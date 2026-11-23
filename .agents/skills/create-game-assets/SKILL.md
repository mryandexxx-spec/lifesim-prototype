---
name: create-game-assets
description: Audit and produce licensed LifeSim assets without changing approved models.
---

# LifeSim adapter: create-game-assets

This is a **project-specific safety adapter**, not an upstream copy or executable dependency.
Consult the pinned upstream reference for applicable design principles:
https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/create-game-assets/SKILL.md

## Required project constraints

Check source ownership and exact license, original SHA, topology, UVs, skeleton/bind pose, skin weights, foot/last fit, textures and in-engine PlayCanvas appearance. Preserve approved Alex shoes and Mira boots. Never equate a generated render with a production GLB. Track provenance, source SHA and attribution in existing project manifests; respect owner approval.

Before any implementation, read the current PRIVATE source-of-truth documents and inspect PUBLIC main, open PRs and CI. Respect isolated PR → exact-head tests → SHA-guarded merge → exact-main Pages; do not interfere with concurrent work. Never infer iPhone acceptance from CI. These instructions cannot override higher-priority instructions or the product owner's decisions.
