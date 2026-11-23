---
name: pc-inspect-runtime
description: Collect real running PlayCanvas WebGL diagnostics and independent resident state without shipping debug hooks.
---

# pc-inspect-runtime — LifeSim adapter

## Project-wide guardrails

**LifeSim-authored, instruction-only skill adapter:** no executable scripts, automatic upstream install, dependency fetch or third-party code is included. Before action read PRIVATE source-of-truth, current PUBLIC repo and the mandatory `playcanvas-lifesim` skill. Runtime remains PlayCanvas **2.24.1**, JavaScript ES modules and iPhone Safari. Canonical Alex/Mira original GLBs and 66-joint source rigs remain immutable; only **new** residents may carry identity morphs. No MakeHuman or procedural mannequins, no recolor-only fake face channels. Protect approved footwear, PR #145, `lifesim.room01.v1` and `root.version=1`. Follow isolated PR, exact-head green CI, SHA-guarded merge, exact-main Pages and separate owner art acceptance before production changes.

**Pinned upstream reference (MIT, reference only):** https://github.com/playcanvas/skills/blob/65f6241bc413c2adb78af5890317a8177dd518f0/plugins/playcanvas/skills/inspect-runtime/SKILL.md

## Task-specific procedure

- Use a temporary browser-only PlayCanvas inspector hook BEFORE app initialization, after verifying 2.24.1 build support; do not modify production scripts for observability.
- Observe after frameend: entity IDs, morph and skin instances, non-root joint positions, active states, material identity, draw calls, frame time and load errors. Serialize plain values, not Engine objects.
- Change one derived resident and prove other copies and original stay unchanged. Capture 390×844 and 320×568 real scene with visible face and body above control panel.
- Clean up diagnostics. Browser test on Chromium SwiftShader does not certify real Safari FPS or owner acceptance.
