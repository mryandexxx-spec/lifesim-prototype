---
name: playcanvas-cas-identity-morphs
description: Create visually different NEW residents with source-fitted derivative facial topology and authentic facial/body morphs, original-rig QA, and PlayCanvas art approval.
---

# LifeSim source-preserving identity morph workflow

**Instruction-only native project skill.** Read `playcanvas-lifesim` and live PRIVATE/PUBLIC first. Owner approved `CAS-HEAD-V2-POC` on 2026-11-24: allow **NEW residents only** to receive independently authored source-fitted derivative head topology, not necessarily original vertex order. Canonical Alex and Mira original GLBs/looks remain strictly unchanged. MPFB/MakeHuman **CC0 asset data may be an internal deformation/topology donor in the isolated POC only**; never ship an unstyled MakeHuman avatar, procedural mannequin, random external replacement body, or GPL addon code. Verify every donor pin/license. Protect original rigs/animations, accepted shoes, PR #145, `lifesim.room01.v1`, `root.version=1`. Paid Meshy, Wrap or other provider actions still require explicit permission and a spend ceiling.

## Gate G0 — Source geometry
Use `pc-inspect-glb` and `blender-core` to SHA-pin exact original GLB families, indices, vertex order, UV/materials, baked clothing/hair, eyes, neck, skin weights, 66 joints, inverse bind matrices and original animations (10 Alex / 13 Mira). Map facial landmarks from actual mesh geometry; do not infer nose/eyes/lips/chin from broad Head bone weights. If topology cannot isolate these, stop and explain.

## Gate G1 — Professional source-derived new heads (approved pilot path)

Two separate invariants must be kept distinct:
- **Original heroic Alex/Mira** assets remain byte-identical, their fixed indexed mesh/rig/UV/animation untouched; zero morph on the **original** must still display unchanged original appearance. Existing G0/R2 source-indexed controls are **rejected as art**, not a recipe to tune or extend.
- **New resident derivative heads** may have a different, consistent deformation-ready head topology and individual skin UV/material. Their zero-weight state must faithfully resemble the art-approved **source-fitted family baseline**, not duplicate original vertices bit-for-bit. Body, skeleton, animation, footwear, hairline and neck fit are separate QA gates; no unlicensed or synthetic mannequin replacement.

Before sculpting: pin/check source and CC0 donor SHA/licence; inspect verified eyelid, nostril, lip, cheek and chin loops, teeth/eyes/hair parts and neck seam; create consistent base topology for both new family baselines; either Blender-authored retopo or MPFB-derived clean topology resculpted to source style. **MPFB is a donor/reference only, never a ready-to-play new resident.** Do not copy its GPL Python addon into game code. An automatically remeshed GLB does NOT certify deformable facial loops or visually correct source likeness.

Actual identity shape keys must independently change eyes/nose/lips/cheeks/chin with neutral and mixed poses, per-identity corrective UV/textures where needed. A single 1.20× P95 area-stretch measure is a **diagnostic risk flag for unchanged baked atlases**, not a universal threshold for professionally designed morphs. Use actual close-up appearance, topology/normal inversion, material/UV distortion, eye contact, blink/smile, and photo-equivalent front/profile/three-quarter evidence; never hide defects by tiny sliders or relaxing tests to claim art pass.

**The approved task is a POC**, not permission to merge production CAS. Keep source fitting, original rig transfer, UV correction and owner art approval explicitly **false** until separately verified in real artifacts.

## Gate G2 — Animations, geometry, outfits
Use `blender-character-rigging`, `blender-animation`, `blender-asset-qa` and `blender-export-pipelines`. Check mixed min/max shapes, realistic eye and mouth contact, skin-tone materials only on audited skin regions (not clothes/eyes/hair), hairline, seams, garment poke-through and approved shoe fit at idle/walk/run/sit/turn source clips. Baked clothing is NOT an instantly separable nude body; do not fake modular anatomy. Reject changed source bind/clip signatures.

## Gate G3 — Independent real PlayCanvas art review
Using `pc-load-assets`, `pc-configure-animation`, `pc-inspect-runtime` and `pc-verify-pixels`, display unchanged reference Alex/Mira beside at least **two visibly different independent new people per source family**. Each new resident has own identity, morph/skin/animation/material state, not shared mutable weights. Prove changing one does not alter others. Provide front, 3/4, profile, full-height and animated real WebGL captures at 390×844 and 320×568 without covering faces/bodies with tool panels. Mechanical PASS and pixels changed are NOT **owner art approval**. Stop before game integration until accepted.

## Gate G4 — Post-approval production
Only AFTER explicit owner art approval implement game CAS UI, save-safe per-new-resident identity/appearance and validated additive legacy migration, keeping `lifesim.room01.v1`/`root.version=1` unless separately approved. Test 2–4 independently animated resident performance, old saves, relationships, careers, FIFO queues and money. Small PR, exact-head CI, SHA-guarded merge, actual exact-main Pages, separate physical iPhone acceptance.

**Evidence report:** original and derivative hashes; affected facial vertex regions, nonzero morph deltas, original restoration, bind/clip correspondence, mixed shape/pose contact checks, independent instances, real browser screenshots and clear owner-art pass/fail. Do not set `productionReady` until approved.
