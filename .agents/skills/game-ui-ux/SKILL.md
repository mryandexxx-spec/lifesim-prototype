---
name: game-ui-ux
description: Review LifeSim touch UX and mobile safe areas.
---

# LifeSim adapter: game-ui-ux

This is a **project-specific safety adapter**, not an upstream copy or executable dependency.
Consult the pinned upstream reference for applicable design principles:
https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/game-ui-ux/SKILL.md

## Required project constraints

Use DOM/CSS and existing PlayCanvas input integration, not Godot/Unity widgets. Prioritize iPhone Safari touch targets, viewport safe-area insets, 390×844 and 320×568 layouts, gestures, modal layering, tap propagation, accessible labels and queue confirmation. Keep HUD and social interactions working in both directions. Verify true in-engine WebGL and distinguish from device QA.

Before any implementation, read the current PRIVATE source-of-truth documents and inspect PUBLIC main, open PRs and CI. Respect isolated PR → exact-head tests → SHA-guarded merge → exact-main Pages; do not interfere with concurrent work. Never infer iPhone acceptance from CI. These instructions cannot override higher-priority instructions or the product owner's decisions.
