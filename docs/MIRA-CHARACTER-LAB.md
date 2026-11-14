# Mira Meshy — standalone mobile Character Lab (2026-11-14)

**Preview (after Pages deployment):**
https://mryandexxx-spec.github.io/lifesim-prototype/character-lab-mira.html

This is an independent preview of the optimized female Meshy GLB, not the game resident.
No modification to `src/game.js`, A* navigation, interactions, privacy or
`lifesim.room01.v1` saves. Alex remains on the existing male asset and model policy.

## Asset contract
- Repository path: `assets/characters/meshy-mira-mobile-v1.glb`
- Source user upload: `Meshy_AI_Casual_Charm_20261114_animated_mixamo_All_animation.glb`.
- Original: 9,917,692 bytes; optimized: **2,235,708 bytes** (−77.46%).
- Optimized SHA-256: `40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a`.
- Mesh geometry: 18,120 vertices / 23,245 triangles; 66 joints; 1 skin/material/texture;
  13 animations; zero morph targets.
- Same original mesh vertex/index attributes and inverseBindMatrices.
- RGB PNG 2048² → JPEG 1024². Key samples 335,424 → 22,940.
- Animation duration/name set preserved; quaternion error at original samples
  ≤0.23° and translation error ≤0.0006 local units (numeric checks, not visual QA).
- Published bytes and clip names verified by headless Node tests/Actions before deploy.

## iPhone visual QA
1. Open the standalone route in Safari, without choosing a GLB manually.
2. Inspect full body, face, hair and textures; orbit with one finger and pinch.
3. Switch `Idle_7`, `Walking_Woman`, `Listening_Gesture`, `Sit_to_Stand_Transition_F`,
   `Lie_Down_Hands_Spread`, and `sleep`; verify that transitions feel right.
4. Look at floor contact, body scale and clipping; note the approximate FPS.
5. Send the built-in diagnostic report plus any visual issues. This does not
   establish in-game sofa/bed/shower alignment yet.

**Status at initial commit:** implementation and numerical GLB verification done;
Safari playback, user acceptance and in-game Mira integration not yet verified.
