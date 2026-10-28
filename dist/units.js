export const METERS_PER_FOOT=.3048;
export const METERS_PER_INCH=.0254;
const NUMBER='(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const PART=`(?:${NUMBER}|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+)`;
function quantity(text){
 const value=text.trim();
 if(/^\d+(?:\s+\d+)?\/\d+$/.test(value)){
  const parts=value.split(/\s+/),fraction=parts.pop().split('/').map(Number);
  if(fraction[1]===0)return NaN;
  return (parts.length?Number(parts[0]):0)+fraction[0]/fraction[1];
 }
 return Number(value);
}
// Explicit suffixes override display units. All returned values are meters.
export function parseLength(input,units='m'){
 const text=String(input).trim().toLowerCase().replace(/[′’‘]/g,"'").replace(/[″“”]/g,'"');
 if(!text)return {error:'Enter a length.'};
 const feet=new RegExp(`^(${PART})\\s*(?:'|ft\\.?|feet|foot)\\s*(?:-?\\s*(${PART})\\s*(?:"|in\\.?|inches|inch)?)?$`).exec(text);
 if(feet){
  const whole=quantity(feet[1]),inches=feet[2]===undefined?0:quantity(feet[2]);
  if(!Number.isFinite(whole)||!Number.isFinite(inches))return {error:'Use a fraction with a nonzero denominator.'};
  if(feet[2]!==undefined&&inches>=12)return {error:'In feet-and-inches notation, inches must be less than 12.'};
  return {meters:whole*METERS_PER_FOOT+inches*METERS_PER_INCH};
 }
 const inches=new RegExp(`^(${PART})\\s*(?:"|in\\.?|inches|inch)$`).exec(text);
 if(inches){const value=quantity(inches[1]);return Number.isFinite(value)?{meters:value*METERS_PER_INCH}:{error:'Use a fraction with a nonzero denominator.'};}
 const metric=new RegExp(`^(${NUMBER})\\s*(mm|cm|m|meters?|metres?)$`).exec(text);
 if(metric)return {meters:Number(metric[1])*(metric[2]==='mm'?.001:metric[2]==='cm'?.01:1)};
 if(new RegExp(`^${NUMBER}$`).test(text))return {meters:Number(text)*(units==='ft'?METERS_PER_FOOT:1)};
 return {error:units==='ft'?`Use decimal feet, 12', 3", or 12'-3". Negative lengths and ambiguous 12-3 entries are invalid.`:'Use meters, cm, mm, or an explicit feet/inches value.'};
}
export function formatLength(meters,units='m'){
 if(units!=='ft')return Number(meters.toFixed(4)).toString();
 // Display to 1/16 inch; canonical meter values are never rounded by toggling.
 const ticks=Math.round(meters/METERS_PER_INCH*16),feet=Math.floor(ticks/192),inchTicks=ticks%192,whole=Math.floor(inchTicks/16),remainder=inchTicks%16;
 let inch=String(whole);
 if(remainder){let n=remainder,d=16;while(n%2===0){n/=2;d/=2;}inch=(whole?whole+' ':'')+`${n}/${d}`;}
 return `${feet}'-${inch}"`;
}
export function validateLength(text,units,min,max){
 const result=parseLength(text,units);
 if(result.error)return result;
 if(!Number.isFinite(result.meters)||result.meters<min-1e-9||result.meters>max+1e-9)return {error:`Enter a length from ${formatLength(min,units)} to ${formatLength(max,units)}${units==='m'?' m':''}.`};
 return result;
}
