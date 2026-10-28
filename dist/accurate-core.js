import {createNecModel} from './vendor/necpp/index.js';
import {necGeometry} from './accurate-geometry.js';
export async function solveNEC(s,progress=()=>{}){
 const start=performance.now(),g=necGeometry(s);progress(`Loading NEC2++ · ${g.segmentCount} segments`);const m=await createNecModel();
 try{
  for(const w of g.wires)m.addWire(w);m.completeGeometry();m.definePorts(g.ports);m.setGround(g.ground);
  if(s.material!=='perfect')for(const w of g.wires)m.addLoad({kind:'conductivity',target:{tag:w.tag},conductivitySPerM:s.material==='aluminum'?3.5e7:5.8e7});
  progress('Solving coupled currents and feed impedance');m.prepare({frequencyMHz:s.freq});const matrix=m.computeImpedanceMatrix().impedance,basis=[],currentBases=[];
  for(let p=0;p<g.ports.length;p++){const r=new Float64Array(g.ports.length),i=new Float64Array(g.ports.length);r[p]=1;m.solveCurrents({real:r,imag:i});basis.push(m.computeFarField({radiusM:1,theta:{startDeg:0,count:s.ground==='free'?37:19,stepDeg:5},phi:{startDeg:0,count:73,stepDeg:5}}));currentBases.push(m.getCurrentDistribution({kind:'latest-solution'}));}
  const sweep=[],span=(s.sweepSpan??10)/100,count=15;
  for(let i=0;i<count;i++){const freq=s.freq*(1-span/2+span*i/(count-1));progress(`SWR sweep ${i+1}/${count} · ${freq.toFixed(3)} MHz`);if(Math.abs(freq-s.freq)<1e-9)sweep.push({freq,matrix});else{m.prepare({frequencyMHz:freq});sweep.push({freq,matrix:m.computeImpedanceMatrix().impedance});}}
  progress('Checking impedance with a finer mesh');let convergence=null;
  let fine;try{fine=necGeometry({...s,meshDensity:(s.mesh==='fine'?100:60)*1.5});}catch{fine={segmentCount:901};g.warnings.push('Finer-mesh check exceeded thin-wire geometry or segment limits; convergence is unavailable.');}
  if(fine.segmentCount<=g.segmentCount)g.warnings.push("Wire diameter limits further refinement; mesh convergence is unavailable.");if(fine.segmentCount<=900&&fine.segmentCount>g.segmentCount){const check=await createNecModel();try{for(const w of fine.wires)check.addWire(w);check.completeGeometry();check.definePorts(fine.ports);check.setGround(fine.ground);if(s.material!=='perfect')for(const w of fine.wires)check.addLoad({kind:'conductivity',target:{tag:w.tag},conductivitySPerM:s.material==='aluminum'?3.5e7:5.8e7});check.prepare({frequencyMHz:s.freq});const z=check.computeImpedanceMatrix().impedance;let delta=0,norm=0;for(let i=0;i<z.real.length;i++){delta+=(z.real[i]-matrix.real[i])**2+(z.imag[i]-matrix.imag[i])**2;norm+=z.real[i]**2+z.imag[i]**2;}convergence=Math.sqrt(delta/Math.max(norm,1e-20));if(convergence>.05)g.warnings.push(`Mesh sensitivity: impedance changes ${(convergence*100).toFixed(1)}% with 1.5× segment density. Refine the model before relying on the match.`);}finally{check.dispose();}}
  return {matrix,basis,currentBases,sweep,geometry:g,convergence,milliseconds:performance.now()-start,engine:'NEC2++ 2.5.0 / WASM 0.9.0',frequency:s.freq};
 }finally{m.dispose();}
}
