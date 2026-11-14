# LifeSim 0.7b — first Meshy furniture interaction: sofa

This is an incremental **in-game** animation update after owner accepted 0.7a on iPhone ("все супер"). It does not change gameplay state, furniture availability, A* or save format.

## Implementation

- The **same Meshy Alex** is now drawn during the complete sofa entry, sitting/relaxation and exit, including the period after gameplay action ends while the actor physically stands up.
- The actual imported `Sit_to_Stand_Transition_M` (6.167s) is scrubbed **backward for seating** and forward for getting up, using the existing procedural `sofaTransitionPose(...).sofaWeight` (not wall-clock time). All seating progress remains controlled by the game.
- The clip authors significant `mixamorig:Hips` horizontal root motion (~0.4 m along local Z) in addition to leg bending; blindly playing it would drift the character into/out of the couch. New `src/meshy-sofa-pose.js` contains 58 calibrated X/Z hip samples from the **shipped optimized 2.28 MB GLB**, and offsets the child GLB horizontally to keep the original game-authored sofa placement as the single source of truth. Vertical hips motion remains from the clip, with the original sofa root lift, to form a seated pose. When leaving sofa, this offset is blended away as Idle/Walk takes over.
- Uses the PlayCanvas 2.24 Anim Component public `baseLayer.activeStateCurrentTime` setter and `anim.speed=0` for deterministic manual scrubbing of the source clip. Action pause freezes progression. No new asset downloads or runtime decoder.
- The old procedural body remains instantiated as an emergency fallback. It now hides during sofa; it is **still used for bed, fridge, shower, and exit sequences** that have not been properly retargeted. Mira remains procedural.
- The old procedural book's attachment pivot is incompatible with Meshy: it is **hidden** while Meshy is displayed on the sofa instead of floating alongside an invisible hand. Proper hand sockets/book props are follow-up work.
- The UI `3D / MESHY` ↔ `3D / СТАРЫЙ` and `?model=legacy` remain for fast rollback; no data migrations.

## Verification

- `tests/meshy-sofa-pose.test.js` decodes **the actual committed GLB** and compares the exported hip motion accessor with the calibration curve, tests endpoints, deterministic scrubbing and X/Z correction.
- `tests/meshy-visual-adapter.test.js` now verifies entering sofa, changing progress, pause, exit, correction release, and fallback for fridge. `tests/meshy-visual.test.js` updates the pure safety gate.
- GitHub Actions runs `npm ci`, `npm test`, `node --check` and verifies the GLB SHA before publishing.
- **Important:** Passing Node tests and Pages publishing does not validate screen-space pose/contact on a real iPhone. User QA required.

## Short iPhone QA

Open https://mryandexxx-spec.github.io/lifesim-prototype/ and verify `prototype / 0.7b`. Keep 3D on, select Alex, switch Auto off if it interferes. Tap sofa, watch his approach, turn, sit, stay sitting, and stand up when action ends or is interrupted by a social interaction. Compare with legacy mode. The same Meshy body should remain throughout the sofa action — no visible swap, no flying book. Check whether legs clip through couch, pelvis hovers, hands twist or knees pop. Then test camera orbit/pinch, pause, ×3, social preemption while sitting, reload mid-sofa, bed, shower privacy, fridge and Mira.

**Status at code commit:** authored and committed; no owner acceptance for 0.7b yet. Any unknown current Actions/Pages status must be verified separately.
