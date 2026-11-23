---
name: blender-facial-shapekeys
description: Sculpt and validate real source-mesh identity shape keys separate from ARKit expressions.
---

# blender-facial-shapekeys — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-facial-shapekeys/SKILL.md

## Task-specific procedure

- Distinguish identity channels (nose bridge/tip/nostrils, eye placement/shape, lip fullness, cheek, jaw and chin) from ARKit expression channels (smile, blink, jawOpen). Empty named keys are not new faces.
- Create relative Basis keys on audited source vertex index/order, preserving UVs, JOINTS/WEIGHTS, bind and original clips. Never remesh topology after keys.
- Every key needs finite nonzero POSITION deltas in audited masks, smoothed boundaries at eyes, hair, neck and baked outfits; preserve eyelids against eyeballs and lips/mouth integrity.
- Verify zero weights recover original Alex/Mira; test individual, mixed extremes, idle, walking and sitting. Do not claim art quality from target count or generic scaling.
- Stop if source facial landmarks or garment/skin groups cannot be reliably segmented.
