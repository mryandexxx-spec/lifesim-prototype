---
name: ai-behavior-trees-utility-ai
description: Reason about LifeSim autonomous action selection using engine-neutral utility AI.
---

# LifeSim adapter: ai-behavior-trees-utility-ai

This is a **project-specific safety adapter**, not an upstream copy or executable dependency.
Consult the pinned upstream reference for applicable design principles:
https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/ai-behavior-trees-utility-ai/SKILL.md

## Required project constraints

Study current deterministic simulation, FIFO queues, A* movement, task reservations and social consent before suggesting AI. Keep decisions independent from rendering. No combat/enemy behavior trees, no silent replacement of existing priority rules. Preserve idempotence, career attendance, saved queued tasks and two-to-four-resident fairness. Test reproducibility, cancellation and deadlocks first.

Before any implementation, read the current PRIVATE source-of-truth documents and inspect PUBLIC main, open PRs and CI. Respect isolated PR → exact-head tests → SHA-guarded merge → exact-main Pages; do not interfere with concurrent work. Never infer iPhone acceptance from CI. These instructions cannot override higher-priority instructions or the product owner's decisions.
