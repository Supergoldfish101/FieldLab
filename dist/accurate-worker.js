import {solveNEC} from './accurate-core.js';
self.onmessage=async event=>{try{const result=await solveNEC(event.data,message=>self.postMessage({progress:message}));self.postMessage({result});}catch(error){self.postMessage({error:error.message||String(error)});}};
