# Document Branches and Copies — install and configuration

Widget id `docBranches`, version in `VERSION` (N.N.N; shown in the PDF header and as `data-version`). Target: Polarion 2512 (keep compatible with 2606).

## Install

1. Download the package: from a GitHub **release**, the asset `docBranches-N.N.N.zip` (recommended), or
   `widget/dist/docBranches.zip` from the repository (development build). The folder inside is always
   `docBranches/`, so a new version overwrites the previous one on upload.
2. **Administration → Documents and Pages → Velocity Widgets → Upload**. Choose the scope:
   - a **project** (to try it), or
   - **Repository** (global, available to every project).

   Re-uploading a zip with the same folder name overwrites the widget.
3. Open a LiveReport page of the project. In edit mode, add **Document Branches and Copies** (category
   *Work Items* / *Traceability*) and set the parameters below. Click **Apply** and save the page.

## Parameters

| Parameter | Default | Meaning |
|---|---|---|
| Copy link roles | `duplicates` | Link roles that mark a copy / LiveDoc reuse (comma separated) |
| Branch link roles | `branched_from` | Link roles of overwritten items in a branch |
| Derived link roles | `derived_from` | Link roles of items reused with derivation |
| Work item types not counted | `heading` | Items of these types are ignored in links and counts |
| Spaces to include | empty (all) | Comma-separated space names, e.g. `Requirements, Design` |
| Documents shown by default | Only documents with relations | Or *All documents*. Viewers can switch it in the widget |
| Indirect relations by default | Hidden | Relations inherited through an intermediate copy (see below) |
| Relation kinds shown by default | none = all | Copies, Branches, Derived. Viewers can toggle each kind in the widget |
| Linked item counts on the lines by default | Shown | Or *Hidden*: line labels show only the kinds (e.g. `copy` instead of `copy 5`). Viewers can toggle it |
| Extra document fields shown by default | none | Type, status, author, created, updated, work item count. Viewers can toggle them |
| Minimum linked work items for a relation | 1 | Relations with fewer linked items are dropped, unless document metadata says branch/derived |
| Graph height in pixels | 600 | Height of the scrollable graph area |

## How relations are found

| Kind | Source |
|---|---|
| copy | work items linked with a copy role |
| branch | the document's *branched from* metadata, plus overwritten items linked with a branch role |
| derived | the document's *derived from* metadata, plus items linked with a derived role |

The line goes from the original document to the copy/branch/derived document. One line per document pair,
labelled with every kind and its number of linked items. Style precedence: branch > derived > copy.

**Indirect relations.** Copying a copy keeps the links of the copied items, so a copy of a copy also links
to the original. When there is a document M with original → M and M → document, the direct original →
document relation is marked *indirect* (unless document metadata confirms it), and is hidden by default.

## Using the widget

- **Toolbar**: documents shown (all / only related), indirect relations, relation kinds (copies / branches / derived), item counts on the lines, extra fields, highlight search,
  Fit / zoom, Table / Graph, SVG download, Excel download, Refresh (reloads the page and re-runs the analysis).
- **Click a document** to open it. **Hover a line** for counts and coverage; **click a line** for the
  list of linked work items (up to 30).
- **Excel**: a workbook with the shown relations (counts, metadata, coverage), the shown documents and the linked
  work items (up to 30 per document pair), with links to Polarion. The toolbar filters apply. If the Excel library
  could not be loaded, the button downloads the relations as CSV and the status line says so.
- **PDF export / print**: the widget renders a static graph and a relations table (no JavaScript).

## Known limitations

- One project only; links to documents of other projects are ignored.
- Documents are read through the Open API data service. Permission filtering for viewers who
  cannot read some documents has not been checked yet (see SPEC §10).
- There is no PNG export (browsers block it on Polarion pages). Use the SVG download, or the PDF export of the page.
- A document whose author user was deleted shows the author as "(unknown user)". Branch or derived documents whose
  source document cannot be read are ignored, and so are links to unreadable work items.
