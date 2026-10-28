import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitize} from '../dist/model.js';
import {newLabSetup,restoreLabSetup,copyLabRadiator} from '../dist/lab-setup.js';
import {necGeometry,returnConfiguration} from '../dist/accurate-geometry.js';
import {impedanceSamples} from '../dist/impedance-core.js';
import {transferCandidate,resizeAntenna} from '../dist/length-tools.js';
import {prepareSweepState,sweepPlan} from '../dist/band-sweep.js';
import {solveKey} from '../dist/accurate-panel.js';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('lab starts independently, preserves legacy return lengths, and copies radiators without overwriting its return',()=>{
 const lab=newLabSetup(),wb=sanitize({type:'invl',rise:8,horizontal:14,height:1,necReturnLength:1.056,returnAuto:false});
 assert.equal(lab.returnSpec.length,5);assert.equal(lab.length,21.9456);
 const migrated=restoreLabSetup(wb);assert.equal(migrated.returnSpec.length,1.056);assert.deepEqual(restoreLabSetup(JSON.parse(JSON.stringify(migrated))),migrated);
 const copy=copyLabRadiator(wb,lab);assert.equal(copy.rise,8);assert.equal(copy.horizontal,14);assert.equal(copy.returnSpec.length,5);copy.returnSpec.length=15;assert.equal(lab.returnSpec.length,5);assert.equal(wb.necReturnLength,1.056);
 const vertical=restoreLabSetup(sanitize({type:'monopole',returnMode:'radials',radialCount:8,radialLength:2,radialSlope:10}));assert.equal(vertical.returnSpec.count,8);assert.equal(vertical.returnSpec.length,2);assert.equal(vertical.returnSpec.slope,10);
});
test('all lab wire shapes solve with independent counterpoise, radial and coax return geometry',async()=>{
 for(const type of ['efsloper','invl','efv','monopole'])for(const kind of ['counterpoise','radials','coax']){
  const s=sanitize({...newLabSetup(),type,height:20,returnSpec:{kind,length:5,count:6,slope:15,bearingOffset:135,diameter:kind==='coax'?5:2}}),g=necGeometry(s),ret=returnConfiguration(s);
  assert.equal(ret.count,kind==='radials'?6:1);assert.equal(g.paths.length,2+ret.count);for(const p of g.paths.slice(2))assert.ok(Math.abs(distance(...p.points)-5)<1e-8);
  const r=(await impedanceSamples(s)).samples[0].matrix;assert.ok(r.real[0]>0&&Number.isFinite(r.imag[0]));
  if(kind==='coax'){assert.match(g.returnDescription,/ideal choke/);assert.ok(g.wires.some(w=>w.radiusM===.0025));assert.ok(g.warnings.some(w=>w.includes('jacket')));}
 }
});
test('coax length changes solved impedance and survives workbench transfer and fixed-frequency sweep',async()=>{
 const s=sanitize({...newLabSetup(),returnSpec:{kind:'coax',length:12,count:1,slope:0,bearingOffset:180,diameter:5}}),plan=sweepPlan([{id:'20',name:'20 m'}]),state=prepareSweepState(s,21.9456,plan),a=(await impedanceSamples(state,[14])).samples[0].matrix;
 const transfer=sanitize(transferCandidate(state,sanitize({}),{frequency:14,ratio:9})),b=(await impedanceSamples(transfer,[14])).samples[0].matrix;
 assert.deepEqual(necGeometry(state).wires,necGeometry(transfer).wires);assert.ok(Math.abs(a.real[0]-b.real[0])<1e-8);assert.ok(Math.abs(a.imag[0]-b.imag[0])<1e-8);
 const shorter={...state,returnSpec:{...state.returnSpec,length:5}},c=(await impedanceSamples(shorter,[14])).samples[0].matrix;assert.ok(Math.hypot(c.real[0]-a.real[0],c.imag[0]-a.imag[0])>10);assert.notEqual(solveKey(state),solveKey(shorter));
});
test('custom return clearance is checked without silently changing experimental height',()=>{
 const s={...newLabSetup(),height:1,returnSpec:{kind:'coax',length:10,slope:30,count:1,bearingOffset:180,diameter:5}};
 assert.throws(()=>resizeAntenna(s,20),/clearance/);assert.throws(()=>necGeometry(s),/above ground/);assert.equal(s.height,1);
});
test('ground runs have an explicit shared drop and the requested count, run length and clearance',async()=>{
 for(const type of ['efsloper','invl','efv','monopole']){
  const s=sanitize({...newLabSetup(),type,height:15,returnSpec:{kind:'ground',length:5,count:4,groundHeight:.05,spread:360,diameter:2}}),g=necGeometry(s),runs=g.paths.slice(3);
  assert.equal(runs.length,4);for(const p of runs){assert.ok(Math.abs(distance(...p.points)-5)<1e-9);assert.equal(p.points[0][2],.05);assert.equal(p.points[1][2],.05);}
  assert.equal(g.paths[2].points[1][2],.05);assert.ok(g.paths[2].points[0][2]>.05);assert.match(g.returnDescription,/shared connecting drop/);assert.ok(g.warnings.some(w=>w.includes('not a validated on-ground')));
  const m=(await impedanceSamples(s)).samples[0].matrix;assert.ok(m.real[0]>0&&Number.isFinite(m.imag[0]),type);
 }
});
test('ground-run count and length change impedance; transfer keeps the complete return geometry',async()=>{
 const s=sanitize({...newLabSetup(),type:'invl',height:1,rise:8,horizontal:14,returnSpec:{kind:'ground',count:4,length:5,groundHeight:.05,diameter:2,spread:180,bearingOffset:180}}),g=necGeometry(s),results=[];
 for(const change of [{},{count:1},{length:10}]){const v={...s,returnSpec:{...s.returnSpec,...change}};results.push((await impedanceSamples(v)).samples[0].matrix);}
 for(const m of results.slice(1))assert.ok(Math.hypot(m.real[0]-results[0].real[0],m.imag[0]-results[0].imag[0])>1);
 const t=sanitize(transferCandidate(s,sanitize({}),{frequency:s.freq,ratio:9}));assert.deepEqual(necGeometry(t).wires,g.wires);
 const higher={...s,returnSpec:{...s.returnSpec,groundHeight:.1}};assert.notEqual(solveKey(higher),solveKey(s));assert.equal(necGeometry(higher).paths.at(-1).points[1][2],.1);
 assert.throws(()=>necGeometry({...s,ground:'free'}),/ground \/ soil/);
 assert.throws(()=>necGeometry({...s,height:.06,returnSpec:{...s.returnSpec,groundHeight:.05}}),/feed point must be above/);
});
