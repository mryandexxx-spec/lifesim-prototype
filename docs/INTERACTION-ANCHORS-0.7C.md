# LifeSim 0.7c — generic seat contact and first real foot IK

**Status:** committed in the public game, pending real iPhone Safari visual acceptance. The earlier 0.7b.1 was observed clipping into the couch; this release replaces the hardcoded sofa lift as the default in-game path.

## What is actually running in the game

- `src/game.js` registers the current furniture as a `SeatSurface` using its physical cushion top, width/depth, orientation and floor plane, and passes the selected slot to Alex's Meshy adapter. Future sofas, chairs and benches can register the same schema rather than requiring a per-item avatar offset.
- `src/meshy-visual.js` asks `src/meshy-seat-runtime.js` to place the *actual GLB skinned character* while Alex is sitting down, sitting, or standing up. The imported `Sit_to_Stand_Transition_M` is still synchronized with `sofaTransitionPose().sofaWeight`. The old `meshySofaOffset` and `meshySofaVerticalLift` functions remain only as a **fallback** if the furniture seat or bone bridge is unavailable.
- The runtime reads `mixamorig:Hips` every frame **after animation system evaluation**, transforms a rig-wide contact marker through that animated bone into world space, calculates the character's pose-specific local contact and solves `SeatSurface.contact = actor visual root + transformed pose contact`. It resets the previous positional correction before solving so the same offset is not applied twice. The authoritative simulation/A* root is NOT moved.
- `src/interaction-anchors.js` is the engine-independent mathematics: `createSeatSurface`, `seatSlot`, `solveSeatRoot`, `blendSeatRoot`, `seatFootTargets` and `solveTwoBoneTargets`. Individual furniture knows only its contact metadata; each humanoid rig knows only its bone names/contact/sole markers.
- The first constrained IK pass maps actual Mixamo `LeftUpLeg → LeftLeg → LeftFoot` and their right-leg equivalents, targets shoes toward the floor, limits bone lengths/reach and caps instantaneous joint rotation. IK weight blends in near full seating so the original walk/approach animation is not overwritten from the start. **This is a first two-bone IK implementation, not a full physical collision simulator**: a very high stool, unusual curved sofa, hand/armrest constraints or extreme animation may need different pose categories/extra constraints.
- Paused game uses its existing contact/animation time rather than advancing a separate sitting clock; exit fades correction back to the same locomotion root. Game saves `lifesim.room01.v1`, autonomy, bed, shower privacy, fridge and Mira's procedural avatar are not changed. The separate Meshy Mira Character Lab remains unaffected.

## Model profile and furniture metadata

The deployed male rig has one per-model contact profile in `src/meshy-visual-policy.js` (pelvis bone name, contact marker under its pelvis, optional foot bone map, ankle height, collision clearance). **No coupling to a particular sofa exists in that profile.** The sofa metadata in game.js describes `seatHeight: seatCenterY + seatHeight/2`, center, yaw and width/depth. The same contact equation applies for taller/lower chairs and multiple seat slots; furniture without appropriate seating geometry must declare a compatible seat class.

## Automated checks

- `tests/interaction-anchors.test.js`: contact at different heights and orientations, 1- and 2-place furniture, multiple model scales, blends, invalid metadata, foot target handedness, and two-bone chain length/reach.
- `tests/meshy-seat-runtime.test.js`: mock PlayCanvas world transforms prove bone contact is placed at the correct cushion anchor across two different furniture heights/rotations, frame-to-frame stability and reset to free pose, invalid seat safety.
- Existing legacy adapter and asset contract tests are kept. The static Pages workflow runs `npm ci && npm test`, JS syntax checks and GLB SHA-256 before deployment.
- In-chat V8 execution of source tests: 13/13 passed for new headless+runtime-contract tests. **Full GitHub Actions run and genuine Safari/WebGL visuals were not verified by these tests.**

## iPhone QA checklist

1. Open https://mryandexxx-spec.github.io/lifesim-prototype/ and ensure the top badge says `prototype / 0.7c`.
2. With `3D MESHY`, make Alex sit on the couch. Inspect hip/cushion contact, thigh penetration, shoes, knees and hands during entry, full seated pose, and exit.
3. Repeat at game pause, ×3, interrupted by Talk/Argue, and after reload mid-action. Confirm Mira, social actions, camera, bed/fridge/shower privacy and saves are unaffected.
4. Compare **same Meshy avatar, old seating algorithm** using `?seat=legacy` (diagnostics only); compare **contact seat with IK disabled** using `?ik=off`; disable whole new avatar using the 3D toggle or `?model=legacy`.
5. Report if shoes cross, knees flip, pelvis floats, body continues moving while paused, or there is a renderer error. These are acceptance-blocking bugs, not solved merely by passing mathematical tests.

## Follow-up

After this first iPhone QA, refine one rig-wide contact proxy/IK joint limits if needed (not a bespoke offset for each sofa). Then validate two different new prefab seat heights and multi-seat occupancy in the actual game, and extend the anchors to beds with side-specific approach and contacts. This file is intentionally public and contains no private project information.
