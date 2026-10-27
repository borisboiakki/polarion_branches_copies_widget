# CLAUDE.md — Polarion Branches Widget

Guidance for Claude Code when working in this repository.

## Project in one paragraph

A Polarion LiveReport widget that visually displays the LiveDocs of a project (or several) and the
**relations between them**: which document is a branch of which, which is a copy / reuse of which.
Relations are deduced from **work item links** (and, where available, document-level "branched from"
metadata). See `SPECIFICATION.md` for requirements (draft, to be refined with the user) and
`README.md` for the overview.

## Required reading before coding

1. `Polarion_Development_Guide.md` — the team's Polarion best-practice reference. Read the sections that
   match the surface you are touching (see its "How to Use This Guide" table):
   - Widget & parameters: §2 · Velocity: §3 · Lucene: §6 · SQL: §7 · REST: §8 · Java/SDK: §9
   - Checklist before submitting: §13
2. `SPECIFICATION.md` — requirements and open questions. If a task conflicts with it, ask; don't silently deviate.

## Golden rules (from the guide, restated for this project)

- Polarion has four distinct programming surfaces (Velocity, Polarion Scripting, Lucene/SQL, Java/REST).
  Decide which one a piece of code belongs to *before* writing it; don't mix idioms.
- Do **not** hard-code project-specific work item types, link roles, custom fields or statuses. They must
  be widget parameters or be resolved from the project configuration (guide §2.1 enumeration parameters,
  e.g. `$factory.enumeration("Link Role", "workitem-link-role")`).
- Guide §10/§12 notes that system roles like `branched`/`derived` should not be used for links between
  reused/branched documents; use a standard role such as `duplicates`. Treat link roles as configurable.
- Use `@document` selectors via `getModelObject()`, not `document.id:` Lucene built from option ids (guide §2.1).
- Respect PDF/print rendering: no JS or external stylesheets in those modes (guide §11/§13).
- Keep the interactive path within the 10 s scripting/render budget; push heavy work into SQL or a cache.

## Technology decision (settled 2026-10-27 — see SPEC §6)

- **Velocity widget** (uploaded `.zip`, widget id/folder `docBranches/`, entry names must stay ≤ 30 chars).
  JS/CSS are **inlined** in `render.vm` (spike V5: `#include`/`#parse` cannot load `resources/`). No CDN, no Java.
- Target **Polarion 2512**, stay compatible with **2606**: public Rendering API + documented SQL tables only.
- Data: SQL scoped to one project (≈100 LiveDocs / 20k work items). Never loop over all work items in Velocity.
- Interactive graph = client-side SVG. PDF/print = static server-side SVG + table, no JS.
- Default link roles: copy `duplicates`, branch `branched_from`, derived `derived_from`. All of them are parameters.
- Work the technical risks in SPEC §9 (spike) before building features on top of them.

## Research notes (verified vs. unverified)

Verified through web search (2026-10-27):
- Polarion copies/branches: copied Documents are linked to source via a "branched from" field; copied Work
  Items are linked to their source via a "branched from" link (Polarion 2016 compare/merge, 2310 bulk branching
  blog posts at blogs.sw.siemens.com/polarion).
- `IModuleBrancher` (Open API) `execute()` returns the saved branched `IModule`; branching from HEAD points
  referenced work items to HEAD, from a historical revision freezes them (`freezeReferences`).
- Extra Widgets extension (`Polarion/com.polarion.alm.extensions.widgets`, Apache-2.0, archived Sep 2024) is
  a reference for packaging widgets; it needs Polarion 2015+. Widget SDK PDF: `<host>/polarion/sdk/doc/widget-sdk.pdf`.
- Community extension "Diff-Tool" (extensions.polarion.com #476) compares reused documents via a link role.
- "Graphical and Tabular Impact Analysis Widget" (extensions.polarion.com #354) is a prior-art link-graph widget.
- SBB (SchweizerischeBundesbahnen on GitHub) publishes Polarion extensions under `ch.sbb.polarion.extension.*`
  (e.g. json-editor, aad-synchronizer, interceptor-manager, generic). No SBB widget repo found; they are
  useful as a **Java/Maven build and packaging reference**, not as a widget reference.

- **Verified on the PO's 2512 schema docs (`tests/v0.1.x/results/A1_FullDBSchema.pdf`)**: `MODULE.FK_URI_BRANCHEDFROM`,
  `MODULE.FK_URI_DERIVEDFROM`, `MODULE.C_DERIVEDFROMLINKROLE`, `MODULE.C_MODULEFOLDER`, `MODULE.C_MODULENAME`,
  `WORKITEM.FK_URI_MODULE`; table `STRUCT_WORKITEM_LINKEDWORKITEMSDERIVED` also exists.
- **Verified by spike A2 on 2512**: links with roles `duplicates`, `branched_from`, `derived_from` go from the
  copy/branch/derived item (`fk_uri_p_workitem`, link source) to the original item (`fk_uri_workitem`, target).
  A branch only links its overwritten items; a branch with nothing overwritten has no links (metadata only).
  Branches (even without overwritten items) have `MODULE.FK_URI_BRANCHEDFROM`; derived documents have
  `MODULE.FK_URI_DERIVEDFROM`; copies have no metadata. Tracker SQL accepts `DISTINCT` and `GROUP BY … HAVING`.
  `MODULE.C_ID` and `C_MODULENAME` both hold the document name.
- **Verified by spike R2 (REST) on 2512**: a copy of a copy keeps the inherited links. E's items link to B **and**
  to A, so raw link counts contain transitive edges (see SPEC §7 "Inherited links").
- **Verified by spike V1 on 2512**: widget context classes, `$date.systemTime`, `isPdf()` true in PDF export,
  reflection method listing blocked.
- **Verified by spike V1–V7 on 2512 (`EOLE_AI_MCP_TESTS`, 120 docs)**:
  - `$parameters.<customEnum>.singleValue` returns the option id as a **String**; `.value()`/`.value` work for strings/integers.
  - `$trackerService.getDataService().sqlSearch(sql)` returns `IModule`/`IWorkItem` objects fast; `DISTINCT` and
    `GROUP BY … HAVING` accepted. Data approach = SPEC §9 R1 option (b) (SQL link-source items + Velocity scan): 22 ms + 84 ms.
  - `IModule.getValue("branchedFrom")` returns the source module object (revision-pinned).
  - `#include`/`#parse` **cannot** load files from the widget's `resources/` folder → inline JS/CSS in `render.vm`.
  - Long arithmetic does not compute (`$t1 - $t0` on `$date.systemTime` is empty), as expected for Velocity 1.4.
  - Inline JS runs in the browser view (SVG export downloaded); no JS in PDF export; static inline SVG renders in PDF.

NOT verified (sandbox could not reach the SDK/extension sites; confirm on a real instance or SDK Javadoc):
- That the `MODULE` columns above exist unchanged in 2606.
- Whether the Widget SDK extension point is suitable for our needs vs. Velocity.

Never present the unverified items as fact in code comments or docs.

## Repository layout (target — create as needed)

```
CLAUDE.md                      this file
README.md                      project overview
SPECIFICATION.md               requirements (draft)
Polarion_Development_Guide.md  Polarion best practices (reference, do not edit casually)
widget/src/                    widget sources: render.vm (marker "## BW_INLINE_JS"), parameters.vm, branches-graph.js
widget/dist/                   generated by tools/build-widget.py (docBranches/ + docBranches.zip); never edit by hand
tools/vtest/                   Velocity 1.4 harness with mock Polarion objects + Chromium check (tools/test-widget.sh)
docs/                          install guide and previews
tests/v0.1.x/                  spike of release 0.1.x: spike-tests.md, results/ (PO test results), spike-widget/ (diagnostic widget
                               bwSpike/ + bwSpike.zip = upload package; rebuild the zip after edits). Kept for reference;
                               tests of later versions go in tests/vN.N.x/
test-data/                     anonymised sample structures for manual verification
```

## Working conventions

- Develop on the branch assigned for the session; commit small, descriptive commits; do not open PRs unless asked.
- Update `SPECIFICATION.md` (open questions / decisions log) whenever a requirement is clarified.
- No customer or project-specific data in the repo. Exception agreed with the PO: the spike test set on the sandbox
  project `VforIA` (`SRS_Test` and its copies/branches) and the results the PO commits under `tests/v0.1.x/results/`.
- **Velocity dialect (verified on the PO's 2512 instance):** Polarion's widget parser behaves like **Velocity 1.4**
  (both errors seen on the instance reproduce exactly with velocity-1.4.jar). Details in guide §3.1.9. Therefore:
  - no map literals `{}` → use `$objectFactory.newMap()`; list literals `[]` are fine
  - `#[[ ... ]]#`, `#break`, `$foreach` parse but do nothing (emitted as text) → don't rely on them
  - no method chains split across lines (`$factory.x()` newline `.y()`) → one statement per line.
    Note: guide §2.1 shows multi-line chains, which fail on this instance
  - no backslashes in Velocity string literals (`"[a-z\-]"` → lexical error); put `-` last in a regex class
  - no directive names in plain text/HTML/JS (e.g. writing `#include` in a sentence); hex colours are fine;
    avoid `$` in inline JS
  - arithmetic is reliable on Integer only (verified: Long differences such as `$date.systemTime` ones do not compute)
- **Always run `tools/vcheck.sh` before committing a `.vm` change.** It parses every template with Velocity 1.4
  (needs Java; it downloads the jars to `tools/.lib/` on first use).
- After editing `tests/v0.1.x/spike-widget/bwSpike/`, rebuild its `bwSpike.zip` (folder at zip root, Deflated).
- **Widget workflow**: edit `widget/src/`, then run `tools/test-widget.sh` (build + Velocity 1.4 render on mocks +
  Chromium screenshots) and commit `widget/dist/` with the sources. `branches-graph.js` must not contain `$`, `#`,
  backslashes or non-ASCII characters (the build enforces it; use `HASH`/`String.fromCharCode`).
- Keep `tools/vtest/WidgetHarness.java` mocks in line with behaviour observed on 2512 (e.g. `singleValue()` is a String).
- **Versioning**: `VERSION` holds N.N.N (semver). Bump it in every change meant for a release (patch = fix, minor =
  feature, major = incompatible parameters/behaviour). Releases are GitHub releases tagged `vN.N.N`; the Release
  workflow attaches `docBranches-N.N.N.zip`. CI fails if `widget/dist` is not rebuilt after a source change.
- Before finishing work, run through guide §13 validation checklist; say plainly what could not be tested
  (no Polarion instance is available in the sandbox).
