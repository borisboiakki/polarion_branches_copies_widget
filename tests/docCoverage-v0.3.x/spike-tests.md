# docCoverage spike — collection context, tests K1–K8 on Polarion 2512

Goal: settle how docCoverage 0.3.0 can limit its scope to the documents of a **collection**, at the revision the
collection pins, when its LiveReport is opened in that collection (PO request, 2026-10-28). Outside a collection the
widget must behave as today.

## What is known (not verified on 2512)

- Guide §2.8: a page opened in a collection renders baseline revisions, but ordinary widgets and queries (our Open API
  `sqlSearch`) still see HEAD. Collection-aware code reads `$transaction.context.contextCollection` (null outside a
  collection) and runs `$transaction.objects.searchBySql("select c_uri, c_col_rev from col_module").collection($ref)`;
  links are rendered with `render.withLinks.openLinksInCollectionContext($ref)`. Only SQL works (no Lucene); upstream
  collections are included.
- Siemens (Polarion 2506 release notes): public API to detect that a LiveReport is opened in a collection, and API to run
  SQL in that context. Rendering API Javadoc: `SharedContext.contextCollection()` returns the collection reference or null.
- SDK "SQL Query Examples for Collections": tables `col_<table>` have the columns of `<table>` plus `C_COL_REV` (revision of
  the row in the collection); always select `c_uri, c_col_rev`; tables include `col_module`, `col_rel_module_workitem`,
  `col_workitem`, `col_struct_workitem_linkedworkitems`.
- Our spike V1/V2: `$transaction` is available in a widget; `searchBySql` returns `ProxyDocument` objects.

## Setup

1. Upload `spike-widget/ccSpike.zip` (**Administration → Documents and Pages → Velocity Widgets → Upload**). The widget is
   called **Document Coverage - Collection Spike** and is read-only.
2. Prepare a **collection** with 3 or more documents linked with a coverage role (e.g. a customer specification and two
   system specifications with `satisfies`), ideally:
   - one document **pinned to an older revision** (or a collection baseline) where its items or links differ from HEAD
     (e.g. after adding the collection, add a `satisfies` link or a new item in HEAD);
   - one document of **another project**, if collections allow it on your instance;
   - one linked document that is **not** in the collection.
3. Create a LiveReport page **in the collection** (Collection → add a page / open a page in the collection context) and
   add the widget **6 times**, one per test: K1, K2, K3a, K3b, K4, K8. Set **Link roles** (e.g. `satisfies`) in K4.
4. Add one more instance (K1) on a page **outside** the collection; then one K2 instance outside the collection with the
   parameter **Collection** set to the collection (K6).
5. Export the page in the collection to **PDF** (K7) and look at the K1 instance.

Report a screenshot (or a copy of the tables) of each instance **in the chat**. Do **not** commit raw results (PDF, PNG,
Excel) to the repository. Only the findings below are kept.

If an instance shows an error instead of its table, report the error text: each test is isolated so that one failing
API call does not hide the others.

## Tests

| Test | Checks | Report |
|---|---|---|
| **K1 Collection context** | `$transaction.context()` and `contextCollection()` inside / outside a collection; reference `projectId()` / `id()` / `revision()`; collection object (`reference.get(transaction)`, `fields().name()`, Open API `getName()`, `isFrozen()`); the Open API elements with their revisions (`getElements()`, `getObjectWithRevision()`); upstream collections; page revision | The tables. Inside: "Collection reference from: **page context**". Outside: "none". Tell which revision you expect for each document |
| **K2 Documents** | `select c_uri, c_col_rev from col_module` in the collection: count, class, reference revision, `getOldApi()` key and `getRevision()`, items via `getContainedWorkItems()` vs. HEAD, rendered link with and without `openLinksInCollectionContext` (HTML shown) | The table. Are all documents of the collection there, with the expected revision? Click a link in the collection context: does it open the document at that revision? |
| **K3a / K3b Items per document** | Items of each collection document from `col_workitem` (K3a, by `fk_uri_module`) and from `col_rel_module_workitem` (K3b), excluded types removed, vs. HEAD count; first items with revision; item link in the collection context | Both tables. Which one gives the item count of the pinned revision? Timing per document |
| **K4 Links** | Link sources and targets from `col_struct_workitem_linkedworkitems` (selected roles, different documents); links read from `getOldApi().getLinkedWorkItemsStructsDirect()` of each source; target document taken from the collection side; pairs `target document \| role \| source document` with link counts; counters "not among the SQL targets" and "document differs from HEAD" | The tables and times. For the pinned document: do the counts match its revision (not HEAD)? Is the linked document outside the collection ignored? |
| **K6 Explicit collection** | K2 outside the collection with the parameter **Collection** | "Collection reference from: **collection parameter**" and the same documents as K2 inside |
| **K7 PDF** | K1 in the PDF export of the page in the collection | Is the context still found (PDF: true)? |
| **K8 Custom SQL** | Runs the text of the parameter "Custom SQL" in the collection (default: the K2 query) | Used only if K3/K4 fail, to try other joins (e.g. with `project`, `col_project`); report what works |

Times are printed as start/end stamps in milliseconds (subtract them, or report them as they are).

## Findings

| Test | Date | Result |
|---|---|---|
| — | — | Not run yet |
