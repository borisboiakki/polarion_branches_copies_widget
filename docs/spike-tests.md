# Spike tests — run on the Polarion 2512 instance

Goal: settle the technical risks in `SPECIFICATION.md` §9 (R1–R5) before building the widget.
Two parts:

- **Part A**: no direct database access is needed. Use the DB schema docs on your server, `SQL:(...)` queries in the
  Work Items tracker search, and a few REST calls to check the schema, link roles, direction and document metadata.
- **Part B**: the `bwSpike` test widget on a LiveReport page. It tests what Velocity/Polarion actually allows.

All queries and the widget are **read-only** (`SELECT` only).

---

## 0. Prepare a small test set (recommended)

In a **test project**, create documents with known relations so the results can be checked:

| Doc | How to create it | Expected relation |
|---|---|---|
| `A` | New document with ~5 work items | — |
| `B` | Reuse/copy of `A` | copy (`duplicates`) A → B |
| `C` | Branch of `A`, then **overwrite 2 items** | branch (`branched_from`) A → C |
| `D` | Reuse of `A` **with derivation option** | derived (`derived_from`) A → D |
| `E` | Copy of `B` | copy B → E (copy of a copy) |
| `F` | Branch of `A` with **no overwritten item** | branch A → F (metadata only?) |
| `G` | Unrelated document | none |

Write down the IDs and the space of each document. In the queries below, replace `MYPROJECT` with the project ID.
Project IDs are case-sensitive.

---

## Part A — Schema, tracker SQL and REST (no direct DB access needed)

Replace `MYPROJECT` with the project ID (case-sensitive), and `MYHOST` with your server.

### A1 — Database schema docs on your server (replaces the old information_schema queries)

Open `https://MYHOST/polarion/sdk/doc/database/TablesReferenceDetails.html` (or `FullDBSchema.pdf` in the same folder).
In table **MODULE**, check whether these columns exist and note the exact names:
`FK_URI_BRANCHEDFROM`, `FK_URI_DERIVEDFROM`, `C_DERIVEDFROMLINKROLE`, and the columns for the document's space and name
(e.g. `C_MODULEFOLDER`, `C_MODULENAME`). Also check that **WORKITEM** has `FK_URI_MODULE`.

### A2 — Tracker SQL queries

In **Work Items** (tracker table view), paste each query into the search bar. Add the **Document** column to the table so
you can see which document each item belongs to. A tracker `SQL:(...)` query must return work item URIs (`c_uri`), so
each query returns work items, not documents.

Each query also tests the SQL firewall: an error means a construct (a join, a column) is rejected or doesn't exist.

**Q1 — items that are the link SOURCE of a cross-document `duplicates` link**

```
SQL:(SELECT ws.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'MYPROJECT' AND l.c_role = 'duplicates' AND ws.fk_uri_module <> wt.fk_uri_module)
```

**Q2 — items that are the link TARGET of a cross-document `duplicates` link**

```
SQL:(SELECT wt.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'MYPROJECT' AND l.c_role = 'duplicates' AND ws.fk_uri_module <> wt.fk_uri_module)
```

Run Q1 and Q2 again with `'branched_from'` and then `'derived_from'` in place of `'duplicates'`.
With the test set, if links point from the copy to the original, Q1 lists items of the copies
(B, E for `duplicates`; C for `branched_from`; D for `derived_from`) and Q2 lists items of the originals (A, B).
Please report the **documents** that appear in each result.

**Q3 — items contained in documents that have "branched from" metadata** (tests that the column exists)

```
SQL:(SELECT w.c_uri FROM workitem w INNER JOIN module m ON m.c_uri = w.fk_uri_module INNER JOIN project p ON p.c_uri = m.fk_uri_project WHERE p.c_id = 'MYPROJECT' AND m.fk_uri_branchedfrom IS NOT NULL)
```

**Q4 — same for "derived from" metadata**

```
SQL:(SELECT w.c_uri FROM workitem w INNER JOIN module m ON m.c_uri = w.fk_uri_module INNER JOIN project p ON p.c_uri = m.fk_uri_project WHERE p.c_id = 'MYPROJECT' AND m.fk_uri_derivedfrom IS NOT NULL)
```

Expected: Q3 lists items of C (and of F, if F contains any items of its own). Q4 lists items of D. Copies (B, E) should
not appear in either. If they do, copies also carry metadata.

**Q5 — firewall check: `DISTINCT` and `GROUP BY`**

```
SQL:(SELECT DISTINCT ws.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'MYPROJECT' AND l.c_role IN ('duplicates', 'branched_from', 'derived_from'))
```
```
SQL:(SELECT ws.c_uri FROM struct_workitem_linkedworkitems l INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem INNER JOIN project p ON p.c_uri = ws.fk_uri_project WHERE p.c_id = 'MYPROJECT' AND l.c_role IN ('duplicates', 'branched_from', 'derived_from') GROUP BY ws.c_uri HAVING COUNT(*) >= 1)
```

### A3 — REST calls (document metadata and link direction)

Use your REST token (Postman, curl or similar). The base URL is `https://MYHOST/polarion/rest/v1`.
The space of the default folder is `_default`. URL-encode document names that contain spaces (`%20`).

**R1 — full document resource for the copy (B), the branch (C) and the derived document (D)**

```
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "https://MYHOST/polarion/rest/v1/projects/MYPROJECT/spaces/SPACE/documents/DOCNAME?fields%5Bdocuments%5D=@all"
```
Looking for relationships or attributes such as `branchedFrom`, `derivedFrom`, `derivedFromLinkRole`, `variant`.
Please paste the JSON responses. Remove anything confidential first; only the structure and IDs matter.

**R2 — links of one item in B, one in C and one in D**

```
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "https://MYHOST/polarion/rest/v1/projects/MYPROJECT/workitems/ITEMID/linkedworkitems?fields%5Blinkedworkitems%5D=@all"
```
This shows the role and the direction of each link, as seen from that item.

## Part B — `bwSpike` test widget in Polarion

### Install

The templates are parser-checked with Velocity 1.4 (`tools/vcheck.sh`), which matches the 2512 instance.

1. Download `spike/bwSpike.zip` from this repository (or zip the `spike/bwSpike` folder yourself; the folder must be at the root of the zip).
2. Go to **Administration → Documents and Pages → Velocity Widgets → Upload**. Use the scope of the **test project**.
3. Create a LiveReport page in the test project. Add the widget **"Branches Widget - Spike Tests"** (category *Branches Widget*) several times, one per test.
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

For V4, run it first on the test project, then copy the page to the **large project** (≈100 docs / 20k items)
and report the timings there. If it takes too long, lower *Max work items to scan* and report the scanned count + time.

If any test shows a Velocity error, copy the message from the widget, or from the log
`[POLARION_HOME]/data/logs/main/log4j-*.log`.

---

## Results template (copy into your answer)

```
Polarion version: 2512 (build ...)
Test set: document IDs/space for A, B, C, D, E, F, G:
A1 MODULE columns (branched/derived/space/name), WORKITEM.FK_URI_MODULE:
A2 Q1/Q2 documents per role (duplicates, branched_from, derived_from):
A2 Q3 / Q4 documents:
A2 Q5 DISTINCT / GROUP BY accepted?:
A3 R1 JSON (B, C, D):
A3 R2 JSON (one item each in B, C, D):
V1:
V2 (counts, timings, working getters, field names):
V3a / V3b:
V4 (test project + large project: SQL ms, scan ms, items):
V5a / V5b / V5c:
V6:
V7:
```
