import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseLength,formatLength,validateLength} from '../dist/units.js';
import {DEFAULT,sanitize,solve} from '../dist/model.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('feet/inches symbols, words, fractions and hyphen separator have exact conversions',()=>{
 for(const entry of [`12'-3"`,`12' 3"`,`12 ft 3 in`,`12 feet 3 inches`,`12′-3″`,`12’–3”`.replace('–','-'),'12.25'])near(parseLength(entry,'ft').meters,3.7338);
 near(parseLength(`12'`,'ft').meters,3.6576);near(parseLength('3"','ft').meters,.0762);near(parseLength('72"','ft').meters,1.8288);
 for(const entry of [`12' 3 1/2"`,`12'-3 1/2"`])near(parseLength(entry,'ft').meters,3.7465);
 near(parseLength('1/2"').meters,.0127);near(parseLength('12.5 ft','m').meters,3.81);
});
test('explicit units override display setting while unmarked numbers follow it',()=>{
 near(parseLength('12.25','m').meters,12.25);near(parseLength('12.25','ft').meters,3.7338);
 for(const units of ['m','ft']){near(parseLength('1.5 m',units).meters,1.5);near(parseLength('150 cm',units).meters,1.5);near(parseLength('1500 mm',units).meters,1.5);}
});
test('ambiguous malformed negative and invalid compound lengths are rejected',()=>{
 for(const entry of ['',`12-3`,`12"-3'`,`12'-12"`,`12'-15"`,'-12','-3"','12abc','NaN','Infinity','1/0"',`12' 1/0"`,'1e3','1,234','12 3'])assert.ok(parseLength(entry,'ft').error,entry);
 assert.ok(validateLength('600 ft','ft',.1,170).error);assert.ok(validateLength('0.01 m','ft',.1,170).error);
 near(validateLength(`12'-3"`,'ft',.1,170).meters,3.7338);
});
test('imperial display carries inches, reduces fractions and never requires changing canonical model',()=>{
 assert.equal(formatLength(3.7338,'ft'),`12'-3"`);assert.equal(formatLength(.0127,'ft'),`0'-1/2"`);assert.equal(formatLength(.3047999,'ft'),`1'-0"`);assert.equal(formatLength(1.5,'m'),'1.5');
 const before=sanitize({...DEFAULT,length:10.56789123,height:12.3456789});let s=before;const peak=solve(s).gain;
 for(let i=0;i<100;i++){s=sanitize({...s,units:i%2?'m':'ft'});formatLength(s.length,s.units);}
 assert.equal(s.length,before.length);assert.equal(s.height,before.height);assert.equal(solve(s).gain,peak);
});
