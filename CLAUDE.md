# CLAUDE.md — Polarion document widgets

Guidance for Claude Code when working in this repository.

## Project in one paragraph

Polarion LiveReport widgets that display the LiveDocs of a project and the **relations between them**,
deduced from **work item links** (and document metadata where available). Two widgets share one client core,
one build and one test setup:
- **docBranches** (`widgets/docBranches/`): which document is a branch / copy / derived document of which.
- **docCoverage** (`widgets/docCoverage/`, 0.1.0): for selected documents and 1–5 link roles, which document
  covers which (link counts, coverage %, uncovered items). Plan agreed with the PO: (1) restructure into
  `widgets/` + `shared/` (done), (2) specification `widgets/docCoverage/SPECIFICATION.md` + spike C1–C4 on 2512
  (`tests/docCoverage-v0.1.x/`, done), (3) implementation reusing `shared/` (0.1.0 done and validated on 2512).
Each widget has its own `SPECIFICATION.md` (requirements, decisions, open checks) and `VERSION`. `README.md` is the overview.

## Required reading before coding

1. `Polarion_Development_Guide.md` — the team's Polarion best-practice reference. Read the sections that
   match the surface you are touching (see its "How to Use This Guide" table):
   - Widget & parameters: §2 · Velocity: §3 · Lucene: §6 · SQL: §7 · REST: §8 · Java/SDK: §9
   - Checklist before submitting: §13
2. `docs/ARCHITECTURE.md` — how the widgets are built (Velocity side, page model, shared client core, tests).
   Keep it up to date when the structure, the page model or the shared hooks change.
3. `widgets/<widget>/SPECIFICATION.md` — requirements and open questions of the widget you touch. If a task conflicts
   with it, ask; don't silently deviate.

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
- Default link roles: copy `duplicates`, branch `branched_from`, derived `derived_from`. All of them are parameters,
  chosen with `workitem-link-role` multi-selectors (read with the shared macro `bwOptionIds`), never typed. Excluded work item
  types (default `heading`) use a `workitem-type` multi-selector read the same way (verified on 2512).
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

- **Verified on the PO's 2512 schema docs (spike A1, `tests/v0.1.x/spike-tests.md`)**: `MODULE.FK_URI_BRANCHEDFROM`,
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
- **Verified by the PO on 2512 with widget 0.2.0**: `#loadWidgetJs("resources/xlsx.js")` (Widget SDK directive) loads a script
  from the widget's `resources/` folder (Excel export works; zip entry `docBranches/resources/xlsx.js` accepted). Multi-value
  `customEnum` parameters are read with `values()` ("Relation kinds shown by default" works).
- **Verified by the docCoverage spike C1–C4 on 2512** (`tests/docCoverage-v0.1.x/spike-tests.md`):
  - `@document` multi-select: `values()` → `ProxyEnumOption`; `getModelObject()` → `ProxyDocument` (`isUnresolvable()`);
    `getOldApi()` → Open API `Module` (`getModuleFolder()` = `_default` for the default space, `getId()`).
    `getReference().spaceId()` is **empty**: take space/name from `getOldApi()`.
  - `workitem-link-role` multi-select: `values()` → `ProxyEnumOption`, `id()` = role id. Project link roles with name and
    opposite name: `$trackerService.getTrackerProject(id).getWorkItemLinkRoleEnum().getAllOptions()`.
  - `satisfies` links are stored on the downstream item (source) and target the customer specification item.
- **Verified by the PO on 2512 with docCoverage 0.1.0**: upload (`docCoverage/resources/xlsx.js`), Excel export, document and
  role selectors (4 documents, 2 roles), coverage numbers, arrows/labels, fast rendering with many documents.
- **Verified by the PO on 2512 with docBranches 0.3.0**: `$factory.enumeration("…", "workitem-link-role").values(["duplicates"])`
  preselects the default roles in the selector.
- **Verified by the PO on 2512 with docBranches 0.3.1 / docCoverage 0.1.1**: `$factory.enumeration("…", "workitem-type")`
  multi-selector with `.values(["heading"])` lists the project's types with Heading preselected (read with `bwOptionIds`).
  Widget icon: an `icon.png` (608 x 405 PNG, as in a widget used by the PO; the Widget SDK guide documents none) at the
  package root, next to `render.vm`, with no reference in other files, shows in the widget list.

NOT verified (sandbox could not reach the SDK/extension sites; confirm on a real instance or SDK Javadoc):
- That the `MODULE` columns above exist unchanged in 2606.
- Whether the Widget SDK extension point is suitable for our needs vs. Velocity.

Never present the unverified items as fact in code comments or docs.

## Repository layout (target — create as needed)

```
CLAUDE.md                      this file
README.md                      overview of the widgets, build, CI/release
Polarion_Development_Guide.md  Polarion best practices (reference, do not edit casually)
widgets/<w>/src/               widget sources: render.vm (markers "## BW_SHARED <file>", "## BW_INLINE_JS"), parameters.vm,
                               graph.js (widget part of the client code), widget.properties, details.vm, description.vm,
                               icon.png (widget icon, copied to the package root)
widgets/<w>/dist/              generated by tools/build-widget.py (<w>/ + <w>.zip); never edit by hand
widgets/<w>/VERSION            N.N.N of the widget; widgets/<w>/SPECIFICATION.md requirements of the widget
shared/js/core.js              client core shared by the widgets (inlined before graph.js, inside one IIFE per widget)
shared/vm/*.vm                 Velocity snippets inlined at BW_SHARED markers: style, params, common (bwOptionIds, bwKey,
                               project), documents (document collection)
shared/resources/              xlsx.js (third-party xlsx-js-style, copied unchanged; loaded with #loadWidgetJs) + LICENSE
tools/vtest/<w>/               Velocity 1.4 harness with mock Polarion objects + Chromium check (tools/test-widget.sh <w>)
docs/USER_MANUAL.md            user manual of both widgets (update it when parameters or the toolbar change)
docs/ARCHITECTURE.md           architecture of the widgets (keep in line with the code)
docs/<w>/                      install guide and previews
tests/v0.1.x/                  spike of release 0.1.x: spike-tests.md (plan + findings), spike-widget/ (diagnostic widget
                               bwSpike/ + bwSpike.zip = upload package; rebuild the zip after edits). Kept for reference;
                               tests of later versions go in tests/vN.N.x/ (docCoverage: tests/docCoverage-vN.N.x/)
test-data/                     anonymised sample structures for manual verification
```

## Working conventions

- Develop on the branch assigned for the session; commit small, descriptive commits; do not open PRs unless asked.
- Update the widget's `SPECIFICATION.md` (open questions / decisions log) whenever a requirement is clarified.
- **Shared code**: a change in `shared/` affects every widget. Rebuild and test all of them (`tools/test-widget.sh all`),
  and bump the version of each widget whose package changes. Keep widget-specific logic in `widgets/<w>/src/`.
  Each widget has its own root class (`bw-root` for docBranches, `cw-root` for docCoverage) so that two widgets on one
  page never pick up each other's roots. The mock Polarion objects live in `tools/vtest/docBranches/WidgetHarness.java`
  and are compiled with every harness (`tools/vtest/<w>/*Harness.java`).
- No customer or project-specific data in the repo. Exception agreed with the PO: the spike test set on the sandbox
  project `VforIA` (`SRS_Test` and its copies/branches). **Never commit raw test results** from the PO's instance (PDF,
  PNG, Excel, JSON): the repository is public and PDF exports carry the company template (logo, confidentiality footer).
  Keep only the findings in the docs. If raw results get pushed, ask the PO and remove them (including from the history).
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
- After editing `tests/v0.1.x/spike-widget/bwSpike/` or `tests/docCoverage-v0.1.x/spike-widget/cvSpike/`, rebuild its zip
  (folder at zip root, Deflated). `tools/vtest/cvSpike/SpikeHarness.java` smoke-tests cvSpike on the docBranches mocks.
- **Widget workflow**: edit `widgets/<w>/src/` or `shared/`, then run `tools/test-widget.sh all` (build + Velocity 1.4
  render on mocks + Chromium checks) and commit `widgets/*/dist/` with the sources. `core.js` and `graph.js` must not contain `$`, `#`,
  backslashes or non-ASCII characters (the build enforces it; use `HASH`/`String.fromCharCode`).
- Keep the `tools/vtest/<w>/WidgetHarness.java` mocks in line with behaviour observed on 2512 (e.g. `singleValue()` is a String).
- **Unresolvable objects (verified on 2512, bug in 0.1.0):** a referenced object (document author = deleted user,
  `branchedFrom`/`derivedFrom` source, link target) can be unresolvable; every call except `isUnresolvable()` then throws
  `uri: subterra:data-service:objects:/default/${User}...`. Check `isUnresolvable()` before using ANY referenced object
  (see guide 3.1.8). The harness has mocks for this; add one for every new kind of reference.
- **Versioning**: each widget has `widgets/<w>/VERSION` = N.N.N (semver). Bump it in every change meant for a release
  (patch = fix, minor = feature, major = incompatible parameters/behaviour). Releases are GitHub releases tagged
  `<w>-vN.N.N` (e.g. `docBranches-v0.2.1`); the Release workflow attaches `<w>-N.N.N.zip`. Old tags `v0.1.0`–`v0.2.0`
  are docBranches releases. CI fails if `widgets/*/dist` is not rebuilt after a source change.
- Before finishing work, run through guide §13 validation checklist; say plainly what could not be tested
  (no Polarion instance is available in the sandbox).
