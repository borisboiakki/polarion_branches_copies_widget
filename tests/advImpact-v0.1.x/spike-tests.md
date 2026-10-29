# Spike plan — advImpact (multi-level impact analysis)

**Status:** diagnostic widget ready (`spike-widget/aiSpike.zip`), checked with Velocity 1.4 on mocks only; **nothing run on 2512 yet**. Results go into the table below and into CLAUDE.md "Verified" notes.
Mocks for the harness are extended only after a result is known.

| ID | Question | Why it matters | Result |
|---|---|---|---|
| I1 | Does `sqlSearch` accept `WITH RECURSIVE` / a self-join chain of `struct_workitem_linkedworkitems` (level 1..7 in one query)? | One query instead of 7 round trips; probably refused by the tracker SQL, then use BFS (I2) | open |
| I2 | Level-by-level BFS: the frontier of work item URIs as an `IN (...)` list (or a join on a subquery of the previous level). Maximum frontier size accepted, time per level on 20k items | The BFS design depends on it | open |
| I3 | Both directions: `fk_uri_workitem = frontier` (items linking to mine) and `fk_uri_p_workitem = frontier` (items I link to), one query with `OR` or two queries; are the 2512 columns the same for all roles? | Direction toggle | open |
| I4 | Start items: (a) all items of the start document (`WORKITEM.FK_URI_MODULE`), (b) a Lucene/SQL query parameter, (c) a work item selector (`@workitem`?) if the parameter factory has one. What does the PO's 2512 offer? | Subset selection UI | open |
| I5 | Transitive/inherited links (copy of a copy, spike R2): do they inflate the levels? Cycle guard (visited set) cost | Correct level counts | open |
| I6 | Timing and page-model size for 3 and 7 levels on `EOLE_AI_MCP_TESTS` (120 docs) and on a 20k-item project, both directions | Decide cap of levels, items per page model | open |
| I7 | Item-level path (item -> item -> item) storage: can the page model carry parent item per reached item without exceeding the size budget (guide §11.5)? | Excel trace export, details | open |

I4 narrowed by the PO (Q1): v1 uses a work item query parameter restricted to the start document; test how to apply it (Lucene `sqlSearch` vs `getWorkItemsByQuery`) and combine with the document filter.

## Setup

1. Upload `spike-widget/aiSpike.zip` (**Administration -> Documents and Pages -> Velocity Widgets -> Upload**). The widget is
   **Advanced Impact - Spike** (read-only, restricted). Add one instance per test to a LiveReport page of a project with a
   few linked documents (e.g. `VforIA` or `EOLE_AI_MCP_TESTS`); choose in its parameters the test, the **start document**
   (one `@document`), the **link roles**, and the direction / levels. An exception stops the render: **the error text is the
   finding**, copy it.
2. The mocks (`tools/vtest/aiSpike/`) only prove the template logic. They answer the generated SQL with a small interpreter and
   know nothing about Polarion SQL, `getLinkedWorkItemsStructsBack` or `queryWorkItems`: those are exactly the assumptions to verify.

## Tests and what to report

| Test (parameter "Test to run") | Settings | Report |
|---|---|---|
| **I1/I3** `sql` | SQL variant `rec` (WITH RECURSIVE), then `join3` (self-join, 3 hops), then `nested` (nested IN sub-selects, levels and direction as set), then `custom` | Per variant: ran or error text, work item count, times. `nested` is the candidate for one query per direction; compare its count with `bfs` for the same levels |
| **I4** `start` | Start items: the query text (e.g. `type:requirement`) | Count and time of a) SQL all items and b) `trackerService.queryWorkItems(query, "id")`: ran or error, counts in/out of the document. Try 1-2 other queries (a status, a text) |
| **I2/I6** `bfs`, mode `sql` | Direction down, up, both; levels 3 then 7; paths yes and no | Level table (frontier, queries, new items, times), total time, document table, edge count and characters (page model, I7); stop by the cap if reached |
| **I3** `bfs`, mode `api` | Same settings | Same table; the API probe: are `getLinkedWorkItemsStructsBack()` and `Direct` there, what does `getLinkedItem()` give on a Back link (the source item?). Do the counts agree with mode `sql`? |
| **I5** `bfs` | A start document that has copies (copy of a copy, spike R2) and the role `duplicates` | The column "rows already visited": inherited links and cycles are skipped, level counts correct |
| **I8** `cols1`, `cols2` | Custom SQL, e.g. `select l.fk_uri_p_workitem, l.fk_uri_workitem, l.c_role from struct_workitem_linkedworkitems l` | What the elements are (work items, rows, error). If rows with columns work, parents of reached items can come from one SQL |

Sizes to try on a large project: fan-out of the start document (items / links), then levels 3 and 7 down and up. Send the pages
as text or screenshots in the chat; raw exports are not committed (CLAUDE.md).

## Added tests

| ID | Question | Why it matters | Result |
|---|---|---|---|
| I8 | Does `$ds.sqlSearch` or `$transaction.objects().searchBySql` return rows with several columns (link source, target, role), outside a collection? | Parents and roles of reached items from SQL, without scanning the objects | open |
