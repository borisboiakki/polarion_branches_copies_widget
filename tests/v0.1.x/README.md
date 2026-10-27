# Tests and spike for release 0.1.x

Kept for reference. These files document how the technical choices of the widget were verified on Polarion 2512.
Later versions get their own folder (`tests/vN.N.x/`).

| Path | Content |
|---|---|
| `spike-tests.md` | Test plan (SQL queries, REST calls, widget tests) with the expected results and a table of the findings |
| `spike-widget/bwSpike/` | Diagnostic widget used for the V tests (sources) |
| `spike-widget/bwSpike.zip` | Its upload package. Rebuild after editing the sources (folder `bwSpike/` at the zip root, Deflated) |

Test data: project `VforIA` (documents `SRS_Test` and its copies/branches) and the larger project `EOLE_AI_MCP_TESTS`.
Open checks for the released widget are tracked in `widgets/docBranches/SPECIFICATION.md` section 10.

The raw result files sent from Polarion (schema PDF, Excel exports, REST JSON, widget PDFs and screenshots) were removed
from the repository and from its git history on 2026-10-27. Only the findings in `spike-tests.md` are kept.
