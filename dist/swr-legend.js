export function swrLegend(ratio,reference,device='device'){
 const selected=Number(ratio)===1?'Selected 1:1 · direct feed':`With ${Number(ratio)}:1 ${device}`;
 return `<div class="swr-legend" role="group" aria-label="SWR chart legend"><span><i class="swr-key-selected" aria-hidden="true"></i>${selected}</span><span><i class="swr-key-direct" aria-hidden="true"></i>Direct · no transformer</span><span><i class="swr-key-target" aria-hidden="true"></i>SWR 2:1</span><span><i class="swr-key-edge" aria-hidden="true"></i>Band edges</span><span><i class="swr-key-window" aria-hidden="true"></i>Band window</span><small>Reference: ${Number(reference)} Ω${Number(ratio)===1?' · Selected and direct curves overlap.':''}</small></div>`;
}
