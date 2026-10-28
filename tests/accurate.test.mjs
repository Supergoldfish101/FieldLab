import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {C,DEFAULT,TYPES,sanitize,db} from '../dist/model.js';
import {necGeometry,necDeck} from '../dist/accurate-geometry.js';
import {solveNEC} from '../dist/accurate-core.js';
import {drive,recommend,swr,materialize} from '../dist/matching.js';
const state=raw=>sanitize({...DEFAULT,length:.475*C/14.2,ground:'free',solveMode:'accurate',material:'perfect',...raw});
const matrix=(r,x=0)=>({rows:1,columns:1,real:Float64Array.of(r),imag:Float64Array.of(x)});
test('ideal impedance ratios transform complex impedance, preserve SWR for a 1:1 choke, and account for mismatch / device loss',()=>{
 for(const ratio of [1,2,4,9,49,64]){const d=drive(matrix(50*ratio),{ratio});assert.ok(Math.abs(d.swrs[0]-1)<1e-12);assert.ok(Math.abs(d.transfer-1)<1e-12);assert.ok(Math.abs(d.presented[0][0]-50)<1e-12);}
 const z=matrix(200,100),direct=drive(z),choke=drive(z,{ratio:1,loss:0}),matched=drive(z,{ratio:4}),lossy=drive(z,{ratio:4,loss:1});assert.deepEqual(direct,choke);assert.deepEqual(matched.presented[0],[50,25]);assert.ok(Math.abs(matched.swrs[0]-swr([50,25]))<1e-12);assert.ok(Math.abs(lossy.transfer/matched.transfer-10**(-.1))<1e-12);assert.equal(lossy.swrs[0],matched.swrs[0]);assert.equal(recommend(matrix(2450),50,false).ratio,49);assert.equal(swr([0,0]),Infinity);
});
test('actual WASM engine matches dipole impedance, analytical gain, current port and power conservation',async()=>{
 const s=state({freq:C,length:.5}),r=await solveNEC(s),m=materialize(r,s),z=m.matching.raw[0];assert.ok(Math.abs(z[0]-85.38)<.15);assert.ok(Math.abs(z[1]-48.45)<.2);assert.ok(Math.abs(m.gain-2.17)<.08);assert.ok(Math.abs(m.spaceFraction-1)<.02);assert.ok(r.convergence<.03);
 const p=r.geometry.ports[0],basis=r.currentBases[0],i=basis.segments.findIndex(v=>v.tag===p.tag&&v.segment===p.segment);assert.ok(Math.abs(basis.aReal[i]+basis.cReal[i]-1)<1e-9);assert.ok(Math.abs(basis.aImag[i]+basis.cImag[i])<1e-9);
 const realized=materialize(r,{...s,gainMetric:'realized',deviceLoss:1});assert.ok(Math.abs(realized.gain-m.gain-10*Math.log10(realized.matching.transfer))<1e-9);assert.ok(realized.gain<m.gain);assert.ok(Math.abs(db(m,360,0)-db(m,0,0))<1e-12);assert.ok(Math.abs(db(m,359.9,0)-db(m,.1,0))<.01);
});
test('every antenna preset solves actual NEC currents, finite soil, passive coupled elements and a fixed-geometry frequency sweep',async()=>{
 for(const type of Object.keys(TYPES)){
  const s=state({type,length:TYPES[type].ratio*C/14.2,ground:'average',height:10}),r=await solveNEC(s),m=materialize(r,s);assert.equal(m.engine,'nec2',type);assert.ok(Number.isFinite(m.gain),type);assert.ok(m.matching.accepted>0,type);assert.ok(m.matching.transfer<=1.00001,type);assert.ok(m.matching.raw.every(z=>z.every(Number.isFinite)),type);assert.equal(r.sweep.length,15);assert.ok(r.sweep[0].freq<s.freq&&r.sweep.at(-1).freq>s.freq);assert.ok(m.spaceFraction>0&&m.spaceFraction<1.05,type);assert.equal(r.geometry.ports.length,type==='array'?2:1);assert.equal(m.currents.length,r.geometry.segmentCount);assert.ok(Number.isFinite(r.convergence),type);
  if(type==='array'){assert.ok(Math.abs(r.matrix.real[1]-r.matrix.real[2])<1e-8);assert.ok(Math.abs(r.matrix.imag[1]-r.matrix.imag[2])<1e-8);assert.ok(Math.abs(r.matrix.real[1])>1);}
  if(type.startsWith('yagi'))assert.equal(r.geometry.ports[0].tag,2);
  if(['efsloper','efv','invl','monopole'].includes(type)){assert.match(r.geometry.returnDescription,/wire/);assert.ok(r.geometry.paths.length>1);}
  assert.match(necDeck(s,r.geometry),/GW/);
 }
});
test('lossy-ground low dipole regression and free-space translation preserve the physical power basis',async()=>{
 const soil=state({length:.5*C/14.2,height:.02*C/14.2,ground:'average'}),r=await solveNEC(soil),m=materialize(r,soil);assert.ok(m.matching.raw[0][0]>90&&m.matching.raw[0][0]<130);assert.ok(m.gain>-7&&m.gain<-3);assert.ok(m.spaceFraction<.15);
 const low=state({height:3}),high=state({height:18}),a=materialize(await solveNEC(low),low),b=materialize(await solveNEC(high),high);assert.ok(Math.abs(a.gain-b.gain)<1e-8);assert.ok(Math.abs(a.matching.raw[0][0]-b.matching.raw[0][0])<1e-8);
});
test('unsafe thin-wire and underground geometries are rejected; portable settings preserve units without affecting solver identity',()=>{
 assert.throws(()=>necGeometry({...state({type:'monopole',returnMode:'radials',radialLength:5,radialSlope:60,ground:'average'}),height:.05}),/above ground/);
 assert.throws(()=>necGeometry(state({type:'dipole',freq:450,length:170})),/900/);assert.throws(()=>necGeometry(state({ground:'custom',soilSigma:0})),/above zero/);
 const s=state({matchRatio:49,wireDiameter:1.3,units:'ft',necReturnLength:3.7338,mesh:'fine'});assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))),s);
});
test('WASM provenance is pinned and all runtime imports are local for offline PWA use',()=>{
 const wasm=fs.readFileSync(new URL('../dist/vendor/necpp/nec2pp.wasm',import.meta.url));assert.equal(createHash('sha256').update(wasm).digest('hex'),'e85378b3761156ea8ea9091b7dc2c76a0e3232225ff9a8e3edcc3490ab01fa01');
 const sw=fs.readFileSync(new URL('../dist/service-worker.js',import.meta.url),'utf8');assert.match(sw,/vendor\/necpp\/nec2pp.wasm/);assert.match(sw,/accurate-worker.js/);assert.doesNotMatch(sw,/\.\/source\//);
});

test('drooping radials at minimum clearance and 70cm feed bridges remain physically valid',async()=>{
 const s=state({type:'monopole',length:C/14.2/4,ground:'average',returnMode:'radials',radialSlope:30,radialLength:C/14.2/4,height:.05}),g=necGeometry(s);assert.ok(g.wires.every(w=>Math.min(w.start[2],w.end[2])>g.radius));const m=materialize(await solveNEC(s),s);assert.ok(Number.isFinite(m.gain));
 for(const type of ['efsloper','monopole','v','uprightv','hexbeam']){const high=state({type,freq:430,length:TYPES[type].ratio*C/430,height:1});const result=await solveNEC(high);assert.ok(Number.isFinite(materialize(result,high).gain),type);}
});
