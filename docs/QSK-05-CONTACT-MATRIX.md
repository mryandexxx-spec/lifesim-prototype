# QSK-05 — original-rig animation/contact matrix (independent phase)

**Status:** initial audit-only instrumentation. CAS-02.2-B is NOT owner-art-approved; final 2–4 different body/wardrobe rig contacts are BLOCKED. This file must never be used as proof of final source-footwear/character artistry or physical iPhone Safari testing.

## Verified scope / instrumentation

- Reads original, existing Alex/Mira GLB files only; verifies *exact* bytes/SHA and 66-joint / existing clip count against QSK-04 manifest. No new rights, production integration, asset rewriting, save schema change, runtime import or acceptance.
- Samples original authored `Idle*`, `Walking`, `Running` (when present) and `Sit_to_Stand*` clip nodes with source matrices. Records paired left/right ankle proxy height/travel, head/pelvis travel, near-low-ankle frames, plus honest gaps in `artifacts/qsk-05/original-rig-matrix.json`.
- Tests the same real source clips in PlayCanvas 2.24.1 headless Chromium/SwiftShader, two viewport sizes 390×844 and 320×568; captures actual animated render frames and verifies nonzero joint movement. The 12 images and JSON report are CI artifacts.
- Inspects only the **existing** sources and source clips. Missing stand/sit/bed/shower/social/heel/furniture collision coverage cannot be silently marked PASS. Heel-specific *separate* accepted C4C lab and its existing fit tests remain unchanged.
- GlTF animations may animate joints without guaranteeing correct skin vertices on a world floor. Ankle height minima **are not measured outsole vertices**. A near-low-ankle marker is not stable planted contact, world-space collision, heel/toe rocker, correct seat surface, no foot sliding, or artistic approval. The rig transform is never edited.

## CAS dependency gate

**GO-INDEPENDENT-ONLY** for this read-only original-source audit. Hard-blocked requirements: source-derived approved distinct identities, source-family-specific morph/garment skin contracts, independent 2–4 novel body silhouettes, all transitions with measured *actual* floor/seat/bed/shower/paired-social/wearable collisions, accepted C4C heel geometry in a final supported wardrobe, and PlayCanvas art approval. Unlock only after CAS-02.2-B, CAS-02.3/02.4 and CAS-04 corresponding art, rig, source licences, build and release evidence have been verified.

## Invariants

No changes to `src/game.js`, `src/animations.js`, authored GLB, approved footwear, SW, `lifesim.room01.v1`, original resident names/appearance or protected PR #145. No Three.js runtime. Do not claim Safari hardware QA or any production game feature by running the preview test.

Skills loaded: `playcanvas-lifesim`, `pc-configure-animation`, `pc-inspect-glb`, `pc-verify-pixels`, `blender-animation`, `threejs-gltf-loading`, `create-game-assets` (format-level only; no engine switch).
