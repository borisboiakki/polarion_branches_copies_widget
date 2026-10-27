# Document Coverage — install and configuration

Widget id `docCoverage`, version in `widgets/docCoverage/VERSION` (N.N.N; shown in the PDF header and as `data-version`).
Target: Polarion 2512 (keep compatible with 2606). Requirements: [`widgets/docCoverage/SPECIFICATION.md`](../../widgets/docCoverage/SPECIFICATION.md).

![Preview rendered from the mock test set](preview-graph.png)

## Install

1. Download the package: from a GitHub **release** tagged `docCoverage-vN.N.N`, the asset `docCoverage-N.N.N.zip`
   (recommended), or `widgets/docCoverage/dist/docCoverage.zip` from the repository (development build). The folder
   inside is always `docCoverage/`, so a new version overwrites the previous one on upload.
2. **Administration → Documents and Pages → Velocity Widgets → Upload**, in a project or in the repository (global).
3. On a LiveReport page, in edit mode, add **Document Coverage** (category *Work Items* / *Traceability*), set the
   parameters below, **Apply** and save the page.

## Parameters

| Parameter | Default | Meaning |
|---|---|---|
| Documents | none = all documents of the project | The LiveDocs to analyse (document selector) |
| Link roles (1 to 5) | none | The link roles that count as coverage, e.g. `satisfies`, `verifies`. More than 5: the first 5 are used |
| Link roles as text | empty | Comma-separated role ids, used only if no role is selected above |
| Work item types not counted | `heading` | Not counted in the coverage, and links to them are ignored |
| Spaces to include | empty (all) | Comma-separated space names (default space: `_default`) |
| Documents shown by default | Only documents with relations | Or *All selected documents*. Viewers can switch it |
| Link counts on the lines by default | Shown | Or *Hidden*. Viewers can toggle it |
| Extra document fields shown by default | none | Type, status, author, created, updated, work item count. Viewers can toggle them |
| Graph height in pixels | 600 | Height of the scrollable graph area |

## How coverage is computed

- A link is stored on one work item (the **downstream** item, e.g. a system requirement) and points to another (the
  **upstream** item, e.g. a client requirement in the customer specification). Verified for `satisfies` on 2512.
- Two documents are connected when at least one link of a shown role goes from an item of one to an item of the other.
  Links inside one document and links to unreadable items are ignored.
- **Coverage of an upstream document** = its counted work items (types not excluded) with at least one link from a
  shown downstream document, over all its counted items. Uncovered items are listed (up to 500 per document; the
  count is always complete).
- Hiding a role or a document in the widget recomputes the coverage.

## Using the widget

- **Graph**: upstream documents on the left; the arrow follows the link, from the downstream document to the upstream
  one. Each line shows the role names and link counts. Each upstream document shows its coverage.
- **Toolbar**: documents shown (only with relations / all), **Documents** picker (hide or show documents), roles,
  item counts, extra fields, highlight, Fit / zoom, Table / Graph, SVG, Excel, Refresh.
- **Click a document** for its coverage and the uncovered items (with a link to open the document).
  **Hover / click a line** for the links per role, the downstream items with links and the upstream items covered.
- **Excel**: sheets Relations, Documents (with coverage), Uncovered items, Linked items (up to 30 per pair).
- **PDF export / print**: static graph, relations table and coverage table (no JavaScript).

## Known limitations (0.1.0)

- One project only; links to documents of other projects are ignored.
- Documents are read through the Open API data service; permission filtering for viewers who cannot read some
  documents has not been checked (same open check as docBranches).
- The linked item lists in the details and Excel are limited to 30 per document pair.
