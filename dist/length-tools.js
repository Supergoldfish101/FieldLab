import {C,minHeight} from './model.js';
import {drive,RATIOS} from './matching.js';
export const L_FIELDS=['length','rise','horizontal'];
const LIMITS={length:[.1,170],rise:[.05,80],horizontal:[.05,90]};
export function editInvertedL(state,key,value){
 if(!L_FIELDS.includes(key)||!Number.isFinite(value))throw Error('Enter a valid inverted-L dimension.');
 const anchor=state.lLastEdited!==key&&L_FIELDS.includes(state.lLastEdited)?state.lLastEdited:L_FIELDS.find(k=>k!==key&&k!==(state.lSolveFor||'length'));
 const derived=L_FIELDS.find(k=>k!==key&&k!==anchor),s={...state,[key]:value,lSolveFor:derived,lLastEdited:key};
 if(derived==='length')s.length=s.rise+s.horizontal;else s[derived]=s.length-s[derived==='rise'?'horizontal':'rise'];
 for(const k of L_FIELDS){const [min,max]=LIMITS[k];if(s[k]<min-1e-9||s[k]>max+1e-9)throw Error(`These dimensions require ${k==='length'?'total wire':k==='rise'?'vertical rise':'horizontal run'} outside ${min}–${max} m. Total must equal rise plus horizontal run.`);}
 return s;
}
export function resizeAntenna(s,length,lPolicy='rise'){
 if(!Number.isFinite(length)||length<.1||length>170)throw Error('Length must be 0.1–170 m.');
 const next={...s,length};
 if(s.type==='invl'){
  if(lPolicy==='scale'){next.rise=s.rise*length/s.length;next.horizontal=s.horizontal*length/s.length;}
  else if(lPolicy==='horizontal'){next.rise=length-s.horizontal;next.lSolveFor='rise';next.lLastEdited='length';}
  else{next.horizontal=length-s.rise;next.lSolveFor='horizontal';next.lLastEdited='length';}
  for(const k of ['rise','horizontal'])if(next[k]<LIMITS[k][0]||next[k]>LIMITS[k][1])throw Error('This length cannot preserve the chosen inverted-L section within its limits.');
 }
 if(s.height+1e-8<minHeight(next))throw Error('This length would put a wire below the selected ground clearance. Height stays fixed.');
 return next;
}
export function transferCandidate(candidate,current,{frequency=candidate.freq,ratio=9,reference=candidate.referenceZ}={}){
 const display=Object.fromEntries(['units','range','dbiReference','dxEnabled','dxMin','dxMax','showCurrents'].map(key=>[key,current[key]]));
 return {...candidate,...display,freq:frequency,referenceZ:reference,matchRatio:ratio,returnAuto:false,wireIntent:'multiband',solveMode:'accurate'};
}
export const BANDS=[{id:'160',name:'160 m',freq:1.9},{id:'80',name:'80 m',freq:3.7},{id:'60',name:'60 m',freq:5.35},{id:'40',name:'40 m',freq:7.1},{id:'30',name:'30 m',freq:10.12},{id:'20',name:'20 m',freq:14.2},{id:'17',name:'17 m',freq:18.1},{id:'15',name:'15 m',freq:21.2},{id:'12',name:'12 m',freq:24.94},{id:'10',name:'10 m',freq:28.5},{id:'6',name:'6 m',freq:50.2}];
export const DEFAULT_BANDS=['80','40','30','20','17','15','12','10'];
export function bandSamples(bands,span=2){
 if(!Array.isArray(bands)||!bands.length||bands.length>12)throw Error('Select 1–12 design bands.');
 return bands.map(b=>{const f=Number(b.freq);if(!Number.isFinite(f)||f<1.8||f>60)throw Error('Design frequencies must be 1.8–60 MHz.');return {...b,freq:f,frequencies:span>0?[f*(1-span/200),f,f*(1+span/200)]:[f]};});
}
export function resonanceClearance(length,band){
 const p=resonanceProfile(length,band);return Math.min(p.highClearance,p.otherClearance);
}
// Distances use quarter-wavelength units. Even positive multiples mark potential
// end-feed high-Z regions; odd multiples are a separate resonance advisory.
export function resonanceProfile(length,band,guard=.1){
 const lo=length*Math.min(...band.frequencies)/C*4,hi=length*Math.max(...band.frequencies)/C*4;
 function distance(start){const first=start+2*Math.max(0,Math.ceil((lo-start)/2));if(first<=hi)return 0;const at=x=>Math.abs(x-(start+2*Math.max(0,Math.round((x-start)/2))));return Math.min(at(lo),at(hi));}
 const highClearance=distance(2),otherClearance=distance(1),highRisk=highClearance<guard,otherRisk=otherClearance<guard;
 return {highClearance,otherClearance,highRisk,otherRisk,kind:highRisk?'high':otherRisk?'other':'clear'};
}
export function screenLengths({min=5,max=45,step=.1,bands,guard=.1,count=6,isValid=()=>true}){
 if(!(min>=.1&&max<=170&&max>min&&step>=.02&&step<=2&&(max-min)/step<=8500))throw Error('Choose a valid 0.1–170 m search range and 0.02–2 m step (maximum 8,500 intervals).');
 if(!bands?.length)throw Error('Select at least one band.');
 const samples=[],total=Math.floor((max-min)/step);
 for(let i=0;i<=total;i++){const length=min+i*step,profiles=bands.map(b=>resonanceProfile(length,b,guard)),clearances=profiles.map(p=>p.highClearance),safe=profiles.filter(p=>!p.highRisk).length,minClearance=Math.min(...clearances),mean=clearances.reduce((a,b)=>a+b,0)/bands.length;
  // This is a geometric shortlist, not an impedance, efficiency or coverage model.
  samples.push({length,safe,minClearance,clearances,profiles,eligible:isValid(length),score:safe*10+minClearance+mean*.15});
 }
 const candidates=[];for(const p of samples.filter(p=>p.eligible).sort((a,b)=>b.score-a.score||a.length-b.length)){if(candidates.every(c=>Math.abs(c.length-p.length)>=Math.max(step*2,.6)))candidates.push(p);if(candidates.length>=Math.min(12,count))break;}
 const windows=[];let window=null;for(const p of samples){if(p.eligible&&p.safe===bands.length){if(!window)window={min:p.length,max:p.length};else window.max=p.length;}else if(window){windows.push(window);window=null;}}if(window)windows.push(window);
 return {candidates,windows,samples};
}
export function scoreBandMatrices(result,{ratio=9,reference=50,loss=0,threshold=3}={}){
 const bands=result.bands.map(b=>{const samples=b.samples.map(p=>({...p,...drive(p.matrix,{ratio,reference,loss})})),worst=Math.max(...samples.flatMap(p=>p.swrs));return {...b,samples,worst,pass:worst<=threshold};});
 return {...result,bands,ratio,reference,loss,threshold,passCount:bands.filter(b=>b.pass).length,worst:Math.max(...bands.map(b=>b.worst)),meanLog:bands.reduce((sum,b)=>sum+Math.log(Math.min(1e9,b.worst)),0)/bands.length};
}
export function compareBandRatios(result,options={}){return RATIOS.map(ratio=>scoreBandMatrices(result,{...options,ratio})).sort((a,b)=>b.passCount-a.passCount||a.worst-b.worst||a.meanLog-b.meanLog);}
export async function searchLength(s,{min=s.length*.75,max=s.length*1.25,lPolicy='rise',coarse=25,refine=10}={},evaluate,progress=()=>{}){
 if(!(min>=.1&&max<=170&&max>min))throw Error('Tune bounds must be 0.1–170 m, with maximum greater than minimum.');
 const cache=new Map(),history=[];let best=null;
 async function sample(length){const key=length.toFixed(9);if(cache.has(key))return cache.get(key);let p;try{const candidate=resizeAntenna(s,length,lPolicy),matrix=await evaluate(candidate),d=drive(matrix,{ratio:s.matchRatio,reference:s.referenceZ,loss:s.deviceLoss});p={length,state:candidate,swr:Math.max(...d.swrs),impedance:d.raw,presented:d.presented};if(Number.isFinite(p.swr)&&(!best||p.swr<best.swr))best=p;}catch(error){p={length,swr:Infinity,error:error.message};}cache.set(key,p);history.push(p);progress({tested:history.length,best:p.error?best:p,bestSWR:best?.swr,length});return p;}
 const before=await sample(s.length);for(let i=0;i<coarse;i++)await sample(min+(max-min)*i/(coarse-1));
 const finite=history.filter(p=>Number.isFinite(p.swr)&&p.length>=min&&p.length<=max).sort((a,b)=>a.swr-b.swr),seeds=[];
 for(const p of finite){if(seeds.every(x=>Math.abs(x.length-p.length)>(max-min)/(coarse-1)*1.1))seeds.push(p);if(seeds.length===3)break;}
 const spacing=(max-min)/(coarse-1),phi=(Math.sqrt(5)-1)/2;
 for(const seed of seeds){let a=Math.max(min,seed.length-spacing),b=Math.min(max,seed.length+spacing),c=b-phi*(b-a),d=a+phi*(b-a),fc=await sample(c),fd=await sample(d);for(let i=0;i<refine;i++){if(fc.swr<fd.swr){b=d;d=c;fd=fc;c=b-phi*(b-a);fc=await sample(c);}else{a=c;c=d;fc=fd;d=a+phi*(b-a);fd=await sample(d);}}}
 const inside=history.filter(p=>p.length>=min&&p.length<=max&&Number.isFinite(p.swr)).sort((a,b)=>a.swr-b.swr);best=inside[0];if(!best)throw Error(history.find(p=>p.error)?.error||'No valid length in this interval.');return {before,best,history,boundary:Math.abs(best.length-min)<spacing*.02||Math.abs(best.length-max)<spacing*.02,min,max,lPolicy};
}
