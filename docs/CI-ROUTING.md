# Change-aware CI (2026-11-21)

## Default PR gate
Only .github/workflows/ci-targeted.yml automatically runs for pull requests. It
checks changed JS/MJS syntax, startup JS syntax, three small invariant suites,
the changed Node tests, their static relative-import dependents and a handful
of critical integration guards (camera, kitchen, finance, queue and outdoors).
Changed browser-facing modules, HTML/CSS, assets or browser-smoke files also
trigger **one** real Chromium/SwiftShader PlayCanvas boot at 390×844. Documentation
changes skip test execution. Latest commits supersede queued PR runs via
concurrency cancellation.

## Releases and deep diagnostics
pages.yml still gates each merge to main with npm test, source syntax
checks, asset hashes, assembly and the actual Pages deployment. It is not
replaced by the PR smoke. ci-full-manual.yml provides an opt-in full Node
regression and optional four-screen browser recovery test. All historical
per-feature .github/workflows/*.yml are preserved as workflow_dispatch
**only**, keeping their original scenarios, screenshots and focused cases for
manual triage without auto-running for unrelated changes.

## Safeguards / limitations
ci-guard.mjs fails when a historical workflow reintroduces an automatic PR
or push trigger. Static JS import tracing is conservative, but runtime dynamic
dependencies or string-based source checks may not be selected; use the manual
relevant feature workflow for high-risk changes and rely on the independent full
Node test before release. A successful Chromium boot is not physical iPhone
Safari acceptance. Existing root-v1/localStorage compatibility and the Pages
artifact remain covered by the merge-time full regression.

**Branch protection:** after switching from dozens of historical checks to one
stable targeted job, update any external required-status-check rule if one
exists; this repository's branch protection endpoint is not readable through
the current integration (403). Do not misrepresent the new CI as verified green
until the exact-head GitHub Actions run finishes.
