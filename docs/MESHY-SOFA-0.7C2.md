# LifeSim 0.7c.2 — sofa foot planting (iPhone QA pending)

**Problem confirmed by owner:** iPhone screenshot `IMG_6545.png` of `prototype / 0.7c.1` shows Alex again positioned on the couch (the off-couch regression was removed), but his legs bend/collapse unnaturally and the shoes extend toward/through the front of the seat. This is NOT accepted visual QA for 0.7c.1.

## Diagnosis from the actual imported Meshy GLB

The original `Sit_to_Stand_Transition_M` at the seated endpoint (t=0s) has:
- skinned `LeftFoot` ankle y=0.14262 (model units), shoe sole y≈−0.00779;
- right ankle y=0.15453, sole y≈+0.00785;
- in the game's seated pose, the sofa controller moves its original avatar root down by 0.225 game units; the player's visual root then has a separate pelvis-only seat height correction. The final feet can therefore be buried ≈0.15 game units into the floor/sofa even if the butt contact is correctly aligned.
- per actual GLB skinned mesh vertices, left/right soles are 0.15041/0.14668 model units BELOW their ankle bone origins. This is stable rig data, **not** pixel measurements or per-furniture offsets.

The earlier sofa target generator also placed feet relative to seat contact at a short forward distance. On a deep couch this could put shoes *under the cushion*. The corrected target uses the physical **front edge** of the furniture, not an invented magic offset from the person.

## Implementation

- `src/interaction-anchors.js`: `seatSlot` exposes the furniture's world `front` edge. `seatGroundedAnkleTargets()` places each ankle just ahead of the surface's real front edge and above its physical floor by `rigSoleDrop*avatarScale + groundClearance`. The same rule handles different widths, depths and orientations.
- `src/meshy-visual-policy.js`: two sole drops measured from the shipped GLB and a rig-wide, left/right knee pole direction (calibrated to this Mixamo skeleton). No changes to Meshy model file, skin, textures or clips.
- `src/meshy-seat-runtime.js`: a **bounded two-bone leg IK pass** is now used only as the seat transition reaches the completed seated phase. It calculates reachable thigh/shin solutions for two supported feet, caps rotation angles, refuses unreachable or extreme targets, and touches **only leg bones**. The already fixed game-authored X/Z root and Y seat contact stay unchanged.
- `src/meshy-visual.js`: sets the scrubbed animation time before reading skeletal contact and applying the foot pass; avoids solving legs against a stale clip timestamp.
- `src/game.js` uses the new safe foot plant by default with `?legs=off` to switch it off immediately without altering Alex/Mira appearance, save data or the stable pelvis seat placement.
- `?seat=legacy` remains the older pose, `?model=legacy` uses original procedural skins, `?seat=full&ik=on` is still an experimental **known-bad** full root solver and is not the production default.

## Verification

New tests validate shoe targets ahead of three furniture depths, toe/sole height, anatomical side assignment, physically reachable targets from the **real shipped GLB seated bone coordinates**, sensible knees, and mock PlayCanvas calls which adjust two leg chains without translating avatar root, plus paused/enter and legs=off switches. In-chat V8 execution: **26/26 targeted scenarios passed**, 5/5 edited production JS modules parsed. These checks do **not** equal a real WebGL/Safari visual approval.

## iPhone checklist

1. Open the main game and check `prototype / 0.7c.2`.
2. Alex in Meshy: choose sofa and observe the last part of sitting, fully sitting, and standing. Both soles should contact floor in front of cushion; knees should remain bent naturally and should NOT jump sideways or overlap.
3. Pause while seated, try 3× speed, interrupt with Talk, then reload. Mira's Meshy appearance, bed, fridge, shower privacy and old saves must remain unchanged.
4. If knees look twisted, compare `?legs=off` (same pelvis placement, original shoes, no new IK). This tells us immediately whether the IK pass itself is causing the problem.
5. Report screenshot from a side camera angle if possible. The integration has **not yet been visually accepted by the owner on iPhone**.

Future: finish contacts for different seats/characters only after the first real iPhone acceptance; do not use untested full-body/world-root repositioning to hide foot issues.
