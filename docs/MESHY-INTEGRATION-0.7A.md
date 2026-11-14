# LifeSim 0.7a — Meshy Alex: isolated first in-game integration

The previously verified 2,278,456-byte Meshy GLB is already in `assets/characters/meshy-casual-v1.glb`; it is **not** downloaded from an expiring URL.

## What actually changed
- Alex **visually** uses the skinned Meshy character when idle, following A* routes and talking/arguing.
- The existing game model/simulation/physics/navigation continues to own Alex's position and facing. The Meshy display is parented to the same avatar root and follows it; there is no second movement controller or independent saved state.
- Clips are selected from real GLB names: `Idle_3`, `Walking`, `Listening_Gesture`, `Stand_Talking_Angry`. Only the 10 supplied clips are in the file.
- For bed, sofa, fridge, shower or active exit transitions Alex is **temporarily drawn with the original procedural rig**. This is a compatibility fallback, not final animation retargeting. In the shower, parent visibility and existing privacy masking take precedence.
- Mira stays procedural because only a male Meshy model has been approved.
- The screen-right control `3D / MESHY` ↔ `3D / СТАРЫЙ` switches Alex's appearance without changing simulation or restarting. The preference has its own localStorage key `lifesim.meshyVisual.v1`; the existing `lifesim.room01.v1` save is unchanged. URL `?model=legacy` forces the old model for troubleshooting.
- If the GLB fails to load or has incompatible/missing clips, the game retains Alex's old model and displays a warning.

## iPhone acceptance checklist
1. Open the main `index.html` game, verify `prototype / 0.7a` (not the Character Lab page).
2. Wait for the Meshy loading notice and look at Alex while standing still. Check model orientation and feet on floor.
3. Disable Auto; send Alex to bed/fridge/sofa/shower and check A* walking. When an item starts, the familiar procedural avatar will appear for its established pose. Ensure no double actor, avatar visibility leak or misplaced props.
4. Try `Поговорить` and `Поспорить` while Alex is active; the Meshy model should show appropriate gestures. Test affinity 100/100 and conversation during the other character's occupied action.
5. Press the `3D` button to compare with the old model; use `?model=legacy` if you need a fallback even if button/display fails.
6. Check pause / ×3, camera rotate/pinch/pan and reset, reload saved state, Alex and Mira independence and shower privacy. Report clipping/scale/orientation, FPS or excessive battery usage.

## Boundaries and next steps
This is a **first vertical slice**, not a complete Meshy retargeting of bed, sofa, fridge or shower. There are no facial morphs, modular garments, new animations or TypeScript migration. No user iPhone QA exists for this in-game integration at publication time. A following phase should implement verified interaction-specific Meshy animation retargeting and contact anchors rather than moving the root by animation alone.
