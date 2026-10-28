import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {C,DEFAULT,sanitize} from '../dist/model.js';
import {parseLength} from '../dist/units.js';
import {editInvertedL,resizeAntenna,searchLength,bandSamples,BANDS,screenLengths,resonanceClearance,resonanceProfile,scoreBandMatrices,compareBandRatios,transferCandidate} from '../dist/length-tools.js';
import {impedanceSamples} from '../dist/impedance-core.js';
import {necGeometry} from '../dist/accurate-geometry.js';
import {solveNEC} from '../dist/accurate-core.js';
import {drive} from '../dist/matching.js';
const matrix=(r,x=0)=>({rows:1,columns:1,real:Float64Array.of(r),imag:Float64Array.of(x)});
const base=raw=>sanitize({...DEFAULT,ground:'free',...raw});
test('inverted L calculates the missing dimension from every pair, preserving feet/inches and invalid-input rollback',()=>{
 for(const order of [['length','rise'],['rise','length'],['length','horizontal'],['horizontal','length'],['rise','horizontal'],['horizontal','rise']]){
  let s=base({type:'invl',rise:5,horizontal:5,length:10});const values={length:20,rise:8,horizontal:12};for(const key of order)s=editInvertedL(s,key,values[key]);assert.equal(s.length,20,order.join(','));assert.equal(s.rise,8,order.join(','));assert.equal(s.horizontal,12,order.join(','));assert.equal(s.lSolveFor,['length','rise','horizontal'].find(k=>!order.includes(k)));assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))),s);
 }
 let s=base({type:'invl',rise:2,horizontal:3});s=editInvertedL(s,'length',parseLength(`12'-3"`,'ft').meters);s=editInvertedL(s,'rise',parseLength(`6'`,'ft').meters);assert.ok(Math.abs(s.horizontal-1.905)<1e-12);const before=structuredClone(s);assert.throws(()=>editInvertedL(s,'length',.5),/Total must equal/);assert.deepEqual(s,before);
});
test('length resizing holds the selected inverted-L leg and rejects moving a wire below fixed ground clearance',()=>{
 const s=base({type:'invl',rise:5,horizontal:10});assert.equal(resizeAntenna(s,18,'rise').horizontal,13);assert.equal(resizeAntenna(s,18,'horizontal').rise,8);const scaled=resizeAntenna(s,18,'scale');assert.equal(scaled.rise+scaled.horizontal,18);assert.equal(scaled.rise/scaled.horizontal,.5);assert.throws(()=>resizeAntenna(s,4,'rise'),/preserve/);
 const low=base({type:'vertical',ground:'perfect',height:6,length:10});assert.throws(()=>resizeAntenna(low,14),/clearance/);assert.equal(s.horizontal,10);
});
test('bounded tuning uses selected complex matching, improves actual NEC SWR, and does not mutate the installation',async()=>{
 const s=base({length:C/14.2*.5,matchRatio:1}),before=structuredClone(s),r=await searchLength(s,{min:9.5,max:10.8,coarse:17,refine:9},async candidate=>(await impedanceSamples(candidate)).samples[0].matrix);
 assert.ok(r.best.swr<r.before.swr-.5);assert.ok(r.best.length>10.1&&r.best.length<10.35);assert.ok(r.best.swr>1&&r.best.swr<1.6);assert.deepEqual(s,before);assert.equal(r.best.state.height,s.height);assert.equal(r.best.state.necReturnLength,s.necReturnLength);
 for(let length=9.5;length<=10.8;length+=.05){const d=drive((await impedanceSamples({...s,length})).samples[0].matrix);assert.ok(r.best.swr<=Math.max(...d.swrs)+.005);}
 const end=base({type:'invl',rise:5,horizontal:5.56,returnAuto:false,necReturnLength:3,matchRatio:49}),tuned=await searchLength(end,{min:8,max:12,lPolicy:'rise',coarse:15,refine:7},async candidate=>(await impedanceSamples(candidate)).samples[0].matrix);assert.ok(tuned.best.swr<=tuned.before.swr);assert.equal(tuned.best.state.rise,5);assert.equal(tuned.best.state.necReturnLength,3);assert.equal(tuned.best.state.matchRatio,49);
});
test('tuning respects bounds when the original is outside them and reports an optimum at a search boundary',async()=>{
 const r=await searchLength(base({length:10}),{min:5,max:8,coarse:9,refine:3},async s=>matrix(50,(s.length-10)*10));assert.ok(r.best.length<=8&&r.best.length>=5);assert.ok(r.boundary);assert.equal(r.before.length,10);
});
test('resonance screening detects an integer crossing between band samples and preserves only feasible spaced candidates',()=>{
 const band={frequencies:[.8,1.2]};assert.equal(resonanceClearance(C/4,band),0);
 const bands=bandSamples(BANDS.filter(b=>['40','20','10'].includes(b.id)),2),r=screenLengths({min:5,max:30,step:.1,bands,isValid:l=>l>10,count:9});assert.ok(r.candidates.length>0);assert.ok(r.candidates.every(p=>p.length>10));for(let i=0;i<r.candidates.length;i++)for(let j=0;j<i;j++)assert.ok(Math.abs(r.candidates[i].length-r.candidates[j].length)>=.6);for(const w of r.windows)for(const p of r.samples.filter(p=>p.length>=w.min&&p.length<=w.max))assert.equal(p.safe,bands.length);
 assert.throws(()=>bandSamples([]),/Select/);assert.throws(()=>screenLengths({min:5,max:6,step:0,bands}),/valid/);
});
test('resonance map separates half-wave high-Z risks from odd quarter-wave advisories without treating zero length as resonance',()=>{
 const b={frequencies:[10]};for(let n=1;n<=12;n++){const p=resonanceProfile(C/10*n/4,b);assert.equal(p.kind,n%2?'other':'high');assert.equal(p.highRisk,n%2===0);assert.equal(p.otherRisk,n%2===1);}
 assert.equal(resonanceProfile(.1,b).kind,'clear');
 const bs=bandSamples(BANDS.filter(b=>['80','40','30'].includes(b.id)),0),p=bs.map(b=>resonanceProfile(72*.3048,b));assert.deepEqual(p.map(p=>p.kind),['other','high','other']);
 const r=screenLengths({min:C/10*.2,max:C/10*.55,step:.02,bands:[b],count:3});const odd=r.samples.reduce((a,p)=>Math.abs(p.length-C/10/4)<Math.abs(a.length-C/10/4)?p:a);assert.equal(odd.safe,1);assert.ok(r.windows.some(w=>odd.length>=w.min&&odd.length<=w.max));const half=r.samples.reduce((a,p)=>Math.abs(p.length-C/10/2)<Math.abs(a.length-C/10/2)?p:a);assert.equal(half.safe,0);assert.ok(odd.score>half.score);
});
test('resonance classification checks whole spans, identifies both types, and gives high-Z warning precedence',()=>{
 const length=C/4;assert.equal(resonanceProfile(length,{frequencies:[1.9,2.1]}).kind,'high');assert.equal(resonanceProfile(length,{frequencies:[2.9,3.1]}).kind,'other');const both=resonanceProfile(length,{frequencies:[1,2]});assert.ok(both.highRisk&&both.otherRisk);assert.equal(both.kind,'high');
 for(const frequencies of [[.2,.4],[.8,1.2],[1.8,2.2],[2.4,2.6],[3.9,4.1],[9.95,10.05]]){const p=resonanceProfile(length,{frequencies}),near=n=>Math.max(0,frequencies[0]-n,n-frequencies[1]);assert.equal(p.highRisk,[2,4,6,8,10,12].some(n=>near(n)<.1));assert.equal(p.otherRisk,[1,3,5,7,9,11].some(n=>near(n)<.1));}
});
test('band fits use worst sampled SWR, while ratio changes recompute complex impedance without altering raw NEC results',()=>{
 const result={length:12,bands:[{name:'20 m',frequencies:[14,14.2,14.4],samples:[{freq:14,matrix:matrix(450,0)},{freq:14.2,matrix:matrix(450,0)},{freq:14.4,matrix:matrix(450,900)}]}]};const saved=structuredClone(result),r=scoreBandMatrices(result,{ratio:9,threshold:3});assert.equal(r.passCount,0);assert.equal(r.bands[0].samples[1].swrs[0],1);assert.ok(r.bands[0].worst>3);assert.deepEqual(result,saved);
 const ideal={length:12,bands:[{name:'20 m',samples:[{freq:14.2,matrix:matrix(450)}]}]};assert.equal(compareBandRatios(ideal,{threshold:1.5})[0].ratio,9);ideal.bands[0].samples[0].matrix=matrix(2450);assert.equal(compareBandRatios(ideal,{threshold:1.5})[0].ratio,49);
});
test('multiband NEC reuses fixed physical geometry and meshes for the highest sampled frequency',async()=>{
 const s=base({type:'efsloper',length:13.6,returnAuto:false,necReturnLength:3}),frequencies=[3.7,7.1,14.2,28.5],before=structuredClone(s),a=await impedanceSamples(s,frequencies),b=await impedanceSamples(s,[...frequencies].reverse());assert.deepEqual(s,before);assert.ok(a.segmentCount>necGeometry(s).segmentCount);assert.match(a.returnDescription,/3.000 m/);
 for(const p of a.samples){const reverse=b.samples.find(v=>v.freq===p.freq);assert.ok(Math.abs(p.matrix.real[0]-reverse.matrix.real[0])<1e-9);assert.ok(Math.abs(p.matrix.imag[0]-reverse.matrix.imag[0])<1e-9);assert.ok(p.matrix.real[0]>0);}
});
test('transferring a band candidate to a lower workbench frequency keeps its physical feed bridge, mesh and impedance',async()=>{
 const s=base({type:'invl',rise:5,horizontal:8.6,length:13.6,returnAuto:false,necReturnLength:3,portReferenceMHz:14.2,meshFloorMHz:28.785}),r=await impedanceSamples(s,[3.7,14.2,28.785]),low={...s,freq:3.7},full=await solveNEC(low);
 assert.deepEqual(necGeometry(s).wires,necGeometry(low).wires);assert.ok(Math.abs(r.samples[0].matrix.real[0]-full.matrix.real[0])<1e-9);assert.ok(Math.abs(r.samples[0].matrix.imag[0]-full.matrix.imag[0])<1e-9);assert.deepEqual(sanitize(low),low);
});
test('new tools and workers are in the PWA offline asset closure',()=>{
 const sw=fs.readFileSync(new URL('../dist/service-worker.js',import.meta.url),'utf8');for(const name of ['length-tools.js','tune-panel.js','random-wire-page.js','length-worker.js','impedance-core.js','length-tools.css'])assert.ok(sw.includes('./'+name),name);
});

test('candidate transfer keeps display preferences while applying the fixed multiband installation',()=>{
 const candidate=base({type:'efsloper',length:25.6,returnAuto:false,necReturnLength:3,meshFloorMHz:28.5,portReferenceMHz:14.2}),current=base({units:'ft',dbiReference:true,range:40,showCurrents:true,dxMin:10,dxMax:25}),next=transferCandidate(candidate,current,{frequency:3.7,ratio:9,reference:75});assert.equal(next.length,25.6);assert.equal(next.necReturnLength,3);assert.equal(next.portReferenceMHz,14.2);assert.equal(next.meshFloorMHz,28.5);assert.equal(next.freq,3.7);assert.equal(next.matchRatio,9);assert.equal(next.referenceZ,75);assert.equal(next.dbiReference,true);assert.equal(next.units,'ft');assert.equal(next.range,40);assert.equal(next.showCurrents,true);assert.equal(next.wireIntent,'multiband');
});
