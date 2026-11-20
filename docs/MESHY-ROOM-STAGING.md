# Meshy room assets — staging batch 01 (2026-11-20)

15 original Meshy Image-to-3D GLB exports were optimized individually for the LifeSim mobile PlayCanvas pipeline. These are **candidate art assets**, not yet installed in the game and not accepted on iPhone. Existing 47 SKU identities, saves, prices, interactions, collision and placements remain unchanged.

Source: user-approved image-to-3D Meshy T2 + N1 jobs; per-item task IDs stored in PRIVATE project documentation. All exports have one textured mesh, no animation, 2048² original image. Optimization preserves every non-image binary glTF buffer view exactly, reduces embedded texture to max 1024², uses JPEG only for fully opaque textures, repacks GLB, checks structure and byte-level geometry invariance, and verifies sha256. **This is NOT polygon decimation**: ~4000 triangle target was requested at Meshy generation time; geometry simplification is not performed during this step.

The staged files live in `assets/furniture/meshy-room-v1/`, with SHA-256/size in the JSON manifest. Each item is named exactly by a stable existing shop SKU. Some generated visual references may not precisely match original procedural meshes; visually review every item before a separate renderer integration and engine contact-anchor validation. App `main` intentionally continues using existing assets; staging does not affect Pages.

Artifact toolchain: conservative embedded-texture replacement; JPEG quality 84, longest texture dimension 1024. Rewriting image does not change vertices, indices, scene nodes, mesh attributes, transforms or UVs. Verify actual viewport visual fidelity and performance prior to active model use.
