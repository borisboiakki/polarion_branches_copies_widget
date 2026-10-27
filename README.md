# Polarion Branches Widget

A Siemens Polarion **LiveReport widget** that shows the documents of a project and how they relate to
each other — which documents are **branches** of which, and which are **copies** (reuse) of which.

> Status: **specification v0.2.** Approach decided (Velocity widget, Polarion 2512, compatible with 2606). Technical spike next. See [`SPECIFICATION.md`](SPECIFICATION.md).
> No implementation yet.

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

## Planned deliverables

- Velocity widget with configurable parameters (scope, link roles: `duplicates` / `branched_from` / `derived_from`, filters).
- Interactive graph + tabular fallback; static rendering for PDF/print.
- Install and configuration guide.

## Repository contents

| File | Purpose |
|---|---|
| `SPECIFICATION.md` | Draft requirements and open questions |
| `CLAUDE.md` | Instructions for Claude Code working in this repo |
| `Polarion_Development_Guide.md` | Polarion development best practices (baseline: Polarion 2512) |

## References

- Polarion extensions portal: <https://extensions.polarion.com> (e.g. Diff-Tool #476, Graphical and Tabular Impact Analysis Widget #354)
- Siemens Polarion blog (branching, compare/merge, bulk branching): <https://blogs.sw.siemens.com/polarion/>
- Extra Widgets (Apache-2.0, archived): <https://github.com/Polarion/com.polarion.alm.extensions.widgets>
- SBB Polarion extensions (Java/Maven packaging reference): <https://github.com/SchweizerischeBundesbahnen>
- Polarion SDK and Widget SDK are shipped with the installation at `<host>/polarion/sdk/`.
