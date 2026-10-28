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
| **K9 Page location** | Page reference, Open API page (`getUri()`, `getLocation()`, space, name), widget context: where a page of a collection is stored | Run it in the browser view, in the PDF export and on a page outside the collection. Does the location contain the collection id? |

Times are printed as start/end stamps in milliseconds (subtract them, or report them as they are).

## Round 2 (after round 1, 2026-10-28)

Round 1 confirmed the API, but HEAD and the collection held the same content (equal counts everywhere), so it did not
show that the widget reads the **pinned revision** rather than HEAD. And the PDF export has no collection context (K7).

1. Upload the new `spike-widget/ccSpike.zip` (adds K9).
2. **Change HEAD** of the two documents of the collection, without updating the revisions the collection pins:
   - upstream document: add one requirement (not a heading);
   - downstream document: remove one of the two `refines` links (e.g. VIA-560 → VIA-554) and add a `refines` link from
     a not yet linked item to another upstream item.
3. Add a **third document** outside the collection whose items `refine` the upstream document.
4. Re-run K2, K3a, K3b and K4 on the page in the collection (browser view). Expected:
   - K2 "work items": `getContainedWorkItems()` 7, HEAD SQL 8; K3a / K3b "items in collection" 6, "items HEAD" 7;
   - K4: the two links of the pinned revision (VIA-560 → VIA-554, VIA-561 → VIA-552), not the new one, and nothing from
     the third document.
   For comparison, put docCoverage 0.2.1 on a normal page with the same documents and role: it shows HEAD.
5. Run **K9** on the page in the collection (browser view **and** PDF export) and on a page outside the collection.
6. Optional: if your instance allows it, add a document of **another project** to the collection and re-run K2/K4; open
   the page from an older revision / baseline of the collection and re-run K1 (is a revision shown in the reference?).

## Round 3 (after round 2, 2026-10-28)

Round 2 showed that items are read at the pinned revision. Still open: whether the **links** are read at the pinned
revision (K4 showed the same 2 links; it is not known whether HEAD changed them), the document outside the collection,
and K9 (not in the results).

1. Upload the new `spike-widget/ccSpike.zip`: K4 now also lists the **HEAD links** between the same documents and the
   HEAD links coming from documents outside the collection, so one K4 run shows both sides.
2. If not done yet: in HEAD, remove the link VIA-560 → VIA-554, add a `refines` link from an unlinked downstream item,
   and create a third document outside the collection that `refines` the upstream document.
3. Re-run **K4** on the page in the collection (browser view). Expected: collection part = VIA-560 → VIA-554 and
   VIA-561 → VIA-552; HEAD part = the new set; "HEAD links from documents outside the collection" > 0, and that document
   absent from the collection pairs.
4. Run **K9** (new option "K9 Page location (PDF export)") on the page in the collection in the browser view **and** in
   the Polarion PDF export, and on a page outside the collection.

## Findings

Round 1, 2026-10-28, project `VforIA`, collection id 3 with 2 documents (upstream system requirements, downstream
software requirements), role `refines`. Raw results sent in the chat, not committed.

| Test | Date | Result |
|---|---|---|
| K1 | 2026-10-28 | ✅ Browser view of the page in the collection: `$transaction.context()` = `ServerUiContext`, `contextCollection()` = `BaselineCollectionReference` (`projectId()` = VforIA, `id()` = 3, `revision()` empty). `reference.get($transaction)` → `ProxyBaselineCollection`, `fields().name().get()` = collection name, `getOldApi()` → Open API `BaselineCollection` (`getId()`, `getName()`, `getProjectId()`; `getRevision()` empty; `isFrozen()` does not exist, `isClosed()` false). `getElements()` → `BaselineCollectionElement`, `getRevision()` = pinned revision, `getObjectWithRevision()` = `Module` at that revision. No upstream collections |
| K2 | 2026-10-28 | ✅ `searchBySql("select c_uri, c_col_rev from col_module").collection(ref)` → `ProxyModelObjectsSqlSearch` of `ProxyDocument`, exactly the 2 collection documents (≈11 ms). `getOldApi()` → `Module` at the pinned revision (`getRevision()` = `getDataRevision()` = element revision; text `…%85266`). `getReference().revision()` empty. Link with `openLinksInCollectionContext`: `/polarion/#/project/<p>/collection/<id>/wiki/<space>/<document>`; without: `…/#/project/<p>/wiki/<space>/<document>?revision=<rev>` (both with the "fixed revision" icon). Relative href in the browser, absolute in PDF |
| K3 | 2026-10-28 | ✅ Both queries (`col_workitem` by `fk_uri_module`, and `col_rel_module_workitem`) work and give the same counts (6 and 3, headings excluded), 2–3 ms per document. Items come at the document's revision (`getOldApi().getRevision()`). Item link: `/polarion/#/project/<p>/collection/<id>/workitem?id=<id>`. Not shown yet: a difference with HEAD (HEAD = collection here) → round 2 |
| K4 | 2026-10-28 | ✅ `col_struct_workitem_linkedworkitems` joined with `col_workitem` / `col_module` accepted; 2 sources, 2 targets, 1 pair with 2 links (≈9 ms in all). `getOldApi()` of a collection item gives `getLinkedWorkItemsStructsDirect()`; link `getRevision()` empty. Not shown yet: links of the pinned revision vs. HEAD, documents outside the collection → round 2 |
| K6 | 2026-10-28 | ✅ Outside the collection, the parameter "Collection" (`@collection`, `ProxyEnumOption` id = collection id) → `getModelObject().getReference()` gives the same reference; K1/K2 identical to the context |
| K7 | 2026-10-28 | ❌ **PDF export: `contextCollection()` is null** (same class `ServerUiContext`), also for the page in the collection; only the "Collection" parameter worked there. To find another way: K9 (round 2); otherwise the PDF of a collection report needs the "Collection" parameter |
| K8 | 2026-10-28 | ✅ Custom SQL in the collection works (default query) |
| K2/K3 round 2 | 2026-10-28 | ✅ **Pinned revision read**: after HEAD changed (items added), K2 `getContainedWorkItems()` 7 vs. HEAD 9 (upstream) and 4 vs. 5 (downstream); K3a and K3b 6 vs. HEAD 8 and 3 vs. 4 (headings excluded). Same counts with the context (browser view) and with the "Collection" parameter (Polarion PDF export) |
| K4 round 2 | 2026-10-28 | ⚠️ Same 2 links as round 1 (VIA-560 → VIA-554, VIA-561 → VIA-552), nothing from outside; whether HEAD links had changed is not visible → K4 now prints the HEAD side too (round 3) |
| K7 round 2 | 2026-10-28 | ❌ confirmed: Polarion PDF export of the page in the collection: no context (only the parameter works). ✅ **Browser print to PDF** of the page opened in the collection keeps the context (it prints the browser view) |
| K4 round 3 | 2026-10-28 | ✅ **Links read at the pinned revision**. Collection: VIA-560 → VIA-554 and VIA-561 → VIA-552 (2 links, the link VIA-560 → VIA-554 was removed in HEAD). HEAD for the same documents: VIA-561 → VIA-552, VIA-561 → VIA-566, VIA-568 → VIA-567 (3 links). HEAD links from two documents outside the collection (2 links) are absent from the collection result. `getOldApi().getLinkedWorkItemsStructsDirect()` of a collection item returns the links of its revision. Times: collection ≈ 25 ms, HEAD ≈ 90 ms (small set) |
| K9 round 3 | 2026-10-28 | The page of the collection is an ordinary rich page (`ProxyRichPage`, Open API `RichPage`, space `CollectionTests`); its reference and location (`…${RichPage}{moduleFolder}CollectionTests#SpikeTestsCollection`) carry **no collection id**. The same page has the context when opened from the collection (`#/project/<p>/collection/<id>/…`) and none when opened from its space. So the context comes from **how the page is opened**, not from where it is stored, and the Polarion PDF export (server side, no collection URL) cannot find it. `getElements()` lists the documents only, not the page. The PDF export of a collection report therefore needs the explicit "Collection" parameter (K6) |

**Conclusion (2026-10-28): the spike is sufficient.** Collection context, documents, items and links at the pinned revision,
collection links and the explicit collection parameter all work on 2512; the only gap is the Polarion PDF export, solved
with the explicit parameter. Left for the tests of 0.3.0 itself (not blocking): a document of another project in a
collection, a collection opened at an older revision or baseline, upstream collections, timing on a large collection.
