# LifeSim 0.7c — Meshy Mira in gameplay (first guarded slice)

Scope: production female GLB `assets/characters/meshy-mira-mobile-v1.glb` (2,235,708 bytes, existing SHA256 `40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a`). This asset is already verified and was not replaced.

- New `src/meshy-mira-policy.js` and `src/meshy-mira-visual.js` load female animation tracks independently from Alex. Game states and saves remain on existing procedural avatar roots.
- Free locomotion: `Idle_7` / `Walking_Woman`. Social: `Listening_Gesture` / `Hand_on_Hip_Gesture` (latter is a one-shot, no artificial angry clip name).
- Scaling: 2.05 game units, using **undeformed** `Mesh.aabb` rather than animated skinned `MeshInstance.aabb`, with a provisional +0.03 foot baseline clearance. This is an initial asset placement, NOT calibrated iPhone feet QA.
- Sofa, bed, fridge, shower and their exit transitions retain the proven female procedural animation. The same model toggle and `?model=legacy` disable **both** Meshy skins. Failure to load/validate Mira GLB leaves her legacy visuals visible; Alex can continue in Meshy.
- No male sofa changes; the 0.7b.1 cushion intersection is still an open separate issue, addressed by Interaction Anchors + IK work. No PlayCanvas version/save schema/simulation/relationships change.

## Phone acceptance (owner)
1. Open game with badge `prototype / 0.7c`, compare Mira/Alex heights standing and walking; inspect foot contact, hair and facial textures.
2. Select Mira, walk, talk, argue, pause/resume and ×3; examine turning/animation loops, iPhone FPS and overheating.
3. Run Mira to sofa/bed/fridge/shower, including midway interruptions/reloads; check legacy fallback and opaque shower privacy.
4. Toggle 3D/СТАРЫЙ and reload. Check Alex's existing Meshy sofa is unchanged (known clipping still unresolved).

CI/Pages success does not constitute Safari visual acceptance.
