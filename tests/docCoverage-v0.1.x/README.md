# Spike of docCoverage 0.1.x

Diagnostic widget and test plan used to verify the technical choices of the docCoverage widget on Polarion 2512
before it is built (see `widgets/docCoverage/SPECIFICATION.md` §8).

| Path | Content |
|---|---|
| `spike-tests.md` | Test plan C1–C4: how to run each test, what to report, table of findings |
| `spike-widget/cvSpike/` | Diagnostic widget (sources). Read-only |
| `spike-widget/cvSpike.zip` | Its upload package. Rebuild after editing the sources (folder `cvSpike/` at the zip root, Deflated) |

The widget is checked locally with Velocity 1.4 on the docBranches mock set (`tools/vtest/cvSpike/SpikeHarness.java`, see
`spike-tests.md`). Raw results from Polarion (screenshots, PDFs) are not committed; only the findings are kept.
