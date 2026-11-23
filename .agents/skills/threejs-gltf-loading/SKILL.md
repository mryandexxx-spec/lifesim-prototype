---
name: threejs-gltf-loading
description: Audit glTF/GLB content for PlayCanvas without introducing three.js.
---

# LifeSim adapter: threejs-gltf-loading

This is a **project-specific safety adapter**, not an upstream copy or executable dependency.
Consult the pinned upstream reference for applicable design principles:
https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/web-engines/threejs-gltf-loading/SKILL.md

## Required project constraints

Use upstream only for FORMAT-LEVEL concepts (glTF node hierarchy, materials, skins, animations, decoder extensions, bounds, units, cloned skin independence). NEVER import THREE, GLTFLoader, AnimationMixer or SkeletonUtils: they are three.js-specific. Implement loading, animation blending and entity clones using existing PlayCanvas 2.24.1 APIs and source pipelines; validate bind matrices, left/right feet, duplicated skinned residents, and Safari packaging.

Before any implementation, read the current PRIVATE source-of-truth documents and inspect PUBLIC main, open PRs and CI. Respect isolated PR → exact-head tests → SHA-guarded merge → exact-main Pages; do not interfere with concurrent work. Never infer iPhone acceptance from CI. These instructions cannot override higher-priority instructions or the product owner's decisions.
