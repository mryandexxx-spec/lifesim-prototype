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
