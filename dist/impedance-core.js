import {createNecModel} from './vendor/necpp/index.js';
import {necGeometry} from './accurate-geometry.js';
export async function impedanceSamples(s,frequencies=[s.freq],onSample=()=>{}){
 const g=necGeometry({...s,meshFrequency:Math.max(s.freq,...frequencies)}),m=await createNecModel();
 try{for(const w of g.wires)m.addWire(w);m.completeGeometry();m.definePorts(g.ports);m.setGround(g.ground);if(s.material!=='perfect')for(const w of g.wires)m.addLoad({kind:'conductivity',target:{tag:w.tag},conductivitySPerM:s.material==='aluminum'?3.5e7:5.8e7});
  const results=[];for(const freq of frequencies){m.prepare({frequencyMHz:freq});const sample={freq,matrix:m.computeImpedanceMatrix().impedance};results.push(sample);onSample(sample,results.length,frequencies.length);}return {samples:results,segmentCount:g.segmentCount,warnings:g.warnings,returnDescription:g.returnDescription};
 }finally{m.dispose();}
}
