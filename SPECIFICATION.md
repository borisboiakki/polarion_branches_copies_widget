# Specification — Polarion Branches Widget

**Status:** DRAFT v0.1 — to be refined with the product owner. Items marked `[?]` are assumptions or open.

## 1. Goal

Provide a LiveReport widget that visually displays the LiveDocs of a repository and the relations of
**branches** and **copies** between them, with relations deduced from work item links.

## 2. Context and assumptions

- A1 `[?]` Target Polarion version: 2512 baseline (see `Polarion_Development_Guide.md`); older versions to be confirmed.
- A2 Polarion records branching as a "branched from" field on the Document and a "branched from" link on Work Items;
  copies may carry no such metadata, hence the need to infer from work item links. (Partly verified, see CLAUDE.md.)
- A3 `[?]` Which link role(s) connect a copy/branch item to its source in your instance (system `branched`, a custom role, `duplicates`...).
- A4 `[?]` Scope: one project, or cross-project relations.

## 3. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | List documents in scope (project / space / selection) as graph nodes with title, type, status | Must |
| F2 | Draw edges for relations between documents, direction source → branch/copy | Must |
| F3 | Distinguish relation kinds: **branch** vs **copy** (distinct styling + legend) | Must |
| F4 | Deduce relations from work item links: aggregate item links between two documents into one edge | Must |
| F5 | Link roles used for deduction are widget parameters (no hard-coded ids) | Must |
| F6 | Threshold parameter: minimum number/percentage of linked items to create an edge | Should |
| F7 | Use document-level "branched from" metadata when present, and flag disagreement with link-based inference | Should |
| F8 | Edge tooltip/detail: counts of linked items, coverage % of each document | Should |
| F9 | Click a node to open the document; click an edge to list the linking work items | Should |
| F10 | Filters: document type, status, space, text, only documents in a relation | Should |
| F11 | Layout modes: family tree (hierarchical) and force/graph; fit-to-view, zoom, pan | Could |
| F12 | Show baseline/revision context (relations as of a baseline/Collection) | Could |
| F13 | Tabular view of the same data and CSV export | Could |
| F14 | PDF/print rendering: static (no JS) version of the graph | Should |

## 4. Non-functional requirements

- N1 Respect Polarion permissions: only show documents/items the viewer can read.
- N2 Performance: render in < 10 s for `[?]` N documents / M links; large sets use SQL aggregation, not per-item loops.
- N3 No hard-coded project data; everything configurable via parameters.
- N4 Works in light/dark theme `[?]`, accessible colours + legend not relying on colour alone.
- N5 Maintainable: follows guide §11/§13; documented install procedure.

## 5. Inputs / widget parameters (draft)

Scope (project/space/documents), link role(s) for branch inference, link role(s) for copy inference,
threshold, document types, statuses, layout mode, show-metadata-relations toggle, max nodes.

## 6. Technical approach (to decide)

| Option | Pros | Cons |
|---|---|---|
| **A. Velocity widget + SQL + client-side graph** | No restart, repo-versioned, quick iteration, guide-preferred | JS limits in PDF/print; render budget; SQL access needed |
| **B. Java extension (Widget SDK)** | Full API, stateful UI, caching | Server restart, build/OSGi packaging, slower iteration |

Recommendation: start with A as a spike to validate data deduction; escalate to B only if needed.
Decision: `[open]`.

## 7. Relation-inference rules (draft)

For documents X, Y with work item sets Wx, Wy and link set L (filtered by configured roles):
- Edge X→Y if |{w ∈ Wy : w linked to some item in Wx via a configured role}| ≥ threshold.
- Kind = branch if the document metadata says "branched from" (or branch-role links), else copy `[?]`.
- Direction by link direction/role semantics, or by document creation date when ambiguous `[?]`.

## 8. Out of scope (initially)

Editing/creating branches, merge/compare functionality (Polarion already provides it), non-LiveDoc documents.

## 9. Open questions

1. Which Polarion version(s) and is SQL (Data Warehouse) access available?
2. Link roles and conventions used for branches and copies in your instance?
3. Cross-project relations needed? Expected size (documents, work items per document)?
4. Should "branch" vs "copy" be distinguished via metadata only, or inferred heuristically?
5. Preferred visual style: tree, graph, swimlanes by project/space?
6. Need baseline-aware views and PDF output?
7. Velocity first, or straight to a Java extension?
8. Is there a test Polarion instance/sample data we can use?

## 10. Decision log

| Date | Decision | Notes |
|---|---|---|
| 2026-10-27 | Draft spec created | Awaiting refinement |
