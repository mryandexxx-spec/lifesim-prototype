---
name: pc-load-assets
description: Verify PlayCanvas GLB container loading, derived asset packaging, fallbacks and optional compression decoders.
---

# pc-load-assets — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/playcanvas/skills/blob/65f6241bc413c2adb78af5890317a8177dd518f0/plugins/playcanvas/skills/load-assets/SKILL.md

## Task-specific procedure

- Do not rewrite the current LifeSim model loader/cache during unfinished CAS-02.2-B. Use PlayCanvas container assets and instantiateRenderEntity for newly approved features, never Three.js renderer APIs.
- Source data may be shared when immutable; new resident skin/morph instances, animation state and mutable materials must be independent.
- Start with uncompressed GLB. Add Draco/Meshopt/KTX2 only after verifying 2.24.1 decoder configuration, WASM/static Pages packaging, exact actual asset hashes and iPhone Safari compatibility.
- Missing optional derived GLB must show a valid original/reference preview and disable creation, not a surrogate mannequin or reset of localStorage.
- Include staged Pages file and 404/cold/warm smoke evidence for any future runtime PR.
