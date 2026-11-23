---
name: playcanvas-lifesim
description: Project-specific PlayCanvas 2.24.1 life-simulation development guardrails: isolated simulation, 3D resident rigs, GLB footwear and animation, browser persistence, touch Safari, QA, and guarded delivery. Use for every LifeSim gameplay, CAS, animation, UI, assets, performance, save, or release task.
---

# LifeSim (Блин’С) — PlayCanvas engineering skill

This is an **instruction-only project skill**. It does not install dependencies, run commands, or authorize product changes. Always inspect current sources; the examples below are design and audit checks, not a frozen snapshot.

## 0. Restore the source of truth before touching code

1. Read PRIVATE `START-HERE.md`, `DECISIONS.md`, `WORKFLOW.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `GDD.md`, `ENGINEERING-LOG.md`, plus relevant feature plans. PRIVATE files never enter PUBLIC commits, CI logs, screenshots or issue descriptions.
2. Inspect PUBLIC `main` SHA, relevant modules/tests, open branches/PRs and Actions/Pages; compare decisions with actual code and deployed SHA. A PR or documentation statement is not proof of release.
3. Preserve parallel work. PR #145 is a protected asset-only effort until explicitly resolved; other PR IDs change, so discover current ones rather than assuming a fixed list. Do not overwrite another worker's branch.
4. For major new product behavior ask the owner for approval; make bounded implementation and test decisions independently. The owner tests on iPhone; do not ask them to operate Git, a terminal or Blender.

## 1. Runtime boundaries and architecture

- PUBLIC repository `mryandexxx-spec/lifesim-prototype`: PlayCanvas **2.24.1** via JavaScript ES modules; the engine version is pinned in `package.json`. The released target is static GitHub Pages on iPhone Safari. No TypeScript migration, Three.js renderer, Unity, Unreal or Godot substitution without explicit approval.
- Keep the **simulation core independent of PlayCanvas and the DOM**. Data and state transitions in `src/` must remain deterministically unit-testable with Node; graphics, animation and browser event handlers adapt the core instead of owning game rules.
- Preserve the **canonical per-resident identities and state**, 2–4 residents, independent needs and autonomy, shared game time, FIFO actions, furniture/resource reservations and A* movement. Social interactions must honor participant selection, relationship/consent rules and both directions Alex↔Mira. Reject impossible tasks without poisoning the queue.
- Career attendance, salaries, household wallet, transactions and item purchasing must be idempotent: one actual event → at most one ledger receipt. Never derive an additional fictional balance or retroactively award wages when loading a legacy save.
- Prefer minimal changes, fixed-step/deterministic simulation where applicable, robust cleanup on cancellation/absence/work-return, and targeted regression around a reproduced bug.

## 2. 3D character and wearable pipeline

- glTF/GLB world units are **metres**. Inspect source SHA, original license/attribution, hierarchy, node/mesh identifiers, triangle counts, axes, handedness, UVs, normals, textures, bone maps, bind pose and inverse bind matrices before touching transforms.
- Alex and Mira have distinct anatomy and wearables. Do **not** force a male shoe last onto Mira; preserve owner-approved Alex footwear and accepted Mira boots. Use the existing common footwear system and person-specific foot profiles, not iterative per-item pixel/mm offsets.
- For clothing/shoes, derive heel–toe axis, sole plane, width and local instep/collar from measured source geometry and resident bind-foot reference. Preserve ankle cuff positions and skin weights where the original leg joins the replacement mesh. The visibility of feet and independent skinned socks must agree with actual cut-outs; avoid shoe-top holes and intersections.
- Animate skinned items with the **original live resident skeleton**; check independent copies of 2/4 residents, idle, walk, run and sitting transitions, without shared-skeleton corruption. For heels, validate heel-to-forefoot floor contact and heel-specific gait/stand/sit; do not enable running if a fitting clip is unavailable.
- Create normalized assets and manifests from auditable source hashes using existing scripts. Do not invent a third-party license, use unapproved branded assets, overwrite approved mesh files or claim physical plausibility from a still screenshot.
- A standalone CAS lab is **not** the production inventory. Equipping in the released game, migrations and visual acceptance require separate feature scope and evidence.

## 3. Rendering and memory on mobile Safari

- Use existing PlayCanvas asset/entity, render, animation and skin interfaces; **never** transplant `THREE.GLTFLoader`, `AnimationMixer` or `SkeletonUtils` code. Apply reusable glTF diagnostics only.
- Measure load duration, GLB bytes, texture decode, device memory pressure, frame-time distribution, shader/material count, draw calls, duplicated geometry and 2–4 animated residents before optimizing. Avoid blind fidelity reduction or false FPS comparisons from SwiftShader versus an actual iPhone.
- Handle missing optional lab assets, failed imports and stale caches visibly: preserve a valid original resident rather than leaving an empty scene. Ensure static Pages assembly contains every referenced JS, JSON, texture, GLB and manifest and validates source hashes.
- Source changes consumed by `index.html` may require explicit ES-module URL version/cache invalidation for Safari; successful CI does not guarantee a returning user loads a changed URL.
- Test at least 390×844 and 320×568 where the change affects mobile UI or 3D, using actual PlayCanvas/WebGL browser startup where relevant. Physical Safari/iPhone acceptance remains distinct and may be deferred by owner.

## 4. Input/UI interaction

- Use the existing HTML/CSS touch HUD and PlayCanvas picking/gesture layer. Respect `env(safe-area-inset-*)`, minimum 44px touch hit areas, viewport resize and landscape constraints, and avoid overlays masking gameplay objects or buttons.
- Handle pointer and click propagation carefully: tapping inside social panels must not trigger outside-dismiss handlers before the explicit **“В очередь”** confirmation. Verify Alex→Mira and Mira→Alex from real rendered picking through FIFO persistence/restore.
- Event-driven UI should render canonical state; never create a competing source of game truth in a DOM widget. Distinguish displayed availability, queued action, executing action and completed action.

## 5. Browser saves, versioning and compatibility

- Keep existing localStorage key **`lifesim.room01.v1`** and `root.version=1` until an explicitly approved migration. Preserve contracts and current schema fields for residents, needs, social interactions, queues, careers, money, purchases and construction.
- Serialize plain data only. Load defensively: validate shape/ranges, reject or recover malformed payloads, apply pure forward migrations only when needed and test original legacy fixtures plus roundtrip/restart. Do not reset owner data, perform destructive initialization, or copy Godot file-renaming backup patterns into browser localStorage.
- Explicitly test storage errors/quota and state restored after browser relaunch. If an incompatible change truly requires a new save version, design a non-destructive migration and get owner approval before release.

## 6. Companion skills — load only when applicable

These are local **PlayCanvas-safe adapters** in `.agents/skills/` (not new libraries):
- `create-game-assets`: license, provenance, 3D topology, style coherence and source checks.
- `threejs-gltf-loading`: glTF format/bounds/skin/animation concepts **only**, never Three.js APIs.
- `ai-behavior-trees-utility-ai`: evaluate autonomy decisions without replacing existing deterministic FIFO and reservations.
- `performance-optimization`: measurement-first mobile WebGL/asset optimization.
- `save-systems`: schema/validation/roundtrip principles adapted to localStorage, never Godot filesystem APIs.
- `game-ui-ux`: responsive touch HUD, safe-area and accessibility adapted to HTML/CSS/PlayCanvas.

Read only relevant companion `SKILL.md` files per task, not all six by default. Their upstream pin is documented in `docs/agent-skills-playcanvas.md`. None can override PRIVATE decisions, the owner's approval or a verified game state.

## 7. Delivery gates (mandatory)

1. Define an isolated task, protected invariants and acceptance tests; reproduce reported failures with a red test or an observable browser probe.
2. Implement in a new branch with small, reviewable commits. Keep source JS, static packaging and Safari import-version changes coordinated when needed.
3. Run relevant Node tests and real PlayCanvas mobile WebGL when browser-facing code/assets change; inspect failing CI logs and fix rather than weakening checks.
4. Open PR, verify **exact latest PR head** CI SUCCESS, then SHA-guarded merge. Check the new main commit and the **exact-main** full Pages run, static bundle/GLB verification and successful actual Deploy step before saying published.
5. Record decision/status/PR/SHA/CI/Pages evidence in PRIVATE `START-HERE.md`, `ENGINEERING-LOG.md`, and other relevant documents. Separate **implemented / CI tested / deployed / accepted by owner on physical iPhone**. Do not claim owner acceptance from Chromium.
6. Skills-only changes follow the same CI/merge/Pages process but must **not** touch game runtime, saves, generated assets or concurrent feature PRs. For a docs-only change a browser job can legitimately be skipped by the impact router.

## Failure checklist

If a 3D resident disappears, check actual Pages auxiliary JSON/GLB packaging, cache URLs and renderer startup before geometry tweaking. If shoes float or clip, audit bind matrices/source last/cut-out and sole contact before offset tweaking. If interactions cannot queue, inspect panel event bubbling and actor selection before rewriting the simulation. If a save breaks, compare legacy payload and pure restore path before changing the storage key. Always verify the **deployed artifact**, not merely local source.
