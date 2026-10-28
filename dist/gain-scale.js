export function gainReference(model,comparison=null,absolute=false){return absolute?Math.max(model.gain,comparison?.gain??-Infinity):model.gain;}
export function gainRadius(gain,reference,floor){return Math.max(0,Math.min(1,1+(gain-reference)/floor));}
export function gainAtRadius(radius,reference,floor){return reference-floor*(1-radius);}
export function zeroGainRadius(reference,floor){return reference>=0&&reference-floor<=0?gainRadius(0,reference,floor):null;}
