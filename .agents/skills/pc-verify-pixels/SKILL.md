---
name: pc-verify-pixels
description: Run deterministic character render comparison for source integrity and visible true geometry.
---

# pc-verify-pixels — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/playcanvas/skills/blob/65f6241bc413c2adb78af5890317a8177dd518f0/plugins/playcanvas/skills/verify-pixels/SKILL.md

## Task-specific procedure

- Fix camera, viewport, lighting, animation time, DPR, random seed and models. Verify untouched baseline renders match twice before claiming a pixel-exact gate.
- Compare original Alex/Mira preservation in equivalent render conditions. For candidate identities, require actual POSITION accessors and visibly altered nose/eyes/lips/chin, not recolor, CSS or ambient light.
- Capture front, 3/4, profile, full body and mixed morph/animation extrema at both mobile viewports. Inspect hair/eye/neck/clothing clipping and panel occlusion.
- Pixel change can establish a render difference, never artistic quality: owner art approval remains separate.
