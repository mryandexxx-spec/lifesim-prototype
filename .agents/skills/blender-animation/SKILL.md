---
name: blender-animation
description: Prepare body, face and gait animation compatible with original Alex/Mira clip hierarchy.
---

# blender-animation — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-animation/SKILL.md

## Task-specific procedure

- Keep canonical 66-joint source hierarchy and original clips. Review actual channel paths/rest pose/binds before considering mocap retarget.
- Build and evaluate contact, passing and transition poses; test foot-slide, animation popping, sit/stand, facial gesture coordination and moving clothing with morphs.
- Bake optional offline Blender control rig onto original supported skeleton only; do not replace canonical rigs or infer compatible clips from equal bone counts.
- Prove actual bone motion and clips playing in PlayCanvas via pc-configure-animation, including independent 2–4 new residents.
