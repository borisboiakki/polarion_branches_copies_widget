# Specification — Advanced Impact Analysis widget (advImpact)

**Status:** v0.1 DRAFT, 2026-10-29, from the PO's first brief. **Nothing is implemented**; the folder holds the scaffold
(parameters, properties, VERSION 0.0.0) and the spike plan `tests/advImpact-v0.1.x/spike-tests.md`. Items marked `[?]`
are open questions for the PO (§8) or need a check on a Polarion instance.

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
| C5 | Sizing as the other widgets: ~100 LiveDocs, ~20,000 work items per project `[?]` | assumed |

## 3. Terms

- **Start items**: the work items the analysis begins with (level 0): all items of the start document, or the subset the
  user selected (§4 F2).
- **Level n**: work items reached from level n-1 items by one link of a selected role (`[?]` Q3: one link = one level).
- **Downstream direction** ("who depends on me"): from an item to the items whose link points to it (`fk_uri_workitem =
  item`, source = the other item). **Upstream direction**: from an item to the targets of its own links
  (`fk_uri_p_workitem = item`). Link storage verified on 2512 (spikes A2, C3): the link is stored on the source item and
  points to the target. Which of these two is "impact" depends on the role, hence the explicit parameter (§4 F4).
- **Impacted document**: document containing at least one item reached at some level. The level of a document is the
  smallest level at which one of its items is reached.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | **Start document**: a single-select document selector (`@document`, current project; same limitation as docCoverage) | Must |
| F2 | **Start item subset**: restrict the start items to a subset of the start document. Mechanism open `[?]` Q1 (candidates: a work item query parameter; a viewer-side picker in the widget; a work item selector if available — spike I4). Nothing selected = all counted items of the document | Must |
| F3 | **Link roles**: multi-select `workitem-link-role`, **1 to 5** (more: first 5 + warning) | Must |
| F4 | **Direction**: downstream, upstream or both, default parameter plus **viewer toggle** `[?]` Q2 (does "both" mean per level the union, or the two analyses side by side) | Must |
| F5 | **Multi-level traversal**: the analysis does not stop at the first impacted document; from the items reached at level n it continues with the items linked to them (same roles, same direction) up to **N levels** | Must |
| F6 | **Levels**: default **3**; parameter 1–7 (integer, capped at 7 server side). If the traversal cannot be done in the budget for 7, the cap is lowered (spike I2/I6); hard-coded 3 is the fallback | Must (3), Should (up to 7) |
| F7 | **Cycle guard**: an item is expanded once, at the lowest level it is reached; links back to already visited items are not followed | Must |
| F8 | **Graph**: documents as nodes in layers by level (start document left), edges = (document, document) pairs with the roles and link counts, one style/colour per role, legend; same look as docCoverage (`shared/js/core.js`) | Must |
| F9 | **Viewer toggles** (on the fly, no re-query): shown roles, direction, **max level shown** (1..N), only documents with relations, link counts on edges, extra document fields, hide/show documents | Must |
| F10 | **Details**: click a document -> impacted items (id, title, type, level, reached via), link to open the document; click an edge -> link pairs. Caps as docCoverage (first N in details, full counts shown) | Must |
| F11 | **Table view** and static **PDF/print** view (graph + table, no JS) | Must |
| F12 | **Excel export** similar to docCoverage (sheets Relations, Documents, Impacted items, Impact paths) and **traceability matrix**-style export per document; SVG export; CSV fallback | Must |
| F13 | Excluded work item types (default `heading`) are neither start items nor followed | Must |
| F14 | Links to unresolvable items ignored; `isUnresolvable()` guard on every referenced object | Must |
| F15 | **Projects** parameter and **collection context** as docCoverage F16/F17 | Could (later version) `[?]` Q9 |
| F16 | Warning in the widget when a traversal was cut off (level cap, item cap, time cap) | Must |

## 5. Non-functional requirements

As the other widgets: render < 2 s target, 10 s hard, never loop over all work items in Velocity, SQL scoped to the
project, Velocity 1.4-safe templates, inlined JS/CSS, no customer data in the repo. Additionally: a **page-model size
budget** (guide §11.5) – impacted items are stored once with their level and parent, not as full paths.

## 6. Technical approach (proposal, to be verified by the spike)

1. **Traversal on the server in SQL, level by level (BFS)**: level n+1 = one `sqlSearch` on `struct_workitem_linkedworkitems`
   joined to `workitem`/`module`, filtered on `c_role IN (roles)` and the frontier of level n; a visited set removes items
   already reached. N levels = N queries (<= 7). A single recursive query is preferred if the tracker SQL accepts it
   (spike I1). Both directions: two queries per level, or one with `OR` (spike I3).
2. **Page model**: documents (reuse `shared/vm/documents.vm`), per document the impacted items `id|level|parentId|role`,
   per edge the link counts per role and level; the viewer toggles recompute from this model in JS (like docCoverage's
   `compute()`), so changing "levels shown" or "direction" needs no server round trip. Direction/levels *beyond* what
   the server computed need a re-render: the server therefore computes the **parameter maximum** and the viewer can only
   reduce `[?]` Q6.
3. **Client**: `widgets/advImpact/src/graph.js` on top of `shared/js/core.js` (layered layout by level, categories = roles,
   level slider/toggle). New root class `ai-root`.
4. **Excel**: same xlsx library; sheets built from the page model.
5. Shared macros extended only when needed; any change in `shared/` rebuilds and retests all widgets (CLAUDE.md).

## 7. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Frontier `IN (...)` lists grow large at levels 4-7 (fan-out) | join on a sub-select instead of a list; item cap per level with warning (spike I2/I6) |
| R2 | Recursive SQL not accepted by `sqlSearch` | BFS (default design) |
| R3 | Inherited links of copies (spike R2) inflate level counts | visited set (F7); option to ignore roles used for reuse `[?]` Q7 |
| R4 | Page model too large for 7 levels | store items once, cap detail lists, counts only beyond the cap |
| R5 | "Impact" semantic differs per role (direction) | explicit direction parameter + viewer toggle |

## 8. Open questions for the PO

See the questions asked in the session of 2026-10-29; answers are recorded here (decisions log) as they come.

1. **Q1 Subset selection** of start items: query parameter, viewer-side picker, other?
2. **Q2 Direction "both"**: union per level, or two separate analyses?
3. **Q3 Level definition**: one link hop = one level (item level), or one document hop = one level?
4. **Q4 Same roles at every level?** Or a role set per level / per direction?
5. **Q5 Output**: documents only, or also the impacted items as a tree (item -> item -> item) in the UI?
6. **Q6 Toggles**: may the viewer raise the level above the parameter value (needs a re-render), or only lower it?
7. **Q7 Copies/branches**: ignore or follow reuse roles (`duplicates`, `branched_from`, ...)?
8. **Q8 Start document scope**: current project only, or other projects too?
9. **Q9 Projects / collection context** in v1 or later?
10. **Q10 Excel**: sheet list, path export (one row per path or per reached item)?

## 9. Decisions log

| Date | Decision | By |
|---|---|---|
| 2026-10-29 | Own widget `advImpact` in this repository, shares `shared/` | PO |
| 2026-10-29 | 3 levels default, up to 7 if feasible and configurable, else hard-coded 3; max 5 link roles; toggles; Excel as docCoverage | PO |
