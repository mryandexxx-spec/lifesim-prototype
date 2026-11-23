# LifeSim AI agent skills integration (2026-11-23)

**Scope:** instruction-only six adapters under `.agents/skills/`. No runtime modules, dependencies, PlayCanvas engine change, generated assets, localStorage changes, game UI, or existing PR touched. For compatible coding agents these are discoverable Agent Skills; GitHub connector / regular ChatGPT conversations do **not** automatically activate these skills merely because the files exist. Agents without skill discovery must read the corresponding SKILL.md explicitly.

**Pinned source:** gamedev-skills/awesome-gamedev-agent-skills at commit `c6ca6c41c839b68319ffc08430b99ab768debc32` (upstream Apache-2.0, original content not copied; adapter text authored for this project). Upstream terms apply if copying upstream content in future. Links are references, not auto-downloaded or executed. This avoids new install scripts, remote code execution, supply-chain drift and skill-router false-positive engine detection.

| Adapter | Compatibility with LifeSim PlayCanvas 2.24.1 |
|---|---|
| create-game-assets | Adapt source/license/geometry/UV/rig/provenance QA, not raster-only tooling by default |
| threejs-gltf-loading | glTF diagnostics only: **reject Three.js runtime loaders/AnimationMixer/SkeletonUtils** |
| ai-behavior-trees-utility-ai | Engine-neutral design review, never replace deterministic simulation and FIFO with an untested AI |
| performance-optimization | Measurement-first mobile profiling, 2–4 residents and quality budgets |
| save-systems | Version/validation/roundtrip concepts; **reject Godot FileAccess** in browser localStorage |
| game-ui-ux | Touch, CSS safe-area, accessibility, overlays and 390×844 / 320×568 QA; reject Godot/Unity APIs |

**Priority:** PRIVATE START-HERE/DECISIONS/WORKFLOW/ROADMAP/ARCHITECTURE/GDD/ENGINEERING-LOG and current PUBLIC code outrank all external skill advice. The adapters are not licenses for changing an owner's product decisions, altering active CAS footwear or the protected #145 asset PR.

**Acceptance:** node:test adapter guard, source/CI diff review, isolated PR CI, then only SHA-guarded merge and full Pages verification if green. A docs-only change should not require PlayCanvas browser job, but main Pages still runs its normal suite. Physical iPhone QA not implied. Future upstream refresh requires a separate reviewed PR, pinned source revision and updated compatibility guard.

## Native project skill: playcanvas-lifesim

The project-specific `.agents/skills/playcanvas-lifesim/SKILL.md` is the primary task router for LifeSim development. It covers PlayCanvas 2.24.1 architecture, independent deterministic simulation, resident rigs and skinning, measured footwear/animation fitting, localStorage migrations, touch Safari, and exact-SHA PR/CI/Pages gates. It composes the six existing adapters **only when relevant**, without copying their upstream engine-specific code. No engine/runtime or dependencies added.

For compatible coding agents with repository skill discovery, the `name: playcanvas-lifesim` frontmatter makes it available as an agent instruction. A GitHub connector and ordinary ChatGPT conversation do not automatically load repository skills; explicitly read the file if discovery is unavailable. The skill does not introduce an executable installer or grant authority to modify active PRs, game saves, characters or releases.


## 2026-11-23 — Official PlayCanvas, Blender and CAS identity-morph extension

**Source pinned (upstream MIT, links only; no source scripts copied):**
- `playcanvas/skills` `65f6241bc413c2adb78af5890317a8177dd518f0`: `pc-inspect-glb`, `pc-configure-animation`, `pc-inspect-runtime`, `pc-verify-pixels`, `pc-load-assets`.
- `EL4CTEO/blender-skills` `1a1cc6c49312f9f370aae86f52b7b907f29c94f6`: `blender-core`, `blender-facial-shapekeys`, `blender-character-rigging`, `blender-animation`, `blender-asset-qa`, `blender-export-pipelines`.
- `scenario-labs/skills` `3c4d18cd0be2e5280a5accebfeef9ddc98b9a15b`: `scenario-blender-sculpting` (art guidance only; not Scenario remote execution).
- Original project-specific `playcanvas-cas-identity-morphs`: geometry G0, sculpt G1, morph/rig/garment QA G2, owner art review G3, post-approval editor/integration G4.

**Security and scope:** 12 original LifeSim instruction adapters + one native CAS coordinator; all standalone SKILL.md. Not automatically executed, no imported Python scripts, new licenses on LifeSim code, services, dependency changes, Blender install, runtime/GLB/texture/save edits or protected PR #145 changes. MIT is upstream licensing, not an added project license. Third-party code vendoring needs a separate license/security audit and separate approval. ARKit expressions are not distinct CAS identity facial geometry; actual PlayCanvas preview and owner art acceptance remain required. Existing QSK loader/cache production work stays CAS-blocked.
