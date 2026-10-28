// Low-angle pattern candidates, not an ionospheric propagation prediction.
export function dxPeak(model,low=5,high=20){
 let best=null;
 for(let j=0;j<=model.rows;j++){
  const el=model.min+(90-model.min)*j/model.rows;
  if(el<low||el>high)continue;
  for(let i=0;i<model.cols;i++){
   const power=model.values[j][i];
   if(power>1e-20&&(!best||power>best.power))best={power,az:i*360/model.cols,el,gain:10*Math.log10(4*Math.PI*power/model.integral)};
  }
 }
 return best;
}
export function dxCandidate(gain,el,low,high,best){return !!best&&el>=low&&el<=high&&gain>=best.gain-3;}
export function closestCutElevation(radius,mainRadius,dxRadius,mainEl,dxEl){return Math.abs(radius-dxRadius)<Math.abs(radius-mainRadius)?dxEl:mainEl;}
