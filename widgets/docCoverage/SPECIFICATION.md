# Specification — Document Coverage widget (docCoverage)

**Status:** v0.3, 2026-10-27, written with the product owner (PO). Spike C1–C4 done on 2512
(`tests/docCoverage-v0.1.x/spike-tests.md`, §8). Widget **0.1.0 implemented** (`widgets/docCoverage/src`), tested with
Velocity 1.4 on mocks and in Chromium; open checks on the instance in §9. Items marked `[?]` are open or need verification on a Polarion instance.

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
  spike A2) and for `satisfies` (spike C3).
- **Upstream document** = document of the link **targets** (e.g. the customer specification).
  **Downstream document** = document of the link **sources** (e.g. the system requirements that "satisfy").
  Verified by C3 for `satisfies`: the link is stored on the downstream item and targets the customer specification item.
- **Counted items**: work items of a document, without the excluded types (`workitem-type` selector, default Heading).

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | **Document selection** in the widget parameters: a multi-select document selector (`@document`). Nothing selected = all documents of the project (optionally limited by "Spaces to include") | Must |
| F1b | **In-widget document selector**: the viewer can hide/show documents among those analysed, without edit mode | Should |
| F2 | **Link roles**: multi-select of the project's link roles (`workitem-link-role`), **1 to 5**. More than 5: the first 5 are used and a warning is shown. (A text fallback was dropped: the selector works on 2512, PO) | Must |
| F3 | One **line per document pair** (upstream → downstream) when ≥ 1 link of a selected role exists between their items, labelled with each role and its **link count** (e.g. `satisfies 42 + verifies 3`) | Must |
| F4 | One line style and colour per role (5 styles), legend; viewer toggles per role (as the relation kinds of docBranches) and the "Item counts" toggle | Must |
| F5 | **Counters** per pair: links per role; **downstream items with links** (count and % of the downstream document); **upstream items covered** by this downstream document (count and %) | Must |
| F6 | **Upstream coverage %** per upstream document: counted items with ≥ 1 link of a selected role from **any** selected downstream document, shown on the document box | Must |
| F7 | **Uncovered items**: list of the upstream items without such a link, in the details (click on a document), the table and Excel | Must |
| F8 | Details: click a line for the counters and the linked items (first 30); click a document for its coverage and uncovered items, with a link that opens the document | Must |
| F9 | Table view; Excel export with sheets Relations, Documents (with coverage), Uncovered items, Linked items; SVG export; CSV fallback | Must |
| F10 | PDF/print: static graph + coverage table (no JavaScript), as docBranches | Must |
| F11 | Extra document fields (type, status, dates, item count) as in docBranches; author removed (PO, user feedback) | Should |
| F12 | Documents shown: only documents with relations / all selected documents (default parameter, viewer toggle) | Should |
| F13 | Links between items of the **same** document are ignored. Links to unresolvable items are ignored | Must |
| F14 | Chains (customer spec ← system reqs ← software reqs) are shown as layers; **no transitive reduction** (each link is a real relation) | Must |
| F15 | Work item type filter for upstream items counted for coverage (e.g. only `customerRequirement`) | Could |
| F16 | **Projects** parameter (`@project` multi-selector, 0.2.0), as docBranches F16: documents of the selected projects (none = current project); links between documents of two selected projects count. The `@document` selector lists the current project only, so the document selection limits the current project; the other selected projects keep all their documents (PO). Warning when documents are selected but the current project is not in scope. 0.2.1: text parameter **Documents of other projects** (`project/space/document`, comma separated, `project/document` = default space) limits the documents of the other selected projects; entries of the current project are added to the selection; bad / unselected / not found entries are reported (PO) | Should (done) |
| F17 | **Collection context** (0.3.0): when the LiveReport is opened in a **collection**, the documents analysed are the documents of the collection at the revision the collection pins (items, links and coverage of that revision). The Projects, Documents and Documents-of-other-projects parameters are then ignored; the Spaces filter and the excluded types still apply. A parameter "Collection context" (use / ignore, default use) switches it off. The scope line shows the collection. Outside a collection: unchanged (PO, 2026-10-28). Spike K1–K8 first (`tests/docCoverage-v0.3.x/`) | Should |

## 5. Non-functional requirements

As docBranches: render within the 10 s budget on ~100 documents / 20k items (target < 2 s), SQL scoped to the project
and the selected documents, never loop over all work items in Velocity, `isUnresolvable()` guard on every referenced
object, Velocity 1.4-safe templates, no customer data in the repository.

## 6. Technical approach

Same as docBranches (Velocity + inlined `shared/js/core.js` + widget `graph.js`; static view for PDF/print):

1. **Parameters**: documents (`$factory.enumeration("Documents", "@document")`, multi), roles
   (`$factory.enumeration("Link roles", "workitem-link-role")`, multi), excluded types, spaces,
   documents shown, item counts, extra fields, height. Common ones come from `shared/vm/params.vm`.
2. **Documents**: `shared/vm/documents.vm`, restricted to the selected document keys (space/name). Verified by C1: each
   value of `$parameters.docs.values()` is a `ProxyEnumOption`; `getModelObject()` is a `ProxyDocument` (check
   `isUnresolvable()`); its `getOldApi()` is the Open API `Module`, whose `getModuleFolder()` (`_default` for the default
   space) and `getId()` give the key. `getReference().spaceId()` is empty: do not use it. The option `id()` reads
   `_default / Name` (not used).
3. **Links**: one SQL query returns the link-source items of the selected documents with a selected role whose target is
   in another selected document (join `struct_workitem_linkedworkitems`, `workitem` source/target, `module` source/target,
   filter on `c_role` and on module folder/name). Velocity scans each item's `getLinkedWorkItemsStructsDirect()` and
   groups per (upstream, downstream) pair: links per role, distinct downstream items, distinct upstream items.
4. **Coverage**: per upstream document, its counted items (one SQL query, as the item count of docBranches) against
   the set of covered item ids over all downstream documents; uncovered ids capped in the page model (e.g. 500, full
   count always shown).
5. **Roles** (verified by C2): `$parameters.roles.values()` gives `ProxyEnumOption`s, `id()` = role id. Labels come from
   `$trackerService.getTrackerProject(projectId).getWorkItemLinkRoleEnum().getAllOptions()` (`getId()`, `getName()`,
   `getOppositeName()`); the line shows the role **name** (fallback: id).
6. **Client**: categories = selected roles (colour/dash from a 5-style palette), node lines with coverage %, in-widget
   document selector (`state.hidden` in `layout()`), details/table/Excel specific to coverage.

## 7. Open questions

1. ~~Arrow direction~~ **Decided**: arrows in the link direction, **downstream → upstream** (the usual traceability
   notation); upstream documents stay on the left (PO, 2026-10-27).
2. ~~Role labels~~ **Decided**: role name (PO, 2026-10-27).
3. ~~Cap of the uncovered items list~~ **Decided**: 500 per document in the page model, full count always shown (PO).
4. Should a document that is both upstream and downstream (middle of a chain) show its coverage %? Default: yes, for
   the links where it is the target.

## 8. Spike (C1–C4) — see `tests/docCoverage-v0.1.x/spike-tests.md`

| Test | Question | Result |
|---|---|---|
| C1 | How are the selected documents of an `@document` multi-select read (`values()`, `getModelObject()`, space/name)? | ✅ `ProxyEnumOption` → `getModelObject()` `ProxyDocument` → `getOldApi()` `Module` (folder `_default`, id). `getReference().spaceId()` empty |
| C2 | How are the selected link roles read (id, name), and which roles does the project have (id, name, opposite name)? | ✅ `id()` = role id; project roles readable with name and opposite name |
| C3 | Link direction of the coverage roles, link scan between the selected documents, timing on the large project | ✅ `satisfies` stored on the downstream item, target = customer spec; SQL with source + target document filter works; 3–4 ms SQL, ≤ 1 ms scan (small set). Large project not measured; PO: no performance concern |
| C4 | Counted items per upstream document, coverage % and uncovered items, timing | ✅ 6 counted items (heading excluded), 5 covered = 83 %, 1 uncovered listed; ≤ 1 ms |

## 8b. Spike K1–K8 (collection context) — see `tests/docCoverage-v0.3.x/spike-tests.md`

| Test | Question | Result |
|---|---|---|
| K1 | Is `$transaction.context().contextCollection()` set in a page opened in a collection (null outside, PDF too)? Collection name and revision for the scope line | ✅ Browser view: `BaselineCollectionReference` (project, id); name via `get($transaction).fields().name().get()` or `getOldApi().getName()`; elements with pinned revisions. Null outside |
| K2 | Does `searchBySql("select c_uri, c_col_rev from col_module").collection(ref)` return the collection documents at their revision (`getOldApi()`)? Link format with `openLinksInCollectionContext` | ✅ Yes, `Module` at the pinned revision; link `#/project/<p>/collection/<id>/wiki/<space>/<doc>` |
| K3 | Which collection query gives the items of a document at its pinned revision (`col_workitem` by `fk_uri_module`, or `col_rel_module_workitem`)? Timing | ✅ Both work, same counts, 2–3 ms; item link `#/project/<p>/collection/<id>/workitem?id=<id>`. Round 2: collection 6 vs. HEAD 8 items after HEAD changed → pinned revision read ✅ |
| K4 | Does `col_struct_workitem_linkedworkitems` give the links of the pinned revision, and does `getOldApi().getLinkedWorkItemsStructsDirect()` of a collection item return the links of that revision? | ✅ Query and link reading work (≈9 ms). Links of the pinned revision vs. HEAD and documents outside the collection: round 3 (K4 prints HEAD too) |
| K6–K8 | Explicit collection reference (parameter), PDF export, custom SQL | K6 ✅ `@collection` parameter gives the same reference. **K7 ❌ no context in the Polarion PDF export** (only the parameter works); the browser's print to PDF keeps it. K8 ✅ |
| K9 | Where is a page of a collection stored (can the PDF export find its collection)? | Round 3 |

## 9. Open checks for 0.1.0 on 2512

Only verifiable on the instance (the harness uses mocks):

a. ✅ (PO, 2026-10-27) Upload of `docCoverage.zip` (entry `docCoverage/resources/xlsx.js`, 29 characters) and the Excel export.
b. ✅ (PO) The document and role selectors with 4 documents and 2 roles (`verifies`, `satisfies`): one checkbox and
   line style per role, a chain of 3 documents (test spec → system spec → customer spec). The text fallback was
   removed before release (not needed).
c. ✅ (PO) Coverage on the spike set: customer spec 5/6 = 83 %, uncovered item listed.
d. ✅ (PO screenshot) Arrows downstream → upstream, upstream on the left, role names and link counts on the lines.
e. ✅ (PO) Fast rendering with many documents.
f. Viewer permissions (as docBranches §10.2 a) — still open.
g. 0.1.1: excluded types selector (`workitem-type`) lists the project's types, Heading preselected, coverage unchanged — ✅ (PO, 2026-10-27).
h. ✅ (PO, 2026-10-28) Project selector works; with no document selected, data of several projects shown; rendering
   time good. The document selector lists the current project's documents only, even with several projects selected:
   Polarion limitation of `@document` (guide §10.2), as designed in F16.
   0.2.1: parameter "Documents of other projects": listed documents only for the other projects, warnings for bad,
   unselected and unknown entries — ✅ (PO, 2026-10-28: listed documents work, "not found" warning shown).
   0.2.0: Projects parameter, as docBranches §10.2 k; in addition: a downstream document of another project counts in
   the coverage of an upstream document of the current project, and the document selection still limits the current
   project.

## 10. Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-10-27 | New widget docCoverage in the same repository as docBranches, sharing `shared/`; own version and release tags | PO |
| 2026-10-27 | Counters: link count per role, upstream coverage %, uncovered items list, downstream items with links | PO |
| 2026-10-27 | v1 single project | PO |
| 2026-10-27 | Repository restructured into `widgets/` + `shared/` (docBranches 0.2.1, no functional change) | PR #4 |
| 2026-10-27 | Spike C1–C4 on 2512 (project with a customer specification and two system specifications, role `satisfies`): selectors readable, document key from `getOldApi()`, coverage links stored on the downstream item, coverage computed as expected, fast on the small set | PO tests |
| 2026-10-27 | Line labels show the role **name** | PO |
| 2026-10-27 | Raw spike results (PDF/PNG with company branding) removed from the branch and its history; only findings are kept | PO |
| 2026-10-27 | Arrows downstream → upstream (link direction), upstream on the left; uncovered list capped at 500 per document (full count shown); no performance concern for the large project | PO |
| 2026-10-27 | Widget 0.1.0 implemented: shared core + `graph.js` (coverage recomputed in the browser from the shown roles and documents, document picker, document details with uncovered items, table, Excel, SVG), static PDF view with coverage tables; harness `tools/vtest/docCoverage/` | `tools/test-widget.sh docCoverage` |
| 2026-10-27 | PO test of 0.1.0 on 2512: upload, Excel, selectors with 2 roles, coverage 83 %, arrows and labels, speed OK. The "Link roles as text" parameter is removed (selector works); still 0.1.0 (not released) | PO |
| 2026-10-27 | Author field removed (user feedback); role selector read with the shared macro `bwRoleIds`. Still 0.1.0 (not released) | PO |
| 2026-10-27 | PO test of 0.1.0 (without author) on 2512: OK. Ready for release | PO |
| 2026-10-27 | Widget 0.1.1: the excluded work item types are chosen with a `workitem-type` multi-selector (default Heading, none selected = all types counted) instead of comma-separated text; shared macro `bwRoleIds` renamed `bwOptionIds`. Patch release (PO). To check on 2512: selector lists the types with Heading preselected; counts unchanged with Heading | PO |
| 2026-10-27 | Widget 0.1.1: `icon.png` (608 x 405, white background) at the package root, as in a widget used by the PO; no reference in other files. Display in the widget list to check on 2512 | PO |
| 2026-10-27 | PO test of 0.1.1 on 2512: type selector (Heading preselected, counts as before) and widget icon OK. Ready for release | PO |
| 2026-10-28 | Widget 0.2.0: **Projects** parameter (`@project`, none = current project), shared with docBranches 0.4.0. Document selection limits the current project only (the selector lists only that project); other selected projects keep all their documents (PO). Cross-project links count (PO). Minor release (PO). Open check §9 h | PO |
| 2026-10-28 | PO test of 0.2.0 on 2512: project selector and multi-project data OK, rendering time good. The document selector lists the current project only (Polarion `@document` limitation, guide §10.2; expected, F16) | PO |
| 2026-10-28 | Widget 0.2.1: text parameter "Documents of other projects" (`project/space/document`, comma separated), since the `@document` selector cannot list other projects (PO: keep the capability even if less comfortable). Shared `documents.vm` gets `docOther` (docBranches 0.4.1, no functional change). To check on 2512 | PO |
| 2026-10-28 | PO test of 0.2.1 on 2512: "Documents of other projects" works with a valid project/space/document, the not-found warning is shown. Ready for release | PO |
| 2026-10-28 | Collection context (F17) requested for docCoverage first (docBranches may follow). The collection replaces the Projects / Documents parameters; a parameter can ignore the context (default: use it); spike K1–K8 before the implementation (0.3.0) | PO |
| 2026-10-28 | Spike round 1 on 2512 (collection with 2 documents, role `refines`): context, collection SQL, items, links and collection links work; the PDF export has **no** collection context (K7). Round 2: HEAD changed after pinning, a document outside the collection, K9 page location | PO tests |
| 2026-10-28 | Spike round 2: items are read at the pinned revision (collection 6 vs. HEAD 8); Polarion PDF export confirmed without context, browser print to PDF keeps it. Round 3: K4 with HEAD comparison, K9 | PO tests |
