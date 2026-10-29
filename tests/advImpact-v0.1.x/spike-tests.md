# Spike plan — advImpact (multi-level impact analysis)

**Status:** diagnostic widget ready (`spike-widget/aiSpike.zip`), checked with Velocity 1.4 on mocks only; **nothing run on
2512 yet**. Results go into the "Result" column below, into `widgets/advImpact/SPECIFICATION.md` and into the CLAUDE.md
"Verified" notes. The mocks are aligned with a result only once it is known.

## Questions

| ID | Question | Why it matters | Test | Result |
|---|---|---|---|---|
| I1 | Does `sqlSearch` accept one query for several levels: `WITH RECURSIVE` (expected refused: guide §7.1 allows a single `SELECT`), a self-join of the link table, nested `IN` sub-selects (one per level, union of the levels)? | One query per direction instead of N | `sql` | open |
| I2 | Level by level in SQL: frontier ids in `IN (...)` lists of at most 500, one query per chunk, level and direction. Time per level, largest frontier | Default design | `bfs` mode `sql` | open |
| I3 | Level by level with the Open API: `getLinkedWorkItemsStructsDirect()` (upstream) and `getLinkedWorkItemsStructsBack()` (downstream) per frontier item. Does `Back` exist on 2512, does its `getLinkedItem()` return the **source** item? Same counts as mode `sql`? | No SQL at all; parents and roles for free | `bfs` mode `api` (probe table) | open |
| I4 | Start items: a) all items of the document by SQL; b) the user's Lucene query restricted to the document with `document.id:"space/name"` (`_default` space omitted) or with an `SQL:(…)` clause, through `trackerService.queryWorkItems(query, "id")` | Start subset (F2, Q1) | `start` | open |
| I5 | Inherited links of copies (spike R2) and cycles: the visited set counts each item once, at its lowest level | Correct levels | `bfs` (column "rows already visited") | open |
| I6 | Times for 3 and 7 levels, directions down, up and both, on `EOLE_AI_MCP_TESTS` (120 docs) and on a large project | Level cap (Q6), item cap per level (Q11) | `bfs` | open |
| I7 | Page model size: parent links per reached item, and all links of the selected roles between reached items (needed for the viewer toggles, SPEC §6.2), with the time of that scan | Size caps | `bfs` with paths `yes` | open |
| I8 | Lucene `linkedWorkItemsOf` (2506+, guide §6.4) with the start document as `SQL:(…)` filter, `follows` = roles, `steps` = levels: does it run, which direction does it follow, does it return levels 1..N or only N, are the start items returned? | One query for all levels | `lucene` | open |

Answered by the dev guide, not tested: widget SQL (`sqlSearch`, `searchBySql`) returns objects, not rows (guide §7.2), so the
parent and role of a reached item come from the Open API links, not from SQL columns. A work item selector parameter (I4 c in
the first plan) belongs to the in-widget picker of a later version (Q1).

## Setup

1. Upload `spike-widget/aiSpike.zip` (**Administration -> Documents and Pages -> Velocity Widgets -> Upload**). The widget is
   **Advanced Impact - Spike** (read-only, restricted). Add one instance per test to a LiveReport page of a project with a
   few linked documents (e.g. `VforIA` or `EOLE_AI_MCP_TESTS`). In its parameters choose the test, the **start document**
   (single select), the **link roles**, and the direction / levels.
2. An exception stops the render of the widget: **the error text is the finding**, copy it.
3. The mocks (`tools/vtest/aiSpike/`) only prove the template logic. They answer the generated SQL with a small interpreter and
   know nothing about Polarion SQL, Lucene, `getLinkedWorkItemsStructsBack` or `queryWorkItems`: those are the assumptions
   under test.

## Runs and what to report

| Run | Settings | Report |
|---|---|---|
| **I1** `sql` | SQL variant `rec`, then `join3`, then `nested` (direction down, then up; levels 3), optionally `custom` | Per variant: ran or error text, count, times, documents |
| **I8** `lucene` | Levels 1, then 3; roles as for `bfs` | Ran or error text, count, of which in the start document, documents, times. If the `SQL:(…)` filter is refused, try the parameter "Custom Lucene" (e.g. `project.id:<P> AND linkedWorkItemsOf:([{"filter":"id:<ID>","follows":["<role>"],"steps":1}])` with a known item id) |
| **I4** `start` | Work item query, e.g. `type:requirement`, then a status, then a text | Counts and times of a) and of both b): in the document / outside (expected 0) |
| **I2/I5/I6/I7** `bfs` mode `sql` | Direction down, up, both; levels 3 then 7; paths yes, then no (time without the scans) | Level table (frontier, queries, new items, rows already visited, times), total time, document table, page model estimate |
| **I3** `bfs` mode `api` | Same settings | Same; the probe table (Direct / Back: role, linked item); do the counts per level equal those of mode `sql`? Red warning if `Back` is missing |
| Start subset | `bfs` with "Start items" = `docid` or `sqlscope` (whichever worked in I4) | Level table from the subset |

Sizes to try on a large project: a start document with many linked items, levels 3 and 7, down and up. Send the pages as text
or screenshots in the chat; raw exports are not committed (CLAUDE.md).
