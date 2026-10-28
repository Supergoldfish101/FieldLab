export const wrap=a=>(a%360+360)%360;
// SVG positions use north/up as zero azimuth. Elevation cuts run right -> zenith -> left.
export function cutDirection(kind,x,y,azCut=0,elCut=30){
 if(kind==='elevation'){
  const angle=Math.max(0,Math.min(180,Math.atan2(Math.max(0,125-y),x-120)*180/Math.PI));
  return {az:wrap(angle<=90?azCut:azCut+180),el:angle<=90?angle:180-angle};
 }
 return {az:wrap(Math.atan2(x-120,110-y)*180/Math.PI),el:elCut};
}
export function cutPoint(kind,angle,normalized){const r=(kind==='elevation'?99:86)*Math.max(0,Math.min(1,normalized)),a=angle*Math.PI/180;return kind==='elevation'?{x:120+r*Math.cos(a),y:125-r*Math.sin(a)}:{x:120+r*Math.sin(a),y:110-r*Math.cos(a)};}

// Scene coordinates use +x east, +y up, -z north. Surface origin is not a direction.
export function surfaceDirection(point){
 const horizontal=Math.hypot(point.x,point.z),radius=Math.hypot(horizontal,point.y);
 if(!Number.isFinite(radius)||radius<1e-7)return null;
 return {az:horizontal<1e-8?0:wrap(Math.atan2(point.x,-point.z)*180/Math.PI),el:Math.atan2(point.y,horizontal)*180/Math.PI};
}
export function isInspectClick(start,end,dragged=false){return !!start&&!dragged&&start.button===0&&Math.hypot(end.x-start.x,end.y-start.y)<5;}
