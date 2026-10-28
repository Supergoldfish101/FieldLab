import {sanitizeReturnSpec} from './return-path.js';
import {C,geometry} from './model.js';
import {soilProperties} from './soil.js';
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const along=(a,b,d)=>a.map((x,i)=>x+(b[i]-x)*d/distance(a,b));
const midpoint=(a,b)=>a.map((x,i)=>(x+b[i])/2);
export const END_FED=['efsloper','efv','invl','monopole'];
export function returnConfiguration(s){
 const custom=sanitizeReturnSpec(s.returnSpec);if(custom)return {...custom,mode:custom.kind,count:['radials','ground'].includes(custom.kind)?custom.count:1};
 const explicit=s.type==='monopole'&&s.returnMode!=='ideal',mode=explicit?s.returnMode:(s.necReturn==='radials'?'radials':s.type==='monopole'&&s.necReturn!=='counterpoise'?'radials':'counterpoise');
 return {mode,count:mode==='radials'?(explicit?s.radialCount:4):1,length:explicit?s.radialLength:(s.returnAuto!==false?C/s.freq*(s.type==='monopole'?.25:.05):s.necReturnLength),slope:explicit?s.radialSlope:0};
}
export function necGeometry(s){
 const wave=C/s.freq,meshWave=C/Math.max(s.freq,s.meshFrequency||0,s.meshFloorMHz||0),portWave=C/(s.portReferenceMHz||s.freq),radius=(s.wireDiameter??2)/2000,density=s.meshDensity??(s.mesh==='fine'?100:60);
 const original=geometry(s),paths=original.paths.filter(p=>p.mode!=='radial').map(p=>({points:p.points.map(v=>[...v])}));
 const wires=[],ports=[],warnings=[];let feed=original.feed,returnDescription='Balanced antenna; no external return wire',portDescription='Center feed';
 function add(a,b,{source=false,odd=false,single=false,wireRadius=radius}={}){const r=wireRadius;const length=distance(a,b);if(length<r*8)throw Error('A wire or feed bridge is too short for this diameter. Reduce wire diameter or increase antenna dimensions / clearance.');let segments=source||single?1:Math.max(1,Math.ceil(length/meshWave*density-1e-10));if(odd&&segments%2===0)segments++;if(length/segments<r*8){let candidate=Math.floor(length/(r*8.1));if(odd&&candidate%2===0)candidate--;if(!source&&!single&&candidate>=1&&length/candidate<=meshWave*.05){segments=candidate;const note='Segmentation reduced on short / thick wire sections to preserve the NEC segment-length / radius ratio.';if(!warnings.includes(note))warnings.push(note);}else throw Error('Segments are too short relative to wire diameter. Use a thinner wire or Standard mesh.');}const wire={tag:wires.length+1,segments,start:a,end:b,radiusM:r};wires.push(wire);if(source)ports.push({tag:wire.tag,segment:1,name:'Feed '+(ports.length+1)});return wire;}
 function path(points){for(let i=1;i<points.length;i++)add(points[i-1],points[i]);}
 function straightFeed(points){const w=add(points[0],points[1],{odd:true});ports.push({tag:w.tag,segment:(w.segments+1)/2,name:'Feed '+(ports.length+1)});feed=midpoint(...points);}
 if(END_FED.includes(s.type)){
  const ret=returnConfiguration(s),{mode,count,length,slope:slopeDegrees}=ret,slope=slopeDegrees*Math.PI/180,returnRadius=(ret.diameter??s.wireDiameter??2)/2000,feedRadius=Math.max(radius,returnRadius);
  const groundRun=mode==='ground';if(groundRun&&s.ground==='free')throw Error('Ground runs need a ground / soil setting. Choose one in Ground, wire & mesh.');
  const points=paths[0].points,base=points[0],next=points[1],returnClearance=groundRun?ret.groundHeight:base[2]-length*Math.sin(slope);if(s.ground!=='free'&&returnClearance<=feedRadius)throw Error('Every return wire must remain above ground by more than its radius. Raise the antenna or reduce return-wire slope.');
  if(groundRun&&base[2]<=ret.groundHeight+.04)throw Error('The feed point must be above the ground-run model height by at least 0.05 m. Raise the feed / apex height.');
  // Preserve equal source / adjacent segment lengths, even for short returns.
  const delta=Math.min(Math.max(portWave*.0025,4.5*feedRadius),distance(base,next)/20,length/6,s.ground==='free'?Infinity:groundRun?(base[2]-ret.groundHeight)/6:Math.min(base[2],returnClearance)/4);
  const high=along(base,next,delta),low=along(base,next,-delta);add(low,high,{source:true,wireRadius:feedRadius});const near=along(high,next,2*delta);add(high,near,{single:true,wireRadius:feedRadius});path([near,...points.slice(1)]);paths[0].points=[high,...points.slice(1)];paths.push({points:[low,high]});feed=midpoint(low,high);
  // A vertical first section has no azimuth. Use the following horizontal
  // direction, or the selected bearing, so the whole installation rotates rigidly.
  const horizontal=points.slice(1).map((p,i)=>[p[0]-points[i][0],p[1]-points[i][1]]).find(v=>Math.hypot(...v)>1e-9);
  const az=(horizontal?Math.atan2(horizontal[1],horizontal[0]):Math.PI/2-s.bearing*Math.PI/180)-(ret.bearingOffset??180)*Math.PI/180;
  let hub=low,drop=0;if(groundRun){hub=[low[0],low[1],ret.groundHeight];drop=distance(low,hub);const near=along(low,hub,2*delta);add(low,near,{single:true,wireRadius:feedRadius});add(near,hub,{wireRadius:returnRadius});paths.push({points:[low,hub]});}
  for(let i=0;i<count;i++){const spread=ret.spread??360,offset=count===1?0:spread===360?i*2*Math.PI/count:(i/(count-1)-.5)*spread*Math.PI/180,a=az+offset,sl=groundRun?0:slope,end=[hub[0]+length*Math.cos(sl)*Math.cos(a),hub[1]+length*Math.cos(sl)*Math.sin(a),hub[2]-length*Math.sin(sl)];if(groundRun)add(hub,end,{wireRadius:returnRadius});else{const near=along(hub,end,2*delta);add(hub,near,{single:true,wireRadius:feedRadius});add(near,end,{wireRadius:returnRadius});}paths.push({points:[hub,end]});}
  returnDescription=groundRun?`${count} ground run${count>1?'s':''} × ${length.toFixed(3)} m, modeled ${ret.groundHeight.toFixed(3)} m above soil; ${drop.toFixed(3)} m shared connecting drop; ${ret.spread}° spread`:mode==='coax'?`Coax shield approximation, ${length.toFixed(3)} m to ideal choke, ${ret.diameter} mm equivalent diameter, ${slopeDegrees}° down`:`${count} ${mode==='radials'?'radial':'counterpoise'} wire${count>1?'s':''}, ${length.toFixed(3)} m each, ${slopeDegrees}° down`;
  if(groundRun)warnings.push('Near-soil approximation: wires are raised above the surface, not touching or buried in soil. Soil contact, insulation and ground stakes are not modeled. Check sensitivity to model clearance and mesh; these SWR estimates are not a validated on-ground installation prediction.');
  portDescription='End feed with short series feed bridge';warnings.push(mode==='coax'?'Coax shield is approximated by a bare conductor ending at an ideal common-mode choke. No jacket, differential transmission-line loss, finite choke impedance or station earth is modeled.':'End-fed impedance depends strongly on the return wire and feed bridge. Check mesh sensitivity; the coax outer conductor is not modeled.');
 }else if(['loop','delta'].includes(s.type)){
  const points=paths[0].points,w=add(points[0],points[1],{odd:true});ports.push({tag:w.tag,segment:(w.segments+1)/2,name:'Loop feed'});path(points.slice(1));feed=midpoint(points[0],points[1]);portDescription='Loop feed at middle of first side';
 }else{
  const driven=s.type.startsWith('yagi')?[1]:s.type==='array'?[0,1]:[0];
  paths.forEach((p,index)=>{
   if(!driven.includes(index)){path(p.points);return;}
   if(p.points.length===2){straightFeed(p.points);return;}
   const ci=s.type==='hexbeam'?2:1,center=p.points[ci],delta=Math.min(Math.max(portWave*.0025,9*radius/distance(along(center,p.points[ci-1],1),along(center,p.points[ci+1],1))),distance(center,p.points[ci-1])/10,distance(center,p.points[ci+1])/10),a=along(center,p.points[ci-1],delta),b=along(center,p.points[ci+1],delta);
   const size=distance(a,b),aa=along(a,p.points[ci-1],size),bb=along(b,p.points[ci+1],size);path([...p.points.slice(0,ci),aa]);add(aa,a,{single:true});add(a,b,{source:true});add(b,bb,{single:true});path([bb,...p.points.slice(ci+1)]);p.points=[...p.points.slice(0,ci),a,b,...p.points.slice(ci+1)];feed=midpoint(a,b);portDescription='Balanced feed across short apex bridge';
  });
 }
 const segmentCount=wires.reduce((n,w)=>n+w.segments,0);
 if(segmentCount>900)throw Error(`This geometry needs ${segmentCount} segments. Offline solve limit is 900; reduce electrical size or choose Standard mesh.`);
 if(s.ground!=='free'&&wires.some(w=>Math.min(w.start[2],w.end[2])<=w.radiusM))throw Error('Every wire must remain above ground by more than its radius. Raise the antenna or reduce return-wire slope. Buried wires / earth stakes are not supported.');
 if(wires.some(w=>distance(w.start,w.end)/w.segments/wave<.001))warnings.push('Some segments are shorter than 0.001 wavelength; impedance can be sensitive to segmentation.');
 if(s.type==='hexbeam')warnings.push('Single-band KIO-inspired wire dimensions; spreaders and the real multiband stack are not electrically modeled.');
 if(s.type.startsWith('yagi'))warnings.push('Preset dimensions are a starting geometry, not an optimized commercial Yagi. Reflectors and directors are passive in NEC.');
 if(s.type==='array')warnings.push('Two coupled feed ports driven by equal Thevenin sources at 0° / −90°. An actual phasing harness is not modeled.');
 const soil=soilProperties(s);if(!['free','perfect'].includes(s.ground)&&soil.sigma<=0)throw Error('NEC finite ground requires conductivity above zero. Enter a positive conductivity, or select Free space / Perfect ground.');const ground=s.ground==='free'?{kind:'free-space'}:s.ground==='perfect'?{kind:'perfect'}:{kind:'finite',method:'sommerfeld-norton',relativePermittivity:soil.er,conductivitySPerM:soil.sigma};
 return {wires,ports,paths,supports:original.supports,feed,ground,segmentCount,warnings,returnDescription,portDescription,radius,balanced:!END_FED.includes(s.type)};
}
export function necDeck(s,g=necGeometry(s)){
 const lines=['CM FieldLab NEC2++ model; metres; one-based source segments','CM '+g.portDescription,'CM '+g.returnDescription,'CM Ideal voltage EX sources; device and source resistance are not embedded.','CM See Full solve JSON for actual coupled-port currents and matching assumptions.','CE',...g.wires.map(w=>`GW ${w.tag} ${w.segments} ${[...w.start,...w.end,w.radiusM].join(' ')}`),'GE 0'];
 if(g.ground.kind==='perfect')lines.push('GN 1');else if(g.ground.kind==='finite')lines.push(`GN 2 0 0 0 ${g.ground.relativePermittivity} ${g.ground.conductivitySPerM}`);else lines.push('GN -1');
 if(s.material!=='perfect')for(const w of g.wires)lines.push(`LD 5 ${w.tag} 0 0 ${s.material==='aluminum'?3.5e7:5.8e7}`);
 lines.push(`FR 0 1 0 0 ${s.freq} 0`);g.ports.forEach((p,i)=>lines.push(`EX 0 ${p.tag} ${p.segment} 0 ${i===1?0:1} ${i===1?-1:0}`));lines.push(`RP 0 ${g.ground.kind==='free-space'?37:19} 73 1000 0 0 5 5 0 0`,'EN');return lines.join('\n')+'\n';
}
