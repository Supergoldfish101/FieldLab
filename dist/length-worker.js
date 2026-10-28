import {impedanceSamples} from './impedance-core.js';
import {searchLength,resizeAntenna} from './length-tools.js';
import {prepareSweepState} from './band-sweep.js';
self.onmessage=async({data})=>{try{
 if(data.task==='tune'){
  const result=await searchLength(data.state,data.options,async s=>(await impedanceSamples(s)).samples[0].matrix,p=>self.postMessage({progress:`Tuning · ${p.tested} lengths · best SWR ${p.bestSWR?.toFixed(2)??'—'}:1`}));self.postMessage({tuned:result});
 }else if(data.task==='sweep'){
  const frequencies=[...new Set(data.bands.flatMap(b=>b.frequencies))],s=prepareSweepState(data.state,data.length,data.bands,data.lPolicy);
  const r=await impedanceSamples(s,frequencies,(_,done,total)=>self.postMessage({progress:`NEC sweep · ${done}/${total} frequencies`}));
  for(const b of data.bands)self.postMessage({band:{...b,samples:b.frequencies.map(freq=>r.samples.find(p=>p.freq===freq))}});
  self.postMessage({sweepComplete:{state:s,segmentCount:r.segmentCount,warnings:r.warnings,returnDescription:r.returnDescription}});
 }else if(data.task==='bands'){
  for(let i=0;i<data.lengths.length;i++){const length=data.lengths[i];self.postMessage({progress:`NEC band estimates · length ${i+1}/${data.lengths.length}`});try{
   const resized=resizeAntenna(data.state,length,data.lPolicy),frequencies=[...new Set(data.bands.flatMap(b=>b.frequencies))],s={...resized,meshFloorMHz:Math.max(resized.freq,...frequencies),portReferenceMHz:Math.max(resized.portReferenceMHz||resized.freq,Math.max(...frequencies)/10)},r=await impedanceSamples(s,frequencies),bands=data.bands.map(b=>({...b,samples:b.frequencies.map(freq=>r.samples.find(p=>p.freq===freq))}));self.postMessage({candidate:{length,state:s,bands,segmentCount:r.segmentCount,warnings:r.warnings,returnDescription:r.returnDescription}});
  }catch(error){self.postMessage({candidate:{length,error:error.message}});}}
  self.postMessage({complete:true});
 }
 }catch(error){self.postMessage({error:error.message||String(error)});}};
