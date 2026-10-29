# Spike of advImpact 0.1.x — multi-level impact analysis

Diagnostic widget and test plan used to verify, on Polarion 2512, how the Advanced Impact Analysis widget can follow
work item links over several levels before advImpact 0.1.0 was built (see `widgets/advImpact/SPECIFICATION.md` §6).
The spike is closed; its conclusion is at the end of `spike-tests.md`.

| Path | Content |
|---|---|
| `spike-tests.md` | Questions I1–I9, setup, findings of run 1 and parts A–C, run sheet, conclusion |
| `spike-widget/aiSpike/` | Diagnostic widget (sources). Read-only |
| `spike-widget/aiSpike.zip` | Its upload package. Rebuild after editing the sources (folder `aiSpike/` at the zip root, Deflated) |

The widget is checked locally with Velocity 1.4 (`tools/vtest/aiSpike/AdvImpactSpikeHarness.java`, run by
`tools/test-widget.sh all`). Raw results from Polarion (screenshots, PDFs) are **not committed** (the repository is
public; PDF exports carry the company template). Only the findings are kept.
