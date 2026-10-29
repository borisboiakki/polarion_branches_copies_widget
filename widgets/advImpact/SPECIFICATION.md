# Specification — Advanced Impact Analysis widget (advImpact)

**Status:** v0.2 DRAFT, 2026-10-29: PO answers Q1–Q11 recorded (§9), reviewed against the dev guide. **Nothing is
implemented**; the folder holds the scaffold (parameters, properties, VERSION 0.0.0). The spike (diagnostic widget `aiSpike`,
plan `tests/advImpact-v0.1.x/spike-tests.md`) is ready, not run yet. Items marked `[?]` need a spike result or a PO answer (§8).

## 1. Goal

A Velocity LiveReport widget that answers: **"if these work items change, which documents (and work items) are
impacted?"** The user selects one LiveDoc, or a subset of its work items, and the link roles to follow. The widget finds
the work items linked to the selected ones, then the items linked to those, and so on for a limited number of levels,
and shows the **documents** that contain impacted items as a layered graph, with details, table and Excel export.

It reuses `shared/` (client core, params, common, documents macros) and the conventions of docBranches / docCoverage.

## 2. Context and constraints

| ID | Constraint | Source |
|---|---|---|
| C1 | Target **Polarion 2512**, keep compatible with **2606** | project rule |
| C2 | Velocity widget, shared client core, Excel via `#loadWidgetJs("resources/xlsx.js")` | docBranches / docCoverage findings |
| C3 | Same repository, **own version** (`widgets/advImpact/VERSION`), release tag `advImpact-vN.N.N` | PO 2026-10-29 |
| C4 | Performance: interactive path within the 10 s budget; analysis bounded by levels (default 3) and roles (max 5) | PO 2026-10-29 |
| C5 | Sizing as the other widgets: ~100 LiveDocs, ~20,000 work items per project; a cap of new items per level | PO 2026-10-29 (Q11) |

## 3. Terms

- **Start items**: the work items the analysis begins with (level 0): all items of the start document, or the subset the
  user selected (§4 F2).
- **Level n**: work items reached from level n-1 items by one link of a selected role (one link = one level, Q3), and not
  reached at a lower level.
- **Downstream direction** ("who depends on me"): from an item to the items whose link points to it (`fk_uri_workitem =
  item`, source = the other item). **Upstream direction**: from an item to the targets of its own links
  (`fk_uri_p_workitem = item`). Link storage verified on 2512 (spikes A2, C3): the link is stored on the source item and
  points to the target. Which of these two is "impact" depends on the role, hence the explicit parameter (§4 F4).
- **Both directions** (Q2, union per level): each item of level n is expanded in both directions, so a path may change
  direction (e.g. down to a system requirement, then up to the other customer requirements it satisfies). This reaches more
  items than "downstream chains + upstream chains" kept apart `[?]` Q12.
- **Impacted document**: document containing at least one item reached at some level. The level of a document is the
  smallest level at which one of its items is reached.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | **Start document**: a single-select document selector (`@document`, current project; same limitation as docCoverage) | Must |
| F2 | **Start item subset**: a work item **query parameter** (Lucene) restricted to the start document (empty = all counted items of the document). The restriction is added by the widget: `document.id:"space/name"` or an `SQL:(…)` clause, whichever works (spike I4). In-widget picker = later version (Q1) | Must |
| F3 | **Link roles**: multi-select `workitem-link-role`, **1 to 5** (more: first 5 + warning) | Must |
| F4 | **Direction**: downstream, upstream or both (union per level, Q2; §3), as a parameter. With "both", a **viewer toggle** can narrow to one direction | Must |
| F5 | **Multi-level traversal**: the analysis does not stop at the first impacted document; from the items reached at level n it continues with the items linked to them (same roles at every level, Q4; direction as F4) up to **N levels** | Must |
| F6 | **Levels**: default **3**; parameter 1–7 (integer, capped at 7 server side). If the traversal cannot be done in the budget for 7, the cap is lowered (spike I2/I6); hard-coded 3 is the fallback | Must (3), Should (up to 7) |
| F7 | **Cycle guard**: an item is expanded once, at the lowest level it is reached; links back to already visited items are not followed | Must |
| F8 | **Graph**: documents as nodes in layers by level (start document left), edges = (document, document) pairs with the roles and link counts, one style/colour per role, legend; same look as docCoverage (`shared/js/core.js`) | Must |
| F9 | **Viewer toggles** (on the fly, no re-query): shown roles, direction (only when the parameter is "both"), **max level shown** (1..N, only lower than the parameter, Q6), only documents with relations, link counts on edges, extra document fields, hide/show documents. Hiding a role or a direction **recomputes the reachability and the levels** in the browser from all the links between the reached items (§6.2); a hidden document is only hidden (the traversal still goes through it) | Must |
| F10 | **Details**: click a document -> impacted items (id, title, type, level, reached via), link to open the document; click an edge -> link pairs. Caps as docCoverage (first N in details, full counts shown) | Must |
| F11 | **Table view** and static **PDF/print** view (graph + table, no JS) | Must |
| F12 | **Excel export** similar to docCoverage (sheets Relations, Documents, Impacted items, Impact paths) and **traceability matrix**-style export per document (Q10); SVG export; CSV fallback | Must |
| F13 | Excluded work item types (default `heading`) are neither start items nor followed | Must |
| F14 | Links to unresolvable items ignored; `isUnresolvable()` guard on every referenced object | Must |
| F15 | **Projects** parameter and **collection context** as docCoverage F16/F17 | Later versions (Q8/Q9) |
| F16 | Warning in the widget when a traversal was cut off (level cap, item cap per level, Q11). After a cut-off the browser recomputation of F9 is incomplete: the warning stays shown | Must |

## 5. Non-functional requirements

As the other widgets: render < 2 s target, 10 s hard, never loop over all work items in Velocity, SQL scoped to the
project, Velocity 1.4-safe templates, inlined JS/CSS, no customer data in the repo. Additionally: a **page-model size
budget** (guide §11.5): impacted items are stored once (id, title, type, document, level) and the links between reached
items once (source, target, role); paths are rebuilt from them in the browser, never stored in full. Caps with a warning, as
docCoverage (`pairCap`, `itemCap`).

## 6. Technical approach (proposal, to be verified by the spike)

1. **Traversal on the server, level by level (BFS)**, with a visited set (F7). Candidates, measured by the spike:
   - **SQL per level** (`sqlSearch` on `struct_workitem_linkedworkitems` joined to `workitem`, filtered on `c_role IN (roles)`
     and the frontier ids in `IN (...)` lists of at most 500): N levels = N queries per direction (spike I2).
   - **Open API per item**: `getLinkedWorkItemsStructsDirect()` (upstream) and `getLinkedWorkItemsStructsBack()` (downstream)
     on each frontier item, no SQL (guide §3.3; to verify on 2512, spike I3).
   - **One query for all levels**: Lucene `linkedWorkItemsOf` (Polarion 2506+, up to 10 steps, `follows` = roles, guide §6.4;
     direction and level semantics to verify, spike I8), or SQL `WITH RECURSIVE` / nested sub-selects (spike I1). The guide
     (§7.1) allows single-`SELECT` statements only, so `WITH RECURSIVE` is expected to be refused. A one-query result gives the
     set of items but not their level or parent: levels and links still come from the per-item scan.
   Widget SQL returns objects, not rows (guide §7.2): the parent and role of a reached item come from the Open API links.
2. **Page model**: documents (reuse `shared/vm/documents.vm`), the reached items once (id, title, type, document, level) and
   **all links of the selected roles between reached items** (source, target, role). The browser recomputes the levels for
   the toggles (F9) with a BFS on these links: narrowing roles, direction or levels gives exactly the result the server would
   give, because every item reachable with fewer roles/directions within N levels is already in the set. The server computes
   with the parameter values; the viewer can only narrow them (Q6).
3. **Client**: `widgets/advImpact/src/graph.js` on top of `shared/js/core.js` (layered layout by level, categories = roles,
   level toggle). New root class `ai-root`.
4. **Excel**: same xlsx library; sheets built from the page model.
5. Shared macros extended only when needed; any change in `shared/` rebuilds and retests all widgets (CLAUDE.md).

## 7. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Frontier `IN (...)` lists grow large at levels 4-7 (fan-out) | chunks of 500 ids; nested sub-selects or `linkedWorkItemsOf`; item cap per level with warning (spike I1/I2/I6/I8) |
| R2 | Recursive SQL not accepted by `sqlSearch` (guide §7.1: single SELECT only) | BFS (default design) |
| R3 | Inherited links of copies (spike R2) add links to items already reached | visited set (F7): an item is counted once, at its lowest level; reuse roles only when selected (Q7) |
| R4 | Page model too large for 7 levels | store items once, cap detail lists, counts only beyond the cap |
| R5 | "Impact" semantic differs per role (direction) | explicit direction parameter + viewer toggle |
| R6 | "Both" with mixed directions per path reaches many items (siblings through a common target) | item cap per level; Q12 |

## 8. Open questions for the PO

Q1–Q11 answered on 2026-10-29 (decisions log). Open:

12. **Q12 "Both" with mixed directions**: with the union per level, a path may go down then up (§3), which also reaches the
    "siblings" of an impacted item (other items linked to the same target). Is that wanted, or should "both" be the union of a
    pure downstream and a pure upstream analysis? The spike measures the first one; the second is cheap to add.
13. Spike results I1–I8; the in-widget picker design (later version).

## 9. Decisions log

| Date | Decision | By |
|---|---|---|
| 2026-10-29 | Own widget `advImpact` in this repository, shares `shared/` | PO |
| 2026-10-29 | 3 levels default, up to 7 if feasible and configurable, else hard-coded 3; max 5 link roles; toggles; Excel as docCoverage | PO |
| 2026-10-29 | Q1: start items chosen by a **query parameter** (restricted to the start document) in v1; **in-widget picker** in a later version | PO |
| 2026-10-29 | Q2: direction "both" = **union per level**; viewer can still hide one direction | PO |
| 2026-10-29 | Q3: one level = **one work item link hop**; a document's level = lowest level of its items | PO |
| 2026-10-29 | Q4: the **same roles** at every level (1-5) | PO |
| 2026-10-29 | Q5: output = document graph + **impacted items with their item paths** (details, Excel) | PO |
| 2026-10-29 | Q6: viewer can only **lower** the level; the parameter value (max 7) is what the server computes | PO |
| 2026-10-29 | Q7: reuse roles are followed only if the user selects them; no special handling | PO |
| 2026-10-29 | Q8/Q9: **current project only** in v1; projects scope and collection context in later versions (keep the SQL layer separable) | PO |
| 2026-10-29 | Q10: Excel sheets Relations, Documents, Impacted items, Impact paths, plus traceability matrix per document | PO |
| 2026-10-29 | Q11: sizing as the other widgets (~100 docs / 20k items); **cap of items per level** (about 5,000, to tune in spike I6) with a visible warning | PO |
