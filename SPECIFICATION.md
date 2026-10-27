# Specification — Polarion Branches Widget

**Status:** DRAFT v0.2 — refined with the product owner on 2026-10-27. Items marked `[?]` are still open
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
| F1 | List the project's LiveDocs (optionally filtered by space/type/status) as graph nodes: title, space, type, status, item count | Must |
| F2 | Draw one directed edge per related document pair, **source → copy/branch/derived** | Must |
| F3 | Distinguish the kinds Copy / Branch / Derived with line style **and** colour, plus a legend | Must |
| F4 | Deduce edges by aggregating work item links (roles from §3) between items of two documents | Must |
| F5 | Link roles per kind are widget parameters with the §3 defaults | Must |
| F6 | Threshold parameter: minimum linked items (absolute and/or %) before an edge is drawn | Should |
| F7 | Use document-level metadata (§3) when present and flag disagreement with link-based inference | Should |
| F8 | Edge detail (tooltip/panel): number of linked items, coverage % of source and target | Should |
| F9 | Click a node to open the document; click an edge to list the linking work items | Should |
| F10 | Filters: space, document type, status, text, "only documents with relations" | Should |
| F11 | Layout: family tree (layered, sources on the left/top) by default; zoom, pan, fit-to-view | Should |
| F12 | Export the current graph as **SVG and PNG** from the widget UI | Could (a plus) |
| F13 | **PDF/print**: static rendering of the graph (no JS) plus a relations table, so standard Polarion PDF export works | Should |
| F14 | Tabular view of nodes/edges (also the PDF fallback) | Should |
| F15 | Baseline/Collection-aware view (relations as of a Collection) | Future |
| F16 | Cross-project relations | Future |

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
    ├── branches-graph.js    vanilla JS: layered layout, SVG render, zoom/pan, export SVG/PNG
    └── branches-graph.css
```

Data flow:
1. **Documents**: SQL on `MODULE` scoped by project (+ space/type/status filters), returning document URIs.
   Resolve them through the Rendering API (`$transaction`) so permissions apply.
2. **Document metadata relations**: branched-from / derived-from references on each document (≤100 documents, cheap).
3. **Link-based relations**: SQL over `STRUCT_WORKITEM_LINKEDWORKITEMS` joined to `REL_MODULE_WORKITEM` on both
   ends, filtered by role and project, giving (source document, target document, role, count). See the risk in §9.
4. Build the node/edge model in Velocity. Emit it as escaped JSON for the JS renderer.
5. **Interactive mode**: JS lays out and renders inline SVG. Export SVG via serialisation and PNG via canvas.
6. **PDF/print mode** (`$widgetContext.target().isPdf()/isPrint()`): no JS. Velocity computes a simple layered
   layout (relations are mostly forests) and emits static inline SVG + the relations table, with inline CSS only.

Compatibility 2512/2606: use only the public Rendering API and documented SQL tables, and isolate version-sensitive
calls in one macro section of `render.vm`.

## 7. Relation-inference rules

Let D be the documents in scope, W(d) the work items contained in document d, and L the links whose role
is in the configured role set R(kind).

- For each ordered pair (S, T) and kind k: n = |{ w ∈ W(T) : w has a link with role ∈ R(k) to some item in W(S) }|.
- Edge S → T of kind k if n ≥ threshold (absolute) and/or n / |W(T)| ≥ threshold (%).
- Direction: the copy/branch item (in T) is the **link source** pointing to the original (in S) `[?]` — to verify per role on a test instance.
- Document metadata (`branched from` / `derived from`) creates an edge even without links. If both sources exist and disagree, show a warning marker.
- One pair may have several kinds. Show one edge per kind (or a combined edge with badges `[?]`).

## 8. Out of scope (v1)

Creating or merging branches (Polarion does this natively), cross-project relations (F16), Collection
context (F15), non-LiveDoc documents.

## 9. Technical risks / to verify on a 2512 instance

| # | Risk | Mitigation |
|---|---|---|
| R1 | `$transaction.objects.searchBySql` resolves **objects** (by `C_URI`), so it cannot return aggregate rows (doc pair + count) | Spike. Options: (a) one SQL per document returning related `MODULE` URIs, with counts via count queries (≤100 × kinds), (b) SQL returning link-source work item URIs then grouping in Velocity by `getModule`, (c) a DB API available to widgets returning raw rows |
| R2 | Exact `MODULE` column names (`FK_URI_BRANCHEDFROM`, `FK_URI_DERIVEDFROM`, `C_DERIVEDFROMLINKROLE`) found in the published DB schema docs, not checked on 2512/2606 | Check the SDK DB schema on the target server |
| R3 | Exact Velocity syntax to load widget `resources/` JS/CSS (SDK macro) | Check Widget SDK PDF on the target server. Fallback: inline the JS in `render.vm` |
| R4 | Link direction for `duplicates` / `branched_from` / `derived_from` | Inspect `STRUCT_WORKITEM_LINKEDWORKITEMS` on sample documents |
| R5 | SQL firewall (`invalidCommands`) may block `GROUP BY`/`COUNT`/`DISTINCT` variants | Test queries on the target server |
| R6 | 2606 changes unknown | Re-test the widget on 2606 once available |

## 10. Open questions

1. Which document fields should be shown on nodes (title, space, type, status, author, updated)?
2. Should the default view show all documents, or only those with at least one relation?
3. Edge labelling: one edge per kind, or one combined edge with kind badges?
4. Is a test 2512 instance (with sample copied/branched/derived documents) available for the spike?

## 11. Decision log

| Date | Decision | Notes |
|---|---|---|
| 2026-10-27 | Draft spec created | v0.1 |
| 2026-10-27 | Target Polarion 2512, keep 2606-compatible; SQL available | PO |
| 2026-10-27 | Link roles: copy `duplicates`, branch `branched_from`, derived `derived_from` (configurable) | PO, Siemens standard |
| 2026-10-27 | v1 = single project; sizing 100 docs / 20k items; cross-project later | PO |
| 2026-10-27 | Visual graph in widget; PDF via standard export + image export as a plus | PO |
| 2026-10-27 | Technology: Velocity widget with bundled JS/CSS resources | PO, settles §6 |
