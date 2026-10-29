# Spike plan — advImpact (multi-level impact analysis)

**Status:** plan only, nothing run yet. Run on Polarion 2512 with a diagnostic widget `aiSpike/` (to be created in
`spike-widget/`, as `tests/docCoverage-v0.3.x/`). Results go into the table below and into CLAUDE.md "Verified" notes.
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
