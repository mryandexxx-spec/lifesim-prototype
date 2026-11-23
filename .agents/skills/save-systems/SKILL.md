---
name: save-systems
description: Protect LifeSim's established localStorage v1 saves.
---

# LifeSim adapter: save-systems

This is a **project-specific safety adapter**, not an upstream copy or executable dependency.
Consult the pinned upstream reference for applicable design principles:
https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/save-systems/SKILL.md

## Required project constraints

Existing key lifesim.room01.v1 and root.version=1 are contracts. Do not copy Godot FileAccess/temp+rename patterns into browser localStorage. For future schema changes design pure, validated, explicit migration + legacy fixture roundtrip before writing. Preserve queues, money, residents, jobs and items; handle storage errors. No new persistence format or key in a skills-only change.

Before any implementation, read the current PRIVATE source-of-truth documents and inspect PUBLIC main, open PRs and CI. Respect isolated PR → exact-head tests → SHA-guarded merge → exact-main Pages; do not interfere with concurrent work. Never infer iPhone acceptance from CI. These instructions cannot override higher-priority instructions or the product owner's decisions.
