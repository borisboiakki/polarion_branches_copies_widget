# Spike of docCoverage 0.3.x — collection context

Diagnostic widget and test plan used to verify, on Polarion 2512, how a widget can work in the **collection context**
(LiveReport opened in a collection: documents of the collection at the revision the collection pins) before docCoverage
0.3.0 is built (see `widgets/docCoverage/SPECIFICATION.md` F17 and §8b).

| Path | Content |
|---|---|
| `spike-tests.md` | Test plan K1–K8: how to run each test, what to report, table of findings |
| `spike-widget/ccSpike/` | Diagnostic widget (sources). Read-only |
| `spike-widget/ccSpike.zip` | Its upload package. Rebuild after editing the sources (folder `ccSpike/` at the zip root, Deflated) |

The widget is checked locally with Velocity 1.4 (`tools/vtest/ccSpike/CollectionSpikeHarness.java`, run by
`tools/test-widget.sh all`). Its collection mocks follow the guide (§2.8) and the SDK collection SQL examples; they are
**not** verified behaviour. Raw results from Polarion (screenshots, PDFs) are **not committed** (the repository is public;
PDF exports carry the company template). Send them in the chat; only the findings are kept.
