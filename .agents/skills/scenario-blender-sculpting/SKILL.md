---
name: scenario-blender-sculpting
description: Use anatomy-first facial sculpting guidance on existing LifeSim source vertices, not substitute head meshes.
---

# scenario-blender-sculpting — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/scenario-labs/skills/blob/3c4d18cd0be2e5280a5accebfeef9ddc98b9a15b/skills/dcc/blender/scenario-blender-sculpting/SKILL.md

## Task-specific procedure

- Use upstream as *art reference only*: facial masses, cheek arches, jaw planes, eyelid sockets, mouth and nose proportions. Do not import Scenario execution framework or primitive-based generic sculpt replacement.
- Map true eye/lip/nose/jaw landmarks from measured Alex/Mira source geometry before creating independent vertex delta identity targets.
- Compare coherent combinations of noticeably different identities in same-camera front/profile/3/4 PlayCanvas renders and protect hair/neck/skin boundaries.
- If source topology lacks suitable deformable edge loops, report the precise limitation instead of silently remeshing/rebinding original character.
