/** Optional Safari/PWA optimization. Model delivery still works if SW is unavailable. */
export async function registerModelCache(serviceWorker=globalThis.navigator?.serviceWorker) {
  if(!serviceWorker?.register)return false;
  try {
    await serviceWorker.register('./sw.js',{scope:'./'});
    // Let an installed SW claim the first visit before issuing GLB requests.
    // A browser that blocks activation must not hold the game hostage.
    await Promise.race([
      serviceWorker.ready,
      new Promise(resolve=>setTimeout(resolve,2000))
    ]);
    return Boolean(serviceWorker.controller);
  } catch(error) {
    console.warn('Model cache unavailable; using normal browser requests',error);
    return false;
  }
}
