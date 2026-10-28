# Specification — Polarion Branches Widget

**Status:** v0.4 — implementation v0.1.0 started (`widget/`) — refined with the product owner on 2026-10-27. Items marked `[?]` are still open
or need verification on a real Polarion instance.

## 1. Goal

Provide a Velocity LiveReport widget that visually displays the LiveDocs of a Polarion project and the
**relations of copies, branches and derivations** between them, deduced from work item links (and
document-level metadata where Polarion stores it).

## 2. Context and constraints

| ID | Constraint | Source |
|---|---|---|
| C1 | Target **Polarion 2512**; keep compatible with **2606** (avoid APIs/columns deprecated or new in 2512 only) | PO |
| C2 | SQL access is available | PO |
| C3 | v1 scope: **one project** (all relations inside it). Cross-project is a future version, so do not design it out | PO |
| C4 | Sizing: up to **~100 LiveDocs** and **~20,000 work items** per project | PO |
| C5 | **Velocity widget** preferred; extra resources (JS/CSS in `resources/`) allowed when needed | PO |
| C6 | Visual representation **inside the widget**; export to **PDF** (standard widget/page PDF export) and **image** is a plus | PO |

## 3. Relation kinds

Defaults follow the Siemens standard link roles; every role is a **widget parameter** (enumeration
`workitem-link-role`), so instances with other conventions can remap them.

| Kind | Polarion operation | Default work item link role | Document-level metadata (see §7) |
|---|---|---|---|
| **Copy** | LiveDoc reuse / copy | `duplicates` | none expected `[?]` |
| **Branch** | Branch, items overwritten | `branched_from` | `MODULE.FK_URI_BRANCHEDFROM` `[?]` |
| **Derived** | Reuse with derivation option | `derived_from` | `MODULE.FK_URI_DERIVEDFROM`, `MODULE.C_DERIVEDFROMLINKROLE` `[?]` |

Note: the dev guide (§10.4) recommends a standard role such as `duplicates` rather than system roles for
reused/branched docs. The product owner states that `branched_from` / `derived_from` are what Siemens uses
in their standard configuration, so these are the defaults. They can still be changed in the parameters.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | List the project's LiveDocs as graph nodes. Default node fields: **document ID, title, space** | Must |
| F1b | Additional node fields selectable by the user: type, status, created, updated, work item count (author removed in 0.3.0, PO: not useful). Default selection set in the widget parameters. The viewer can toggle them in the widget UI without editing the parameters | Should |
| F2 | Draw **one line per related document pair**, directed **source → copy/branch/derived**, labelled with the kind(s) of the relation (e.g. `derived`, `branch`, `copy`, or `branch + derived`) | Must |
| F3 | Distinguish the kinds Copy / Branch / Derived with line style **and** colour, plus a legend | Must |
| F4 | Deduce edges by aggregating work item links (roles from §3) between items of two documents | Must |
| F5 | Link roles per kind are widget parameters with the §3 defaults: `workitem-link-role` multi-selectors since 0.3.0 (no typing) | Must |
| F6 | Threshold parameter: minimum linked items (absolute and/or %) before an edge is drawn | Should |
| F7 | Use document-level metadata (§3) when present and flag disagreement with link-based inference | Should |
| F8 | Edge detail (tooltip/panel): number of linked items, coverage % of source and target. **Heading items are excluded** from counts by default (parameter: excluded types, `workitem-type` selector, default Heading) | Should |
| F9 | Click a node to open the document; click an edge to list the linking work items | Should |
| F10 | Filters: space, document type, status, text | Should |
| F10b | **Show all documents / only documents with relations**: default set in the widget parameters, and the viewer can switch it in the widget UI (no edit mode needed). A **Refresh** control re-runs the analysis | Must |
| F10c | **Indirect (inherited) relations hidden by default** (transitive reduction, §7). A viewer toggle "show indirect relations" displays them as faint dashed lines | Must |
| F11 | Layout: family tree (layered, sources on the left/top) by default; zoom, pan, fit-to-view | Should |
| F12 | Export the current graph as **SVG** from the widget UI, and the shown documents and relations as **Excel** (0.2.0, xlsx-js-style in the widget resources; CSV fallback). PNG was dropped in 0.1.2: the browser blocks canvas export on Polarion pages (PO test). PDF is covered by F13 | Could (done) |
| F13 | **PDF/print**: static rendering of the graph (no JS) plus a relations table, so standard Polarion PDF export works | Should |
| F14 | Tabular view of nodes/edges (also the PDF fallback) | Should |
| F15 | Baseline/Collection-aware view (relations as of a Collection) | Future |
| F16 | **Projects** parameter (`@project` multi-selector, 0.4.0): documents of the selected projects (none = current project); relations between documents of two selected projects are shown; the scope ("Project: X" / "Projects: A, B") is shown at the top of the widget and in the PDF header; each document shows its project when several are in scope | Should (done) |

## 5. Non-functional requirements

- N1 Respect Polarion permissions: only show documents and items the viewer can read.
- N2 Performance: render in **< 10 s** at C4 sizing. No per-work-item Velocity loops over 20k items. Aggregate in SQL.
- N3 No hard-coded project data. Roles, types and statuses come from parameters or configuration.
- N4 Accessible: kinds are distinguished by line style, not colour alone. Legend always visible.
- N5 Security: escape all titles and field values in HTML/SVG/JSON output (guide §2.6, XSS).
- N6 Widget package within upload limits (guide §1.3): ≤ 30 entries, file names ≤ 30 chars, Stored/Deflated zip.
- N7 Offline-capable: no CDN dependencies. Any JS library is bundled in `resources/`.

## 6. Technical approach — DECIDED: Velocity widget

```
branchesWidget/              (folder name = widget id)
├── widget.properties        label, tags, isRestricted
├── parameters.vm            scope, roles per kind, threshold, filters, layout, height
├── dependencies.vm          show/hide threshold & filter params
├── details.vm / description.vm
├── render.vm                data collection (SQL) → model → HTML/SVG or static PDF view
└── resources/
    ├── branches-graph.js    vanilla JS: layered layout, SVG render, zoom/pan, export SVG
    └── branches-graph.css
```

Data flow:
1. **Documents**: SQL on `MODULE` scoped by project (+ space/type/status filters), returning document URIs.
   Resolve them through the Rendering API (`$transaction`) so permissions apply.
2. **Document metadata relations**: branched-from / derived-from references on each document (≤100 documents, cheap).
3. **Link-based relations**: SQL over `STRUCT_WORKITEM_LINKEDWORKITEMS` joined to `REL_MODULE_WORKITEM` on both
   ends, filtered by role and project, giving (source document, target document, role, count). See the risk in §9.
4. Build the node/edge model in Velocity. Emit it as escaped JSON for the JS renderer.
5. **Interactive mode**: JS lays out and renders inline SVG. The widget always ships the full model (all documents and all extra fields, ≤100 nodes), so the "all / only related" switch and the extra-field toggles act on the client instantly. Refresh reloads the widget data. Export SVG via serialisation and PNG via canvas.
6. **PDF/print mode** (`$widgetContext.target().isPdf()/isPrint()`): no JS. Velocity computes a simple layered
   layout (relations are mostly forests) and emits static inline SVG + the relations table, with inline CSS only.

Compatibility 2512/2606: use only the public Rendering API and documented SQL tables, and isolate version-sensitive
calls in one macro section of `render.vm`.

## 7. Relation-inference rules

Let D be the documents in scope, W(d) the work items contained in document d, and L the links whose role
is in the configured role set R(kind).

- For each ordered pair (S, T) and kind k: n = |{ w ∈ W(T) : w has a link with role ∈ R(k) to some item in W(S) }|.
- Edge S → T of kind k if n ≥ threshold (absolute) and/or n / |W(T)| ≥ threshold (%).
- Direction (**verified on 2512, spike A2**): for all three roles the copy/branch/derived item is the **link source** and
  the original item is the **link target**. So the edge is drawn original (link target's document) → copy (link source's document).
- Document metadata (`branched from` / `derived from`) creates an edge even without links. If both sources exist and disagree, show a warning marker.
- **Verified on 2512 (spike A2 Q3/Q4)**: a branch has `MODULE.FK_URI_BRANCHEDFROM` set, even with no overwritten item
  (the only way to detect such a branch). A derived document has `MODULE.FK_URI_DERIVEDFROM` set. A copy/reuse has
  **no** metadata and is detected only through `duplicates` links.
- **Inherited links (verified on 2512, spike R2.8)**: copying a copy keeps the links of the copied items. The items of
  E (copy of B, which is a copy of A) link with `duplicates` to B **and** to A. Raw counting therefore gives an extra
  edge A → E. Rule (**decided**): **transitive reduction**. Drop an edge S → T when there is a document M
  with S → M and M → T, **whatever the kinds** (spike V4: a branch of a copy also inherits the copy's
  `duplicates` links to the copy's own source), and the S → T links are inherited through M. The direct parent is the
  closest source. A viewer toggle "show indirect relations" shows them again as faint dashed lines. Supporting signal:
  the inherited link keeps its older link revision (84994 vs 85000).
- One pair may have several kinds. Draw **one line per pair** labelled with all of its kinds. Style follows the strongest kind: **branch > derived > copy** (decided). The label always lists every kind.

## 8. Out of scope (v1)

Creating or merging branches (Polarion does this natively), relations to projects that are not selected (F16), Collection
context (F15), non-LiveDoc documents.

## 9. Technical risks / to verify on a 2512 instance

| # | Risk | Mitigation |
|---|---|---|
| R1 ✅ (2512) | `$transaction.objects.searchBySql` resolves **objects** (by `C_URI`), so it cannot return aggregate rows (doc pair + count) | Spike. Options: (a) one SQL per document returning related `MODULE` URIs, with counts via count queries (≤100 × kinds), (b) SQL returning link-source work item URIs then grouping in Velocity by `getModule`, (c) a DB API available to widgets returning raw rows. **Decided: (b)**. Spike V4 on 120 documents: SQL 22 ms + scan of 1631 items / 2597 links in 84 ms |
| R2 ✅ (2512) | Exact `MODULE` column names (`FK_URI_BRANCHEDFROM`, `FK_URI_DERIVEDFROM`, `C_DERIVEDFROMLINKROLE`) found in the published DB schema docs, not checked on 2512/2606 | Check the SDK DB schema docs on the target server, tracker `SQL:` queries and REST document resources (spike A1–A3) |
| R3 ⚠️ (2512) | Exact Velocity syntax to load widget `resources/` JS/CSS (SDK macro) | Spike V5a/V5b: `#include`/`#parse` cannot load widget resources. V5c (URL) pending. **Plan: inline the JS/CSS in `render.vm`**, written Velocity-safe (no `$`, no directive names), unless V5c finds a working URL |
| R4 ✅ (2512) | Link direction for `duplicates` / `branched_from` / `derived_from` | Inspect `STRUCT_WORKITEM_LINKEDWORKITEMS` on sample documents |
| R5 ✅ tracker (2512) | SQL firewall (`invalidCommands`) may block `GROUP BY`/`COUNT`/`DISTINCT` variants | `DISTINCT` and `GROUP BY … HAVING COUNT(*)` accepted in tracker SQL (spike A2 Q5); widget-side check in V3a/V3b |
| R6 | 2606 changes unknown | Re-test the widget on 2606 once available |

## 10. Open questions

1. ~~V5c / V6 browser checks~~ **Closed (2026-10-27)**: PNG export is blocked by the browser, so the feature was removed
   (0.1.2); SVG export works. V5c (loading JS from a URL) is not needed because the JS is inlined.

2. **OPEN CHECKS for widget v0.1.0 on 2512** (only verifiable on the instance; the Velocity 1.4 harness uses mocks):
   a. Viewer permissions (N1): documents are read via `IDataService.sqlSearch` (Open API). Check with a user who
      cannot read some documents; switch to the Rendering API if they appear.
   b. Item counts per document filter on `module.c_modulefolder` = `getModuleFolder()`; check that counts are not 0
      for documents in the default space.
   c. Document link URL `#/project/<id>/wiki/<space>/<document>` opens the document (default space included).
   d. `getType()/getStatus().getName()`, `getAuthor().getName()` and `$date.format` give readable values.
   e. Multi-value parameter "Extra document fields" is read correctly. Same code path as h (verified), so very likely fine; confirm by ticking fields in the parameter.
   f. ~~PNG export~~ removed in 0.1.2 (blocked by the browser).
   g. (fixed in 0.1.1) A document whose author user was deleted made the widget fail with
      `uri: subterra:data-service:objects:/default/${User}t0025088` (found by the PO on 2512). References to
      unresolvable objects (author, branched/derived source, link target) are now checked with `isUnresolvable()`.
      Still to confirm on the instance with the document of that user. (Moot since 0.3.0: the author field was removed.)
   h. **Verified on 2512 (PO, 0.2.0).** Multi-value parameter "Relation kinds shown by default" is read correctly (same question as e; falls back to all).
   i. **Verified on 2512 (PO, 0.2.0): the Excel export works.** `#loadWidgetJs("resources/xlsx.js")` (Widget SDK directive, not yet used on 2512) loads the Excel library:
      the Excel button must download an `.xlsx`. If it downloads a `.csv` and the status line says "Excel library not
      loaded", the directive did not work. Also check that the zip entry `docBranches/resources/xlsx.js` (29 chars) is
      accepted on upload.
   j. **Verified on 2512 (PO, 0.3.0).** The link role selectors show their defaults (`duplicates`, `branched_from`, `derived_from`) when the widget is
      added: `$factory.enumeration(...).values([...])` as in guide §2.1, not yet used on 2512. If the defaults are missing,
      select the roles by hand and report it.
   k. **Verified on 2512 (PO, 0.4.0): selector works, documents and links of two projects shown, rendering time good.**
      **0.4.0, Projects parameter** (`@project`, guide §10.2): the selector lists the projects;
      none selected = current project, numbers unchanged from 0.3.1; `id()` of a selected project is its id (otherwise
      the widget shows "The selected projects could not be read"); with two projects, documents of both, cross-project
      lines, documents and items open in their own project; `IModule.getProjectId()` gives the project of a document;
      rendering time with the intended number of projects.

## 11. Decision log

| Date | Decision | Notes |
|---|---|---|
| 2026-10-27 | Draft spec created | v0.1 |
| 2026-10-27 | Target Polarion 2512, keep 2606-compatible; SQL available | PO |
| 2026-10-27 | Link roles: copy `duplicates`, branch `branched_from`, derived `derived_from` (configurable) | PO, Siemens standard |
| 2026-10-27 | v1 = single project; sizing 100 docs / 20k items; cross-project later | PO |
| 2026-10-27 | Visual graph in widget; PDF via standard export + image export as a plus | PO |
| 2026-10-27 | Technology: Velocity widget with bundled JS/CSS resources | PO, settles §6 |
| 2026-10-27 | Node fields: ID, title, space by default; extra fields selectable (parameter + UI toggle) | PO |
| 2026-10-27 | "All / only related" switch: parameter default + runtime UI switch with Refresh | PO |
| 2026-10-27 | One line per document pair, labelled with kind(s) | PO |
| 2026-10-27 | Spike tests (SQL + test widget) handed to PO for execution on 2512 | `tests/v0.1.x/spike-tests.md` |
| 2026-10-27 | No direct DB access for the PO: spike uses tracker `SQL:(...)` queries, the test widget and REST calls instead | PO |
| 2026-10-27 | Spike A1: MODULE branching/derivation columns confirmed in the 2512 schema; V1 passed | spike results (see `tests/v0.1.x/spike-tests.md`) |
| 2026-10-27 | Spike test set: project `VforIA`, original `SRS_Test` with copies/branches B–G | `tests/v0.1.x/spike-tests.md` §0 |
| 2026-10-27 | Spike A2 Q1/Q2: link direction verified (copy/branch/derived item → original item) for `duplicates`, `branched_from`, `derived_from`; branch links exist only for overwritten items | spike results (see `tests/v0.1.x/spike-tests.md`) |
| 2026-10-27 | Heading work items are excluded from link counts and coverage by default (parameter: excluded work item types, default `heading`) | PO |
| 2026-10-27 | Line style for a pair with several kinds: precedence branch > derived > copy; label lists all kinds | PO |
| 2026-10-27 | Spike A2 Q3–Q6: branch/derived metadata confirmed (incl. branch without overwrite), copies have no metadata, DISTINCT/GROUP BY accepted, `c_id` = `c_modulename` = document name. Part A2 complete | spike results (see `tests/v0.1.x/spike-tests.md`) |
| 2026-10-27 | Spike A3 R1: REST document attributes do not show branched/derived-from (only `derivedFromLinkRole`/`derivedFields` on the derived doc); relationships not inspected. Not needed: the widget uses SQL. R2 optional | spike results (see `tests/v0.1.x/spike-tests.md`) |
| 2026-10-27 | Spike A3 R2: REST confirms roles/direction; copy of a copy keeps the inherited `duplicates` link to the original (E→A besides E→B). Part A complete | spike results (see `tests/v0.1.x/spike-tests.md`) |
| 2026-10-27 | Indirect relations from inherited links are hidden by default (transitive reduction), with a viewer toggle to show them | PO |
| 2026-10-27 | Spike Part B (V1–V7) on `EOLE_AI_MCP_TESTS`: data approach (b) validated and fast; `#include`/`#parse` of resources fail → JS/CSS inlined; inline JS + SVG export work in the browser; static SVG renders in PDF. Transitive reduction made kind-agnostic. Pending: V5c/V6 browser screenshots | `docs/V*_*.pdf` |
| 2026-10-27 | Start widget implementation (v0.1) before V5c/V6 browser results; tracked as open check §10.1 | PO |
| 2026-10-27 | Widget v0.1.0 implemented (`widget/src`, id `docBranches`): Velocity data collection + inlined JS graph, static PDF view. Tested with Velocity 1.4 on mocks and in Chromium; open checks §10.2 | `tools/test-widget.sh` |
| 2026-10-27 | Widget 0.1.1: fixes the exception on documents with a deleted author (unresolvable user); all object references are guarded; harness mocks unresolvable objects | `tools/vtest/WidgetHarness.java` |
| 2026-10-27 | PNG export removed (blocked by the browser on Polarion pages); SVG export kept. Open checks V5c/V6 closed. Widget 0.1.2 | PO |
| 2026-10-27 | Relation kind filter (copies / branches / derived, default all): parameter "Relation kinds shown by default" + toolbar checkboxes; edges are restricted to the selected kinds (labels and counts too); also applied in the PDF view. Widget 0.2.0. The multi-value parameter read is unverified on 2512 (falls back to all) | PO |
| 2026-10-27 | Excel export (0.2.0): sheets Relations, Documents, Linked items (max 30 per pair), with links; current filters apply. Library xlsx-js-style 1.2.0 (gitbrent, Apache-2.0) shipped as `resources/xlsx.js` and loaded with `#loadWidgetJs` (unverified on 2512, open check §10.2 i); CSV fallback when it is not loaded | PO |
| 2026-10-27 | Linked item counts on the line labels can be hidden: parameter "Linked item counts on the lines by default" (shown/hidden) + toolbar toggle "Item counts"; applies to all kinds and to the PDF view; tooltips, details, table and Excel keep the counts. Widget 0.2.0 | PO |
| 2026-10-27 | PO test of 0.2.0 on 2512: upload with `resources/xlsx.js` accepted, Excel export works (`#loadWidgetJs` verified), relation kind filter and parameter work, item count toggle and parameter work (PDF too). Open checks h and i closed | PO |
| 2026-10-27 | Repository restructured for a second widget (docCoverage): sources in `widgets/docBranches/`, client core in `shared/js/core.js`, Velocity snippets in `shared/vm/`, Excel library in `shared/resources/`. No functional change (render output, SVG, CSV and Excel identical on the mock set); widget 0.2.1. Release tags are now `docBranches-vN.N.N` | PO |
| 2026-10-27 | Shared core changes for docCoverage, still in 0.2.1 (not released yet): line labels are kept clear of the target document box; `documents.vm` can restrict the documents and keeps their work item lists (unused by docBranches) | |
| 2026-10-27 | Widget 0.3.0: link roles per kind chosen with `workitem-link-role` multi-selectors (shared macro `bwRoleIds`, as docCoverage) instead of comma-separated text; new parameter ids `copyLinkRoles`, `branchLinkRoles`, `derivedLinkRoles` (no backward compatibility, PO). The **author** document field is removed from both widgets (PO, user feedback) | PO |
| 2026-10-27 | PO test of 0.3.0 on 2512: role selectors with their defaults, graph as before, no author field. Ready for release | PO |
| 2026-10-27 | Widget 0.3.1: the excluded work item types are chosen with a `workitem-type` multi-selector (default Heading, none selected = all types counted) instead of comma-separated text; shared macro `bwRoleIds` renamed `bwOptionIds`. Patch release (PO). To check on 2512: selector lists the types with Heading preselected; counts unchanged with Heading | PO |
| 2026-10-27 | Widget 0.3.1: `icon.png` (608 x 405, white background) at the package root, as in a widget used by the PO; no reference in other files. Display in the widget list to check on 2512 | PO |
| 2026-10-27 | PO test of 0.3.1 on 2512: type selector (Heading preselected, counts as before) and widget icon OK. Ready for release | PO |
| 2026-10-28 | Widget 0.4.0: **Projects** parameter (`@project` multi-selector, none = current project). Document key `project/space/name`; SQL on `p.c_id IN (…)`; cross-project links between selected projects count (PO); scope line in the main view and the PDF header; project column in Excel; links open in the project of the document/item; warning above 5 projects. Minor release (PO). Open check §10.2 k | PO |
| 2026-10-28 | PO test of 0.4.0 on 2512: project selector works, documents and cross-project links of two projects shown, rendering time good. Open check §10.2 k closed. Ready for release | PO |
