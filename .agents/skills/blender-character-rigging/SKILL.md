---
name: blender-character-rigging
description: Validate original 66-joint rigs, skin influences, inverse bind and pose stress without re-rigging.
---

# blender-character-rigging — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-character-rigging/SKILL.md

## Task-specific procedure

- Record exact Alex/Mira joint paths, per-family rest pose, inverse-bind matrices and vertex weights. Do not generate a substitute Rigify skeleton or rebind canonical source.
- Skin and morph the real source-derived characters, preserving original 10/13 animation clips and accepted shoes. A changed face or body is a vertex delta, not a new source bone family.
- Stress check head and arms, sitting/standing, moving hips and legs, foot/sole contact, clothes, neck seams and baked hair on each candidate.
- Test multiple independently animated residents without state bleed, and record signatures proving original rig and animation unchanged.
