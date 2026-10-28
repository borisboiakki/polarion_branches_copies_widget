# Architecture of the document widgets

This document explains how **docBranches** and **docCoverage** are built, how the pieces fit together, and where to
make a change. Requirements and decisions are in each `widgets/<widget>/SPECIFICATION.md`. Polarion facts verified on
2512 are listed in `CLAUDE.md`. The Velocity dialect rules are in `Polarion_Development_Guide.md` §3.1.9.

## 1. Overview

Both widgets are **Velocity LiveReport widgets**, uploaded as a zip (Administration → Velocity Widgets). They have no
Java code, no CDN dependency and no server-side extension. One template (`render.vm`) runs on the Polarion server and
produces one of two outputs:

```
                    Polarion server (Velocity 1.4 parser)                     Browser
 ┌──────────────────────────────────────────────────────────────┐   ┌─────────────────────────────┐
 │ parameters ─► SQL (sqlSearch) ─► Velocity scan ─► edges/docs │   │                             │
 │                                                    │         │   │                             │
 │                     isPdf()/isPrint()? ── yes ─► static SVG + tables (no JS) ──► PDF / print   │
 │                                                    │ no      │   │                             │
 │                     hidden "page model" (<i data-…>) ───────────► │ inlined JS (core + graph.js)│
 │                     + #loadWidgetJs(xlsx.js) + <script>  ────────►│ reads model, draws SVG,     │
 └──────────────────────────────────────────────────────────────┘   │ toolbar, table, exports     │
                                                                    └─────────────────────────────┘
```

- **Server side (Velocity):** all data access happens here. SQL queries are scoped to the projects in scope (the
  *Projects* parameter, or the current project when it is empty), and the results are then grouped into documents and
  edges in Velocity. The heavy filtering is done in SQL; Velocity never loops over all work items of a project.
- **Static view (PDF/print):** the same template draws a server-side SVG with integer geometry, plus HTML tables. It
  contains no JavaScript, because the PDF export does not run scripts.
- **Interactive view (browser):** the template writes the computed data as hidden `<i>` elements (the *page model*)
  inside the widget root, followed by one inlined `<script>`. The script reads the model and does everything
  interactive on the client: layout, drawing, filters, table, and SVG/Excel/CSV export. Filters do not reload the page.

Why it is built this way (decided in docBranches SPEC §6, spike V1–V7 on 2512):
- `#parse`/`#include` cannot load files from an uploaded widget. Shared Velocity code and the JS are therefore
  **inlined at build time**.
- `#loadWidgetJs("resources/…")` does work. It is used only for the third-party Excel library.
- Polarion's parser behaves like **Velocity 1.4**. Its constraints are listed in §8.

## 2. Source layout and build

```
widgets/<w>/src/render.vm        main template, with markers  "## BW_SHARED <file>.vm"  and  "## BW_INLINE_JS"
widgets/<w>/src/parameters.vm    widget parameters ($factory…)
widgets/<w>/src/graph.js         widget-specific client code
widgets/<w>/src/widget.properties, details.vm, description.vm   label/tags, short and long description
widgets/<w>/src/icon.png         widget icon (608 x 405 PNG, from docs/<w>/icon.svg), copied unchanged to the package root
shared/vm/*.vm                   Velocity snippets inlined at the BW_SHARED markers
shared/js/core.js                client core, inlined before graph.js
shared/resources/xlsx.js         xlsx-js-style (unchanged copy) + LICENSE, copied to <w>/resources/
tools/build-widget.py            assembles widgets/<w>/dist/<w>/ and widgets/<w>/dist/<w>.zip
```

`tools/build-widget.py` does the following for each widget:
1. It replaces each `## BW_SHARED x.vm` line with the content of `shared/vm/x.vm`.
2. It replaces `## BW_INLINE_JS` with `(function(){ 'use strict'; core.js + graph.js })();`. Both files share one
   IIFE per widget, so nothing is global. The build refuses JS that contains `$`, `#`, `\` or non-ASCII characters,
   because Velocity would interpret them. In the JS, use `HASH` and `String.fromCharCode(…)` instead.
3. It stamps the version from `widgets/<w>/VERSION` (or from `--version`) into the line `#set($bwVersion = "…")`.
4. It copies `src/icon.png` to `<w>/` and `shared/resources/` to `<w>/resources/`.
5. It parses every `.vm` file of the result with Velocity 1.4 (`tools/vcheck.sh`).
6. It writes the zip and checks the zip limits: entry names of 30 characters or fewer, 30 entries or fewer.

`dist/` is generated output, committed for convenience. Never edit it by hand. CI fails when it is out of date.

## 3. Server side: `render.vm`

Both templates follow the same sequence. The shared snippets are shown in **bold**.

| Step | docBranches | docCoverage |
|---|---|---|
| CSS | **style.vm** (classes `bw-*`, used by both widgets) | same |
| Common parameters | **params.vm**: projects and excluded types (selector values), spaces, documents shown, item counts, extra fields, height | same |
| Own parameters | copy / branch / derived link role selectors, relation kinds shown, indirect relations, threshold | collection context (`$colRef` from `$transaction.context().contextCollection()`, else the `@collection` parameter; mode ignore = none; `$colText`, `$colKey`), document selector, documents of other projects (text `project/space/document`), link role selector (1–5), limits (`maxRoles`, `uncCap` = 500, 30 samples per pair) |
| Lists and projects | **common.vm**: macros `bwOptionIds` (enumeration selector → ids), `bwKey` (module → `project/space/name` and `$bwKeyProject`, guarded by `isUnresolvable()`) and `bwDocLabel` (table label, project prefix when several projects), `$excludedTypes`, `$typeSql`, `$spaceFilter`, `$projectId` (current project), `$projectIds` / `$projectSql` / `$projectsStr` (scope), `$multiProject`, `$scopeText`, `$scopeWarn`, `$isStatic` | same; additionally the selected documents → `$docOnly` keys, role names from `getWorkItemLinkRoleEnum()` of the current project |
| Documents | **documents.vm**: one SQL query for the modules of the projects in scope, then one count query per document. Builds `$docList` / `$docByKey` maps (key, project, id, title, space, type, status, dates, `rev`, `items`, `itemObjs`, `module`; macro `bwDocMap`). When `$colRef` is set: `$transaction.objects().searchBySql("select c_uri, c_col_rev from col_module").collection($colRef)` (documents of the collection and its upstream collections, `getOldApi()` = module at the collection revision, `rev` = that revision or `HEAD`), and one `col_workitem` query for all their items, grouped by `getModule()` | same (docBranches does not set `$colRef` yet); `$docOnly` limits the documents of the current project (the `@document` selector lists that project only), `$docOther` the documents of the other projects (text parameter "Documents of other projects", parsed in render.vm) |
| Relations | (1) SQL: link-source items with a configured role whose target is in another document of a project in scope (cross-project links count). Velocity scans `getLinkedWorkItemsStructsDirect()`. Macro `bwEdge` groups by pair `orig>copy` and kind. (2) Document metadata `branchedFrom` / `derivedFrom`. (3) Threshold. (4) Transitive reduction: an edge is *indirect* when S>M>T exists | SQL: link-source items of the selected documents and roles, with the target in another selected document. In a collection: link sources and targets from `col_struct_workitem_linkedworkitems` (pinned revisions); the target's document comes from the target query (`project/id` → key), not from the current item. Macro `cwEdge` groups by pair `up>down`: links per role, upstream items covered, downstream items with links |
| Computation | — | Coverage per upstream document: its counted items (`itemObjs`) against the items covered by any downstream document. The uncovered list is capped at `uncCap`; the full count is always kept |
| Output | `#if($isStatic)`: static SVG + table. Otherwise: page model + script | same |

Link direction (verified on 2512): a link is stored on the **source** item (`fk_uri_p_workitem`) and points to the
**target** (`fk_uri_workitem`).
- docBranches: source = copy/branch/derived item, target = original. The edge is `o` = original document,
  `c` = copy document.
- docCoverage: source = downstream item, target = upstream item. The edge is `o` = upstream, `c` = downstream.

### Page model (contract between Velocity and JS)

Both widgets write:
- the root element `<div class="bw-root">` (docBranches) or `<div class="cw-root">` (docCoverage), whose `data-*`
  attributes carry the settings;
- a hidden `<div class="bw-model">` with one `<i class="bw-n">` per document and one `<i class="bw-e">` per edge.

Each widget has its own root class, so two widgets on one page do not read each other's model. Before the model, the
root holds a visible scope line (`Project: X` / `Projects: A, B`) and, if any, the scope warning.

| Element | Attributes |
|---|---|
| root (both) | `data-project` (current project: fallback for links, file names), `data-projects` (scope, `A,B`), `data-mode` (`related`/`all`), `data-counts` (1/0), `data-extras` (`type,status,…`), `data-height`, `data-version` |
| root, docBranches | `data-indirect`, `data-rel` (kinds shown by default) |
| root, docCoverage | `data-roles` (`id|name;id|name`), `data-warn`, `data-col` (collection `project/id`, empty outside a collection: links open in the collection) |
| `bw-n` (both) | `data-k` (key `project/space/name`), `data-p` (project: links open in it), `data-id`, `data-title`, `data-space`, `data-type`, `data-status`, `data-created`, `data-updated`, `data-items` |
| `bw-n`, docCoverage | `data-rev` (collection revision, `HEAD` when none is pinned, empty outside a collection), `data-up` (is upstream), `data-cov`, `data-unc-n` (full count), `data-unc` (first 500 ids) |
| `bw-e` (both) | `data-o`, `data-c`, `data-s` (samples `c|o|k;…`, at most 30) |
| `bw-e`, docBranches | `data-kc`/`kb`/`kd` (items per kind), `data-mb`/`md` (metadata branch/derived), `data-oi`, `data-ci`, `data-n`, `data-ind` |
| `bw-e`, docCoverage | `data-r` (`role:links;…`), `data-u` / `data-d` (`role:id id;…`: upstream items covered / downstream items with links) |

If you add a field, change both sides (render.vm output and `readModel` in graph.js) and the harness checks.

## 4. Client side: `core.js` + `graph.js`

`shared/js/core.js` contains everything that does not depend on the widget:
- **helpers**: `el`, `svg`, `toInt`, `pct`, `docUrl(node)` (in `node.project`), `itemUrl(project, id, col)` (the project of
  the item's document: sample items take it from the edge's documents); with a collection (`node.col` from root
  `data-col`) both open in the collection: `…/project/P/collection/ID/…`, or `…/project/P/collection/CP//ID/…` for a
  project other than the collection's (formats rendered by Polarion 2512); `docLabel` / box add `(HEAD)` when
  `node.rev` is `HEAD`, `docSortKey`, `download`;
- **model helpers**: `readNodes`, `parseSamples`, `restrictEdge`, `relFromData`, `kindsLabel`;
- **`layout(model, state, edges)`**: a layered layout. Origin/upstream documents go on the left, using the longest
  path. Barycentre ordering reduces crossings. Documents without an edge go in a grid when `state.mode === 'all'`.
  Documents in `state.hidden` are skipped.
- **`Base` mixin**: toolbar parts (`kindChecks`, `countsCheck`, `fieldChecks`, `searchBox`, `viewButtons`),
  `buildAreas`, `layoutAndDraw`, `drawGraph`, `nodeLines`, `docLabel` (`space / name`, with the project first when
  `multi`, i.e. several projects in scope), tooltip, details box, `htmlTable`, zoom/fit, SVG export,
  and `exportWorkbook` (Excel through `XLSX`, with a CSV fallback when the library is missing);
- **`startWidgets(rootClass, Ctor, name)`**: starts one widget per root and marks the root `data-bw-ready`, so a
  second script on the page does not start it twice. Errors are shown in the widget.

**Edge categories** (`cats`) are the abstraction that lets both widgets share the drawing. A category is
`{ id, name, label, color, dash }`. An edge has `kinds: { catId: count }`, and the first category present on an edge
gives its line style. The two widgets define their categories as follows:
- **docBranches**: fixed categories `branch` > `derived` > `copy`.
- **docCoverage**: one category per selected role, built from `data-roles`, with a 5-style palette. The same
  palette is repeated in render.vm for the static view.

A widget (`graph.js`) defines a constructor that calls `initBase(this, root, readModel(root))` and `extendBase(Widget)`,
and provides the following:

| Hook | Purpose |
|---|---|
| `cats`, `filePrefix`, `emptyText` | categories, export file name prefix, empty-graph text |
| `build()` | toolbar composition (uses the `Base` parts) |
| `legend(box)` | legend content (`legendKinds` + widget text) |
| `render(refit)` | computes the visible edges from `state`, then calls `layoutAndDraw` and sets the status line |
| `edgeSummary(e)` | tooltip / label text of a line |
| `showDetails(e)` | details box of a line |
| `drawTable()` | table view |
| `exportExcel()` | workbook sheets for the current filters |
| optional: `nodeLines(n)` + `state.baseLines`, `onNode`, `arrowAtOrigin` | docCoverage adds the coverage line to the boxes, shows document details on click, and draws the arrow at the upstream end |

Widget-specific client logic:
- **docBranches:** `visibleEdges` (indirect toggle + `restrictEdge` by kind). The Excel sheets are relations,
  documents and linked items.
- **docCoverage:** `compute()` restricts the edges to the shown roles and documents, then recomputes the coverage
  in the browser. The covered count is the union of the visible edges' upstream sets. The uncovered list is the
  never-covered items from the server plus the items covered only by hidden lines. Also in graph.js: the document
  picker (`state.hidden`), `showDocDetails`, and the Excel sheets Relations, Documents, Uncovered items and
  Linked items.

## 5. Static view (PDF / print)

This view is drawn entirely in Velocity when `$isStatic` is true. It uses only `rect`, `line`, `polygon` and `text`,
which are verified to render in the PDF export. It uses integer arithmetic only.
- Levels come from the longest path over the shown edges. Columns are placed as in the browser layout, in a simpler
  form.
- Each widget has a static table: relations for both widgets, plus coverage and the uncovered items for docCoverage.
- docCoverage percentages (macro `cwPct`) are rounded the same way as in the browser (`(part*200+whole)/(2*whole)`), so the
  PDF and the screen agree.

If you change how something looks in `drawGraph` (core.js), check whether the static SVG in each render.vm needs the
same change.

## 6. Tests

```
tools/vcheck.sh                      parse .vm files with Velocity 1.4 (jars downloaded to tools/.lib/)
tools/test-widget.sh [widget|all]    build + render on mocks + Chromium checks, screenshots in the output dir
```

- `tools/vtest/docBranches/WidgetHarness.java` holds the **mock Polarion API** (modules, work items, links, `sqlSearch`
  with the SQL filters the widgets use, unresolvable objects, selector options `RoleOpt`/`DocOpt`, `Param` with
  `value()`/`singleValue()`/`values()`). It is compiled with every harness, and it is also the docBranches harness:
  test set modelled on the `VforIA` spike set.
- `tools/vtest/docCoverage/CoverageHarness.java` builds a coverage test set (customer spec, two system specs, one
  software spec) on the same mocks.
- `tools/vtest/<w>/browser-check.js` loads the rendered browser and PDF fragments in Chromium (Playwright). It clicks
  through toggles, details, table, SVG/Excel/CSV export and checks the numbers. Polarion turns `#loadWidgetJs` into a
  script tag; `test-widget.sh` does the same thing with `sed`.
- Keep the mocks in line with the behaviour observed on 2512, for example `singleValue()` returning a String. Add a
  mock for every new kind of referenced object, including its unresolvable case.

CI (`.github/workflows/ci.yml`) runs `tools/test-widget.sh all` and checks that `dist/` is up to date. The release
workflow (`release.yml`) runs on a tag `<widget>-vN.N.N`: it tests that widget, builds it with that version and
attaches `<widget>-N.N.N.zip`.

## 7. How to …

**Add a parameter to one widget.**
1. Add it in `widgets/<w>/src/parameters.vm`, on one line.
2. Read it in render.vm. Try each accessor form, because a `#set` with a null value keeps the previous value (see the
   pattern in `params.vm`). Use an enumeration selector when the value comes from the project configuration (roles,
   types, documents).
3. Pass it to the browser as a root `data-*` attribute when the client needs it.
4. Add it to the harness `params(…)`, the install guide and the SPECIFICATION.

**Change shared code** (`shared/`). It changes every widget: run `tools/test-widget.sh all` and bump the VERSION of
each widget whose package changes.

**Add a new widget `<w>`.**
1. Copy the structure of `widgets/docCoverage/src/` (including an `icon.png`, 608 x 405).
2. Choose a new root class (`xx-root`) and pass it to `startWidgets`.
3. Keep the zip entry names (`<w>/resources/xlsx.js`) within 30 characters.
4. Add `widgets/<w>/VERSION` and `widgets/<w>/SPECIFICATION.md`, a harness `tools/vtest/<w>/<Name>Harness.java`
   (main class) and `browser-check.js`, and `docs/<w>/install.md`.
5. The build, the tests and the release workflow pick up the widget from its folder.

**Release.** See the README, "Continuous integration and releases".

## 8. Constraints to keep in mind

- **Velocity 1.4:**
  - no map literals (use `$objectFactory.newMap()`);
  - one statement per line (no method chains split over lines);
  - no backslashes in string literals;
  - Integer arithmetic only;
  - no directive names in plain text;
  - `#break` and `$foreach` do nothing.
- **`isUnresolvable()` first:** a referenced object (link target, `branchedFrom` source, selected document) can be
  unresolvable. Any other call on it then throws.
- **SQL:** only identifiers (checked with a regex) go into SQL; document names are quoted with `''`. Space names are
  compared in Velocity only. Projects go into SQL as `p.c_id IN (…)` (`$projectSql`).
- **Several projects:** the document key always carries the project (two projects can hold the same space/name).
  Links and Excel hyperlinks open in the project of the document or item, never in a fixed project.
- **Budget:** the interactive render must stay well within the 10 s scripting budget. Page model sizes are capped
  (30 samples per pair, 500 uncovered items per document). The work grows with the number of projects in scope; a
  warning is shown above 5 projects.
- **No project-specific values** (types, roles, statuses) in code: they are parameters or are read from the project
  configuration.
