/** Optional Safari/PWA optimization. Model delivery still works if SW is unavailable. */
export async function registerModelCache(serviceWorker=globalThis.navigator?.serviceWorker) {
  if(!serviceWorker?.register)return false;
  try {
    await serviceWorker.register('./sw.js',{scope:'./'});
    // On the FIRST visit, registration.ready can resolve before clients.claim()
    // controls this tab. Wait briefly for controllerchange so the very first
    // GLB requests are intercepted and cached for the NEXT visit.
    let onChange;
    let timeout;
    try {
      await Promise.race([
        new Promise(resolve=>{
          if(serviceWorker.controller){resolve();return;}
          onChange=()=>resolve();
          serviceWorker.addEventListener('controllerchange',onChange,{once:true});
          if(serviceWorker.controller)resolve();
        }),
        new Promise(resolve=>{timeout=setTimeout(resolve,2500);})
      ]);
    } finally {
      if(timeout)clearTimeout(timeout);
      if(onChange)serviceWorker.removeEventListener('controllerchange',onChange);
    }
    return Boolean(serviceWorker.controller);
  } catch(error) {
    console.warn('Model cache unavailable; using normal browser requests',error);
    return false;
  }
}
