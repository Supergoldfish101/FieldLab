import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,TYPES,sanitize,solve,geometry,db} from '../dist/model.js';
import {dxPeak,dxCandidate,closestCutElevation} from '../dist/dx.js';
test('legacy end-fed wire presets consolidate with physical layout preserved',()=>{
 for(const type of ['efhw','longwire','randomwire']){
  assert.equal(TYPES[type],undefined);
  const s=sanitize({...DEFAULT,type,length:39,height:12,tilt:40,bearing:25});
  assert.equal(s.type,'efsloper');assert.equal(s.length,39);assert.equal(s.height,12);assert.equal(s.bearing,25);assert.equal(s.tilt,type==='randomwire'?40:0);
  const g=geometry(s),tip=g.paths[0].points.at(-1);assert.ok(Math.abs(tip[2]-(12+39*Math.sin(s.tilt*Math.PI/180)))<1e-8);assert.deepEqual(g.feed,g.paths[0].points[0]);
 }
});
test('DX maximum is constrained to window and agrees with an exhaustive independent gain scan',()=>{
 for(const ground of ['perfect','average','free']){
  const m=solve(sanitize({...DEFAULT,type:'yagi3',height:18,ground})),best=dxPeak(m,5,20);
  let maximum=-Infinity;for(let el=5;el<=20;el+=5)for(let az=0;az<360;az+=5)maximum=Math.max(maximum,db(m,az,el));
  assert.ok(best.el>=5&&best.el<=20);assert.ok(Math.abs(best.gain-maximum)<1e-8);assert.ok(Math.abs(db(m,best.az,best.el)-best.gain)<1e-8);
  assert.equal(dxCandidate(best.gain,best.el,5,20,best),true);assert.equal(dxCandidate(best.gain-3.01,best.el,5,20,best),false);assert.equal(dxCandidate(best.gain,30,5,20,best),false);
 }
});
test('DX controls sanitize invalid or inverted windows and portable preferences persist',()=>{
 const s=sanitize({...DEFAULT,dxMin:100,dxMax:-4,dxEnabled:false});assert.equal(s.dxMin,55);assert.equal(s.dxMax,60);assert.equal(s.dxEnabled,false);assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))),s);
 assert.equal(dxPeak({rows:0,cols:1,min:0,values:[[0]],integral:1},5,20),null);
 assert.equal(closestCutElevation(.65,.2,.7,45,10),10);assert.equal(closestCutElevation(.25,.2,.7,45,10),45);
});
