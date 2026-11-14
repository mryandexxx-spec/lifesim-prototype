# Meshy Character Lab — isolated GLB animation preview

Standalone route `character-lab.html` in the same code-first PlayCanvas 2.24.1 repository. This route intentionally does **not** import `src/game.js`, mutate game state, or touch `lifesim.room01.v1` localStorage data.

- Scene, light, floor, camera, mobile touch orbit/pinch and GLB loader are created in `src/character-lab.js`, not in PlayCanvas Editor.
- The loader uses the GLB's own animation clips and Mixamo skin. It displays named clips and lets you switch, pause and rotate the model.
- If `assets/characters/meshy-casual-v1.glb` is deployed alongside the route, it loads automatically. Otherwise the route lets the user select a GLB in the browser as a **temporary diagnostic fallback**, not a replacement for shipping the model.
- Do not store expiring signed Meshy URLs in the repository. The binary GLB is still required for a fully automatic published preview.
- Basic source/test checks cover the GLB header and character fit math. Browser/Safari animation playback is NOT verified until the actual file is served and the owner tests the page.

## Audited source model (2026-11-14)

Uploaded: `Meshy_AI_Casual_Animated_Young_Man_20261114_animated_mixamo_All_animation.glb`.

- SHA-256: `82ad047b82cf5999fc5b0bf9fa75777c574a41e75dc1d109ef8b6ab2fdbaedaf`
- Size: 12,212,288 bytes; glTF 2.0 GLB
- Mesh: 1 mesh / 1 primitive / 18,137 vertices / 25,847 triangles
- Material: 1, double-sided; PNG texture 2048 × 2048
- Skin: `SmartRigArmature` with 66 joints, Mixamo-style names
- Clips (10): `Running`, `Walking`, `Call_Gesture`, `Idle_3`, `Idle_4`, `Listening_Gesture`, `Run_02`, `Sit_to_Stand_Transition_M`, `Stand_Talking_Angry`, `Wave_One_Hand`
- No morph targets and no separate hair/eyes/clothing skinned meshes; full facial sliders or modular outfits are not yet available.
- `Sit_to_Stand_Transition_M` includes substantial hip translation; do not drop into sofa/bed interaction without retargeting and animation-anchor validation.

This lab is a sandbox. No production integration is approved until animations, gameplay pose compatibility, download size and iPhone performance are assessed.