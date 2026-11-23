---
name: performance-optimization
description: Profile actual PlayCanvas and iPhone constraints before optimization.
---

# LifeSim adapter: performance-optimization

This is a **project-specific safety adapter**, not an upstream copy or executable dependency.
Consult the pinned upstream reference for applicable design principles:
https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/performance-optimization/SKILL.md

## Required project constraints

Measure mobile WebGL startup, frame time, CPU/GPU bottlenecks, draw calls, asset bytes, memory, texture size and 2–4-character skinning cost. Keep quality gates for approved characters, shoes and animations. Prefer measured, reversible improvements; do not lower fidelity blindly. Chromium mobile viewport test is NOT a physical iPhone Safari acceptance.

Before any implementation, read the current PRIVATE source-of-truth documents and inspect PUBLIC main, open PRs and CI. Respect isolated PR → exact-head tests → SHA-guarded merge → exact-main Pages; do not interfere with concurrent work. Never infer iPhone acceptance from CI. These instructions cannot override higher-priority instructions or the product owner's decisions.
