import {sanitize} from './model.js';
import {END_FED,returnConfiguration} from './accurate-geometry.js';
import {DEFAULT_LAB_RETURN,sanitizeReturnSpec} from './return-path.js';
export function newLabSetup(){return sanitize({type:'efsloper',freq:14.2,length:21.9456,height:6,tilt:20,ground:'average',wireIntent:'multiband',solveMode:'accurate',returnAuto:false,portReferenceMHz:14.2,returnSpec:{...DEFAULT_LAB_RETURN}});}
export function restoreLabSetup(raw){
 const s=sanitize(raw);if(!END_FED.includes(s.type))return newLabSetup();
 const legacy=returnConfiguration(s),returnSpec=sanitizeReturnSpec(s.returnSpec)||sanitizeReturnSpec({kind:legacy.mode,length:legacy.length,count:legacy.count,slope:legacy.slope,diameter:s.wireDiameter,bearingOffset:180});
 return {...s,returnSpec,returnAuto:false,portReferenceMHz:s.portReferenceMHz||s.freq,wireIntent:'multiband',solveMode:'accurate'};
}
export function copyLabRadiator(workbench,lab){
 const source=END_FED.includes(workbench.type)?workbench:{...workbench,type:'efsloper',length:21.9456,tilt:20,height:6};
 // Explicit copy action; the lab return remains independent even during copying.
 return {...restoreLabSetup(source),returnSpec:{...lab.returnSpec}};
}
