# CAS-02.2-B — G0 source-face / UV-stretch art-blocker audit (R3)
Date: 2026-11-23  
Status: **mechanical diagnosis and guard implemented; art NOT approved; no new sculpted residents; NO game integration**.

## What was examined
- **Alex source:** `meshy-casual-v1.glb`, SHA-256 `7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4`, 18,137 vertices / 25,847 triangles / 66 joints / 10 animation clips.
- **Mira source:** `meshy-mira-mobile-v1.glb`, SHA-256 `40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a`, 18,120 vertices / 23,245 triangles / 66 joints / 13 clips.
- R2 derived morphs (six true POSITION targets per family): SHA-256 `b80eeb5b8215abd3da34dd17dd62f98c12b32337e15ace6b5083b65a27e26c7b` Alex and `119ec109f1e9ecac9b342ab16b2419d1729a49d775d4a60cd14053a59005159b` Mira. Source hashes/clips, original skin/UV/image data unchanged.
- Both sources use a **single densely packed 1024×1024 JPEG texture atlas** on one skinned primitive, including baked facial features, hair and garments. Head-bone influence is NOT an isolated skin/eye/lip mesh.
- Original observed frontal head surface mask, using source head skin influence >0.75, normal.z >0.2, front z >0.015m, y in (1.43m, 1.68m): Alex **3,180 vertices, 3,704 triangles**; Mira **2,048 vertices, 2,031 triangles**. Their UV coordinates occupy **166 / 173 distinct 16×16 bins**; not a simple separately paintable face rectangle.

## Quantitative UV deformation risk
The R3 audit measures **ratio of triangle surface area after morph / before morph** on the original face triangles. Since the existing R2 morph leaves source UV unchanged, larger geometric area corresponds to lower source-atlas texel density on that surface. This *does not* directly measure user-perceived JPEG quality, which additionally needs a real visual art gate.

| R2 target at full weight | Alex face affected-triangle P95 area stretch | Mira P95 |
|---|---:|---:|
| eyes | **1.2473×** | **1.3962×** |
| nose | **1.8136×** | **1.2695×** |
| lips | **1.8019×** | **1.3372×** |
| chin | **1.6650×** | **1.6643×** |
| cheeks | **1.4942×** | **1.6799×** |

The existing P0 engineering budget **1.20× at P95** is exceeded by **all ten tested facial targets**. Two published R2 example profiles additionally measured face P95 ≈1.30×/1.38× Alex and ≈1.30×/1.24× Mira, with higher P99 tails. This is consistent with the owner's report of apparently stretched painted features. Turning sliders down to conceal it would make the still-similar identities even less distinct; blindly increasing coefficients is not an answer.

## New reproducible QA
- `audit-uv-stretch.mjs` recomputes source exact SHA, regenerated R2 derivative hash, original skin/bind/animation/image/UV preservation, facial triangle area stretch percentiles and non-ready art blockers. `--export` writes an optional audit report into the isolated art folder.
- `tests/cas-02-2-b-uv-stretch.test.js` asserts original GLB byte immutability, per-channel real geometry, authentic atlas preservation, P95 art-blocking thresholds and fail-closed on fake source.
- Standalone test: `node --test tests/cas-02-2-b-uv-stretch.test.js`. **3/3 PASS** in isolated Vercel sandbox at source branch `fix/cas-02-2-b-semantic-morphs-r2`; not the same as CI or iPhone Safari.
- This is a **regression and honest failure gate**, NOT a fix for the face. No R3 generated GLBs are published or substituted into the game.

## Next art-production gates
1. **G1 facial source topology:** build true human-verified vertex landmarks and semantically isolated source geometry regions on BOTH GLBs (including mouth cavity/eyelids/hairline), not ellipsoids or Head weights alone. Create editable Blender source copies with stable vertex indices and originals untouched.
2. **G1 actual sculpt:** art-directed nose, eye sockets/eyelids, lips and chin/jaw shape keys with corrective profiles that preserve facial continuity in front/profile and animations. Do not generate empty ARKit keys or substitutes from MakeHuman/Meshy.
3. **Texture/UV:** per-approved appearance baked compatible atlases or a validated texture-correction mechanism; glTF 2.0 standard morph targets do **not** animate UV attributes, so a runtime morph slider does not solve this automatically. Preserve legitimate skin/hair/garment regions, with licensed source assets.
4. **Hair/body/wardrobe:** actual source-derived hair alternatives and separate compatible clothing/body layers or explicitly documented blockers; existing all-in-one baked geometry is not a ready modular body.
5. **G2/G3 review:** real PlayCanvas face front/profile/3/4/full-body, actual 390×844/320×568 browser frames and idle/walk/sit with 2+ independently differing new residents per family. Only owner visual acceptance unlocks any CAS integration, save changes or release PR.

**Scope:** standalone art branch only. Canonical Alex/Mira, their source binary files and approved shoes, protected PR #145, `game.js`, `lifesim.room01.v1` and the published game remain unchanged.
