# QSK-04 — pinned GLB/texture asset passport and visual QA

**Scope:** read-only checks of the 65 GLB files currently tracked on PUBLIC main: original Alex, original Mira, 15 v1 furniture assets, 35 v2 furniture assets and 13 staged v3 furniture assets. The original Alex/Mira binaries, accepted footwear, protected PR #145, CAS-02.2-B art branch, runtime, service worker, localStorage and asset loader **must remain untouched**.

## Reproducible source registry

`docs/qsk-04-asset-registry.json` pins the SHA-256, byte size, source/evidence references, asset category, stage, rig/clip expectations and non-promoting validation budgets for Alex and Mira. For furniture it references the existing three authoritative `manifest.json` files, rather than silently copying their SHA values into another conflicting source of truth. This deliberately excludes generated-on-CI footwear and CAS-02.2-B candidate art, which require their own approved release provenance.

Run `node scripts/qsk-04-asset-qa.mjs` from the repository root to produce `artifacts/qsk-04/asset-passport.json`. The command **fails closed** on missing/changed GLBs, invalid GLB2 chunks/BIN/accessors/UV/skin data, wrong source SHA or bytes, unexpected existing rig/clip/triangle metadata, and exceeded audit budgets. The report covers raw local-space accessor bounds, basic skin/inverse-bind existence, UV and normal coverage, morph count, embedded PNG/JPEG dimensions, primitives, material and texture counts.

Budgets are conservative QA alarms, **not** artistic approvals: character <= 30,000 triangles per GLB, furniture <= 20,000, texture longest edge <= 2,048 pixels. A scanned bounding box is **not** a verified world pivot, authored unit scaling, physical contact, LOD chain, aesthetic suitability, skin continuity, texture color accuracy or licence proof.

### Licences and release gate

Existing published assets may pass binary integrity while their underlying ownership/license chain remains **`unknown-not-cleared`**. Existing Meshy owner uploads and catalog names do not constitute an independent commercial re-use licence. This new registry never confers permission to integrate or ship *new* characters, garments or furniture. `rightsCleared=false`, `readyForNewIntegration=false` and `newIntegrationsApproved=0` are intentional. Missing evidence must be resolved in the relevant asset/CAS approval process; no implicit promotions.

### Real reference frames

`tests/qsk-04-browser-visual.mjs` uses genuine PlayCanvas 2.24.1 rendering under mobile Chromium/SwiftShader, loading the existing untouched source Alex and Mira in standalone `character-lab*.html` routes at 390x844 and 320x568. It captures three camera angles for each of four combinations (12 PNG controls), verifies original animation clip counts, canvas/mesh presence, distinct orbit views, absence of page errors and *byte-for-byte unchanged* `lifesim.room01.v1` localStorage sentinel. CI stores the screenshots and JSON report as PR artifacts. SwiftShader is **not** measured real iPhone Safari, and those screenshots are not acceptance of CAS-02.2-B identities.

## Status and dependencies

Only the independent QSK-04 validation track is in scope. CAS-02.2-B owner art gate remains open; QSK-05 new-character motion tests, QSK-10 optimizations and CAS-dependent production loaders remain blocked until the relevant CAS source-derived art/asset gates pass. No new runtime 3D model is installed by this change.

**Skills read:** `playcanvas-lifesim`, `create-game-assets`, `threejs-gltf-loading` (format-only, **no THREE runtime**), `pc-inspect-glb`, `blender-asset-qa`, `pc-verify-pixels`, `pc-load-assets`. Content remains JavaScript ESM / PlayCanvas, with no new build dependency.
