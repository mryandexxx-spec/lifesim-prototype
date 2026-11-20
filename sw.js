/* Блин’С: versioned, same-origin cache for the two immutable character GLBs.
 * Bump CACHE_VERSION whenever a GLB is replaced at the same URL.
 * This is an optimization, not an offline guarantee for the full game.
 */
const CACHE_VERSION='blins-models-v3-room-meshy-batch02';
const CACHE_PREFIX='blins-models-';
const MODEL_FILES=new Set([
  'assets/characters/meshy-casual-v1.glb',
  'assets/characters/meshy-mira-mobile-v1.glb',
  ...[
    'sofa.comfort','sofa.loft','armchair.wing','armchair.shell','bed.platform',
    'bookcase.starter','dresser.reed','floorlamp.tripod','legacy.plant',
    'mirror.panel','plant.palm','rug.geo','rug.weave','sconce.halo',
    'wardrobe.classic'
  ].map(sku=>'assets/furniture/meshy-room-v1/'+sku+'.glb'),
  ...["nightstand_decor","vanity_set","coffee_table","tv_media_console","wall_art_triptych","dining_set","kitchen_sink_cabinet","kitchen_stove","cream_fridge","microwave_counter","pantry_shelf","glass_shower","bathroom_toilet","bathroom_sink_set","home_office_set","fluffy_rug","round_jute_rug","large_leaf_plant","snake_plant","small_potted_plant","hanging_plant","green_curtains","wooden_blinds","floating_shelf","white_radiator","wicker_hamper","wicker_storage_box","coat_rack","green_pendant_light","globe_chandelier","bedside_lamp","wooden_dining_chair","office_swivel_chair","counter_microwave","bathroom_towel_ring"].map(slug=>'assets/furniture/meshy-room-v2/'+slug+'.glb')
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
