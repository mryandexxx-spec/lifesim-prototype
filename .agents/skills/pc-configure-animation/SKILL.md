---
name: pc-configure-animation
description: Safely configure and inspect original PlayCanvas character animation targets and skin binding.
---

# pc-configure-animation — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/playcanvas/skills/blob/65f6241bc413c2adb78af5890317a8177dd518f0/plugins/playcanvas/skills/configure-animation/SKILL.md

## Task-specific procedure

- Enumerate actual 66-joint hierarchy and source animation node paths before binding clips; no guessing by clip name or similar bone counts.
- Use the current direct PlayCanvas Engine `anim` on/above skinned hierarchy, not Three.js GLTFLoader, AnimationMixer or a new rendering engine.
- Clamp blend tree parameters to supported child points. An advancing animation clock does not prove motion: compare two non-root joint transforms over several rendered frames.
- Test idle, walk, run where available, sit, turns and transitions with new morph weights. Preserve original Alex/Mira clip sets, inverse bind matrices, contacts and accepted shoes.
- Verify independently moving originals and two same-family derived people without skin, animation or morph weight leakage.
