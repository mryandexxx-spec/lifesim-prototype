---
name: blender-asset-qa
description: Gate true morph geometry, skin/garment continuity, animation poses and visual owner review.
---

# blender-asset-qa — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-asset-qa/SKILL.md

## Task-specific procedure

- Check finite morph delta arrays, UVs, original vertex order, degenerate geometry, normals, skin-weight sums, untouched forbidden vertex regions, original hash and immutable bind.
- Check nose/nostril, lip, eye socket/eyelids, chin, jaw, neck and hairline anatomy, baked garment material/skin boundaries and no poke-through at mixed weights.
- Validate idle/walk/sit/run where present, both families, at least two visually different derivatives each, in actual PlayCanvas front/3/4/profile/full-height views.
- Mechanical PASS ≠ owner art approved. Fake sliders, tiny indistinguishable changes, replacement bodies, color-only face variants or ugly clipping fail the review gate.
