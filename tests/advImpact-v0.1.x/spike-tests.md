# Spike plan — advImpact (multi-level impact analysis)

**Status:** run 1 and part A (with its redo) **done** on 2512 (2026-10-29, project `EOLE_AI_MCP_TESTS`, small test set, see
"Findings"); next: parts B and C of the run sheet. Results go into the "Result" column below, into `widgets/advImpact/SPECIFICATION.md` and into the CLAUDE.md
"Verified" notes. The mocks are aligned with a result only once it is known.

## Questions

| ID | Question | Why it matters | Test | Result |
|---|---|---|---|---|
| I1 | Does `sqlSearch` accept one query for several levels: `WITH RECURSIVE` (expected refused: guide §7.1 allows a single `SELECT`), a self-join of the link table, nested `IN` sub-selects (one per level, union of the levels)? | One query per direction instead of N | `sql` | **All run on 2512.** `WITH RECURSIVE` is **accepted** (contrary to the expectation from guide 7.1): 8 items down, same as `bfs`. `join3` runs. `nested` runs down (run 1) and up (A3: 2 items, same as `bfs` up). Recursive up: A1b |
| I2 | Level by level in SQL: frontier ids in `IN (...)` lists of at most 500, one query per chunk, level and direction. Time per level, largest frontier | Default design | `bfs` mode `sql` | run 1 (down, 3 levels, 6 start items): **runs**, 1 query per level, new items 5 / 2 / 0, a few ms per level. Large set: to run |
| I3 | Level by level with the Open API: `getLinkedWorkItemsStructsDirect()` (upstream) and `getLinkedWorkItemsStructsBack()` (downstream) per frontier item. Does `Back` exist on 2512, does its `getLinkedItem()` return the **source** item? Same counts as mode `sql`? | No SQL at all; parents and roles for free | `bfs` mode `api` (probe table) | **Answered.** `getLinkedWorkItemsStructsBack()` exists, its `getLinkedItem()` is the **source** item (`LinkedWorkItemStruct`, role id readable). Mode api gives the same items per level as SQL, down (A9: 5 / 3 / 0) and both (A10 = A8: 9 items) |
| I4 | Start items: a) all items of the document by SQL; b) the user's Lucene query restricted to the document with `document.id:"space/name"` (`_default` space omitted) or with an `SQL:(…)` clause, through `trackerService.queryWorkItems(query, "id")` | Start subset (F2, Q1) | `start` | **Answered.** Both forms work and agree: `type:stakeholderrequirement AND (status:in_analysis)` gave 4 of the 6 items with `document.id:"CustomerSpecSpike"` and with `SQL:(…)`, 0 outside the document (A6); `bfs` from that subset works (A11) |
| I5 | Inherited links of copies (spike R2) and cycles: the visited set counts each item once, at its lowest level | Correct levels | `bfs` (column "rows already visited") | B1 (`VforIA`, `duplicates`, down from SRS_Test): **as expected**. Level 1: 10 items (5 of the copy, 5 of the copy of a copy through its inherited links); level 2: 0 new, 5 rows already visited (the copy of a copy also links to the copy); 18 items, 15 links between them. Note: through the inherited links the copy of a copy is at **level 1**, not 2. B2: to run |
| I9 | Direction "both" = a pure downstream and a pure upstream traversal, combined (PO, Q12): time of the two passes, combined documents | "Both" costs two analyses | `bfs` direction both | A8 (SystemSpec_1, sql): down 3 items (TestSpec1, subSysSpec1, subSysSpec2), up 2 (CustomerSpecSpike), **SystemSpec_2 not reached** (Q12 behaviour confirmed), 9 items in total, 8 ms. Times on the large set: part C |
| I6 | Times for 3 and 7 levels, directions down, up and both, on `EOLE_AI_MCP_TESTS` (120 docs) and on a large project | Level cap (Q6), item cap per level (Q11) | `bfs` | open |
| I7 | Page model size: parent links per reached item, and all links of the selected roles between reached items (needed for the viewer toggles, SPEC §6.2), with the time of that scan | Size caps | `bfs` with paths `yes` | run 1: 9 parent links (305 characters), 9 links between the 13 reached items (269 characters); one item with 2 parents. Large set: to run |
| I8 | Lucene `linkedWorkItemsOf` (2506+, guide §6.4) with the start document as `SQL:(…)` filter, `follows` = roles, `steps` = levels: does it run, which direction does it follow, does it return levels 1..N or only N, are the start items returned? | One query for all levels | `lucene` | **Answered.** Runs (3 ms); returns levels **1..steps** together (steps 1 = 5 items = level 1; steps 3 = levels 1..3), never the start items; follows **incoming links only** (= downstream): from TestSpec1, which nothing links to, 0 items (A5). No upstream variant |

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

## Findings of run 1 (2026-10-29, `EOLE_AI_MCP_TESTS`)

Start document `CustomerSpecSpike` (6 items without headings), roles `satisfies` + `verifies`, direction down, 3 levels.
Test set seen in the results: `SystemSpec_1` (2 items) and `SystemSpec_2` (3) satisfy the customer specification (level 1);
`TestSpec1` (1, `verifies`) and `subSysSpec1` (1, `satisfies`) link to the system specifications (level 2); nothing at level 3.

| Test | Result |
|---|---|
| `sql` nested | Ran. 7 items, documents as below |
| `lucene` | Ran (`linkedWorkItemsOf` with an `SQL:(…)` filter is accepted). 7 items, 0 in the start document |
| `start` | a) 6. b) `docid` and `sqlscope` both ran, 0 items (the query matched nothing) |
| `bfs` sql down | Levels: 6 start, 5 new, 2 new, 0 new; 1 query per level; 13 items reached; 9 parent links = 9 links between reached items |

The three methods give the **same 7 items and documents**. On this small set everything takes a few ms: the times that
decide the design come from the large set (run sheet, part C).

## Findings of part A (2026-10-29, `EOLE_AI_MCP_TESTS`, a document `subSysSpec2` added downstream since run 1)

Roles `satisfies` + `verifies`. Downstream from CustomerSpecSpike there are now 8 items: level 1 SystemSpec_1 (2) and
SystemSpec_2 (3); level 2 TestSpec1, subSysSpec1, subSysSpec2 (1 each).

| # | Result | OK? |
|---|---|---|
| A1 `rec` (down) | **Ran**: 8 items, the 5 documents above, 15 ms. `WITH RECURSIVE` is accepted by `sqlSearch` on 2512 | yes |
| A2 `join3` | Ran: 1 item (subSysSpec2), i.e. an item at the end of a 3-link path; `bfs` has it at level 2 (a shorter path exists) and counts the longer path in "rows already visited" at level 3 (A9) | yes |
| A3 `nested` up from TestSpec1 | 2 items: SystemSpec_1, CustomerSpecSpike | yes |
| A4 `lucene` steps 1 | 5 items = level 1 only | yes |
| A5 `lucene` from TestSpec1 | 0 items: linkedWorkItemsOf follows incoming links only (downstream) | yes |
| A6 `start` | First query matched nothing. Redo with `type:stakeholderrequirement AND status:in_analysis`: a) 6, b) docid 4, sqlscope 4, 0 outside | yes (redo) |
| A7 `bfs` up from TestSpec1 | 3 start items; level 1: 1 (SystemSpec_1), level 2: 1 (CustomerSpecSpike), level 3: 0. Same as A3 | yes |
| A8 `bfs` both from SystemSpec_1 | Down 3, up 2, SystemSpec_2 not reached, 9 items, 11 parent links, 12 links between reached items | yes |
| A9 `bfs` api, both, from CustomerSpecSpike | Down 5 / 3 / 0 (same as SQL and `rec`), up 0 (nothing above the customer specification). Probe: Back links = `LinkedWorkItemStruct`, role `satisfies`, linked item = the SystemSpec item (source); a Direct `parent` link is ignored (role not selected) | yes |
| A1b `rec` up from TestSpec1 | 2 items: CustomerSpecSpike, SystemSpec_1 (= A3, A7). Recursive SQL works in both directions | yes (redo) |
| A10 `bfs` api, both, from SystemSpec_1 | Down 3 / 0, up 2 / 0: the same 9 items and 4 documents as A8 (mode sql) | yes (redo) |
| A11 `bfs` api, both, start items `docid` (query of A6) | 4 start items; down: level 1 4 items (SystemSpec_2 3, SystemSpec_1 1), level 2 3 items (TestSpec1, subSysSpec1, subSysSpec2); up: 0; 11 items in total | yes (redo) |
| A12 `bfs` api, both, paths no | Same levels as A9 (5 / 3 / 0); the all-links scan is skipped (0 links). In mode api the parent links are always recorded (they come with the traversal), "paths" only switches the all-links scan | yes (redo) |

Conclusions of part A: all four ways (SQL per level, recursive SQL, nested SQL, Open API per item) give the same items in both directions; Lucene
`linkedWorkItemsOf` gives the same downstream items in one query but cannot go upstream. The "rows already visited" of
mode api count **links** to known items, those of mode sql count **distinct items**, so the two columns differ (expected).

## Run sheet

Each line is **one widget instance** (several instances can share a page; an error stops only its own instance). Set the
parameters listed, keep the others at their default (direction down, levels 3, mode sql, paths yes, start items all, cap
5000, excluded types `heading`). Duration of a step = end stamp - start stamp (ms). Send the page (PDF or screenshots).

**Part A — small test set, project `EOLE_AI_MCP_TESTS`, roles `satisfies` + `verifies`** (the documents of run 1)

| # | Test | Start document | Other parameters | Expected / what it tells |
|---|---|---|---|---|
| A1 | `sql` | CustomerSpecSpike | SQL variant `rec` | Done: runs |
| A1b | `sql` | TestSpec1 | SQL variant `rec`, direction **up** (new in the spike widget: re-upload `aiSpike.zip`) | Same 2 items as A3 (SystemSpec_1, CustomerSpecSpike) |
| A2 | `sql` | CustomerSpecSpike | SQL variant `join3` | Ran or error; items exactly 3 hops away: expected 0 on this set |
| A3 | `sql` | TestSpec1 | SQL variant `nested`, direction **up** | Upstream in one query: expected the SystemSpec item(s) it verifies (level 1) and CustomerSpecSpike items (level 2) |
| A4 | `lucene` | CustomerSpecSpike | Levels **1** | Expected 5 (level 1 only) if `steps` limits the levels; 7 if it does not |
| A5 | `lucene` | TestSpec1 | Levels 3 | **Direction of linkedWorkItemsOf**: 0 or few items = it follows incoming links only (downstream, as run 1); SystemSpec / CustomerSpecSpike items = it also follows outgoing links |
| A6 | `start` | CustomerSpecSpike | Work item query = **`HAS_VALUE:title`** (every item has a title), then a narrower one: open one item of the document and use its type id as shown in the URL / Administration (e.g. `type:customerRequirement`), or `title:<a word of one title>` | `HAS_VALUE:title`: both b) = 6 (= a), 0 outside. Narrower: both b) the same count, < 6 |
| A7 | `bfs` | TestSpec1 | Direction **up** | Same items as A3, level by level |
| A8 | `bfs` | SystemSpec_1 | Direction **both** | Down: TestSpec1 / subSysSpec1 items linking to SystemSpec_1. Up: CustomerSpecSpike items. **SystemSpec_2 must not appear**: it is only a "sibling" through CustomerSpecSpike (Q12) |
| A9 | `bfs` | CustomerSpecSpike | Mode **api** | Same level table as run 1 (5 / 2 / 0). Probe table: Back links with role and linked item; is the linked item the **source** (a SystemSpec item)? No red warning |
| A10 | `bfs` | SystemSpec_1 | Mode **api**, direction **both**, start items **all** | Same 9 items and documents as A8 |
| A11 | `bfs` | CustomerSpecSpike | Start items `docid`, work item query = the **narrower query of A6** (one that gave > 0) | Level table starting from the subset (level 0 = A6 count) |
| A12 | `bfs` | CustomerSpecSpike | Paths **no**, start items **all** (not docid) | Same levels as A9 down (5 / 3 / 0); total time without the path scans |

Note on the parameter "Work item query": it is used only by the test `start` and when "Start items" is `docid` or
`sqlscope`. With "Start items" = `all` it is ignored. If a run shows **0 start items**, the query matches nothing.

**Part B — copies (I5), project `VforIA`, role `duplicates` only**

| # | Test | Start document | Other parameters | Expected |
|---|---|---|---|---|
| B1 (done) | `bfs` | SRS_Test | Direction down | Level 1: the items of the copies that link to SRS_Test, including the inherited links of the copy of a copy (spike R2); level 2: "rows already visited" > 0 (the copy of a copy also links to the first copy), no item counted twice |
| B2 | `bfs` | the copy of a copy (`SRS_Test_Copy_of_B_TestE`) | Direction up | Level 1: items of the first copy **and** of SRS_Test (inherited links); level 2: rows already visited, no new items |

**Part C — size and time (I6, I7, I9): the largest document chain you have** (a start document with many linked items,
roles of that chain). Note the number of start items. Run each line once; stop going up in levels when one run is slow.

| # | Test | Parameters | Report |
|---|---|---|---|
| C1 | `bfs` | Direction down, levels 3 | Level table, total time, page model estimate |
| C2 | `bfs` | Direction down, levels 7 | Same; red "Stopped" line if the cap of 5000 new items per level is reached |
| C3 | `bfs` | Direction up, levels 7 | Same |
| C4 | `bfs` | Direction both, levels 7 | Two blocks of rows, total time (= cost of "both") |
| C5 | `bfs` | Mode api, direction both, levels 7 | Compare the total time with C4 |
| C6 | `lucene` | Levels 7 (same roles) | Count and time against C2 (same items if A5 shows it is downstream only) |
| C7 | `sql` | `nested`, direction down, levels 7 | Count and time against C2 |
| C8 | `bfs` | As C4, paths no | Cost of the path and link scans (C4 - C8) |

If a run exceeds the page time limit, note the last settings that worked and the error.

Raw exports are not committed (CLAUDE.md): send them in the chat; only the findings are kept here.
