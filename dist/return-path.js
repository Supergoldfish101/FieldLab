// Optional, explicitly specified return geometry. Length is physical metres;
// coax mode represents exterior common-mode current up to an ideal choke.
export function sanitizeReturnSpec(raw){
 if(!raw||!['counterpoise','radials','coax','ground'].includes(raw.kind))return null;
 const bounded=(key,fallback,min,max)=>Number.isFinite(Number(raw[key]))?Math.max(min,Math.min(max,Number(raw[key]))):fallback;
 return {kind:raw.kind,length:bounded('length',5,.05,80),count:Math.round(bounded('count',4,1,32)),slope:bounded('slope',0,0,80),bearingOffset:bounded('bearingOffset',180,0,360),diameter:bounded('diameter',raw.kind==='coax'?5:2,.05,30),groundHeight:bounded('groundHeight',.05,.01,1),spread:bounded('spread',360,10,360)};
}
export const DEFAULT_LAB_RETURN={kind:'counterpoise',length:5,count:4,slope:0,bearingOffset:180,diameter:2};
export function returnLabel(ret){return ret.mode==='ground'?'Ground runs (near-soil approximation)':ret.mode==='coax'?'Coax shield to ideal choke (approximate)':ret.mode==='radials'?'Elevated radial wires':'Counterpoise wire';}
