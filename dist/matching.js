export const RATIOS=[1,2,4,9,49,64];
export const complex=(r=0,i=0)=>[r,i];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
export function divide(a,b){const d=b[0]**2+b[1]**2;return d>1e-30?[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d]:[NaN,NaN];}
export function swr(z,reference=50){
 if(!Number.isFinite(reference)||reference<=0)throw Error('Radio reference impedance must be positive and finite.');
 if(!Number.isFinite(z[0])||!Number.isFinite(z[1])||z[0]<=0)return Infinity;
 // q=(SWR+1/SWR)/2. Scale first, then avoid subtracting |Gamma| from 1:
 // that subtraction loses precision (or rounds to zero) for very high mismatch.
 const scale=Math.max(z[0],Math.abs(z[1]),reference),r=z[0]/scale,x=z[1]/scale,z0=reference/scale;
 const q=Math.max(1,(r*r+x*x+z0*z0)/(2*r*z0));
 return q+Math.sqrt(q-1)*Math.sqrt(q+1);
}
export function drive(matrix,{ratio=1,reference=50,loss=0}={}){
 const n=matrix.rows,z=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>[matrix.real[i*n+j],matrix.imag[i*n+j]]));
 const resistance=ratio*reference,scale=Math.sqrt(ratio)*10**(-loss/20),v=Array.from({length:n},(_,i)=>i===1?[0,-scale]:[scale,0]),a=z.map((row,i)=>row.map((x,j)=>add(x,i===j?[resistance,0]:[0,0])));let currents;
 if(n===1)currents=[divide(v[0],a[0][0])];else{const det=add(mul(a[0][0],a[1][1]),mul([-a[0][1][0],-a[0][1][1]],a[1][0]));currents=[divide(add(mul(v[0],a[1][1]),mul([-a[0][1][0],-a[0][1][1]],v[1])),det),divide(add(mul(a[0][0],v[1]),mul([-a[1][0][0],-a[1][0][1]],v[0])),det)];}
 const terminal=z.map(row=>row.reduce((sum,x,j)=>add(sum,mul(x,currents[j])),[0,0])),raw=n===1?[[matrix.real[0],matrix.imag[0]]]:terminal.map((x,i)=>divide(x,currents[i])),presented=raw.map(x=>x.map(a=>a/ratio)),swrs=presented.map(x=>swr(x,reference));
 const accepted=terminal.reduce((sum,x,i)=>sum+.5*(x[0]*currents[i][0]+x[1]*currents[i][1]),0),available=n/(8*reference);
 return {currents,raw,presented,swrs,accepted,available,transfer:accepted/available,ratio,reference,loss};
}
export function recommend(matrix,reference=50,balanced=false){return (balanced?[1,2,4,9]:RATIOS).map(ratio=>drive(matrix,{ratio,reference})).sort((a,b)=>b.transfer-a.transfer)[0];}
export const ohms=z=>Number.isFinite(z[0])&&Number.isFinite(z[1])?`${z[0].toFixed(1)} ${z[1]<0?'−':'+'} j${Math.abs(z[1]).toFixed(1)} Ω`:'Undefined';
export const formatSWR=n=>Number.isFinite(n)?`${n.toFixed(n<10?2:1)}:1`:'∞';
export function materialize(result,s){
 const d=drive(result.matrix,{ratio:s.matchRatio??1,reference:s.referenceZ??50,loss:s.deviceLoss??0}),basis=result.basis,first=basis[0],size=first.eThetaReal.length,field=Array.from({length:4},()=>new Float64Array(size));
 const names=['eThetaReal','eThetaImag','ePhiReal','ePhiImag'];basis.forEach((b,p)=>{const [r,i]=d.currents[p];for(let k=0;k<size;k++){for(const offset of [0,2]){field[offset][k]+=r*b[names[offset]][k]-i*b[names[offset+1]][k];field[offset+1][k]+=r*b[names[offset+1]][k]+i*b[names[offset]][k];}}});
 if(!(d.accepted>0))throw Error('NEC returned non-positive accepted power for this feed. Check the geometry and port definition.');
 const grounded=s.ground!=='free',min=grounded?0:-90,rows=grounded?18:36,cols=72,values=[];let max=0,peakAz=0,peakEl=0,integrated=0;
 for(let j=0;j<=rows;j++){const el=min+j*5,theta=Math.round((90-el)/5),row=[];for(let i=0;i<=cols;i++){const az=i*5,phi=((90-az+360)%360)/5,k=phi*(rows+1)+theta,power=field.reduce((sum,plane)=>sum+plane[k]**2,0),gain=4*Math.PI*power/(2*376.730313668*(s.gainMetric==='realized'?d.available:d.accepted));row.push(gain);if(i<cols){if(gain>max){max=gain;peakAz=az%360;peakEl=el;}integrated+=gain*Math.cos(el*Math.PI/180)*(j===0||j===rows?.5:1);}}values.push(row);}
 const currents=result.currentBases[0].segments.map((segment,k)=>{let r=0,i=0;result.currentBases.forEach((b,p)=>{const cr=b.aReal[k]+b.cReal[k],ci=b.aImag[k]+b.cImag[k],[ar,ai]=d.currents[p];r+=cr*ar-ci*ai;i+=cr*ai+ci*ar;});return {start:Array.from(result.currentBases[0].startsM.slice(k*3,k*3+3)),end:Array.from(result.currentBases[0].endsM.slice(k*3,k*3+3)),amplitude:Math.hypot(r,i),phase:Math.atan2(i,r),...segment};});
 const spaceFraction=integrated*(Math.PI/36)**2/(4*Math.PI)/(s.gainMetric==='realized'?d.transfer:1);
 return {s:{...s},engine:'nec2',values,rows,cols,min,max,peakAz,peakEl,gain:10*Math.log10(max),integral:4*Math.PI,paths:result.geometry.paths,supports:result.geometry.supports,feed:result.geometry.feed,segments:currents,currents,matching:d,nec:result,spaceFraction};
}
