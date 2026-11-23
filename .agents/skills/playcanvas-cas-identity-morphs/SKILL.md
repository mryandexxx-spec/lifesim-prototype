---
name: playcanvas-cas-identity-morphs
description: Create visually different NEW residents on immutable original Alex/Mira GLB topologies with genuine facial/body morphs, rig QA and PlayCanvas art approval.
---

# LifeSim source-preserving identity morph workflow

**Instruction-only native project skill.** Read `playcanvas-lifesim` and live PRIVATE/PUBLIC first. Create NEW separate people from Alex/Mira original models; canonical Alex and Mira remain unchanged. No MakeHuman, procedural mannequins, external substitute bodies, color-only faux identity sliders or overwriting originals. Protect PR #145, accepted shoes, `lifesim.room01.v1`, `root.version=1`.

## Gate G0 — Source geometry
Use `pc-inspect-glb` and `blender-core` to SHA-pin exact original GLB families, indices, vertex order, UV/materials, baked clothing/hair, eyes, neck, skin weights, 66 joints, inverse bind matrices and original animations (10 Alex / 13 Mira). Map facial landmarks from actual mesh geometry; do not infer nose/eyes/lips/chin from broad Head bone weights. If topology cannot isolate these, stop and explain.

## Gate G1 — Real identity morphs
With `scenario-blender-sculpting` and `blender-facial-shapekeys`, sculpt separate original-source-relative, finite nonzero POSITION delta fields for eyes, nose, lips, cheeks and chin/jaw; body proportion keys separately. Preserve base POSITION, primitive order, UV, JOINTS/WEIGHTS, bind matrices and animations. Smooth mask boundaries by eyelids, hairline, neck and baked garments; no material-tint-only facial geometry or empty ARKit blendshapes. Zero morph weights MUST recreate canonical reference appearance.

## Gate G2 — Animations, geometry, outfits
Use `blender-character-rigging`, `blender-animation`, `blender-asset-qa` and `blender-export-pipelines`. Check mixed min/max shapes, realistic eye and mouth contact, skin-tone materials only on audited skin regions (not clothes/eyes/hair), hairline, seams, garment poke-through and approved shoe fit at idle/walk/run/sit/turn source clips. Baked clothing is NOT an instantly separable nude body; do not fake modular anatomy. Reject changed source bind/clip signatures.

## Gate G3 — Independent real PlayCanvas art review
Using `pc-load-assets`, `pc-configure-animation`, `pc-inspect-runtime` and `pc-verify-pixels`, display unchanged reference Alex/Mira beside at least **two visibly different independent new people per source family**. Each new resident has own identity, morph/skin/animation/material state, not shared mutable weights. Prove changing one does not alter others. Provide front, 3/4, profile, full-height and animated real WebGL captures at 390×844 and 320×568 without covering faces/bodies with tool panels. Mechanical PASS and pixels changed are NOT **owner art approval**. Stop before game integration until accepted.

## Gate G4 — Post-approval production
Only AFTER explicit owner art approval implement game CAS UI, save-safe per-new-resident identity/appearance and validated additive legacy migration, keeping `lifesim.room01.v1`/`root.version=1` unless separately approved. Test 2–4 independently animated resident performance, old saves, relationships, careers, FIFO queues and money. Small PR, exact-head CI, SHA-guarded merge, actual exact-main Pages, separate physical iPhone acceptance.

**Evidence report:** original and derivative hashes; affected facial vertex regions, nonzero morph deltas, original restoration, bind/clip correspondence, mixed shape/pose contact checks, independent instances, real browser screenshots and clear owner-art pass/fail. Do not set `productionReady` until approved.
