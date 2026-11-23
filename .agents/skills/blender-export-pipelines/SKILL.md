---
name: blender-export-pipelines
description: Export real GLB skin+morph+clips with source hash and PlayCanvas roundtrip verification.
---

# blender-export-pipelines — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-export-pipelines/SKILL.md

## Task-specific procedure

- Export distinct derived GLB files, never overwrite originals. Preserve metres, rest hierarchy, materials, UV, source vertex indices, JOINTS/WEIGHTS, inverse binds, clip target paths and baseline zero morph weights.
- Verify actual glTF 2.0 meshes[].primitives[].targets POSITION accessors and stable target names; zero weights must match original.
- Re-import and audit source-vs-derivative, validate with Khronos glTF Validator if available, then exercise real PlayCanvas rendering/animation.
- Start uncompressed. Use compressed Meshopt/Draco/KTX2 only after explicit decoder/static Pages/Safari compatibility verification. No game-ready claims from Blender-export success alone.
