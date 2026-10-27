# docCoverage spike — tests C1–C4 on Polarion 2512

Goal: settle the open points of `widgets/docCoverage/SPECIFICATION.md` (§6, §7, §8) before building the widget:
how the document and link-role selectors are read, the direction of coverage links, and the speed of the
link scan and the coverage computation on a large project.

## Setup

1. Upload `spike-widget/cvSpike.zip` (**Administration → Documents and Pages → Velocity Widgets → Upload**, project
   scope is enough). The widget is called **Document Coverage - Spike Tests** and is read-only.
2. Pick a test set in a project:
   - an **upstream** document (e.g. a customer specification) and **2 downstream** documents whose items are linked to
     it with a coverage role (e.g. `satisfies`), some upstream items **not** linked;
   - ideally one more document that is **not** selected but also linked, to check that it is ignored.
   The small project of the docBranches spike (`VforIA`) can be used with the roles `duplicates`/`derived_from` if no
   coverage data exists there, but a real coverage set is better.
3. On a LiveReport page of that project, add the widget **four times** (one per test). In each instance set:
   - **Test to run**: C1, C2, C3 or C4;
   - **Documents**: the upstream and the 2 downstream documents;
   - **Link roles**: the coverage role(s) (e.g. `satisfies`);
   - leave *Link roles as text* empty, *Work item types not counted* = `heading`, *Max rows* = 50.
4. Then repeat **C3 and C4** on the **large project** (≈100 documents / 20k items) with real coverage documents,
   and once with **no document selected** (= all documents) to see the worst-case timing.

Report a screenshot (or a copy of the tables) of each instance **in the chat**. Do **not** commit raw results (PDF,
PNG, Excel) to the repository: it is public, and PDF exports carry the company template (logo, confidentiality footer).
Only the findings below are kept.

## Tests

| Test | Checks | Report |
|---|---|---|
| **C1 Document selector** | How the `@document` multi-select is read: class of the values, `id()`, `getModelObject()` class, `isUnresolvable()`, space/name through `getReference()` and through `getOldApi()`, and the key (space/name) the widget would use | The table. Every selected document must have a non-empty **key used** |
| **C2 Link roles** | How the `workitem-link-role` multi-select is read (class, id, name/label), and the list of the project's link roles with id, name and opposite name | Both tables. Tell which label you want on the lines (id, name or opposite name) |
| **C3 Link scan** | The SQL query (shown) and the Velocity scan: pairs `target document \| role \| source document` with the number of links, distinct source items, distinct target items and one example | The table and the times. **Direction**: the upstream document (customer spec) should appear on the **left** (target). Check one example item pair in Polarion |
| **C4 Coverage** | For each target document: counted work items (headings excluded), covered items, coverage %, uncovered items (first 50), SQL times | The table. Compare one coverage % and a few uncovered items with what you see in Polarion |

Times are printed as start/end stamps in milliseconds (the difference cannot be computed in Velocity on 2512):
subtract them, or report them as they are.

## Expected on a test set "Customer spec ← SysReq A, SysReq B" with role `satisfies`

- C1: 3 rows, each with a key like `Space/DocumentName`.
- C2: 1 selected role `satisfies`; the project roles table lists `satisfies` with its opposite name.
- C3: rows `Space/CustomerSpec | satisfies | Space/SysReqA` and `… | Space/SysReqB`. No row with an unselected document.
- C4: one row for the customer spec with its coverage %; the uncovered items are the client requirements with no
  `satisfies` link from A or B.

## Local check (no Polarion needed)

`tools/vtest/cvSpike/SpikeHarness.java` renders the four tests with Velocity 1.4 on the docBranches mock set
(roles `duplicates`, `derived_from`; documents SRS_Test, SRS_Test_Reuse_TestB, SRS_Test_TestD_Derived):

```
lib=tools/.lib; cp="$lib/velocity-1.4.jar:$lib/commons-collections-3.2.2.jar:$lib/commons-lang-2.6.jar:$lib/oro-2.0.8.jar"
mkdir -p /tmp/cvs/cls && javac -cp "$cp" -d /tmp/cvs/cls tools/vtest/docBranches/WidgetHarness.java tools/vtest/cvSpike/SpikeHarness.java
java -cp "/tmp/cvs/cls:$cp" SpikeHarness tests/docCoverage-v0.1.x/spike-widget/cvSpike /tmp/cvs
```

The mock selector objects are assumptions (Rendering API document with `getReference()` and `getOldApi()`); C1/C2
tell what the real objects are.

## Findings

| Test | Result on 2512 | Consequence for the widget |
|---|---|---|
| C1 | ✅ `values()` = `StrictListImpl` of `ProxyEnumOption`; text `ProxyEnumOption id:_default / Doc`, `id()` = `_default / Doc`. `getModelObject()` = `ProxyDocument`, `isUnresolvable()` false. `getReference()`: project and name OK, **`spaceId()` empty**. `getOldApi()` = `Module`: folder `_default`, id, title, URI `subterra:data-service:objects:/default/<project>${Module}{moduleFolder}_default#<doc>` | Key = `getOldApi().getModuleFolder()` + `/` + `getId()` (as cvSpike); default space is `_default`, same as `MODULE.C_MODULEFOLDER` |
| C2 | ✅ value = `ProxyEnumOption` (`id:satisfies`), `id()` = `satisfies`, label read = `satisfies`. Project roles readable via `getTrackerProject().getWorkItemLinkRoleEnum().getAllOptions()` with id, name, opposite name (e.g. `satisfies`/`satisfies`/`is satisfied by`, `parent`/`has parent`/`is parent of`) | Role ids from `id()`; line label = role **name** (PO), fallback id |
| C3 | ✅ 3 documents (customer spec + 2 system specs), role `satisfies`: 5 link-source items, 6 links, 0 unresolvable, 2 pairs, both with the **customer spec as target**: ← spec 1: 2 links / 2 source / 2 target items; ← spec 2: 4 links / 3 / 3. SQL 3–4 ms, scan ≤ 1 ms. Large project and "no document selected" not run | Direction confirmed: upstream = link target. Worst-case timing stays an open check of 0.1.0 (docBranches V4: 22 + 84 ms on 120 docs with the same approach) |
| C4 | ✅ Customer spec: 6 counted items (heading excluded), 5 covered, **83 %**, 1 uncovered item listed; count SQL ≤ 1 ms | Coverage algorithm confirmed |
