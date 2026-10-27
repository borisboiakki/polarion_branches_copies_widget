# Tests and spike for release 0.1.x

Kept for reference. These files document how the technical choices of the widget were verified on Polarion 2512.
Later versions get their own folder (`tests/vN.N.x/`).

| Path | Content |
|---|---|
| `spike-tests.md` | Test plan (SQL queries, REST calls, widget tests) with the expected results and the results table |
| `results/` | Results sent from the Polarion instance: DB schema (A1), SQL exports (A2), REST responses (R1, R2), widget test PDFs and screenshots (V1 to V7) |
| `spike-widget/bwSpike/` | Diagnostic widget used for the V tests (sources) |
| `spike-widget/bwSpike.zip` | Its upload package. Rebuild after editing the sources (folder `bwSpike/` at the zip root, Deflated) |

Test data: project `VforIA` (documents `SRS_Test` and its copies/branches) and the larger project `EOLE_AI_MCP_TESTS`.
Open checks for the released widget are tracked in `SPECIFICATION.md` section 10.

The host name of the test server was replaced by `MYHOST` in `results/R2_test_results.txt` and in the hidden
hyperlinks of the `A2_*.xlsx` exports (cell data unchanged, so those links no longer open Polarion).
It is still present in the git history before this change.
