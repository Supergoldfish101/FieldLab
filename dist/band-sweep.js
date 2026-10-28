import {drive} from './matching.js';
import {resizeAntenna} from './length-tools.js';
export const BAND_EDGES={'160':[1.8,2],'80':[3.5,4],'60':[5.3515,5.3665],'40':[7,7.3],'30':[10.1,10.15],'20':[14,14.35],'17':[18.068,18.168],'15':[21,21.45],'12':[24.89,24.99],'10':[28,29.7],'6':[50,54]};
export function sweepIdentity(config){const {referenceZ,units,matchRatio,deviceLoss,...setup}=config.setup;return JSON.stringify({setup,selected:config.selected,lPolicy:config.lPolicy});}
export function workbenchBandOverlay(freq,min,max){
 const references={...BAND_EDGES,'2':[144,148],'70cm':[420,450]},entry=Object.entries(references).find(([id,[low,high]])=>freq>=low&&freq<=high||(id==='60'&&freq>=5.3&&freq<=5.41));if(!entry||!(max>min))return null;
 const [id,[low,high]]=entry,fraction=f=>(f-min)/(max-min),markers=[low,high].map((freq,i)=>({freq,side:i?'Upper':'Lower',fraction:fraction(freq),visible:freq>=min&&freq<=max})),needed=200*Math.max(Math.abs(freq-low),Math.abs(freq-high))/freq*1.05;
 return {name:id==='70cm'?'70 cm':id==='60'?'60 m segment':id+' m',low,high,markers,start:Math.max(0,fraction(low)),end:Math.min(1,fraction(high)),fitSpan:[2,10,20,40].find(span=>span>=needed)||40};
}
export function sweepPlan(bands,edges=BAND_EDGES,points=41){
 if(!bands.length)throw Error('Select at least one design band above.');
 if(![21,41,81].includes(points))throw Error('Choose 21, 41 or 81 sweep points.');
 return bands.map(b=>{const [low,high]=(edges[b.id]||[]).map(Number);if(!(low>=1.8&&high<=60&&high>low))throw Error(`${b.name}: enter increasing band edges within 1.8–60 MHz.`);
 const margin=(high-low)*.2,min=Math.max(1.8,low-margin),max=Math.min(60,high+margin),frequencies=[...new Set([...Array.from({length:points},(_,i)=>min+(max-min)*i/(points-1)),low,high])].sort((a,b)=>a-b);return {...b,low,high,min,max,frequencies};});
}
export function scoreSweep(band,{ratio=9,reference=50}={}){
 const samples=band.samples.map(p=>{const direct=drive(p.matrix,{reference}),selected=drive(p.matrix,{ratio,reference});return {...p,direct,selected,swr:Math.max(...selected.swrs),directSWR:Math.max(...direct.swrs)};});
 const inside=samples.filter(p=>p.freq>=band.low&&p.freq<=band.high),best=inside.reduce((a,p)=>!a||p.swr<a.swr?p:a,null);return {...band,samples,best,worst:Math.max(...inside.map(p=>p.swr))};
}
export function prepareSweepState(state,length,plan,lPolicy='rise'){const resized=resizeAntenna(state,length,lPolicy),top=Math.max(...plan.flatMap(b=>b.frequencies));return {...resized,meshFloorMHz:Math.max(resized.freq,resized.meshFloorMHz||0,top),portReferenceMHz:Math.max(resized.portReferenceMHz||resized.freq,top/10)};}
export const sweepX=(freq,band)=>48+(freq-band.min)/(band.max-band.min)*516;
export const sweepY=swr=>134-Math.log10(Math.max(1,Math.min(20,swr)))/Math.log10(20)*100;
export function sweepGeometry(band){const x=f=>sweepX(f,band),path=key=>band.samples.map((p,i)=>`${i?'L':'M'}${x(p.freq).toFixed(2)},${sweepY(p[key]).toFixed(2)}`).join(' ');return {lowX:x(band.low),highX:x(band.high),direct:path('directSWR'),selected:path('swr')};}
