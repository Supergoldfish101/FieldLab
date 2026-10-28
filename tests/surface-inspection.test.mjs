import {test} from 'node:test';import assert from 'node:assert/strict';
import {surfaceDirection,isInspectClick} from '../dist/inspection.js';
import {DEFAULT,HEX_REFERENCE,sanitize,solve} from '../dist/model.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('surface picking uses world north and east with signed elevation',()=>{
 for(const [point,az,el]of [[{x:0,y:0,z:-2},0,0],[{x:3,y:0,z:0},90,0],[{x:0,y:0,z:2},180,0],[{x:-2,y:0,z:0},270,0],[{x:1,y:Math.sqrt(2),z:-1},45,45],[{x:1,y:-Math.sqrt(2),z:-1},45,-45],[{x:0,y:2,z:0},0,90]]){
  const actual=surfaceDirection(point);near(actual.az,az);near(actual.el,el);
 }
 assert.equal(surfaceDirection({x:0,y:0,z:0}),null);assert.equal(surfaceDirection({x:NaN,y:1,z:0}),null);
});
test('3D hover direction round-trips camera-independent surface coordinates at any radius',()=>{
 for(const az of [0,25,90,180,270,359])for(const el of [-60,0,20,75])for(const r of [.01,2,4.8]){
  const a=az*Math.PI/180,e=el*Math.PI/180,d=surfaceDirection({x:r*Math.cos(e)*Math.sin(a),y:r*Math.sin(e),z:-r*Math.cos(e)*Math.cos(a)});near(d.az,az);near(d.el,el);
 }
});
test('orbit drags, right clicks and multitouch cannot pin the surface',()=>{
 const start={x:100,y:200,button:0};assert.equal(isInspectClick(start,{x:103,y:201}),true);assert.equal(isInspectClick(start,{x:110,y:200}),false);assert.equal(isInspectClick(start,{x:100,y:200},true),false);assert.equal(isInspectClick({...start,button:2},start),false);assert.equal(isInspectClick(null,start),false);
});
test('Hexbeam free-space reference is invariant with mounting height; ground peak has different basis',()=>{
 const s=sanitize({...DEFAULT,type:'hexbeam',length:HEX_REFERENCE[0].half*2*.0254,ground:'free'}),a=solve({...s,height:5}),b=solve({...s,height:25}),ground=solve({...s,ground:'perfect',height:10});
 near(a.gain,b.gain);assert.ok(a.gain>5&&a.gain<6);assert.ok(ground.gain>a.gain+3);assert.notEqual(ground.peakEl,a.peakEl);
});
