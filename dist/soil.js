// Illustrative constant properties for exploring flat-ground reflections.
// These are starting values, not site measurements or frequency-dependent ITU predictions.
export const SOILS={
 verydry:{name:'Very dry ground',er:3,sigma:.0001},
 sand:{name:'Dry sand',er:4,sigma:.0002},
 rock:{name:'Rocky / stony ground',er:5,sigma:.0001},
 poor:{name:'Poor dry soil',er:5,sigma:.001},
 average:{name:'Average ground',er:13,sigma:.005},
 farmland:{name:'Moist farmland / loam',er:15,sigma:.01},
 good:{name:'Good conductive soil',er:17,sigma:.015},
 wet:{name:'Wet ground',er:30,sigma:.01},
 clay:{name:'Moist clay',er:20,sigma:.02},
 marsh:{name:'Marsh / saturated soil',er:30,sigma:.03},
 freshwater:{name:'Fresh water',er:80,sigma:.001},
 seawater:{name:'Sea water',er:80,sigma:5}
};
export const hasSoil=s=>s.ground!=='free'&&s.ground!=='perfect';
export function soilProperties(s){return Object.hasOwn(SOILS,s.ground)?SOILS[s.ground]:{name:'Custom ground',er:s.soilEr??13,sigma:s.soilSigma??.005};}
export function groundName(s){return s.ground==='free'?'Free space':s.ground==='perfect'?'Perfect ground':soilProperties(s).name;}
const div=(a,b)=>{const d=b[0]*b[0]+b[1]*b[1];return [(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
export function fresnel(er,sigma,freqMHz,elevation){
 const sin=Math.sin(Math.max(0,elevation)),cos=Math.cos(elevation),imag=-sigma/(2*Math.PI*freqMHz*1e6*8.8541878128e-12),a=er-cos*cos,mag=Math.hypot(a,imag),root=[Math.sqrt((mag+a)/2),-Math.sqrt(Math.max(0,(mag-a)/2))];
 // Grazing incidence into a medium indistinguishable from air has no reflection.
 if(Math.abs(er-1)<1e-14&&sigma===0)return {h:[0,0],v:[0,0]};
 const h=div([sin-root[0],-root[1]],[sin+root[0],root[1]]),e=[er*sin,imag*sin],v=div([e[0]-root[0],e[1]-root[1]],[e[0]+root[0],e[1]+root[1]]);
 return {h,v};
}
