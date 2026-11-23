# CAS-HEAD-V2-POC — pinned MakeHuman donor and face-fit feasibility

Date: 2026-11-24. **Isolated technical proof, NOT artist-approved new residents.**

## Owner-approved change of direction

New residents may use their own professionally structured, **source-fitted derivative** head topology with correct eye/lip/nostril loops, separate UV/skin/eyes/hair and source-compatible animation. This alters the former same-vertex requirement **for new residents only**. The canonical shipped original Alex and Mira remain unchanged. MPFB/MakeHuman is allowed only as a **CC0 topology/morph donor** used offline, never an unstyled mannequin or another pretext for source replacement. No paid provider was called.

## Upstream vendor pin and actual source data

- Official `makehumancommunity/mpfb2` release **v2.0.18**, Git commit `d0a32e57a7f915cb2f2b95410e2117648c7bbb7e`; local clone verified at this tag. Core data CC0-1.0. Blender addon source GPLv3, **no addon Python or asset installed/vendored in LifeSim game**. Official licenses: https://github.com/makehumancommunity/mpfb2/blob/v2.0.18/LICENSE.md .
- Source donor `src/mpfb/data/3dobjs/base.obj`, SHA-256 `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`, verified **19,158 vertices / 18,486 quads / 21,334 UV coordinates**. Full body donor triangulates to **36,972 triangles**, **not** a mobile-ready head.
- The official release contains **1,258 compressed morph target files**, not all automatically validated. Five *specific* pinned CC0 sparse targets were parsed and actually converted into Blender **4.5.0** shape keys; exact target hashes in `MPFB-DONOR-PIN.json`.

| Authored MPFB reference channel | Changed vertices | Max offset (donor units) | Geometric P95 stretch |
|---|---:|---:|---:|
| Eyes (left eyelid height) | 215 | 0.0300 | 1.6006× |
| Nose (depth) | 366 | 0.0860 | 1.8669× |
| Lips (upper volume) | 141 | 0.0297 | 1.8685× |
| Chin (height) | 555 | 0.2050 | 2.4887× |
| Cheek (left bone) | 59 | 0.0810 | 1.2579× |

Numbers describe official MPFB sparse targets on **their own** topology, not quality-accepted LifeSim shapes; some channels are intentionally one-sided and cannot directly be our five symmetric CAS sliders. All five targets were actually imported in Blender and exported in an isolated reference-only 7,321,684-byte GLB: one mesh, **five morph targets with real POSITION deltas, UV present, 0 skins, 0 animation clips**. A 986 KiB donor .blend and the 7.0 MiB technical GLB were produced only under the disposable sandbox. They are **not uploaded as residents**. The scripts reproduce the proof from exact upstream bytes; source MPFB binary and GPL addon not committed to game.

**Key insight about R3:** Native MPFB shape keys themselves yield geometric triangle-area P95 greater than the former 1.20× sentinel, **without any degenerate measured triangle in the affected regions**. This proves the numeric threshold is **not a universal professional facial art acceptance metric**. For *unchanged source baked face atlas* it remains useful as an early risk flag (owner also observed actual stretched texture); for clean new topology and purpose-made UV/skin, acceptance requires visual texture quality, contours, reversals, material coherence, eye blink/lip deformation, stable rig and rendered comparisons. Do not replace an observed UV defect by a successful scalar.

## Blender source-fitting feasibility, without fake art pass

Reproducible `blender-sourcefit-probe.py` imported each original SHA-pinned source Alex/Mira GLB plus MPFB donor; it used visually identified **G1 screen-to-original-mesh candidate IDs**. By measuring eye/lip *height only*, it computed a **preliminary rigid scale / translation** for the donor and frontal ray intersections at source candidate screen positions. All 17 Alex and 15 Mira attempted front rays intersected donor. After a *single front-depth median translation*, the absolute screen-matched depth residual P95 was **0.029615 m Alex / 0.023084 m Mira**. This is not feature correspondence: the test does not map the *correct eyelid/lip/nostril loop*, it only ensures a nearby front surface at the same 2D screen position. A centimetre-scale residual is far too large to presume seamless face, eyelids or neck. The donor eye/lip positions are estimated from target bounding regions, not accepted correspondence.

Reference-only .blend scenes were saved in the sandbox (4.6 MB/4.2 MB), **not** new resident models. They contain originals unchanged and a placed CC0 donor. No nonrigid sculpt, skinning, new UV/texture, animation retarget, PlayCanvas screenshot or owner art approval has been completed. The source-to-donor mapping must be artist reviewed before any shape/skin transfer.

## Scope/CI and next gate

PUBLIC isolated branch `art/cas-head-v2-mpfb-sourcefit-poc-20261124` based **only on stacked G1 draft #262**; original art #260, protected #145 and independent current `main` untouched. Owner-approved new derivative-only rules are encoded in the branch-local project skill. Five morphs and topology verified from actual official CC0 source, scripts and checksum-gates committed; **source original hero bytes remain SHA-pinned**. All tests and CI are for technical diagnostic only. Browser/PlayCanvas skipped or blocked until actual styled source-fitted head exists.

### Outstanding POC before owner visual review

1. Design and fit **one real stylized derivative head per source family** while preserving deformation-ready eye/lip loops and separation of eyes/hair/neck; donor full-body geometry must not be shipped.
2. Source-compatible original 66-joint skin/weights transfer, physically plausible neck attachment, real Alex 10 and Mira 13 animation compatibility; never claim this from matching bone names.
3. Corrective independent per-family UV/materials and textured eye/mouth/hair assets with rights. **Original Meshy-era source licensing/provenance requires explicit verification** before external commercialization.
4. Confirm five genuinely independent **visually meaningful** facial controls, shape contact and actual texture density, not just changed vertices.
5. Prepare **two distinct new residents per family** in real PlayCanvas WebGL at 390×844/320×568, head/front/profile/3-4/full-body/idle/walk/sit, never obscured by overlay, then ask owner for art approval. Only after approval consider source skin gameplay/editor/save integration.

### Acceptance state

- Technical donor topology and morph export: **PASS (isolated)**.
- Preliminary rigid projection of donor beside sources: **measured, NOT source-fit**.
- Semantic original-family facial sculpt, retopology, skin-transfer, new UV/atlas, body/footwear fit: **BLOCKED/PENDING**.
- Commercial source rights: **not yet provenance-cleared**.
- PlayCanvas new resident previews, mobile/performance, owner art review, gameplay integration: **NOT DONE**.
- Protected #145, original Alex/Mira source files, accepted shoes and legacy saves: **not touched**.
