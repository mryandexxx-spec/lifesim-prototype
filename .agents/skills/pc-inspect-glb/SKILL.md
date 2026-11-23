---
name: pc-inspect-glb
description: Inspect GLB real vertex, morph, skin, animation and material geometry for source-derived LifeSim people.
---

# pc-inspect-glb — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/playcanvas/skills/blob/65f6241bc413c2adb78af5890317a8177dd518f0/plugins/playcanvas/skills/inspect-glb/SKILL.md

## Task-specific procedure

- SHA-pin original Alex/Mira GLBs independently. Parse verified GLB JSON/header, node hierarchy, POSITION/UV/JOINTS/WEIGHTS accessors, primitives, images, morph target names, `skins[].inverseBindMatrices` and `animations[].channels`.
- Keep original mesh vertex indices/order, materials, rig and animation channels. Equal 66-joint counts do not prove shared bind matrices.
- Each identity target must have real finite nonzero POSITION deltas on exactly corresponding source vertices, audited facial region masks and zero-weights original restoration.
- Map baked garments, eyes and hair explicitly. Never guess a nose/eye/chin from Head bone influence weights alone.
- Record original/derived source hash, morph vertex count, affected region, rig/animation signatures and gaps; confirm deformations using actual PlayCanvas WebGL, not accessor bounds alone.
