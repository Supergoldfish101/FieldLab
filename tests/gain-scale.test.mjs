import test from 'node:test';
import assert from 'node:assert/strict';
import {gainReference,gainRadius,gainAtRadius,zeroGainRadius} from '../dist/gain-scale.js';
import {DEFAULT,sanitize,solve,db} from '../dist/model.js';
import {solveKey} from '../dist/accurate-panel.js';
test('absolute gain references share one scale across unequal model peaks; relative mode retains each peak',()=>{
 const current={gain:5},comparison={gain:9};assert.equal(gainReference(current,comparison,true),9);assert.equal(gainReference(current,comparison,false),5);assert.equal(gainRadius(5,9,30),1-4/30);assert.equal(gainRadius(9,9,30),1);assert.equal(gainRadius(-30,9,30),0);assert.equal(gainRadius(12,9,30),1);
 for(const radius of [0,.1,1/3,2/3,1])assert.ok(Math.abs(gainRadius(gainAtRadius(radius,9,30),9,30)-radius)<1e-12);
});
test('0 dBi guide is placed at isotropic gain on the logarithmic radius and omitted outside the visible scale',()=>{
 assert.ok(Math.abs(zeroGainRadius(6,30)-.8)<1e-12);assert.equal(zeroGainRadius(-1,30),null);assert.equal(zeroGainRadius(40,30),null);assert.equal(zeroGainRadius(0,30),1);assert.equal(zeroGainRadius(30,30),0);assert.ok(Math.abs(gainAtRadius(zeroGainRadius(6,30),6,30))<1e-12);
});
test('dBi overlays persist as display settings and cannot change solved physics or restart NEC',()=>{
 const off=sanitize({...DEFAULT,ground:'free'}),on=sanitize({...off,dbiReference:true}),a=solve(off),b=solve(on);assert.equal(a.gain,b.gain);assert.equal(db(a,90,30),db(b,90,30));assert.deepEqual(a.values,b.values);assert.equal(solveKey(off),solveKey(on));assert.equal(sanitize(JSON.parse(JSON.stringify(on))).dbiReference,true);assert.equal(DEFAULT.dbiReference,false);
});
