# Spike tests — run on the Polarion 2512 instance

Goal: settle the technical risks in `SPECIFICATION.md` §9 (R1–R5) before building the widget.
Two parts:

- **Part A**: raw SQL in a PostgreSQL client (pgAdmin, DBeaver, psql) against the Polarion database.
  It shows the schema and the "ground truth" relations.
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

## Part A — SQL in a database client

Polarion tables live in the `polarion` schema. Run `SET search_path TO polarion;` first, or prefix the
table names with `polarion.`.

### A0 — Does the DB keep history rows?

```sql
SELECT COUNT(*) AS rows_total, COUNT(DISTINCT c_uri) AS distinct_items
FROM workitem
```
If the two numbers differ, the database holds several revisions per object. Report this, because counts need de-duplication then.

### A1 — Columns of the `module` (document) table

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'polarion' AND table_name = 'module'
ORDER BY ordinal_position
```
Looking for: `fk_uri_branchedfrom`, `fk_uri_derivedfrom`, `c_derivedfromlinkrole`, and the space/name columns
(e.g. `c_modulefolder`, `c_modulename`).

### A2 — Columns of `workitem` and of the link table

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'polarion'
  AND table_name IN ('workitem', 'struct_workitem_linkedworkitems', 'rel_module_workitem')
  AND (table_name <> 'workitem' OR column_name LIKE '%module%' OR column_name IN ('c_uri', 'c_id', 'fk_uri_project'))
ORDER BY table_name, ordinal_position
```

### A3 — Documents with their branched-from / derived-from metadata

```sql
SELECT m.c_uri, m.c_id AS document, m.c_title,
       b.c_id AS branched_from, d.c_id AS derived_from, m.c_derivedfromlinkrole
FROM module m
INNER JOIN project p ON p.c_uri = m.fk_uri_project
LEFT JOIN module b ON b.c_uri = m.fk_uri_branchedfrom
LEFT JOIN module d ON d.c_uri = m.fk_uri_derivedfrom
WHERE p.c_id = 'MYPROJECT'
  AND m.c_deleted IS NOT TRUE
ORDER BY m.c_id
```
If a column does not exist (see A1), remove it and report the error.

### A4 — Link roles used in the project, and whether they cross documents

```sql
SELECT l.c_role,
       CASE WHEN ws.fk_uri_module IS NULL OR wt.fk_uri_module IS NULL THEN 'item outside any document'
            WHEN ws.fk_uri_module = wt.fk_uri_module THEN 'same document'
            ELSE 'cross document' END AS scope,
       COUNT(*) AS links
FROM struct_workitem_linkedworkitems l
INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem
INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem
INNER JOIN project p ON p.c_uri = ws.fk_uri_project
WHERE p.c_id = 'MYPROJECT'
  AND l.c_deleted IS NOT TRUE
GROUP BY 1, 2
ORDER BY 1, 2
```

### A5 — Document pairs (core of the widget): ground truth

```sql
SELECT ms.c_id AS link_source_document,
       l.c_role,
       mt.c_id AS link_target_document,
       COUNT(DISTINCT ws.c_uri) AS linked_source_items,
       (SELECT COUNT(*) FROM workitem w WHERE w.fk_uri_module = ms.c_uri AND w.c_deleted IS NOT TRUE) AS source_doc_items,
       (SELECT COUNT(*) FROM workitem w WHERE w.fk_uri_module = mt.c_uri AND w.c_deleted IS NOT TRUE) AS target_doc_items
FROM struct_workitem_linkedworkitems l
INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem
INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem
INNER JOIN module ms ON ms.c_uri = ws.fk_uri_module
INNER JOIN module mt ON mt.c_uri = wt.fk_uri_module
INNER JOIN project p ON p.c_uri = ws.fk_uri_project
WHERE p.c_id = 'MYPROJECT'
  AND l.c_role IN ('duplicates', 'branched_from', 'derived_from')
  AND l.c_deleted IS NOT TRUE
  AND ms.c_uri <> mt.c_uri
GROUP BY ms.c_uri, ms.c_id, l.c_role, mt.c_uri, mt.c_id
ORDER BY ms.c_id, l.c_role, mt.c_id
```
Please also report the **execution time** on the real (large) project, not only the test project.

### A6 — Link direction (sample rows)

```sql
SELECT ws.c_id AS source_item, ms.c_id AS source_document,
       l.c_role,
       wt.c_id AS target_item, mt.c_id AS target_document
FROM struct_workitem_linkedworkitems l
INNER JOIN workitem ws ON ws.c_uri = l.fk_uri_p_workitem
INNER JOIN workitem wt ON wt.c_uri = l.fk_uri_workitem
INNER JOIN module ms ON ms.c_uri = ws.fk_uri_module
INNER JOIN module mt ON mt.c_uri = wt.fk_uri_module
INNER JOIN project p ON p.c_uri = ws.fk_uri_project
WHERE p.c_id = 'MYPROJECT'
  AND l.c_role IN ('duplicates', 'branched_from', 'derived_from')
  AND l.c_deleted IS NOT TRUE
  AND ms.c_uri <> mt.c_uri
ORDER BY l.c_role, ms.c_id
LIMIT 30
```
With the test set from §0 we expect, for example, `source_document = B` (the copy) → `target_document = A` (the original).
Please confirm or correct this for each role.

### A7 — Contained vs referenced items per document

```sql
SELECT m.c_id AS document,
       (SELECT COUNT(*) FROM workitem w WHERE w.fk_uri_module = m.c_uri AND w.c_deleted IS NOT TRUE) AS contained_items,
       (SELECT COUNT(*) FROM rel_module_workitem r WHERE r.fk_uri_module = m.c_uri) AS rel_module_rows
FROM module m
INNER JOIN project p ON p.c_uri = m.fk_uri_project
WHERE p.c_id = 'MYPROJECT'
  AND m.c_deleted IS NOT TRUE
ORDER BY m.c_id
```
This shows how branched documents store items that were *not* overwritten (referenced items). Branch `F` from §0
may have no links at all, so it can only be detected through metadata (A3).

---

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
| **V4 Link scan** | Candidate data algorithm: SQL returns the link-source items, then Velocity groups them per document pair. **Timing on the real project size** | SQL time, scan time, pair list. Compare with A5 |
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
A0 rows_total / distinct_items:
A1 module columns (branched/derived/space/name):
A2 notes:
A3 metadata correct for B, C, D, E, F? :
A4 roles / scopes:
A5 pairs as expected? execution time (large project):
A6 direction per role (copy -> original?):
A7 notes on referenced items:
V1:
V2 (counts, timings, working getters, field names):
V3a / V3b:
V4 (test project + large project: SQL ms, scan ms, items):
V5a / V5b / V5c:
V6:
V7:
```
