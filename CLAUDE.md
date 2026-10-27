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

- **Velocity widget** (uploaded `.zip`, folder `branchesWidget/`) with bundled vanilla JS/CSS in `resources/`.
  No CDN, no Java extension.
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

- Published DB schema docs (testdrive SDK) list `MODULE.FK_URI_BRANCHEDFROM`, `MODULE.FK_URI_DERIVEDFROM`,
  `MODULE.C_DERIVEDFROMLINKROLE` (seen in search results; not yet checked on 2512/2606).

NOT verified (sandbox could not reach the SDK/extension sites; confirm on a real instance or SDK Javadoc):
- That the `MODULE` columns above exist unchanged in 2512/2606.
- Velocity syntax/macro for loading `resources/` JS/CSS in a widget (Widget SDK mentions such macros).
- Whether `searchBySql` can return aggregate rows (it resolves objects by `C_URI`). See SPEC §9 R1.
- Whether the Widget SDK extension point is suitable for our needs vs. Velocity.

Never present the unverified items as fact in code comments or docs.

## Repository layout (target — create as needed)

```
CLAUDE.md                      this file
README.md                      project overview
SPECIFICATION.md               requirements (draft)
Polarion_Development_Guide.md  Polarion best practices (reference, do not edit casually)
widget/                        widget sources (Velocity: parameters.vm, render.vm, assets)
docs/                          design notes, decisions, spike tests (docs/spike-tests.md)
test-data/                     anonymised sample structures for manual verification
spike/bwSpike/                 diagnostic test widget (spike/bwSpike.zip = upload package; rebuild after edits)
```

## Working conventions

- Develop on the branch assigned for the session; commit small, descriptive commits; do not open PRs unless asked.
- Update `SPECIFICATION.md` (open questions / decisions log) whenever a requirement is clarified.
- No customer or project-specific data in the repo.
- **Velocity dialect (verified on the PO's 2512 instance):** Polarion's widget parser behaves like **Velocity 1.4**
  (both errors seen on the instance reproduce exactly with velocity-1.4.jar). Therefore:
  - no map literals `{}` → use `$objectFactory.newMap()`; list literals `[]` are fine
  - no `#[[ ... ]]#` unparsed blocks, no `#break`, no `$foreach`/`$velocityCount`-style 1.7 features
  - no method chains split across lines (`$factory.x()` newline `.y()`) → one statement per line.
    Note: guide §2.1 shows multi-line chains, which fail on this instance
  - no backslashes in Velocity string literals (`"[a-z\-]"` → lexical error); put `-` last in a regex class
  - no `#directive` look-alikes in plain text/HTML/JS/CSS (e.g. writing `#include` in a sentence) → avoid `#`
    in inline CSS/JS/SVG colours (use `rgb()`), and avoid `$` in inline JS
  - arithmetic is reliable on Integer only (Long results, e.g. `$date.systemTime` differences, may not compute)
- **Always run `tools/vcheck.sh` before committing a `.vm` change.** It parses every template with Velocity 1.4
  (needs Java; it downloads the jars to `tools/.lib/` on first use).
- After editing `spike/bwSpike/`, rebuild `spike/bwSpike.zip` (folder at zip root, Deflated).
- Before finishing work, run through guide §13 validation checklist; say plainly what could not be tested
  (no Polarion instance is available in the sandbox).
