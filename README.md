# Polarion Branches Widget

A Siemens Polarion **LiveReport widget** that shows the documents of a project and how they relate to
each other — which documents are **branches** of which, and which are **copies** (reuse) of which.

> Status: **v0.1.0 — first implementation, to be validated on Polarion 2512.** Spike complete
> (`docs/spike-tests.md`). Install: [`docs/install.md`](docs/install.md). Requirements: [`SPECIFICATION.md`](SPECIFICATION.md).

![Widget preview rendered from the VforIA test set (mock data)](docs/preview-graph.png)

## Why

Polarion tracks branching and copying, but there is no single at-a-glance view of the document family
tree of a project. This widget aims to provide one, embeddable in any LiveReport page.

## How it is expected to work

Relations are **deduced from work item links** between documents' work items (plus document-level
"branched from" metadata where available):

1. Collect the documents in scope (project, space, or a selection).
2. Read the links between their work items using configurable link roles.
3. Aggregate item-level links into document-to-document relations (e.g. "≥ N items of B are linked to A").
4. Classify each relation (copy / branch / derived) and render a graph or tree.

## Build and test

```
python3 tools/build-widget.py   # inline the JS, check with Velocity 1.4, write widget/dist/docBranches.zip
tools/test-widget.sh            # build + render with Velocity 1.4 on mock data + Chromium screenshots
tools/vcheck.sh                 # parse every .vm file with Velocity 1.4
```

Requires Java (for Velocity 1.4), Python 3 and Node with Playwright (for the browser check).

## Repository contents

| File | Purpose |
|---|---|
| `SPECIFICATION.md` | Requirements, decisions and open checks |
| `widget/src/` | Widget sources: `render.vm`, `parameters.vm`, `branches-graph.js` (inlined at build) |
| `widget/dist/docBranches.zip` | Upload package (generated, committed for convenience) |
| `docs/install.md` | Install and configuration guide |
| `tools/build-widget.py`, `tools/test-widget.sh`, `tools/vtest/` | Build, Velocity 1.4 harness with mock Polarion objects, browser check |
| `docs/spike-tests.md` | SQL and widget tests to run on a Polarion 2512 instance |
| `spike/bwSpike/`, `spike/bwSpike.zip` | Diagnostic test widget (upload package) |
| `CLAUDE.md` | Instructions for Claude Code working in this repo |
| `Polarion_Development_Guide.md` | Polarion development best practices (baseline: Polarion 2512) |

## References

- Polarion extensions portal: <https://extensions.polarion.com> (e.g. Diff-Tool #476, Graphical and Tabular Impact Analysis Widget #354)
- Siemens Polarion blog (branching, compare/merge, bulk branching): <https://blogs.sw.siemens.com/polarion/>
- Extra Widgets (Apache-2.0, archived): <https://github.com/Polarion/com.polarion.alm.extensions.widgets>
- SBB Polarion extensions (Java/Maven packaging reference): <https://github.com/SchweizerischeBundesbahnen>
- Polarion SDK and Widget SDK are shipped with the installation at `<host>/polarion/sdk/`.
