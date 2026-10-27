# Specification — Document Coverage widget (docCoverage)

**Status:** v0.1 draft, 2026-10-27, written with the product owner (PO). Spike C1–C4 is pending on 2512
(`tests/docCoverage-v0.1.x/spike-tests.md`). Items marked `[?]` are open or need verification on a Polarion instance.

## 1. Goal

A Velocity LiveReport widget that shows **how documents cover each other** through work item links. The user
selects 2 or more LiveDocs (or all of them) and 1 to 5 link roles. Two documents are connected when at least one
link of a selected role goes from an item of one to an item of the other. Each connection carries counters.

Typical use: a **customer specification** with client requirements (upstream) that are satisfied by requirements
in one or more downstream LiveDocs (system requirements, software requirements, …).

It reuses the code and the verified findings of docBranches (`widgets/docBranches/`, `shared/`).

## 2. Context and constraints

| ID | Constraint | Source |
|---|---|---|
| C1 | Target **Polarion 2512**, keep compatible with **2606** | PO, as docBranches |
| C2 | v1 = **one project**. Cross-project later, do not design it out | PO 2026-10-27 |
| C3 | Sizing as docBranches: up to ~100 LiveDocs and ~20,000 work items per project | PO |
| C4 | Velocity widget, client code from `shared/js/core.js`, Excel library loaded with `#loadWidgetJs` | docBranches findings |
| C5 | Same repository as docBranches, **own version** (`widgets/docCoverage/VERSION`), release tag `docCoverage-vN.N.N` | PO 2026-10-27 |

## 3. Terms

- **Link source / target**: Polarion stores a link on one work item (the source, `fk_uri_p_workitem`) pointing to
  another (the target, `fk_uri_workitem`). Verified for `duplicates`/`branched_from`/`derived_from` on 2512 (docBranches
  spike A2); to be checked for the coverage roles (spike C3).
- **Upstream document** = document of the link **targets** (e.g. the customer specification).
  **Downstream document** = document of the link **sources** (e.g. the system requirements that "satisfy").
  `[?]` C3 confirms that coverage links (e.g. `satisfies`, `verifies`) are stored on the downstream item.
- **Counted items**: work items of a document, without the excluded types (default `heading`).

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | **Document selection** in the widget parameters: a multi-select document selector (`@document`). Nothing selected = all documents of the project (optionally limited by "Spaces to include") | Must |
| F1b | **In-widget document selector**: the viewer can hide/show documents among those analysed, without edit mode | Should |
| F2 | **Link roles**: multi-select of the project's link roles (`workitem-link-role`), **1 to 5**. More than 5: the first 5 are used and a warning is shown. Text parameter as fallback if the selector cannot be read `[?]` C2 | Must |
| F3 | One **line per document pair** (upstream → downstream) when ≥ 1 link of a selected role exists between their items, labelled with each role and its **link count** (e.g. `satisfies 42 + verifies 3`) | Must |
| F4 | One line style and colour per role (5 styles), legend; viewer toggles per role (as the relation kinds of docBranches) and the "Item counts" toggle | Must |
| F5 | **Counters** per pair: links per role; **downstream items with links** (count and % of the downstream document); **upstream items covered** by this downstream document (count and %) | Must |
| F6 | **Upstream coverage %** per upstream document: counted items with ≥ 1 link of a selected role from **any** selected downstream document, shown on the document box | Must |
| F7 | **Uncovered items**: list of the upstream items without such a link, in the details (click on a document), the table and Excel | Must |
| F8 | Details: click a line for the counters and the linked items (first 30); click a document for its coverage and uncovered items, with a link that opens the document | Must |
| F9 | Table view; Excel export with sheets Relations, Documents (with coverage), Uncovered items, Linked items; SVG export; CSV fallback | Must |
| F10 | PDF/print: static graph + coverage table (no JavaScript), as docBranches | Must |
| F11 | Extra document fields (type, status, author, dates, item count) as in docBranches | Should |
| F12 | Documents shown: only documents with relations / all selected documents (default parameter, viewer toggle) | Should |
| F13 | Links between items of the **same** document are ignored. Links to unresolvable items are ignored | Must |
| F14 | Chains (customer spec ← system reqs ← software reqs) are shown as layers; **no transitive reduction** (each link is a real relation) | Must |
| F15 | Work item type filter for upstream items counted for coverage (e.g. only `customerRequirement`) | Could |
| F16 | Cross-project documents | Future |

## 5. Non-functional requirements

As docBranches: render within the 10 s budget on ~100 documents / 20k items (target < 2 s), SQL scoped to the project
and the selected documents, never loop over all work items in Velocity, `isUnresolvable()` guard on every referenced
object, Velocity 1.4-safe templates, no customer data in the repository.

## 6. Technical approach

Same as docBranches (Velocity + inlined `shared/js/core.js` + widget `graph.js`; static view for PDF/print):

1. **Parameters**: documents (`$factory.enumeration("Documents", "@document")`, multi), roles
   (`$factory.enumeration("Link roles", "workitem-link-role")`, multi), roles as text (fallback), excluded types, spaces,
   documents shown, item counts, extra fields, height. Common ones come from `shared/vm/params.vm`.
2. **Documents**: `shared/vm/documents.vm`, restricted to the selected document keys (space/name) resolved through
   `getModelObject()` `[?]` C1.
3. **Links**: one SQL query returns the link-source items of the selected documents with a selected role whose target is
   in another selected document (join `struct_workitem_linkedworkitems`, `workitem` source/target, `module` source/target,
   filter on `c_role` and on module folder/name). Velocity scans each item's `getLinkedWorkItemsStructsDirect()` and
   groups per (upstream, downstream) pair: links per role, distinct downstream items, distinct upstream items.
4. **Coverage**: per upstream document, its counted items (one SQL query, as the item count of docBranches) against
   the set of covered item ids over all downstream documents; uncovered ids capped in the page model (e.g. 500, full
   count always shown) `[?]` cap.
5. **Client**: categories = selected roles (colour/dash from a 5-style palette), node lines with coverage %, in-widget
   document selector (`state.hidden` in `layout()`), details/table/Excel specific to coverage.

## 7. Open questions

1. Arrow direction: upstream → downstream (as docBranches: original → copy), upstream documents on the left.
   Alternative: arrow in the link direction (downstream → upstream, "satisfies"). `[?]` PO
2. Role labels: role id, role name, or opposite name ("satisfies" / "is satisfied by")? Default: role name `[?]` C2
3. Cap of the uncovered items list in the page model (default 500 per document) `[?]`
4. Should a document that is both upstream and downstream (middle of a chain) show its coverage %? Default: yes, for
   the links where it is the target.

## 8. Spike (C1–C4) — see `tests/docCoverage-v0.1.x/spike-tests.md`

| Test | Question | Result |
|---|---|---|
| C1 | How are the selected documents of an `@document` multi-select read (`values()`, `getModelObject()`, space/name)? | pending |
| C2 | How are the selected link roles read (id, name), and which roles does the project have (id, name, opposite name)? | pending |
| C3 | Link direction of the coverage roles, link scan between the selected documents, timing on the large project | pending |
| C4 | Counted items per upstream document, coverage % and uncovered items, timing | pending |

## 9. Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-10-27 | New widget docCoverage in the same repository as docBranches, sharing `shared/`; own version and release tags | PO |
| 2026-10-27 | Counters: link count per role, upstream coverage %, uncovered items list, downstream items with links | PO |
| 2026-10-27 | v1 single project | PO |
| 2026-10-27 | Repository restructured into `widgets/` + `shared/` (docBranches 0.2.1, no functional change) | PR #4 |
