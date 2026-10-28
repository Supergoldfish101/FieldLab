export function initPWA({showDialog,notify}){
 const button=document.getElementById('install-app'),badge=document.querySelector('.local-badge');
 let installPrompt=null,offlineReady=false,registration=null,problem='',cacheInfo=null;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 button.hidden=standalone();if(badge)badge.onclick=installGuide;
 function status(){
  const label=offlineReady?(navigator.onLine?'Offline ready':'Offline · ready'):problem?'Offline setup needs attention':navigator.onLine?'Preparing offline files…':'Offline · setup incomplete';
  if(badge){badge.textContent=label;badge.dataset.pwaStatus=offlineReady?'ready':problem?'error':'preparing';}
  const footer=document.querySelector('footer>span');if(footer)footer.textContent=label+' · calculations run on your device';
 }
 window.addEventListener('online',status);window.addEventListener('offline',status);
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;button.dataset.installAvailable='true';});
 window.addEventListener('appinstalled',()=>{installPrompt=null;button.hidden=true;notify('FieldLab installed.');});
 async function checkFiles(){
  const worker=navigator.serviceWorker.controller||registration?.active;if(!worker)throw Error('The offline worker is not active yet. Retry in a moment.');
  const result=await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Offline check timed out. Reload and retry.'));},5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);});
  if(!result.complete)throw Error('Some app files are missing. Use Repair offline files, then reopen online.');
  cacheInfo=result;offlineReady=true;problem='';status();return result;
 }
 function installGuide(){
  showDialog('Install & offline use',`<p id="offline-check-result"><strong>${offlineReady?'Offline files verified':problem?'Offline setup needs attention':'Preparing offline files'}</strong>${cacheInfo?' · '+cacheInfo.count+' required files stored.':''}</p>${problem?'<p>Offline download failed. Check your connection and retry. If this site is restricted again, its access policy must allow the browser’s service-worker request.</p>':''}<p><strong>Chrome / Edge:</strong> use Install in the address bar or browser menu → Install FieldLab / Apps → Install this site as an app.</p><p><strong>Android:</strong> Chrome menu → Add to Home screen → Install.</p><p><strong>iPhone / iPad:</strong> Safari → Share → Add to Home Screen → Open as Web App.</p><p>Wait for <strong>Offline ready</strong> before disconnecting. After that, reopen the same installed app or saved URL offline. Modeling, charts, saved setups, unit conversion, JSON / CSV export and print sheets work on your device. Saved antenna data stays in this browser; export JSON for backup. Fonts fall back to local fonts offline.</p><button class="button" id="check-offline-files">Check offline files</button><button class="button" id="retry-offline-setup">Retry offline setup</button><p><a href="repair.html">Repair offline files</a> keeps saved setups and preferences.</p>`);
  document.getElementById('check-offline-files').onclick=async()=>{const output=document.getElementById('offline-check-result');output.textContent='Checking stored app files…';try{const result=await checkFiles();output.textContent=`Offline files verified · ${result.count} required files stored.`;}catch(error){output.textContent=error.message;}};
  document.getElementById('retry-offline-setup').onclick=async()=>{await register();installGuide();};
 }
 button.onclick=async()=>{if(installPrompt){const prompt=installPrompt;installPrompt=null;delete button.dataset.installAvailable;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome!=='accepted')installGuide();return;}installGuide();};
 const update=document.getElementById('pwa-update');let controlled=!!navigator.serviceWorker?.controller;
 navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(controlled)location.reload();else controlled=true;});
 async function register(){
  if(!('serviceWorker'in navigator)){problem='Service workers are unavailable in this browser.';status();return;}
  try{
   problem='';status();registration=await navigator.serviceWorker.register('./service-worker.js',{type:'module',updateViaCache:'none'});
   const offer=()=>{update.hidden=false;document.getElementById('pwa-update-button').onclick=()=>registration.waiting?.postMessage({type:'ACTIVATE_UPDATE'});};
   if(registration.waiting)offer();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offer();if(worker.state==='redundant'&&!offlineReady){problem='Offline file download did not complete.';status();}});});
   registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Offline download is taking too long. Check your connection and retry.')),30000))]);await checkFiles();registration.update().catch(()=>{});
  }catch(error){if(navigator.serviceWorker.controller){try{await checkFiles();return;}catch{}}problem=String(error?.message||error);offlineReady=false;status();console.warn('Offline setup unavailable:',error);}
 }
 status();register();
}
