# Spike tests — run on the Polarion 2512 instance

Goal: settle the technical risks in `SPECIFICATION.md` §9 (R1–R5) before building the widget.
Two parts:

- **Part A**: no direct database access is needed. Use the DB schema docs on your server, `SQL:(...)` queries in the
  Work Items tracker search, and a few REST calls to check the schema, link roles, direction and document metadata.
- **Part B**: the `bwSpike` test widget on a LiveReport page. It tests what Velocity/Polarion actually allows.

All queries and the widget are **read-only** (`SELECT` only).

---

## 0. Test set on project `VforIA`

Project ID: **`VforIA`** (case-sensitive). Project location: `/sandbox/SBE/VforIA`.
Starting document (the original, "A"): **`SRS_Test`**.

| Ref | Document | How it was created | Expected relation |
|---|---|---|---|
| A | `SRS_Test` | Original document | — |
| B | `SRS_Test_Reuse_TestB` | Reuse/copy of A | copy (`duplicates`) A → B |
| C | `SRS_Test_Branch_Test_C` | Branch of A, 2 items overwritten | branch (`branched_from`) A → C |
| D | `SRS_Test_TestD_Derived` | Reuse of A with derivation option | derived (`derived_from`) A → D |
| E | `SRS_Test_Copy_of_B_TestE` | Copy of B | copy (`duplicates`) B → E |
| F | `SRS_Test_F_nooverwrite` | Branch of A, no item overwritten | branch A → F (metadata only?) |
| G | `Test_G_UnrelatedDoc` | Unrelated document | none |

The documents `Index` and `Sp` in the same space are not part of the test set and should show no relation.
All test documents are in the space **`Requirements`** (confirmed by the PO; mapping above confirmed too).

---

## Part A — Schema, tracker SQL and REST (no direct DB access needed)

All queries below already use project `VforIA`. Replace `MYHOST` with your server.

### A1 — Database schema docs on your server ✅ done

Result: `docs/A1_FullDBSchema.pdf`. On 2512, **MODULE** has `FK_URI_BRANCHEDFROM`, `FK_URI_DERIVEDFROM`,
`C_DERIVEDFROMLINKROLE`, `C_BRANCHEDWITHQUERY`, `C_MODULEFOLDER`, `C_MODULENAME`, `FK_URI_VARIANT`. **WORKITEM** has
`FK_URI_MODULE`. There is also a table `STRUCT_WORKITEM_LINKEDWORKITEMSDERIVED` (same columns as the link table).

Original instructions, for reference:

Open `https://MYHOST/polarion/sdk/doc/database/TablesReferenceDetails.html` (or `FullDBSchema.pdf` in the same folder).
In table **MODULE**, check whether these columns exist and note the exact names:
`FK_URI_BRANCHEDFROM`, `FK_URI_DERIVEDFROM`, `C_DERIVEDFROMLINKROLE`, and the columns for the document's space and name
(e.g. `C_MODULEFOLDER`, `C_MODULENAME`). Also check that **WORKITEM** has `FK_URI_MODULE`.

### A2 — Tracker SQL queries ✅ done (Q1–Q6, see "Results so far")

In **Work Items** (tracker table view), paste each query into the search bar. Add the **Document** column to the table so
you can see which document each item belongs to. A tracker `SQL:(...)` query must return work item URIs (`c_uri`), so
each query returns work items, not documents.

Each query also tests the SQL firewall: an error means a construct (a join, a column) is rejected or doesn't exist.

**Q1 — items that are the link SOURCE of a cross-document `duplicates` link**

```
SQL:(SELECT ws.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'VforIA' AND l.c_role = 'duplicates' AND ws.fk_uri_module <> wt.fk_uri_module)
```

**Q2 — items that are the link TARGET of a cross-document `duplicates` link**

```
SQL:(SELECT wt.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'VforIA' AND l.c_role = 'duplicates' AND ws.fk_uri_module <> wt.fk_uri_module)
```

Run Q1 and Q2 again with `'branched_from'` and then `'derived_from'` in place of `'duplicates'`.
Please report the **documents** (and number of items) that appear in each result.

Expected, **if links point from the copy to the original**. If you see the opposite (Q1 and Q2 swapped), the
links point from the original to the copy, which is just as useful to know:

| Role | Q1 (link sources) | Q2 (link targets) |
|---|---|---|
| `duplicates` | `SRS_Test_Reuse_TestB`, `SRS_Test_Copy_of_B_TestE` | `SRS_Test`, `SRS_Test_Reuse_TestB` |
| `branched_from` | `SRS_Test_Branch_Test_C` (the 2 overwritten items) | `SRS_Test` |
| `derived_from` | `SRS_Test_TestD_Derived` | `SRS_Test` |

`SRS_Test_F_nooverwrite` should appear nowhere. With no overwritten item it has no link of its own.

**Q3 — items contained in documents that have "branched from" metadata** (tests that the column exists)

```
SQL:(SELECT w.c_uri FROM workitem w INNER JOIN module m ON m.c_uri = w.fk_uri_module INNER JOIN project p ON p.c_uri = m.fk_uri_project WHERE p.c_id = 'VforIA' AND m.fk_uri_branchedfrom IS NOT NULL)
```

**Q4 — same for "derived from" metadata**

```
SQL:(SELECT w.c_uri FROM workitem w INNER JOIN module m ON m.c_uri = w.fk_uri_module INNER JOIN project p ON p.c_uri = m.fk_uri_project WHERE p.c_id = 'VforIA' AND m.fk_uri_derivedfrom IS NOT NULL)
```

Expected: Q3 lists the 2 overwritten items of `SRS_Test_Branch_Test_C`. `SRS_Test_F_nooverwrite` probably does not
appear: its items still belong to `SRS_Test`, so an item query cannot see it. That case is covered by widget test V2,
which reads the document metadata directly. Q4 lists the items of `SRS_Test_TestD_Derived`. The copies
(`SRS_Test_Reuse_TestB`, `SRS_Test_Copy_of_B_TestE`) should not appear in either; if they do, copies also carry metadata.

**Q5 — firewall check: `DISTINCT` and `GROUP BY`**

```
SQL:(SELECT DISTINCT ws.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'VforIA' AND l.c_role IN ('duplicates', 'branched_from', 'derived_from'))
```
```
SQL:(SELECT ws.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'VforIA' AND l.c_role IN ('duplicates', 'branched_from', 'derived_from') GROUP BY ws.c_uri HAVING COUNT(*) >= 1)
```

**Q6 — which MODULE column holds the document name** (needed by the widget)

```
SQL:(SELECT w.c_uri FROM workitem w INNER JOIN module m ON m.c_uri = w.fk_uri_module INNER JOIN project p ON p.c_uri = m.fk_uri_project WHERE p.c_id = 'VforIA' AND m.c_id = 'SRS_Test')
```
```
SQL:(SELECT w.c_uri FROM workitem w INNER JOIN module m ON m.c_uri = w.fk_uri_module INNER JOIN project p ON p.c_uri = m.fk_uri_project WHERE p.c_id = 'VforIA' AND m.c_modulename = 'SRS_Test')
```
Report which of the two returns the items of `SRS_Test` (possibly both).

### A3 — REST calls (document metadata and link direction)

Use your REST token (Postman, curl or similar). The base URL is `https://MYHOST/polarion/rest/v1`.
The space of the default folder is `_default`. URL-encode document names that contain spaces (`%20`).

**R1 — full document resource for `SRS_Test_Reuse_TestB`, `SRS_Test_Branch_Test_C`, `SRS_Test_TestD_Derived` and
`SRS_Test_F_nooverwrite`** (replace `DOCNAME` with each document name)

```
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "https://MYHOST/polarion/rest/v1/projects/VforIA/spaces/Requirements/documents/DOCNAME?fields%5Bdocuments%5D=@all"
```
Looking for relationships or attributes such as `branchedFrom`, `derivedFrom`, `derivedFromLinkRole`, `variant`.
Please paste the JSON responses. Remove anything confidential first; only the structure and IDs matter.

**R2 — links of one item in `SRS_Test_Reuse_TestB`, one overwritten item in `SRS_Test_Branch_Test_C` and one in
`SRS_Test_TestD_Derived`** (replace `ITEMID` with the item ID, e.g. `VFIA-123`)

```
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "https://MYHOST/polarion/rest/v1/projects/VforIA/workitems/ITEMID/linkedworkitems?fields%5Blinkedworkitems%5D=@all"
```
This shows the role and the direction of each link, as seen from that item.

## Part B — `bwSpike` test widget in Polarion

### Install

The templates are parser-checked with Velocity 1.4 (`tools/vcheck.sh`), which matches the 2512 instance.

1. Download `spike/bwSpike.zip` from this repository (or zip the `spike/bwSpike` folder yourself; the folder must be at the root of the zip).
2. Go to **Administration → Documents and Pages → Velocity Widgets → Upload**. Use the scope of the **test project**.
3. Create a LiveReport page in project `VforIA` (done: page `spiketest`). Add the widget **"Branches Widget - Spike Tests"** (category *Branches Widget*) several times, one per test.
   In each instance, choose the **Test to run** parameter. A failing test only breaks its own instance.

Parameters: *Link roles* (default `duplicates,branched_from,derived_from`), *Max rows to display*, *Max work items to scan* (V4).

### Tests

| Test | Checks | Report |
|---|---|---|
| **V1 Environment** | Context objects, class names, project location, introspection of `$widgetContext` | Screenshot / copy of the table and the method list |
| **V2 Documents** | `searchBySql` (Rendering API) and `sqlSearch` (Open API) on `module`; which `IModule` getters work; `getValue("branchedFrom")`, `getValue("derivedFrom")`, `getValue("derivedFromLinkRole")`; prototype field names | Counts, timings, which columns are empty, field name list |
| **V3a SQL DISTINCT** | Is `SELECT DISTINCT` accepted by the SQL firewall? | Accepted / error message |
| **V3b SQL GROUP BY** | Are `GROUP BY ... HAVING COUNT(DISTINCT ...)` accepted? | Accepted / error message |
| **V4 Link scan** | Candidate data algorithm: SQL returns the link-source items, then Velocity groups them per document pair. **Timing on the real project size** | SQL time, scan time, pair list. This is the ground truth for document pairs: compare it with the expected relations in §0 |
| **V5a include** | Does `#include("resources/spike.txt")` find the widget resource? | Shows `INCLUDE-OK` or error |
| **V5b parse** | Does `#parse("resources/spike.vm")` find the widget resource? | Shows `PARSE-OK` or error |
| **V5c resource URL** | Can the browser load `resources/spike.js` through the SVN `/repo` URL? | HTTP status per URL |
| **V6 JavaScript** | Do inline scripts run? Can SVG be serialised and turned into a PNG (canvas, blob URLs, CSP)? | OK/FAIL lines; try the two download links |
| **V7 PDF** | Export the page to **PDF** (and print preview): flags, static SVG, HTML fallback | Attach the PDF or a screenshot |

Suggested order: V2, then V3a/V3b, V4, V5a–c, V6, V7.

For V4, the expected pairs on `VforIA` are the A2 table above, with counts (e.g. `SRS_Test_Reuse_TestB | duplicates |
SRS_Test`, `SRS_Test_Copy_of_B_TestE | duplicates | SRS_Test_Reuse_TestB`, `SRS_Test_Branch_Test_C | branched_from |
SRS_Test` with 2 items, `SRS_Test_TestD_Derived | derived_from | SRS_Test`). Then copy the page to the **large project**
(≈100 docs / 20k items) and report the timings there. If it takes too long, lower *Max work items to scan* and report the scanned count + time.

If any test shows a Velocity error, copy the message from the widget, or from the log
`[POLARION_HOME]/data/logs/main/log4j-*.log`.

---

## Results so far

| Test | Date | Result |
|---|---|---|
| A1 | 2026-10-27 | ✅ Columns confirmed (see A1 above). `docs/A1_FullDBSchema.pdf` |
| A2 Q1/Q2 | 2026-10-27 | ✅ **Exactly as expected: links point from the copy/branch/derived item (link source) to the original (link target).** Cross-document joins on `struct_workitem_linkedworkitems` + `workitem.fk_uri_module` are accepted by the tracker. Counts: `duplicates`: B 6 → A 6, E 6 → B 6; `branched_from`: C 2 (only the overwritten items VIA-522/523) → A (VIA-509/512); `derived_from`: D 6 → A 6. F and G appear nowhere. Each document's title/heading item (e.g. VIA-514 "SRS_Test") is linked too. Exports: `docs/A2_Q1_results_*.xlsx`, `docs/A2_Q2_results_*.xlsx` |
| A2 Q3/Q4 | 2026-10-27 | ✅ **Document metadata confirmed.** `fk_uri_branchedfrom` is set on both branches: `SRS_Test_Branch_Test_C` (its 2 overwritten items + its own title heading VIA-521) **and `SRS_Test_F_nooverwrite`** (its own title heading VIA-536), so F *is* detectable through metadata. `fk_uri_derivedfrom` is set only on `SRS_Test_TestD_Derived` (6 items). The copies B and E carry **neither** field, so copies can be detected only through `duplicates` links. Note: a branch's own title heading is new and not linked; in copies and derived documents the heading is linked like the other items. Exports: `docs/A2_Q3_results.xlsx`, `docs/A2_Q4_results.xlsx` |
| A2 Q5 | 2026-10-27 | ✅ `SELECT DISTINCT` and `GROUP BY … HAVING COUNT(*)` are both accepted by the tracker SQL. Both return the same 20 items = all link sources of the 3 roles (B 6, C 2, D 6, E 6). Exports: `docs/A2_Q5_*.xlsx` |
| A2 Q6 | 2026-10-27 | ✅ `module.c_id` and `module.c_modulename` both hold the document name (`SRS_Test`); both queries return its 6 items. Exports: `docs/A2_Q6_*.xlsx` |
| V1 | 2026-10-27 | ✅ Runs. Polarion ALM 2512. `$widgetContext` = `RichPageWidgetRenderingContextImpl`, `$transaction` = `ReadOnlyTransactionImpl`, `$transaction.objects()` = `ProxyModelObjects`; `$trackerService`/`getDataService()` are proxies. `$date.systemTime` works. Reflection method listing is blocked (empty), as the guide says. In PDF export `isPdf` = true. `docs/SpikeTest_Results_Widget_27-10-1116.pdf` |

## Results template (copy into your answer)

```
A3 R1 JSON (B, C, D, F):
A3 R2 JSON (one item each in B, C, D):
V2 (counts, timings, working getters, field names, branchedFrom/derivedFrom values):
V3a / V3b:
V4 (VforIA + large project: SQL ms, scan ms, items, pairs):
V5a / V5b / V5c:
V6:
V7:
```
