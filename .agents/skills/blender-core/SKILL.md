---
name: blender-core
description: Control isolated Blender bpy source-derived geometry jobs without mutating Alex/Mira originals.
---

# blender-core — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-core/SKILL.md

## Task-specific procedure

- Check the available Blender version and supported bpy API first. Upstream Blender 5.2+/5.3 procedures cannot be assumed compatible with unknown CI images.
- Import only SHA-pinned copies of approved Alex/Mira GLBs into isolated offline workspaces. Keep units, node hierarchy, per-family 66-bone bind, UV, indices and skin weights unchanged.
- Choose context-safe deterministic bpy procedures and explicit derivative file destinations. Record source SHA, generated target names and changed vertex IDs.
- Do not auto-install upstream add-ons or run downloaded Python scripts. Review executable code/security/license separately before a future authorized pipeline stage.
- Never generate a new generic human, remesh after shape keys or run Blender in Safari.
