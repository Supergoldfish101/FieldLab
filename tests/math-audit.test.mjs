import test from 'node:test';
import assert from 'node:assert/strict';
import {C,TYPES,sanitize} from '../dist/model.js';
import {swr,drive,materialize} from '../dist/matching.js';
import {necGeometry,necDeck,returnConfiguration} from '../dist/accurate-geometry.js';
import {impedanceSamples} from '../dist/impedance-core.js';
import {solveNEC} from '../dist/accurate-core.js';
import {sweepIdentity} from '../dist/band-sweep.js';
const matrix=(r,x)=>({rows:1,columns:1,real:[r],imag:[x]});
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} versus ${b}`);
const wireLength=w=>Math.hypot(...w.start.map((v,i)=>v-w.end[i]));

test('SWR agrees with independent reflection/power equations and handles extreme finite mismatch',()=>{
 for(const reference of [25,50,75,600])for(const r of [.001,1,25,50,450,2450,1e5])for(const x of [-9000,-100,0,100,9000]){
  const gammaSquared=((r-reference)**2+x*x)/((r+reference)**2+x*x),gamma=Math.sqrt(gammaSquared);
  close(swr([r,x],reference),(1+gamma)/(1-gamma),1e-5);
  for(const ratio of [1,2,4,9,49,64]){
   const d=drive(matrix(r,x),{ratio,reference}),expected=4*r*ratio*reference/((r+ratio*reference)**2+x*x);
   close(d.transfer,expected);close(d.swrs[0],swr([r/ratio,x/ratio],reference));
   close(d.transfer,4*d.swrs[0]/(d.swrs[0]+1)**2);
  }
 }
 close(swr([1e20,0]),2e18);close(swr([1e-20,0]),5e21);
 close(swr([50,1e10]),4e16);close(swr([50,50]),(3+Math.sqrt(5))/2);
 assert.equal(swr([0,50]),Infinity);assert.throws(()=>swr([50,0],0),/positive/);
});

test('all 15 antennas preserve impedance under rigid bearing rotation over uniform ground',async()=>{
 for(const type of Object.keys(TYPES)){
  const s=sanitize({type,length:TYPES[type].ratio*C/14.2,ground:'average',height:10,returnAuto:false,necReturnLength:3});
  const a=(await impedanceSamples({...s,bearing:90})).samples[0].matrix,b=(await impedanceSamples({...s,bearing:23})).samples[0].matrix;
  for(let i=0;i<a.real.length;i++){close(a.real[i],b.real[i],1e-7);close(a.imag[i],b.imag[i],1e-7);}
 }
});

test('all 15 perfect-conductor geometries obey electromagnetic length/frequency scaling',async()=>{
 for(const type of Object.keys(TYPES)){
  const s=sanitize({type,length:TYPES[type].ratio*C/14.2,ground:'free',material:'perfect',height:20,returnMode:'counterpoise',returnAuto:false,necReturnLength:3}),scaled={...s,freq:s.freq/2};
  for(const key of ['length','height','rise','horizontal','radialLength','necReturnLength','wireDiameter'])scaled[key]*=2;
  const a=(await impedanceSamples(s)).samples[0].matrix,b=(await impedanceSamples(scaled)).samples[0].matrix;
  for(let i=0;i<a.real.length;i++){close(a.real[i],b.real[i],1e-8);close(a.imag[i],b.imag[i],1e-8);}
 }
});

test('short end-fed returns retain equal source-neighbor lengths or reject impossible thick wires',async()=>{
 for(const type of ['efsloper','efv','invl','monopole'])for(const returnLength of [.05,.1,1]){
  const s=sanitize({type,ground:'free',height:10,returnMode:'counterpoise',radialLength:returnLength,returnAuto:false,necReturnLength:returnLength}),g=necGeometry(s),feed=g.wires[0],length=wireLength(feed);
  const adjacent=g.wires.filter(w=>w!==feed&&(w.start.every((v,i)=>v===feed.start[i])||w.end.every((v,i)=>v===feed.start[i])||w.start.every((v,i)=>v===feed.end[i])||w.end.every((v,i)=>v===feed.end[i])));
  assert.equal(adjacent.length,2,type);for(const w of adjacent)close(wireLength(w),length);
  assert.ok(length<=returnLength/3+1e-10);const r=(await impedanceSamples(s)).samples[0].matrix;assert.ok(r.real[0]>0&&Number.isFinite(r.imag[0]));
 }
 assert.throws(()=>necGeometry(sanitize({type:'efsloper',returnAuto:false,necReturnLength:.05,wireDiameter:30})),/too short/);
});

test('vertical counterpoise rotates with bearing and exported NEC covers the same angular domain',()=>{
 const s=sanitize({type:'monopole',returnMode:'counterpoise',bearing:0,radialLength:3,height:10}),g=necGeometry(s),ret=g.paths.at(-1).points;
 assert.ok(Math.abs(ret[1][0]-ret[0][0])<1e-12);close(ret[1][1]-ret[0][1],-3);
 assert.match(necDeck(s),/RP 0 19 73/);assert.match(necDeck(sanitize({type:'dipole',ground:'free'})),/RP 0 37 73/);
 assert.deepEqual(returnConfiguration(s),{mode:'counterpoise',count:1,length:3,slope:0});
});

test('random wire cache identity tracks inverted-L resize policy while allowing ratio rescoring',()=>{
 const cfg={setup:sanitize({type:'invl'}),selected:['40','20'],lPolicy:'rise'},key=sweepIdentity(cfg);
 assert.notEqual(key,sweepIdentity({...cfg,lPolicy:'horizontal'}));assert.notEqual(key,sweepIdentity({...cfg,lPolicy:'scale'}));
 assert.equal(key,sweepIdentity({...cfg,ratio:49,setup:{...cfg.setup,referenceZ:75,units:'ft',matchRatio:49}}));
 assert.notEqual(key,sweepIdentity({...cfg,setup:{...cfg.setup,necReturnLength:10}}));
});

test('72 ft inverted-L impedance and 9:1 SWR agree across solve paths and respond to actual return length',async()=>{
 const s=sanitize({type:'invl',rise:26*.3048,horizontal:46*.3048,height:.9,ground:'average',freq:14.2,returnAuto:false,necReturnLength:1.056,matchRatio:9,meshFloorMHz:28.785,portReferenceMHz:14.2}),sample=(await impedanceSamples(s)).samples[0],full=await solveNEC(s),m=materialize(full,s),d=drive(sample.matrix,{ratio:9});
 close(d.swrs[0],m.matching.swrs[0]);close(d.raw[0][0],full.matrix.real[0]);close(d.raw[0][1],full.matrix.imag[0]);
 assert.ok(d.swrs[0]>10&&d.swrs[0]<25);
 const longer=(await impedanceSamples({...s,necReturnLength:6})).samples[0],longSWR=drive(longer.matrix,{ratio:9}).swrs[0];
 assert.ok(longSWR<d.swrs[0]/2);assert.ok(longSWR>1);
});
