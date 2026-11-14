/* Блин’С: versioned, same-origin cache for the two immutable character GLBs.
 * Bump CACHE_VERSION whenever a GLB is replaced at the same URL.
 * This is an optimization, not an offline guarantee for the full game.
 */
const CACHE_VERSION='blins-models-v1';
const CACHE_PREFIX='blins-models-';
const MODEL_FILES=new Set([
  'assets/characters/meshy-casual-v1.glb',
  'assets/characters/meshy-mira-mobile-v1.glb'
]);
self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try {
      const names=await caches.keys();
      await Promise.all(names
        .filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_VERSION)
        .map(name=>caches.delete(name)));
    }catch(error){console.warn('Model cache cleanup skipped',error);}
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const scopePath=new URL(self.registration.scope).pathname;
  if(!url.pathname.startsWith(scopePath))return;
  const path=url.pathname.slice(scopePath.length);
  if(!MODEL_FILES.has(path))return;
  event.respondWith((async()=>{
    let cache;
    try {
      cache=await caches.open(CACHE_VERSION);
      const stored=await cache.match(request,{ignoreSearch:true});
      if(stored)return stored;
    }catch(error){console.warn('Model cache read unavailable',error);}
    const response=await fetch(request);
    if(cache && response.ok && response.type!=='opaque') {
      // Keep original fetch response available immediately to PlayCanvas.
      event.waitUntil(cache.put(request,response.clone()).catch(error=>{
        console.warn('Model cache write unavailable',error);
      }));
    }
    return response;
  })());
});
