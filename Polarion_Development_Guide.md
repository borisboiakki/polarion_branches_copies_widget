# Polarion Development Guide (LLM Agnostic)

> **Purpose**: Generic best-practice reference for AI coding assistants (opencode, continue, ClaudeCode, etc.) when developing **for Siemens Polarion ALM** — Velocity widgets and LiveReport pages, Polarion Scripting (ECMAScript) workflow logic, workflow/configuration XML, Lucene and SQL queries, REST API clients, and Java extensions.
>
> **Baseline**: Polarion **2512** (*Administrator and User Help*, Siemens 2025) plus Siemens developer documentation. Verify version-sensitive behavior against the documentation and configuration of the target Polarion instance.
>
> **Scope**: Deployment-specific data models are intentionally excluded. Resolve Work Item types, custom fields, statuses, workflows, link roles, and enumerations from the target project's configuration rather than assuming fixed IDs.

---

## How to Use This Guide

| If the task is… | Read |
|---|---|
| Build a dashboard / report widget | §1, §2, §3, §6 |
| Automate a status transition, validate on save, run a nightly job | §4, §5 |
| Write a query (search bar, widget, macro, API) | §6 |
| Write a SQL report query | §7 |
| Integrate an external system | §8 (REST), §9 (Java) |
| Locate or interpret project configuration | §6.2, §10 |
| Check work before submitting | §13 |

**Golden rule for agents**: Polarion has *four* distinct programming surfaces with *different* APIs and *different* rules — Velocity (rendering), Polarion Scripting (ECMAScript, server-side automation), Lucene/SQL (querying), and Java/REST (integration). Identify which surface the task belongs to **before** writing code. Mixing their idioms is the most common cause of broken Polarion code.

---

## Table of Contents

1. [Development Environment](#1-development-environment)
2. [Widget & Report Development](#2-widget--report-development)
3. [Velocity Scripting](#3-velocity-scripting)
4. [Polarion Scripting (ECMAScript)](#4-polarion-scripting-ecmascript)
5. [Workflow Configuration](#5-workflow-configuration)
6. [Query Language (Lucene)](#6-query-language-lucene)
7. [SQL Query Development](#7-sql-query-development)
8. [REST API](#8-rest-api)
9. [Java Extensions & the SDK](#9-java-extensions--the-sdk)
10. [Configuration Reference](#10-configuration-reference)
11. [Best Practices](#11-best-practices)
12. [Common Patterns](#12-common-patterns)
13. [Validation & Debugging](#13-validation--debugging)

- [Appendix A: Velocity Context Variables](#appendix-a-velocity-context-variables)
- [Appendix B: Configuration File Map](#appendix-b-configuration-file-map)
- [Appendix C: Key System Properties](#appendix-c-key-system-properties)

---

## 1. Development Environment

### 1.1 What You Can Build

| Extension point | Language | Where it lives | Can modify data? |
|---|---|---|---|
| **Velocity Widget** | Velocity + HTML/CSS/JS | Uploaded `.zip`; Administration → Documents and Pages → Velocity Widgets | No (read-only rendering) |
| **Script Block / Script Inline widget** | Velocity | Inline in a LiveReport Page | No |
| **Page Script** | Velocity | Page Script sidebar of a LiveReport Page | No (sets `$pageContext` only) |
| **Classic Wiki page / LiveDoc Wiki block** | Velocity + wiki markup | Repository | No |
| **Polarion Script** (2410+) | ECMAScript 2022 | Administration → Scripting → Scripts | Yes (Functions, Save Hooks, Scheduled) |
| **Legacy workflow script** | Groovy or JavaScript | `scripts/` folder on the server filesystem | Yes |
| **Workflow condition / function (built-in)** | XML configuration | `.polarion/tracker/workflow/*.xml` | Yes |
| **Java extension** | Java (OSGi bundle) | `<Polarion>/polarion/extensions/` | Yes |
| **REST client** | Any | External | Yes |

**Decision rule**:
- Read-only display inside Polarion → **Velocity widget**.
- Server-side business rule, validation, or scheduled automation → **Polarion Scripting**.
- Data modification driven by a UI control, or logic too heavy/stateful for scripting → **Java extension**.
- External system talking to Polarion → **REST API** (preferred) or SOAP Web Services (legacy).

### 1.2 Widget Types

| Aspect | Velocity Widget | Java Widget |
|---|---|---|
| **Language** | Velocity + HTML/CSS/JS | Java (renders HTML/JS) |
| **Deployment** | `.zip` upload via Administration (stored in SVN under `.polarion/pages/widgets/<widgetId>/`) | `<Polarion>/polarion/extensions/` (`.jar`) |
| **Data Access** | Read-only | Read-write (via `executeAction`) |
| **Server-side Logic** | No (client-side JS only) | Yes |
| **Server restart needed** | No | Yes |
| **Use Case** | Charts, tables, KPI dashboards | Editing data, complex logic |

### 1.3 File Structure (Velocity Widget)

```
<widgetId>/                 # folder name == widget ID; the folder is zipped for upload
├── widget.properties       # REQUIRED — metadata (label=, tags=, isRestricted=)
├── parameters.vm           # REQUIRED — parameter definitions (sidebar configuration)
├── render.vm               # REQUIRED — Velocity + HTML + CSS + JS
├── details.vm              # REQUIRED — short tooltip (sidebar + Administration page)
├── dependencies.vm         # Optional — parameter visibility / scope rules
├── description.vm          # Optional — "About this Widget" long HTML help
├── icon.png                # Optional — widget icon (a default icon is used if absent)
└── resources/              # Optional static assets
```

> **Verified filename rule for the target Polarion 2512 deployment**: the mandatory metadata file is **`widget.properties`** (singular). A package containing only `widgets.properties` is rejected. Siemens documentation uses both spellings, but do not copy the plural spelling into a widget package unless the target server has been separately verified to require it.

**Upload limits** (global runtime properties — Administration → Configuration Properties):

| Property | Default |
|---|---|
| `velocityWidgets.directoryDepthLimit` | 10 |
| `velocityWidgets.zipFileNameLengthLimit` | 30 characters |
| `velocityWidgets.entryNameLengthLimit` | 30 characters |
| `velocityWidgets.maxNumberOfEntries` | 30 |
| `velocityWidgets.entrySizeLimitMB` | 30 MB |

> **Verified on 2512 (widget icon)**: an `icon.png` at the package root, next to `render.vm`, is shown in the widget list (tested with a 608 x 405 PNG). No other file needs to reference it.

Additional constraints: the `.zip` must not be a symlink; only **Stored** or **Deflated** compression is accepted (no BZIP2 / LZMA / PPMd); total size is also bound by `maxAttachmentSize`.

### 1.4 widget.properties Format

```properties
label=Work Record Report Widget
tags=richpages.widget.tag.workitems,Traceability
isRestricted=true
```

| Key | Meaning |
|---|---|
| `label` | Name shown in the Widgets sidebar and the Administration page |
| `tags` | Comma-separated categories; localization keys or free strings |
| `isRestricted` | `true` → only users with `Pages - MODIFY RESTRICTED WIDGETS` can edit the widget |

**Standard tag keys**:

| Key | Category |
|---|---|
| `richpages.widget.tag.generic` | Generic |
| `richpages.widget.tag.charts` | Charts |
| `richpages.widget.tag.planning` | Plans |
| `richpages.widget.tag.scripting` | Scripting |
| `richpages.widget.tag.workitems` | Work Items |
| `richpages.widget.tag.testRuns` | Test Runs |
| `richpages.widget.tag.includes` | Includes |
| `richpages.widget.tag.collections` | Collections |

Custom strings are allowed and create new categories. Categories sort alphabetically, except **All** (always first) and **Untagged** (always last).

### 1.5 Scopes: Global vs Project

Almost every configuration in Polarion exists at two scopes:

- **Global / Repository scope** — applies everywhere unless overridden.
- **Project scope** — overrides the global definition for that project.

Consequences an agent must respect:

- A widget with the same ID deployed globally **and** in a project → the **project** widget wins.
- Workflow configured at the global level can reference only **global** scripts. Project-level workflow can reference **global + project** scripts.
- **Scheduled Scripts exist only at the global level.**
- Save Hooks: project scope covers Work Items, Documents, Pages, Plans, Test Runs, Collections. Global scope covers Projects and Users.
- You **cannot import a script from another project** — only from `/global/` or the same `/project/`.

### 1.6 Where Configuration Lives

Polarion configuration is **XML held in the SVN repository**, under `.polarion/` at the repository root (global scope) or inside a project folder (project scope). See [Appendix B](#appendix-b-configuration-file-map) for the full map. System-level tuning lives in `polarion.properties` on the server filesystem — `[POLARION_HOME]\polarion\configuration\polarion.properties` on Windows, `[POLARION_HOME]/etc/polarion.properties` on Linux — and **changes to it require a server restart**. A separate set of advanced properties is editable online under **Global Administration → Configuration Properties** and takes effect **without** a restart. The authoritative property list is the *Polarion System Configuration Properties Reference* (Support Center; republished every release).

Because everything is SVN-backed, every change creates a revision. This is deliberate (audit/compliance) and has two practical consequences: nothing is ever truly deleted, and object revision numbers are **not** predictable across a save (see §4.12).

### 1.7 Logs

Default location: `[POLARION_HOME]/polarion/data/logs/main` (Linux `/opt/polarion/data/logs/main`, Windows `C:\Polarion\data\logs\main`).

| File | Contents |
|---|---|
| `log4j-TIMESTAMP.log` | Everything (primary support log) |
| `log4j-errors-TIMESTAMP.log` | Errors only |
| `log4j-jobs-TIMESTAMP.log` | Scheduled jobs |
| `log4j-scripts-TIMESTAMP.log` | **Polarion Scripting output (`console.log`)** |
| `log4j-startup-TIMESTAMP.log` | Start-up and reindex |
| `log4j-licensing-TIMESTAMP.log` | License usage |
| `log4j-monitoring-TIMESTAMP.log` | Monitoring / audit / repair |
| `log4j-tx-TIMESTAMP.log` | Transaction statistics |
| `log4j-rpc-TIMESTAMP.csv` | GWT RPC calls |

log4j configuration: `[POLARION_HOME]/polarion/plugins/com.polarion.core.util_*/log4j2.xml`; override by copying it to `[POLARION_HOME]/polarion/configuration/log4j2.xml` (a restart may be required). The format changed in Polarion 22 R1.

---

## 2. Widget & Report Development

### 2.1 Parameter Definition Patterns (`parameters.vm`)

Parameters are built with `$factory` and registered into `$parameters`. Use `$!` (quiet reference) or `#set($void = …)` so the builder's return value is not printed.

> **Verified on Polarion 2512**: write each builder chain on **one line**. A chain split across lines
> (`$factory.customEnum("X")` newline `.addEnumItem(…)`) fails with *"Error processing parameters … Encountered "\n .addEnumItem…" … Was expecting one of: "," … ")""*. See [§3.1.9](#319-velocity-14-dialect-in-widgets).

#### String
```velocity
$parameters.put("chartTitleParameter", $factory.string("Chart title").value("My Chart").build())
```

#### Integer
```velocity
$parameters.put("timeRangeParameter", $factory.integer("Time Range").value(12).build())
```

#### Boolean (checkbox)
```velocity
$parameters.put("useWidgetParameters", $factory.bool("Use widget's internal parameter(s)").value(false).dependencySource(true).build())
```

#### Custom enum (fixed list)
```velocity
$parameters.put("timeScaleParameter", $factory.customEnum("Time Scale").addEnumItem("Day","Day").addEnumItem("Week","Week").addEnumItem("Month","Month").allowNoValue(false).allowMultipleValues(false).singleValue("Month").build())
```

#### Polarion enumeration (work item type, severity, link role, …)
```velocity
#set($defaultTypeList = [])
$!defaultTypeList.add("requirement").null
$parameters.put("workItemTypeListParameter", $factory.enumeration("Workitem type(s)", "workitem-type").allowNoValue(false).allowMultipleValues(true).values($defaultTypeList).dependencyTarget(true).build())

## Single-value form
$parameters.put("mySingleSeverity", $factory.enumeration("MySingleSeverity", "severity").singleValue("major").build())

## Multi-value with defaults
$parameters.put("myMultiSeverity", $factory.enumeration("MyMultiSeverity", "severity").allowMultipleValues(true).values(["major","critical"]).build())

## Link roles (values come from workitem-link-role-enum.xml)
$parameters.put("linkRole", $factory.enumeration("Link Role", "workitem-link-role").dependencyTarget(true).build())
```

> **Verified on 2512**: multi-value `workitem-link-role` and `workitem-type` selectors preselect their defaults with
> `.values(["duplicates"])` / `.values(["heading"])` and list the project's roles / types. Read them with `values()`:
> each value is a `ProxyEnumOption` whose `id()` is the role / type id. Write the chain on **one line** (§3.1.9).

#### Document / Collection / Page selectors
```velocity
$parameters.put("documentListParameter",   $factory.enumeration("Document(s)",   "@document").allowNoValue(true).allowMultipleValues(true).dependencyTarget(true).build())
$parameters.put("collectionListParameter", $factory.enumeration("Collection(s)", "@collection").allowNoValue(true).allowMultipleValues(true).dependencyTarget(true).build())
```
The `@…` enumeration IDs are the *dynamic enumeration types* listed in [§10.2](#102-dynamic-enumeration-types).

**Important for `@document`**: `singleValue()` returns a model-backed `EnumOption`. Its `id()` is an enumeration option ID and is **not guaranteed to be the value accepted by the Work Item Lucene field `document.id`**. Do not build `document.id:"${option.id()}"` from it. Resolve the selected Document with `getModelObject()` instead.

To process active Work Items that actually belong to the selected LiveDoc, in document order:

```velocity
#set($selectedOption = $parameters.sourceDocument.singleValue)
#if(!$selectedOption)
  $renderingContext.renderWarning("A LiveDoc must be selected.")
#else
  #set($selectedDocument = $selectedOption.getModelObject())
  #if(!$selectedDocument || $selectedDocument.isUnresolvable())
    $renderingContext.renderWarning("The selected LiveDoc could not be resolved.")
  #else
    #set($requirements = [])
    #foreach($documentItem in $selectedDocument.items().contained())
      #set($documentItemType = $documentItem.fields().type().getIfCan())
      #if($documentItemType && $documentItemType.id() == "requirement")
        $!requirements.add($documentItem).null
      #end
    #end
  #end
#end
```

`Document.items().contained()` returns the active contained Work Items in document order. This is preferable to reconstructing a document query when the document originated from an `@document` selector.

> **Verified on 2512 (selector objects)**:
> - `@document` (multi): `values()` → `ProxyEnumOption`; `getModelObject()` → `ProxyDocument` (check `isUnresolvable()`
>   first); `getOldApi()` → Open API `Module` with `getModuleFolder()` (`_default` for the default space) and `getId()`.
>   `getModelObject().getReference().spaceId()` is **empty**: take space and name from `getOldApi()`.
> - `@document` lists the **current project's documents only**, also when a `@project` parameter selects other projects.
>   For documents of other projects, add a text parameter (e.g. `project/space/document`, comma separated).
> - `@project` (multi): `values()` → options whose `id()` is the project id.
> - `@collection`: `getModelObject().getReference()` → `BaselineCollectionReference`, the same object as the collection
>   context (§2.8). Use it when the page has no collection context (Polarion PDF export).
> - There is **no `@space`** dynamic enumeration (§10.2): a "spaces" parameter stays a text field, or needs a custom list.

#### Date (relative or absolute)
```velocity
$parameters.put("myRelativeDate", $factory.date("MyRelativeDate").relative(-12).build())
$parameters.put("myAbsoluteDate", $factory.date("MyAbsoluteDate").absolute($date.toDate("yyyy-MM-dd","2015-01-02")).build())
```

#### Object selector (pick a Work Item, Plan, Document, …)
```velocity
$parameters.put("userStory", $factory.objectSelector("User Story").allowedPrototypes(["WorkItem"]).dependencySource(true).build())
$parameters.put("myPlan",    $factory.objectSelector("MyPlan").allowedPrototypes(["Plan"]).objectPath("drivepilot/Version_1_0").build())
```

#### Script parameter
```velocity
$parameters.put("myScript", $factory.script("MyScript").value("${esc.d}me").build())
```
`${esc.d}` emits a literal `$`, so the default value is the escaped `$me`.

#### Time axis
```velocity
$parameters.put("myTimeAxis", $factory.timeAxis("MyTimeAxis").fromRelative(-28).toRelative(0).scaleWeek().build())
```

#### Lucene query parameter
```velocity
$parameters.put("myQuery", $factory.luceneQuery("MyQuery").scope().global().prototype().workItem().subtype("defect").value("HAS_VALUE:resolution").build())
```

#### Fields + Sorting + Data Set (the Table Widget pattern)
```velocity
#set($myColumns = $factory.fields("MyColumns").build())
#set($mySorting = $factory.sorting("MySorting").build())
$parameters.put("myDataSet", $factory.dataSet("MyDataSet").add("myColumns",$myColumns).add("mySorting",$mySorting).build())
```

#### Collection-aware data set
```velocity
$parameters.put("collectionScopeDataSet", $factory.dataSet("MyDataSet").allowCollectionScope(true).build())
```
**Limitations**: the Collection-scope data set configuration is fixed; `allowedPrototypes` and similar methods affect only the Project-scope configuration. You cannot offer *only* Collection scope — Project scope is always present.

### 2.2 Reading Parameters (`render.vm`)

```velocity
#set($chartTitle = $pageParameters.chartTitleParameter.value())
#set($timeRange  = $pageParameters.timeRangeParameter.value())
#set($typeValues = $pageParameters.workItemTypeListParameter.values())

## Multi-value parameters return a list of enum options
#set($typeIdList = [])
#foreach($tv in $typeValues)
  $!typeIdList.add($tv.id()).null
#end
```

Inside an *uploaded* widget, parameters are also reachable as `$parameters.<key>`.

> **Verified on 2512**: for a `customEnum` parameter, `$parameters.<key>.singleValue` returns the selected option **id as a plain `String`** (e.g. `"docs"`), not an option object, so `.singleValue.id` is empty. Use the value directly. Enumeration parameters backed by Polarion objects (`@document`, `workitem-link-role`) may differ; check with `.getClass().getName()`.


```velocity
#set($userStoryParameter = $parameters.userStory)
#set($userStory          = $userStoryParameter.value)
#set($type               = $parameters.type.singleValue)
#set($linkRoleId         = $parameters.linkRole.singleValue.id)
```

**Render a validation warning instead of failing silently**:
```velocity
#if(!$userStory)
  $renderingContext.renderWarning("$userStoryParameter.label is undefined.")
#elseif(!$linkRoleParameter || !$linkRoleParameter.singleValue)
  $renderingContext.renderWarning("Parameter $parameters.linkRole.label is required.")
#else
  #render($userStory $linkRoleParameter.singleValue.id)
#end
```

### 2.3 Dependency Control (`dependencies.vm`)

Two distinct uses:

**(a) Show / hide parameters**
```velocity
#set($widgetParameterList = [])
$!widgetParameterList.add($parameters.workItemTypeListParameter)
$!widgetParameterList.add($parameters.documentListParameter)

#foreach($widgetParameter in $widgetParameterList)
  $widgetParameter.visuals.setVisible($parameters.useWidgetParameters.value())
#end
```

**(b) Re-scope a dependent parameter** — e.g. make the Link Role list reflect the project of the selected Work Item:
```velocity
#set($userStoryParameter = $parameters.userStory)
#set($linkRoleParameter  = $parameters.linkRole)
#set($workItem = $userStoryParameter.value)
#if(!$workItem)
  #set($scope = $null)
#else
  #set($scope = $workItem.getReference().scope())
#end
$linkRoleParameter.set().scope($scope)
```

The source parameter must declare `.dependencySource(true)`; each dependent parameter must declare `.dependencyTarget(true)`.

### 2.4 Deploying a Velocity Widget

1. Put the files in a folder named for the widget ID.
2. Zip the folder.
3. **Administration → Documents and Pages → Velocity Widgets → Upload** (choose the Repository scope for global, or a Project for project scope).
4. Re-uploading a `.zip` with the same folder name **overwrites** the widget; the previous version is not recoverable.

Download and Delete are available from the same page. **Polarion does not check whether a widget is in use before deleting it** — pages referencing a deleted widget render an error.

### 2.5 Page Script and `$pageContext`

The **Page Script** sidebar (Page in edit mode → top-right menu → **Page Script**) runs one Velocity script *before* the widgets; its job is to populate `$pageContext`.

- Requires the `Pages - MODIFY RESTRICTED WIDGETS` permission.
- Uses the same context variables as script widgets, **except**:
  - Use `$renderingContext` (class `RichPageRenderingContext`) instead of `$widgetContext`.
  - `$parameters` is **not** available.
- `$pageContext` is then readable by every widget on the page but **cannot be modified** by widgets or the UI.
- Widget rendering may run **concurrently** → anything placed in `$pageContext` must be **thread-safe**.
- Changes take effect only after clicking **Apply**.
- Sidebar actions: **Show Result** (execution output — the main debugging tool), **Show Log** (Velocity errors/warnings), **Full screen** (F11 / ESC).

Typical uses: compute a shared data set once; define page parameters that must not be user-editable; bind one input to several widgets.

### 2.6 Script Block / Script Inline Widgets

- **Script - Block**: coded widget rendered as a block.
- **Script - Inline**: coded widget rendered inline with text.
- Both require `Pages - MODIFY RESTRICTED WIDGETS` to edit.
- Velocity is the recommended language; macros and variables are supported.
- To reuse an existing widget: open its page → **Edit** → widget header menu → **Copy Widget Source Code** → paste into a Script - Block's Script parameter → customize → **Apply**.
- To use the Work Item Properties sidebar or drag-and-drop with items rendered from a Script Block, each item needs a **unique widget ID**.

> **Security**: poorly written page code enables XSS. Work Item field values are returned verbatim by the API, so anything a user can type into a Work Item can reach your HTML. Escape untrusted field values; never build HTML by raw concatenation of user content.

### 2.7 Generic Button Widget (custom actions)

Found on the **Generic** tab of the Widgets sidebar. Requires `Pages - MODIFY RESTRICTED WIDGETS`.

| Parameter | Notes |
|---|---|
| `Label` | Defaults to `Execute` when empty |
| `URL` | Simple navigation; when set, the button remains clickable in exported PDF |
| `Click Handler` | Required if `URL` is empty. Velocity + Rendering API. Build actions with `$renderingContext.createJsActionsBuilder()` |
| `Sub-label` | Optional, script only — **no HTML/CSS allowed** |
| `Disable Logic` | Script returning the *reason* the button is disabled (shown as the tooltip). Empty string → enabled |
| `Label Color` | Any CSS color |

`JsActionsBuilder` reference on your server: `sdk/doc/javadoc-rendering/com/polarion/alm/shared/api/utils/js/JsActionsBuilder.html`.

### 2.8 Collection-Aware Reports

A Page *associated* with a Collection is **not** automatically Collection-aware: it renders the Collection's baseline revisions, but ordinary widgets and queries still see *all* documents and work items.

To make a script widget truly Collection-aware:

```velocity
#set($collectionReference = $transaction.context.contextCollection)

#if($collectionReference)
  <p><b>Documents</b> (in the hierarchy):
  #set($documents = $transaction.objects.searchBySql("select c_uri, c_col_rev from col_module").collection($collectionReference))
  <b>$documents.size</b></p>
  <ol>
    #foreach($elem in $documents)
      <li>$elem.render.withLinks.openLinksInCollectionContext($collectionReference)</li>
    #end
  </ol>
#else
  No Collection context.
#end
```

**Rules**:
- Only **SQL** queries work in the Collection context — **Lucene is not supported**.
- Collection-context SQL is *not* interchangeable with HEAD / Baseline SQL.
- Results are returned in the revision/baseline appropriate to the Collection hierarchy, including upstream Collections.
- Object types that do not belong to a Collection are returned in the revision corresponding to the current Collection Baselines.
- You may pass an explicit Collection reference to query a hierarchy from outside its context.
- See *SQL Query Examples for Collections* in the Polarion SDK.

> **Verified on 2512 (collection spike, uploaded Velocity widget)**:
> - `$transaction.context().contextCollection()` returns a `BaselineCollectionReference`: `projectId()`, `id()`,
>   `get($transaction).getOldApi()` → `getName()`, `getUpstreamCollections()`.
> - It is **null outside a collection and in the Polarion PDF export** (browser print keeps it). The page location does
>   not carry the collection id either. A widget that must export to PDF needs an `@collection` parameter as fallback
>   (`getModelObject().getReference()`, §2.1).
> - `searchBySql(sql).collection($ref)` works on `col_module`, `col_workitem` and `col_struct_workitem_linkedworkitems`
>   (always select `c_uri, c_col_rev`). Each result's `getOldApi()` is the Open API object **at the pinned revision**.
>   Documents of **upstream collections** are included. `IModule.getRevision()` is empty for a document added without a
>   pinned revision (read at HEAD: mark it as such). Documents outside the collection, and their items, are never returned.
> - **Pitfall**: `getLinkedItem()` on a pinned item returns the **current (HEAD)** target. Resolve the target's document
>   and fields through a collection query on the link tables (map `project/id` → object), not through the link.
> - Links that open objects in the collection: `#/project/<P>/collection/<ID>/wiki/<space>/<document>`,
>   `#/project/<P>/collection/<ID>/workitem?id=<item>`; for an object of another project:
>   `#/project/<other>/collection/<collection project>//<ID>/…`.

### 2.9 Activity Stream Query Fields

The Activity Stream widget's `Query` parameter indexes source-specific prefixed fields:

`workitem.type`, `workitem.id`, `workitem.revision`, `job.rootJob`, `job.name`, `job.worker`, `job.info`, `revision.name`, `build.tag`, `build.stamp`, `build.artifact.groupId`, `build.artifact.id`, `build.project.id`, `testrun.revision`, `testrun.groupId`, `testrun.type`, `testrun.status`.

`user.name` and `user.id` are indexed for every activity. Emptiness filters use `HAS_VALUE` / `NOT_HAS_VALUE`.

---

## 3. Velocity Scripting

### 3.1 Hard Rules (Never Violate)

#### 3.1.1 No Newlines in Directive Expressions
Every `#if`, `#elseif`, `#foreach`, `#set`, `#macro` directive — including its entire condition — **must fit on a single line**.

```velocity
## CORRECT
#if($workItem.getType().getId() == "requirement" && $workItem.fields().status().get() == "released")

## CORRECT — extract long conditions
#set($isReleasedReq = $workItem.getType().getId() == "requirement" && $workItem.fields().status().get() == "released")
#if($isReleasedReq)

## WRONG
#if($workItem.getType().getId() == "requirement"
    && $workItem.fields().status().get() == "released")
```

#### 3.1.2 Control Directives on Their Own Line
```velocity
## CORRECT
<td>
  #if($title)
    $title
  #else
    &nbsp;
  #end
</td>

## WRONG
<td>#if($title)$title#{else}&nbsp;#end</td>
```

#### 3.1.3 Work Item ID Rendering
```velocity
## CORRECT
$workItem.fields.id.render()

## WRONG
$workItem.id
```

#### 3.1.4 Optional Values
```velocity
## CORRECT — quiet reference
<td>$!title</td>

## CORRECT — explicit fallback
<td>
  #if($title)
    $title
  #else
    &nbsp;
  #end
</td>
```

#### 3.1.5 Rendering API Field Emptiness Check
```velocity
## CORRECT
#if($req.fields().description().isUnset())
  <i style="color: #888;">No description.</i>
#else
  $req.fields().description().render()
#end

## WRONG
<td>$!req.fields().description()</td>
```

#### 3.1.6 Lucene Query Rules in Velocity
- Never use `*` alone (parse failure).
- Always include `project.id:${projectId}` in Rendering API queries.
- Use `${var}` interpolation, not `+` concatenation.
- Hold the `linkedWorkItemsOf` fragment in a **single-quoted** Velocity string (it contains double quotes), then interpolate that variable into a double-quoted string. Single-quoted Velocity strings are **not** interpolated — `'project.id:$projectId …'` sends the literal text `$projectId` to the query engine.

```velocity
## CORRECT
#set($query = "project.id:${projectId} AND type:requirement AND status:released")
#set($hop = 'linkedWorkItemsOf:([{"filter":"status:inprogress AND type:task","steps":1}])')
#set($linkQuery = "project.id:${projectId} AND ${hop}")

## WRONG
#set($allItems = $trackerService.queryWorkItems($project, "*", "id"))
```

#### 3.1.7 linkedWorkItemsOf Syntax
Always use the `([...])` array delimiters.

```velocity
## CORRECT
#set($linkedReqHop = 'linkedWorkItemsOf:([{"filter":"type:requirement","follows":["verifies"]}])')

## WRONG
#set($bad = 'linkedWorkItemsOf:({"filter":"type:requirement","follows":["verifies"]})')
```

#### 3.1.8 Open API Linked Item Guards
```velocity
#set($target = $ls.getLinkedItem())
#if($target && !$target.isUnresolvable() && $target.getType().getId() != "heading")
  ## safe to use $target
#end
```

> **Every referenced object needs this guard, not only linked work items** (verified on 2512, widget v0.1.0 on a project with
> a deleted user): a document's author, `getValue("branchedFrom")` / `getValue("derivedFrom")`, work item links, assignees...
> can point to an *unresolvable* object (deleted user, document without access). Any call other than `isUnresolvable()`
> then throws, and the widget shows *"There was an exception (see server log for details) uri:
> subterra:data-service:objects:/default/${User}t0025088"*. Velocity 1.4 has no try/catch, so check first:
> `#set($u = $doc.getAuthor())` then `#set($ur = "unknown")`, `#set($ur = $u.isUnresolvable())`, and use `$u` only when
> `"$ur" == "false"`. The explicit "unknown" default also keeps the code safe if the method does not exist.

#### 3.1.9 Velocity 1.4 Dialect in Widgets

> **Verified on a Polarion 2512 instance (2026-10-27)**: the Velocity parser used for uploaded widgets
> (`parameters.vm`, `render.vm`) behaves like **Apache Velocity 1.4**. Two errors raised by the
> instance were reproduced exactly (same message, line and column) with `velocity-1.4.jar`, while
> Velocity 1.7 accepted one of the templates. Do not use syntax introduced in Velocity 1.5+.

| Do not use | What happens | Use instead |
|---|---|---|
| Method chain split across lines | **Error (seen on 2512)**: `ParseException: Encountered "\n .addEnumItem…" … Was expecting one of: "," … ")"` | One chain per line |
| Map literal `#set($m = {})` | **Error (seen on 2512)**: `TokenMgrError: Lexical error … Encountered: "{" (123)` | `$objectFactory.newMap()` (§3.4) |
| Backslash in a Velocity string literal, e.g. `$s.matches("[a-z\-]+")` | **Error (seen on 2512)**: `TokenMgrError: Lexical error … Encountered: "-" (45)` | No backslashes; put `-` last in a regex class: `"[a-z_.-]+"` |
| A directive name in plain text, e.g. `<code>#include</code>` in HTML | **Parse error** (Velocity 1.4 check) | Rephrase, or write `&#35;include` |
| Unparsed block `#[[ … ]]#` | No error, but **not unparsed**: `#[[`/`]]#` are emitted as text and `$`/`#` inside are still interpreted | Keep `$` out of inline JS, or load JS as a widget resource |
| `#break`, `$foreach.count`, `$foreach.hasNext` | No error, but **no effect**: emitted as literal text | Manual counter and `#if` guards: `#set($n = $n + 1)` |

Also avoid, as a precaution (consistent with Velocity 1.4, not individually confirmed on the instance):
- `$` or `${…}` in inline JavaScript (template literals, jQuery `$`): Velocity treats them as references.

Also verified on 2512:
- Arithmetic on `Long` values does not compute: `#set($d = $t1 - $t0)` with `$date.systemTime` values leaves `$d` unset. Velocity 1.4 arithmetic is defined for `Integer`. Print the raw values, or compute in JavaScript.
- `#include("resources/x")` and `#parse("resources/x.vm")` fail with *"Unable to find resource"*: Velocity cannot load files from an uploaded widget's `resources/` folder. Inline small JS/CSS in `render.vm` (Velocity-safe). For a large third-party script, ship it in `resources/` and load it with the Widget SDK directive `#loadWidgetJs("resources/x.js")` (verified on 2512 with a 425 KB library; keep the zip entry name, e.g. `widget/resources/x.js`, within 30 characters).
- Multi-value `customEnum` parameters (`allowMultipleValues(true)`) are read with `$parameters.<id>.values()`; each value's `id()` (or its string form) is the option id.

Velocity 1.4 behaviours to design around (seen with `velocity-1.4.jar`; the widgets rely on the first one on 2512):
- `#set($x = $obj.get())` with a **null** result keeps the previous value of `$x`. Reset first: `#set($x = "")`, then
  `#set($x = $obj.get())`.
- `#foreach` iterates Lists, Collections and arrays; an object that is only an `Iterator`/`Iterable` was not iterated.
- An inline `#set` after a reference on the same line (`$a$b#set($s = ";")#end` inside a one-line `#foreach`) was
  emitted as text. To join a list on one line, write the separator after each entry
  (`#foreach($x in $list)$esc.html($x);#end`) and ignore the empty last part when reading it.

Hex colour codes (`#c62828`) are safe: hex digits cannot spell a directive name.

**Check templates locally before uploading.** Parse every `.vm` file with `velocity-1.4.jar`
(Maven Central `velocity:velocity:1.4`, plus `commons-collections`, `commons-lang`, `oro`) through
`RuntimeSingleton.parse(reader, name)`. A parse error there is a parse error on the server. Parsing
does not catch runtime problems (wrong method names, null values).

### 3.2 API Selection Guide

| Use **Rendering API** (`$transaction`) | Use **Open API** (`$trackerService`, `$projectService`) |
|---|---|
| Rendering fields/links in Polarion format | Gathering data across projects |
| Revision-awareness, baseline support | Modifying work items (Java/scripting contexts) |
| Formatted display output | Querying across multiple projects |
| Collection-context queries | Services not exposed by the Rendering API |

| Aspect | Open API | Rendering API |
|---|---|---|
| Structure | Service-oriented | Hierarchical / object-oriented |
| Rendering | Manual (build hyperlinks/HTML yourself) | Built in, via `.render()` |
| Method chains | Shorter | Longer but more readable |
| Entry points | `$trackerService`, `$projectService`, `$securityService`, `$testManagementService` | `$transaction` (+ `$localization`) |

**Guidance**: prefer the Rendering API; fall back to the Open API when the Rendering API cannot express what you need. Mixing is valid and common — Open API to gather, Rendering API to render.

#### Rendering API Pattern
```velocity
#set($projectId = $page.getReference().projectId())
#set($renderWIs = $transaction.workItems().search().query("type:requirement AND project.id:${projectId}"))
#foreach($wi in $renderWIs)
  $wi.render().withLinks()<br>
#end
```

#### Open API Pattern
```velocity
#set($projectId = $page.getReference().projectId())
#set($project   = $projectService.getProject($projectId))
#set($sysReqs   = $trackerService.queryWorkItems($project, "type:requirement", "id"))
#foreach($sysReq in $sysReqs)
  $sysReq.getId()
#end
```

#### Mixed Pattern (convert Open API object → Rendering API object)
```velocity
#set($openApiWI  = $trackerService.getWorkItem($projectId, $req.fields().id().get()))
#set($renderApiWI = $transaction.workItems().getBy().oldApiObject($openApiWI))
$renderApiWI.render().withLinks()
```

### 3.3 Link Traversal

| Need | API | Method |
|---|---|---|
| Display as Polarion clickable links | Rendering API | `$wi.fields().linkedWorkItems().direct()` / `.back()` |
| Filter by type, access URL programmatically | Open API | `$openApiWI.getLinkedWorkItemsStructsDirect()` / `…Back()` |

**Rendering API (display)**:
```velocity
#set($directLinks = $req.fields().linkedWorkItems().direct())
#if($directLinks.isEmpty())
  <span style="color:#888;">None</span>
#else
  #foreach($link in $directLinks)
    $link.render().withLinks()
  #end
#end
```

**Rendering API (inspect a back-link struct)**:
```velocity
#foreach($linkedWorkItem in $userStory.fields().linkedWorkItems().back())
  #set($workItem     = $linkedWorkItem.fields().workItem().getIfCan())
  #set($workItemRole = $linkedWorkItem.fields().role().getIfCan())
  #if($workItem && $workItemRole && $linkRoleId == $workItemRole.id())
    ## …process $workItem
  #end
#end
```
`getIfCan()` returns `false`/null instead of throwing when the current user cannot read the target — always guard on it.

**Open API (programmatic)**:
```velocity
#set($directStructs = $openApiWI.getLinkedWorkItemsStructsDirect())
#foreach($ls in $directStructs)
  #set($target = $ls.getLinkedItem())
  #if($target && !$target.isUnresolvable() && $target.getType().getId() != "heading")
    #if($ls.getLinkRole().getId() == "verifies")
      <a href="$target.getHyperlink()">$target.getId() - $!target.getTitle()</a>
    #end
  #end
#end
```

### 3.4 Collections & Data Structures

```velocity
## New map
#set($myMap = $objectFactory.newMap())
$!myMap.put("key", "value").null

## New set
#set($mySet = $objectFactory.newSet())
$!mySet.add($item).null

## List literal
#set($myList = [])
$!myList.add($item).null

## Add without printing the return value
$!collectionVariable.add($item).null
## OR
#set($void = $myList.add($item))

## Map keyed on work item ID
#if(!$myMap.containsKey($wiId))
  $!myMap.put($wiId, []).null
#end
$!myMap.get($wiId).add($wi).null
```

### 3.5 Chart Building (HighCharts)

```velocity
#set($highChartBuilder = $renderingContext.createChartBuilder().build())
$!highChartBuilder.title().text($chartTitle).null

## Column series
$!highChartBuilder.series().add().name("Met").type().column().color("#5cb85c").null
$!highChartBuilder.series().get("Met").data().add().y($metCount).null

## Line series
$!highChartBuilder.series().add().name("Total").type().line().color("#000000").null

## Pie chart
$!highChartBuilder.chart().type().pie().null
$!highChartBuilder.plotOptions().pie().dataLabels().enabled(true).null

## Render
$!highChartBuilder.render($html, 500, $renderingContext.columnWidth).null
```

### 3.6 Progress Bar

```velocity
#set($percent = 0)
#if($totalCount > 0)
  #set($percent = $math.round($coveredCount * 100 / $totalCount))
#end
#set($barColor = "#IndianRed")
#if($percent == 100)
  #set($barColor = "MediumAquamarine")
#end

<style>
  .progress-meter   { background-color: #eee;      border-radius: 4px; height: 16px; width: 100%; }
  .progress-percent { background-color: $barColor; border-radius: 4px; height: 16px; width: ${percent}%; }
</style>

<div class="progress-meter">
  <div class="progress-percent"></div>
</div>
<span>${percent}%</span>
```

### 3.7 Document Tree Traversal

```velocity
#set($projectId  = $page.getReference().projectId())
#set($project    = $projectService.getProject($projectId))
#set($projectLocation = $project.getLocation())
#set($documentLocation = $projectLocation.getLocation($documentPath))  ## e.g. "Space/DocumentName"
#set($module     = $trackerService.getModuleManager().getModule($project, $documentLocation))

#macro(displayNode $node $level)
  #set($wi = $node.getWorkItem())
  #if($wi && !$wi.isUnresolvable() && $wi.getType().getId() == "heading")
    <h${level}>$!wi.getTitle()</h${level}>
  #elseif($wi && !$wi.isUnresolvable())
    $transaction.workItems().getBy().oldApiObject($wi).render().withLinks()
  #end
  #foreach($child in $node.getChildren())
    #set($childLevel = $level + 1)
    #displayNode($child $childLevel)
  #end
#end

#if($module.getRootNode())
  #displayNode($module.getRootNode() 1)
#end
```

> **Verified pitfalls (empirically confirmed against a live Polarion 2512 instance — the two most
> common sources of a silently-empty tree walk):**
> - **`getModule()`'s second argument must be a `Location`** (`$projectLocation.getLocation($path)`),
>   **not a raw path string.** A plain string silently resolves to nothing — `$module` then evaluates
>   falsy and the whole traversal no-ops with zero output and no error.
> - **The tree node's work item accessor is `getWorkItem()`, not `getWorkItemId()`.** Each node
>   (class `...module.StructureNodeStruct`) exposes a `workItem` field reachable only via
>   `getWorkItem()`, returning a full `WorkItem` object (guard with `!$wi.isUnresolvable()`, same as
>   any other Open API reference) — there is no `getWorkItemId()` method. Calling a nonexistent
>   method does not error in Velocity; it silently evaluates to nothing, so a loop built on it just
>   produces zero results with no diagnostic. If you need only the id, call `.getId()` on the
>   `WorkItem` returned by `getWorkItem()`.
>
> When an Open API call's exact method/argument shape is uncertain, do not guess silently through
> several submissions — print `$object.getClass().getName()` (works; §13.5) to identify the real
> class, then confirm the method against the SDK Javadoc for that class rather than trial-and-error
> against a live report.

### 3.8 Querying Baselines from a Document Wiki Block

```velocity
#set($q = '"')
#set($query = "project.id:$document.projectId AND (baseObject:${q}document/$document.relativePath$q)")
#set($sort  = "~baseRevision")
#set($baselines = $transaction.baselines().search().query($query).sort($sort))

<b>Found:</b> $baselines.size() baseline(s)</br>
<table class="polarion-rpw-table-content">
<tbody>
  <tr class="polarion-rpw-table-header-row">
    <th>Baseline Name</th><th>Document Link</th><th>Base Revision</th>
  </tr>
  #foreach($baseline in $baselines)
  <tr class="polarion-rpw-table-content-row">
    <td>$baseline.fields.name.render</td>
    <td>$baseline.fields.baseObject.render.withLinks</td>
    <td>$baseline.fields.baseRevision.render</td>
  </tr>
  #end
</tbody>
</table>
```

### 3.9 Built-in Velocity Macros

Polarion ships Velocity macros (e.g. LiveDoc signature panels) in:

```
[POLARION_HOME]/polarion/plugins/com.polarion.alm.wiki_N.NN.N/src/main/webapp/templates/macros.vm
```

Example of a shipped macro you can mirror or override:
```velocity
#macro(documentPanel $showPending $approvedState)
<div>
  #renderProperties()
  \\
  #renderLastApproved($approvedState)
  #renderSignatures($showPending)
</div>
#end
```

### 3.10 Standard CSS Classes

Reuse Polarion's report CSS so widgets match the portal look:

| Class | Use |
|---|---|
| `polarion-rpw-table-content` | `<table>` wrapper |
| `polarion-rpw-table-header-row` | header `<tr>` |
| `polarion-rpw-table-content-row` | body `<tr>` |

---

## 4. Polarion Scripting (ECMAScript)

> Introduced in **Polarion 2410**. This is the modern, supported way to add server-side automation. It supersedes the legacy filesystem-based Groovy/JS workflow scripts (§5.5), which still work but should not be used for new development.

### 4.1 Overview

Scripts are written in **ECMAScript 2022** and run **server-side, always PRE-SAVE**. There are no post-save scripts.

| Type | Trigger | Can modify data? | Must end with |
|---|---|---|---|
| **Condition** (Workflow) | User opens the status drop-down / attempts a transition | **No** | `true`, or a `String` explaining refusal (a String == `false`) |
| **Function** (Workflow) | A workflow transition executes | Yes | anything; `throw` to block the save |
| **Save Hook** | An object is saved | Yes | `true` or nothing; any other value **fails** the save |
| **Scheduled Script** | Cron schedule (global only) | Yes | anything |

Administration entry points: **Administration → Scripting →** *Scripts* (editor/CRUD), *Save Hooks*, *Scheduled Scripts* (global only), *Script Monitor*.
Workflow assignment happens in the Workflow Designer: **Work Items → Workflow**, **Documents & Pages → Document Workflow**, **Testing → Test Run Workflow**, using the `PolarionScriptCondition` / `PolarionScriptFunction` entries.

### 4.2 Script Metadata Rules

| Field | Rules |
|---|---|
| **Name** | Free text; searchable |
| **Reference Name** | Acts as the filename. Alphanumeric ASCII plus `.`, `_`, `-` only; forbidden characters become dashes; non-ASCII is transliterated; `.js` is appended. **Must be unique and is case-insensitive** — `theScript.js` and `TheScript.js` collide. Required for `import` |
| **Type** | `Condition`, `Function`, `Save Hook`, `Scheduled` (global only). **Cannot be changed after the first save** — delete and recreate if wrong |
| **Maintainer** | Informational; only users with AUTHOR SCRIPTS can be selected; grants no permissions |
| **Monitored / Logs Stored** | Send executions/logs to Script Monitor. Resource-intensive — enable only during development |
| **Active** (Save Hooks) | Only active Save Hooks run |
| **Order** (Save Hooks) | `1` runs first. Equal numbers → **no guaranteed order**; always assign distinct numbers |

> **Do not monitor Workflow Condition scripts** — conditions run constantly and will flood the monitoring system. Disable monitoring once a script is production-ready.

### 4.3 Permissions

| Permission | Grants |
|---|---|
| `Scripts - VIEW SCRIPTS` | Read scripts and their fields |
| `Scripts - AUTHOR SCRIPTS` | Create, update, delete scripts |
| `Scripts - MODIFY CONFIGURATION` | Create/update/delete Save Hooks and Scheduled Scripts; assign scripts to workflow; run a Scheduled Script on demand |

Defaults: Global admins have all three. Project admins get MODIFY CONFIGURATION. Global users get VIEW. By default **only global administrators may author scripts**, because scripting exposes a broad Open API surface.

### 4.4 Available Objects by Script Type

| Script type | `context` type | Other globals |
|---|---|---|
| Condition | `com.polarion.alm.tracker.workflow.ICallContext` | `arguments` (`IArguments`), `context.scriptContext()` (`IScriptContext`) |
| Function | `com.polarion.alm.tracker.workflow.ICallContext` | same |
| Save Hook | `com.polarion.alm.tracker.model.scripting.ISaveContext` | same |
| Scheduled | `com.polarion.alm.tracker.model.scripting.IScheduledScriptContext` | `arguments`, `context.scriptContext()` |

Also available: `console.log(...)`, `PolarionScriptingException`, `userAccountVault` (`IScriptVault`), `Java.type()` / `Java.from()`.

`context.getTarget()` returns, depending on where the workflow/save runs:
- `com.polarion.alm.tracker.model.IWorkItem`
- `com.polarion.alm.tracker.model.IModule` (Document)
- `com.polarion.alm.tracker.model.ITestRun`

Reading arguments configured on the workflow action / Save Hook / schedule:
```javascript
var versionFieldId  = arguments.getAsString("versionFieldID", "version");
var fields          = arguments.getAsSetOptional("fields").toArray();
```

Accessing services:
```javascript
const tracker = context.scriptContext().services().tracker();
const items   = tracker.queryWorkItems("type:task AND status:done", "id");
const http    = context.scriptContext().utils().httpClient();
```

> Only **allowlisted** Open API methods may be called. The allowlist file's name and location are deliberately undocumented; contact Polarion Support to inspect or change it. The allowed Open API subset is documented under **Scripting API** in the SDK (`https://<your-polarion>/polarion/sdk/index.html`). Expanding the allowlist is a security decision and may void support.

### 4.5 Workflow Conditions (`PolarionScriptCondition`)

A Condition decides whether a transition **appears as available** in the UI drop-down. It **cannot modify Polarion content**.

**Return contract**: the *last statement* of the script is the result — Polarion does **not** process a `return` statement at top level.
- `true` → action allowed.
- `false` → action blocked.
- a `String` → action blocked, and the string is shown as the tooltip on the disabled transition.

```javascript
// Condition: block "Mark Reviewed" while unresolved comments exist
var isUnresolvedCommentFound = false;

// See com.polarion.alm.tracker.model.IModule for all Document methods
var document   = context.getTarget();
var allComments = document.getComments();

// See com.polarion.alm.tracker.model.IModuleComment for comment methods
for (let i = 0; i < allComments.size(); i++) {
  var comment = allComments.get(i);
  if (!comment.isResolvedComment()) {
    isUnresolvedCommentFound = true;
    break;
  }
}

var returnValue = true;
if (isUnresolvedCommentFound) {
  returnValue = "Unresolved comment found. Make sure to resolve all your comments";
}

// LAST LINE is the result
returnValue;
```

Scope rule: a workflow configured at the **global** level sees only global scripts in the picker; a **project**-level workflow sees global + project scripts.

### 4.6 Workflow Functions (`PolarionScriptFunction`)

A Function performs actions **during** a transition — update fields, send notifications, calculate values. It does *not* decide whether the transition is allowed; to block the save, `throw`.

```javascript
// Function: increment a version custom field on transition
var versionCustomFieldID = arguments.getAsString("versionFieldID", "version");
var incrementValue       = arguments.getAsString("incrementValue", "1.0");
console.log("Version Field Id: " + versionCustomFieldID);

var baseObject = context.getTarget();
var oldVersion = baseObject.getCustomField(versionCustomFieldID);
var newVersion = "";

if (oldVersion == "" || oldVersion == null || oldVersion == "NaN") {
  newVersion = incrementValue;
  baseObject.setCustomField(versionCustomFieldID, newVersion);
} else {
  newVersion = parseFloat(oldVersion) + parseFloat(incrementValue);
  baseObject.setCustomField(versionCustomFieldID, newVersion.toFixed(1).toString());
}
console.log("New Version: " + newVersion);
```

**Blocking a save from a Function**:
```javascript
var document    = context.getTarget();
var allComments = document.getComments();
for (var i = 0; i < allComments.size(); i++) {
  var comment = allComments.get(i);
  if (!comment.isResolvedComment()) {
    throw new PolarionScriptingException("Unresolved comments found. Please resolve all comments before proceeding.");
  }
}
```

### 4.7 Save Hooks

Save Hooks run when an object is saved — the general-purpose validation/automation hook.

**Configurable object types**
- *Project scope*: Work Items, Documents (LiveDocs), Pages (Reports & Rich Pages), Plans, Test Runs, Collections. (Work Item and Document hooks can target multiple types.)
- *Global scope*: Projects, Users.

**Return contract**: the script must end with **`true` or return nothing**. Any other terminal value (a number, a string, an object) **fails the save**.

```javascript
// WRONG — myFunction(3,4) returns a number, so the save always fails
// myFunction(3, 4);

// RIGHT — log the value instead, so the terminal expression is a console.log call
console.log("Calculation result: " + myFunction(3, 4));
```

**Example — require an assignee for high-CVSS items**:
```javascript
const workItem          = context.getTarget();
const cvssScore         = workItem.getCustomField("CVSS_Score");   // float custom field, ID CVSS_Score
const cvssScoreTreshold = 7.0;

console.log(`Script started for work item ${workItem.getId()}.`);
console.log(`CVSS Score is ${cvssScore}.`);

if (cvssScore >= cvssScoreTreshold) {
  if (workItem.getAssignees().size() == 0) {
    throw new PolarionScriptingException(
      `Security Issues with CVSS Score higher than ${cvssScoreTreshold} must have an assignee`);
  }
} else {
  console.log("CVSS Score is lower than 7");
}
```

**Detecting what changed in the transaction**:
```javascript
const modified = context.getModifiedContainedObjects();  // e.g. Comments, Attachments being modified
```

**Execution semantics**
- Hooks run **sequentially by `Order`**.
- If **one hook fails** (logic error or timeout), Polarion **stops the remaining hooks and blocks the whole save**.
- Saving a Work Item contained in a Document also triggers the **Document's** Save Hooks.
- Adding a **Baseline** for a Document or Collection does **not** trigger that object's Save Hook.

### 4.8 Workflow Functions vs Save Hooks — Ordering

1. A workflow transition occurs.
2. **Workflow Functions run first** (field updates, transition-specific logic).
3. **Save Hooks run next** (validation, enforcement).
4. If a Save Hook saves a *related* object, Polarion **recursively** applies that object's Workflow Functions (if a workflow action is initiated on it) and Save Hooks.

### 4.9 Scheduled Scripts

Global level only. Each run executes **on behalf of the user in the script's `Updated By` field** — that user's permissions apply. If Polarion cannot log in as that user, the run ends `FAILED`.

**Do not explicitly start or commit a transaction.** Call `save()` on objects you change.

```javascript
const Text = Java.type("com.polarion.core.util.types.Text");

function searchItems(query) {
  const items = context.scriptContext().services().tracker().queryWorkItems(query, "id");
  console.log("Applied query: " + query);
  items.toArray().forEach((item) => console.log(item.getId() + " - " + item.getTitle()));
  return items;
}

function closeStaleItem(item) {
  const availableActions = Java.from(item.getAvailableActions());
  let action = undefined;
  for (let i = 0; i < availableActions.length; i++) {
    if (availableActions[i].getTargetStatus().getId().startsWith("verified")) {
      action = availableActions[i];
      break;
    }
  }
  if (action !== undefined) {
    item.performAction(action.getActionId());
    item.createComment(Text.plain("In the current state for too long -> Verified")).save();
    item.save();
  } else {
    console.log("... ERROR: no available action");
  }
}

var baseQuery = arguments.getAsString(
  "query",
  "type:task AND status:(done) AND NOT updated:[$today-30d$ TO $today$]");

const staleItems = searchItems(baseQuery);
staleItems.toArray().forEach((item) => closeStaleItem(item));
```

Minimal save example:
```javascript
var wi = context.scriptContext().services().tracker().findWorkItem('projectID', 'WI-ID');
wi.setTitle('title from Scheduled script ' + Date.now());
wi.save();
```

**Cron expression** — 6 or 7 whitespace-separated fields:

| Field | Allowed values | Special characters |
|---|---|---|
| Seconds | 0–59 | `, - * /` |
| Minutes | 0–59 | `, - * /` |
| Hours | 0–23 | `, - * /` |
| Day of month | 1–31 | `, - * ? / L W` |
| Month | 1–12 or JAN–DEC | `, - * /` |
| Day of week | 1–7 or SUN–SAT | `, - * ? / L #` |
| Year *(optional)* | empty, 1970–2099 | `, - * /` |

`0 15 9 ? * MON` → every Monday at 09:15.

**`UNABLE TO START` status** means either the schedule fires again before the previous run finished, or all scheduler workers are busy. Fix by spacing out the schedule or raising `com.siemens.polarion.jobs.scheduler.threadCount`.

You can trigger a Scheduled Script immediately from **Administration → Scripting → Scheduled Scripts → Run** (needs MODIFY CONFIGURATION). It still runs as the last editor, not as you; the log records who triggered it.

### 4.10 Script Helpers

#### HTTP Client
Standard Java HTTP classes are blocked. Use the helper, and allowlist hosts first:

```properties
# global Configuration Property
scripting.httpClient.allowedHosts=https://api.nasa.gov
```
The allowed-host list is **empty by default** — no outbound calls work until configured. Calls to allowed hosts are recorded in the main log.

```javascript
const HttpRequest = Java.type('java.net.http.HttpRequest');
const URI         = Java.type('java.net.URI');
const Duration    = Java.type('java.time.Duration');

const httpClient = context.scriptContext().utils().httpClient();
const url = new URI(`https://api.nasa.gov/neo/rest/v1/feed?api_key=DEMO_KEY`);

var request = HttpRequest.newBuilder()
    .uri(url)
    .header("Content-Type", "application/json")
    .timeout(Duration.ofSeconds(5))
    .GET()
    .build();

try {
  var result = httpClient.sendRequest(request);
  if (result.statusCode() === 200) {
    const body = JSON.parse(result.body());
    // …evaluate
  } else {
    throw new PolarionScriptingException("API request failed. Unable to proceed.");
  }
} catch (error) {
  console.log("Request failed:", error);
  throw new PolarionScriptingException("An error occurred while contacting the API. Workflow blocked.");
}
```
Always wrap external calls in `try/catch` and convert failures into a `PolarionScriptingException`, otherwise a network problem silently lets the transition through. Remember the per-script timeout (default 10 s) bounds the whole call.

#### User Account Vault secrets
Scripts can **read** secrets; they can never write them. Only the *password* value is reachable (never the username).

```javascript
// scripts/<ProjectId>/<secret_name>
const dbPassword = userAccountVault.project().getSecret('db_password');

// scripts/shared/<secret_name>
const apiKey = userAccountVault.shared().getSecret('external_api_key');

// Verify the key layout
console.log("Full Storage Key: " + userAccountVault.project().getStorageKey("db_password"));
```
Only keys under the `scripts/<ProjectId>/` or `scripts/shared/` prefixes are accessible.

### 4.11 Imports / Script Libraries

Use standard ECMAScript `import`. The path must match the **Reference Name exactly, including case**.

```javascript
// From the Global script repository
import { utilityFunction } from "/global/UtilityScript.js";

// From the same project
import { utilityFunction } from "/project/UtilityScript.js";
```

The imported script exports normally:
```javascript
const utilityFunction = () => {
  console.log("Utility function called");
}
export default utilityFunction;
```

**You cannot import a script from another project.** Put shared code in the Global scope.

### 4.12 Limits, Timeouts, and Known Issues

**Enable / disable** (`polarion.properties`):
```properties
com.siemens.polarion.scripting.enabled=false                   # disables all scripting
com.siemens.polarion.scripting.scheduledScripts.enabled=false  # disables Scheduled Scripts only
```

**Timeouts**:

| Property | Applies to | Default |
|---|---|---|
| `com.siemens.polarion.scripting.maxTotalScriptsExecutionTime` | Combined time of all scripts *and the transaction* in one operation; exceeding it aborts the transaction | 10 s |
| `com.siemens.polarion.scripting.maxScriptExecutionTime` | A single script execution | 10 s |
| `com.siemens.polarion.scripting.maxScheduledScriptExecutionTime` | A single Scheduled Script | 600 s |
| `com.siemens.polarion.jobs.scheduler.threadCount` | Scheduler workers (shared with Jobs) | 10 |
| `com.siemens.polarion.jobs.scheduler.jobMisfireThresholdMs` | Delay after which a cron trigger counts as a "misfire" | 10000 ms |

Raising timeouts is at your own risk; support will ask you to revert them before investigating performance issues.

**Known issues to design around**:
- Save Hooks do **not** prevent *project creation* when validation fails.
- If a Save Hook blocks Work Item creation, the numeric ID is consumed anyway → **gaps in the ID sequence**.
- If an object is being **moved or deleted** and a Save Hook modifies that object, **no Save Hook runs** (the move still happens; this is logged). Example: moving a Work Item into/out of a Document.
- **Never build logic on revision numbers inside a Save Hook.** At execution time the object is at revision X; after the save it is X+n, where n depends on the number of SVN commits. `workItem.setValue("revisionId", workItem.getDataRevision())` stores the *previous* revision.
- You can detect that most fields changed, **except the Document Name (ID)**.
- During a workflow transition, permissions are evaluated against the **source** status.
- Scripts **can modify fields marked read-only in the UI**, and can update Derived/Calculated fields. Guard deliberately — e.g. skip derived fields via `IModule.getDerivedFields()` — and use permissions to enforce the rest.

### 4.13 Debugging & Monitoring

- There is **no debugger**. Debug with `console.log()`.
- Output always lands in `[POLARION]/polarion/data/logs/main/log4j-scripts-TIMESTAMP.log`, even with monitoring off.
- **Script Monitor** (Administration → Scripting → Script Monitor) gives live execution records and stored logs; it filters by Object ID, User, Script Type, and surfaces slow/failing scripts.
- Script Monitor requires an **external PostgreSQL database** (already configured on Polarion X; on-premise customers must provide it):
  ```properties
  scripting.monitoringDb.connectionUri=postgresql://USER:SECRET@SERVER:PORT/DB_NAME
  # or the system property
  com.siemens.polarion.scripting.monitoringDb.connectionUri=...
  ```
  Resolution order: system property → configuration property → default. For security, the URI can instead be stored in the User Account Vault under the key `ScriptRunsDb` (URI in the *Password* field).
  Use a **dedicated machine** and a **separate PostgreSQL instance** from the one running Polarion services.
  `com.siemens.polarion.scripting.monitoringDb.recreateTableOnRestart=true` drops and recreates the monitoring table on restart — **destroys all monitoring data**; use only when instructed.
- Log rotation is controlled by the log4j configuration; script logs grow fast when logging is verbose.

### 4.14 Scripts in Project Templates

To make scripts travel with a Project Template, replace the project ID with the `%project-id%` placeholder.

`workflow.xml`:
```xml
<action id="action_id" name="Action Name">
  <functions>
    <function name="PolarionScriptFunction">
      <param name="script" value="%project-id%/{scriptId}"/>
    </function>
  </functions>
</action>

<action id="action_id" name="Action Name">
  <conditions>
    <condition name="PolarionScriptCondition">
      <param name="script" value="%project-id%/{scriptId}"/>
    </condition>
  </conditions>
</action>
```

`savehooks.xml`:
```xml
<savehooks xmlns="http://polarion.com/schema/SaveHooks">
  <savehook
    objectType="{savehook-objectType}"
    order="{savehook-order}"
    id="{savehook-id}"
    name="{savehook-name}"
    description="{savehook-description}"
    scriptPath="%project-id%/{scriptId}"
    active="true"/>
</savehooks>
```

Then list those files in the template's `template.properties`:
```properties
process=.polarion/polarion-project.xml;.polarion/tracker/fields/workitem-type-enum.xml;.polarion/tracker/workflow/{WorkItemType-}workflow.xml;.polarion/savehooks/savehooks.xml;
```

### 4.15 Deleting Scripts — Cautions

**Polarion does not check whether a script is in use.** Before deleting:
1. Verify it is not referenced by an active workflow action.
2. Check Save Hook configurations (a ⚠ marker next to a Save Hook means its script is missing).
3. Check Scheduled Script configurations (same marker).
4. Keep a local copy — **deletion is not reversible**.

---

## 5. Workflow Configuration

Workflows are XML files under `.polarion/tracker/workflow/`, edited through the Workflow Designer or directly. Three workflow families exist, each with its own catalogue of conditions and functions:

- **Work Items** — Administration → Work Items → Workflow
- **Documents** — Administration → Documents & Pages → Document Workflow
- **Test Runs** — Administration → Testing → Test Run Workflow

A **Condition** attached to an *action* blocks the transition when unsatisfied. A Condition attached to a *function* prevents that function from running (which may in turn block the action). **Functions** perform the work of the transition.

### 5.1 XML Shape

```xml
<action id="mark_reviewed" name="Mark Reviewed">
  <conditions>
    <condition name="FieldNonEmpty">
      <param name="field.name" value="assignee"/>
    </condition>
  </conditions>
  <functions>
    <function name="SetDate">
      <param name="field.name" value="reviewedOn"/>
    </function>
  </functions>
</action>
```

### 5.2 Built-in Conditions — Work Items

| Condition | Parameters | Effect |
|---|---|---|
| `ApprovalState` | `commonApprovalState` (`waiting` / `approved` / `disapproved`; default `approved`) | All approvals have the given state |
| `AtLeastOneApprovedAndNooneDisapproved` | — | ≥1 approval and no disapproval |
| `FieldNonEmpty` | `field.name`, `negate` (`true`/`false`, default `false`) | Field non-empty (or empty if negated). Empty = missing, null, empty collection, empty text/rich text, or `false` boolean |
| `LinkedWorkItem` | `link.role`, `target.work.item.type`, `backlink` (all optional) | At least one link/backlink exists, optionally of a given role and/or target type |
| `LinkedWorkItemsStatus` | `link.roles`, `back.link.roles`, `valid.states` (comma-separated) | All traversed targets are in one of `valid.states` |
| `RoleCondition` | `roles` (comma-separated) | Invoking user holds at least one of the roles |
| `ScriptCondition` | `engine` (`groovy`/`js`), `script` | Legacy filesystem script — see §5.5 |
| `PolarionScriptCondition` | `script` (`<scope>/<scriptId>`) | Modern Polarion Scripting condition — see §4.5 |

### 5.3 Built-in Functions — Work Items

| Function | Parameters | Effect |
|---|---|---|
| `AddDefaultApprovals` | `approvals.users`, `approvals.roles` | Adds approvers in `waiting` state. Requires *Work Items: Permission to MODIFY* |
| `ChangeField` | `field.name`, `field.value.type` (only `current.date`) | Sets a date / date-time field to now. *(Titled "Changed Field" in the Work Item reference but `ChangeField` in the Document reference — confirm the exact name in the Workflow Designer's function list.)* |
| `ClearField` | `field.name` | Clears a field. **Does not work on `plannedIn`** (that lives on the Plan). Must not be a required field |
| `CreateLinkedWorkItem` | `type` (req.), `link.role` (req.), `backlink` (opt., default `false`), `categories` (maybe req.) | Creates a linked item; `backlink=true` → created as child, `false` → as parent. New item is auto-assigned per the Auto-assignment scheme |
| `LinkedWorkItemsStatusChange` | `link.roles`, `back.link.roles`, `valid.states`, `target.state`, `clear.attribs` | Transitions traversed items that are not in `valid.states` to `target.state`, optionally clearing fields |
| `MarkWorkflowSignaturesAsObsolete` | — | Removes signatures made on preceding statuses (still tracked in History) |
| `ResetApprovalsState` | — | Resets all approvals to `waiting`. Requires *APPROVE/DISAPPROVE as ANOTHER USER* or *RESET APPROVALS* |
| `SetDate` | `field.name` | Sets a date / date-time field to now |
| `ScriptFunction` | `engine`, `script` | Legacy filesystem script — see §5.5 |
| `PolarionScriptFunction` | `script` | Modern Polarion Scripting function — see §4.6 |
| `TriggerJenkins` | — | Triggers a remote Jenkins build |

### 5.4 Documents and Test Runs

**Document conditions**: `ContainsNoMatchingWorkItems` (`query` — blocks if the Lucene query matches any contained item; **does not see changes made in the same edit/save operation**), `FieldNonEmpty`, `RoleCondition`, `ScriptCondition`, `PolarionScriptCondition`.

**Document functions**:

| Function | Parameters |
|---|---|
| `AddDefaultSigners` | `signedBy.users` and/or `signedBy.roles` (one is mandatory), `signer.role` (opt. free text), `target.status.id` (mandatory) |
| `ChangeField` | `field.name`, `field.value.type` (`current.date`) |
| `ClearField` | `field.name` |
| `InvokeAction` | `statusId`, `actionId`, `query` (opt. Lucene filter of contained items), `skip.referenced.items` (opt., default `true`). If any contained item's transition fails, the **Document action fails** |
| `MarkWorkflowSignaturesAsObsolete` | `signatureStates` (default `Done`) — also resolves linked verdict comments. Process signature comments manually first |
| `ResetSignaturesVerdict` | `target.status.id` (opt.; if absent, resets all unfinished signatures) |
| `SetDate` | `field.name` |
| `ScriptFunction` / `PolarionScriptFunction` | see above |

**Test Run conditions**: `FieldNonEmpty`, `RoleCondition`, `ScriptCondition`, `PolarionScriptCondition`.
**Test Run functions**: `MarkWorkflowSignaturesAsObsolete` (no params), `SetDate`, `ScriptFunction` / `PolarionScriptFunction`, `TriggerJenkins`.

### 5.5 Legacy Filesystem Scripts (`ScriptCondition` / `ScriptFunction`)

Still supported, but superseded by Polarion Scripting (§4). Scripts are **files on the server filesystem** in the installation's `scripts` folder (Linux `/opt/polarion/scripts/`, Windows `C:\Polarion\polarion\scripts\`), not repository objects.

| Parameter | Values |
|---|---|
| `engine` | `groovy` or `js` |
| `script` | Script filename in the `scripts` folder |

- The result is **the value of the last line**, same contract as §4.5.
- `ScriptCondition` cannot modify content.
- **Do not explicitly start or commit a transaction** inside a `ScriptFunction`.
- On Linux the script files need Owner/User/Group privileges set up for the Polarion system user.
- Context object is `workflowContext` (not `context`): `workflowContext.getTarget()`, `workflowContext.getActionId()`, `workflowContext.getTargetStatusId()`.

```javascript
// Legacy JS ScriptFunction: add a comment recording the transition
var workitem = workflowContext.getTarget();
var title = "workflow action:" + workflowContext.getActionId() + " processed on:" + new java.sql.Date(new Date().getTime());

var commentFields = arguments.getAsSetOptional("fields").toArray();
var comment = "";
for (i in commentFields) {
  if (!comment.equals("")) comment = comment + "\n";
  name = commentFields[i];
  comment = comment + name + ":" + workitem.getValue(name);
}
workitem.createComment(com.polarion.core.util.types.Text.plain(comment), title, null).save();
```

```javascript
// Legacy JS ScriptFunction: create a Document Baseline automatically
var baseObject = workflowContext.getTarget();
var baseline = baseObject.getProject().getBaselinesManager().createObjectBaselineForChange(baseObject);
baseline.setName(createName());
baseline.setDescription(com.polarion.core.util.types.Text.plain(createDescription()));
baseline.save();

function createName() {
  return baseObject.getEnumerationOptionForField("status", workflowContext.getTargetStatusId()).getName();
}
function createDescription() {
  return "Created automatically by a workflow transition";
}
```

**Script jobs** — the same legacy engine can run a script on a schedule. Define a job with ID `script.job` in `.polarion/jobs/schedule.xml` (global scope):
```xml
<job name="Script Job" id="script.job" cronExpression="" disabled="true" scope="system">
  <scriptName>test.js</scriptName>
  <scriptEngine>js</scriptEngine>
  <properties>
    <myProperty>myPropertyValue</myProperty>
  </properties>
</job>
```
- Required: `scriptName`, `scriptEngine` (`groovy` or `js`). The file must be in the installation `scripts` folder.
- Script variables: `logger` (`com.polarion.platform.jobs.ILogger`), `scope` (`com.polarion.platform.context.IContext`), `workDir` (`java.io.File`), `jobUnit` (`com.polarion.platform.jobs.IJobUnit`), plus one variable per `<properties>` child (here `myProperty`).
- For new scheduled automation prefer **Scheduled Scripts** (§4.9): repository-stored, permission-controlled, monitorable.

**Direct run page** — `https://<host>/polarion/scripting` runs an ad-hoc script *as a job* (same variables as script jobs) without installing it. Requires `com.polarion.scripting.servlet.enabled` in `polarion.properties`; admins only by default. Treat it as a privileged debugging tool, never leave it enabled casually.

**Jobs in general**: jobs run in the global scope; start/stop the Scheduler in Global Administration → Scheduler; run a job immediately from Monitor → Scheduled Jobs → **Execute Now**. A job name may be a runtime expression: `,` = sequential, `|` = parallel (`|` binds tighter), e.g. `J1,J2|J3|J4,J5` runs three parallel groups; failures inside groups are ignored. In a cluster, set `node="*"` (or a node name) on jobs such as Index Checker and the DB History Creator suspend/resume jobs.

**Unblocking restricted `ISecurityService` methods** (`polarion.properties` — dangerous, use a specific method list, never `*`):
```properties
com.polarion.scripting.job.allowedSecurityServiceMethods=addGlobalRoleToUser
com.polarion.scripting.allowedSecurityServiceMethods=addGlobalRoleToUser
com.polarion.wiki.allowedSecurityServiceMethods=addGlobalRoleToUser,removeGlobalRoleFromUser
```
These unblocking properties **do not apply to Polarion Scripting**, and `doAsUser` impersonation is not available there either. A script always runs with the privileges of the user it runs on behalf of.

### 5.6 Workflow Error Handling

If a configured condition/function is missing (extension removed, hand-edited XML uploaded):

- Errors are written to the main Polarion log.
- The Workflow Designer shows a warning dialog naming the missing items.
- **Missing function** → the action is **always disabled**; the transition is impossible until fixed.
- **Missing condition** → the action is **not** disabled, but saving after invoking it **fails**, and an error is logged.

### 5.7 Scripting Permissions Overview

| Permission | Limits |
|---|---|
| `Scripts - …` (see §4.3) | Who writes Workflow Conditions/Functions and Save Hooks |
| `Pages - MODIFY RESTRICTED WIDGETS` | Who writes widget scripts, Page Scripts, restricted widgets |
| `Documents - MANAGE WIKI CONTENT` | Who adds scripts to Document Wiki Content |
| `ClassicWikiPages - MODIFY` | Who edits Classic Wiki Pages |

---

## 6. Query Language (Lucene)

Polarion's query engine is Apache Lucene. The same syntax is used in the search bar, saved queries, widget/macro parameters, workflow condition queries, API calls, and configuration files.

### 6.1 Syntax Rules

| Rule | Detail |
|---|---|
| **Operators are UPPER CASE** | `AND`, `OR`, `NOT` (also `&&`, `\|\|`, `!`, `+`, `-`) |
| **Parenthesise mixed operators** | `(NOT HAS_VALUE:assignee.id) OR status:draft` — **never** `NOT HAS_VALUE:assignee.id OR status:draft` |
| **No operator precedence** | Group everything: `(type:userstory AND targetRelease.KEY:1.0) OR (type:defect AND priority:highest)` |
| **Whitespace == OR** | `severity:(blocker critical)` ≡ `severity:(blocker OR critical)` |
| **Leading `NOT` is fine** | `NOT severity:blocker` is valid; `QUERY1 OR NOT QUERY2` is not — write `QUERY1 OR (NOT QUERY2)` |
| **No leading wildcard** | `something*` is valid; `*something` is not |
| **Wildcards** | `?` = one character, `*` = several. `title:ab*`, `title:ab*c` |
| **Ranges** | `[ ]` inclusive, `{ }` exclusive: `created:[20120208 TO 20120222]` |
| **Fuzzy / proximity `~`** | Rarely needed |
| **Boost `^`** | Rarely needed, not recommended |
| **Escape with `\`** | `title.1:\(1+1\)\:2`; escape spaces too: `document.id:My\ Space*` |
| **Quoting** | `"Phrase with several words"` |

**Performance**: excessive parentheses slow query preprocessing. Wildcards are expanded into OR clauses — too generic a wildcard exceeds the clause limit and errors out.

### 6.2 Work Item Field & Index Field Reference

When writing queries, use the **Index ID**, not always the Field ID. Some fields have no queryable Field ID at all.

| Field | Field ID | Index IDs |
|---|---|---|
| Approvals | `approvals` | `approvals` (tokenized), `approvalState` — special syntax, see §6.3 |
| Assignee | `assignee` | `assignee.id`, `assignee.name` (sortable, lowercase) |
| Attachments | `attachments` | `attachments`, `attachments.author.id`, `attachments.author.name`, `attachments.content`, `attachments.fileName`, `attachments.length`, `attachments.length.1`, `attachments.title`, `attachments.updated` |
| Backlinked Work Items | `backlinkedWorkItems` | `backlinkedWorkItems` |
| Categories | `categories` | `categories.id`, `categories.name` (sortable, lowercase) |
| Comments | `comments` | `comments.author.id`, `comments.text`, `comments.title` |
| Created | `created` | `created` (date), `created.1` (datetime), `created.2` (sortable) |
| Custom field (generic) | `<customFieldId>` | `customField`, `customField.1` (sortable), `customField.KEY` |
| Description | — | `description` (tokenized) |
| Document | `_document`, `_space` | `document.id` (special syntax — §6.3) |
| Due Date | `dueDate` | `dueDate` (sortable) |
| Externally Linked WIs | `externallyLinkedWorkItems` | `externallyLinkedWorkItems`, `externallyLinkedWorkItems.host` |
| Hyperlinks | `hyperlinks` | not searchable |
| ID | `id` | `id`, `id.1` (tokenized), `id.2` (sortable) |
| Initial Estimate | `initialEstimate` | `initialEstimate`, `initialEstimate.1` (sortable) |
| Linked Revisions | `linkedRevisions`, `linkedRevisionsDerived` | `linkedRevisions`, `linkedRevisionsDerived` |
| Linked Work Items | `linkedWorkItems` | `linkedWorkItems` — special syntax, §6.4 |
| Location | `location` | `location`, `location.tokenized`, `location.tree` |
| Outline Number | `outlineNumber` | `outlineNumber` — special syntax, §6.3 |
| Parent Work Item | `parentWorkItem` | `parentWorkItem:ProjectId/WorkItemId` |
| Planned In | `plannedIn` | `PLAN:(projectId/planId)` — §6.3 |
| Planned End / Start | `plannedEnd`, `plannedStart` | `plannedEnd`, `plannedStart` (sortable) |
| Planning Constraints | `planningConstraints` | not searchable |
| Priority | `priority` | `priority`, `priority.1` (sortable) |
| Project | `project` | `project.id` (sortable) |
| Remaining Estimate | `remainingEstimate` | `remainingEstimate`, `remainingEstimate.1` (sortable) |
| Resolution | `resolution` | `resolution`, `resolution.1` (sortable) |
| Resolved On | `resolvedOn` | `resolvedOn` (sortable) |
| Severity | `severity` | `severity`, `severity.1` (sortable) |
| Status | `status` | `status`, `status.1` (sortable) |
| Suspect | `suspect` | `suspect` (sortable) |
| Time Point | `timePoint` | `timePoint.id`, `timePoint.time` (sortable), `timePoint.earliestPlannedStart` |
| Time Spent | `timeSpent` | `timeSpent`, `timeSpent.1` (sortable) |
| Title | `title` | `title` (tokenized), `title.1` (sortable, lowercase) |
| Type | `type` | `type`, `type.1` (sortable) |
| Updated | `updated` | `updated` (date), `updated.1` (datetime), `updated.2` (sortable) |
| Watched By | `watchedBy` | `watchedBy:<username>` |
| Work Records | `workRecords` | `workRecords`, `workRecords.user.id`, `workRecords.date`, `workRecords.comment` |

**Tokenized** = substring/word search works. **Sortable** = usable for ordering and range search (holds a lowercased, index-function-computed value).

> Example of why this matters: `{workitems: timePoint.time:[20120101 TO 20120212] AND assignee.id:$me | fields=id, title, severity, assignee, timePoint | sortby=timePoint created}` — the *query* uses index IDs (`timePoint.time`, `assignee.id`) while `fields` and `sortby` use field IDs.

Index fields also exist for **Attachments, Documents, Pages, Plans, Test Runs, Wiki Pages, and Work Records** — see *Search using index fields* in the Polarion help for the per-prototype lists.

**Fields that cannot be imported from Excel** — read-only/internal: `author`, `created`, `id`, `linkedWorkItemsDerived`, `linkedRevisionsDerived`, `location`, `module`, `outlineNumber`, `plannedEnd`, `plannedIn`, `plannedStart`, `previousStatus`, `project`, `updated`. Unsupported for import: `approvals`, `attachments`, `externallyLinkedWorkItems`, `linkedRevisions`, `planningConstraints`, `timePoint`, `workRecords`.

### 6.3 Special Query Constructs

#### HAS_VALUE (emptiness)
```
NOT HAS_VALUE:resolution
HAS_VALUE:targetRelease
```
Use `HAS_VALUE` — **not** the deprecated `CUSTOM_FIELDS:`, `######NULL`, `FIELDS:`, `ALL:ALL_VALUE`, `ALL:NO_VALUE`. For Activities, `NOT_HAS_VALUE` also exists.

#### Enumeration custom fields — `.KEY`
```
targetRelease.KEY:2.1.0        # correct
targetRelease:2.1.0            # deprecated
ReqCompliance.KEY:met
```

#### Relative dates — `$today$`
```
created:[$today - 2w$ TO $today - 1w$]
updated:[$today-30d$ TO $today$]
```
Shift units: `Nd` days, `Nw` weeks, `Nm` months, `Ny` years. `+` and `-` both work. Spaces inside `$…$` are ignored.

#### Documents
```
document.id:"Functional Requirements"                    # _default space — omit the space name
document.id:"Requirements/Functional Specification"      # named space
document.title:("Document_name_1" "Document_name_2")     # ALWAYS parenthesise multi-title queries
```
Without parentheses, `document.title:"A" "B"` also matches items containing "B" anywhere (title, description, comments, fields).

#### Outline numbers
```
outlineNumber:1.1.*
NOT HAS_VALUE:resolution AND document.id:"Specification/Functional Specification" AND outlineNumber:1.1*
outlineNumber:("PROJECT/SPACE/ID", "2*")
```
By default this searches the **HEAD revision only** (historical indexing is off). Always scope to a Document — otherwise the query scans every Document in the repository. Fails when matches exceed `luceneMaxClauseCount`.

#### Approvals
```
approvals:fullxxxapprovedxxxrProject      # awaiting/approved by user rProject
approvals:fullxxxdisapprovedxxx*          # disapproved by anyone
approvals:fullxxxwaitingxxx$[user.id]     # awaiting the current user
```
Build these in the visual Query Builder and use **Copy to Clipboard** rather than hand-writing them.

#### Baselines
```
baseObject:collection/*
baseObject:collection/17
baseObject:document/*
baseObject:"document/Specification/Formula 3"
baseObject:project
```

#### Plans
```
PLAN:(myProjectId/myPlanId)
PLAN:(myProjectId1/myPlanId1 myProjectId2/myPlanId2)
PLAN:(myProjectId/*)
PLAN:(*/myPlanId)
PLAN:(*)
```
Subject to `luceneMaxClauseCount` (20 000) and `com.siemens.polarion.platform.hardSearchSizeLimit` (100 000). `PLAN:(*)` alone fails when >20 000 items are planned; narrow it with `AND project.id:… AND …` (the added criteria must themselves match <100 000 items).

#### Test records
```
TEST_RECORDS:(<testRun>, <result>, <executedBy>, <whenExecuted>, <linkedType>)
```

| Component | Required | Values |
|---|---|---|
| test run | **yes** | `projectId/TestRunId` |
| test result | no | `"failed"` / `"passed"` / `"blocked"`, `@any`, `@null`, `*` |
| executed by | no | user ID, `*` |
| when executed | no | `yyyymmdd`, `yyyymmdd TO yyyymmdd`, `*` |
| linked work item type | no | `false` (default → Test Cases), `true` (→ Defects) |

```
TEST_RECORDS:("drivepilot/Initial System Verification Test",@any)
TEST_RECORDS:("drivepilot/Initial System Verification Test",@null)
TEST_RECORDS:("drivepilot/Full System Verification Test",@any,"mTest","$today-1w$ TO $today$")
TEST_RECORDS:("drivepilot/Initial System Verification Test","failed",*,*,"true")
```

### 6.4 Linked Work Item Queries

#### Single hop
```
linkedWorkItems:WI-10
linkedWorkItems:ProjectA/WI-10
linkedWorkItems:depends_on=WI-10
linkedWorkItems:depends_on=ProjectA/WI-10

backlinkedWorkItems:WI-10
backlinkedWorkItems:ProjectA/WI-10
backlinkedWorkItems:depends_on=WI-10
```
`linkedWorkItems` matches items whose **outgoing** links point at the target; `backlinkedWorkItems` matches items pointed **at** by the target. Qualify with `ProjectA/` when the same ID exists in several projects.

#### Multi-level — `linkedWorkItemsOf` (Polarion 2506+)
```
linkedWorkItemsOf:([{"filter":"…","follows":["…"],"steps":N}, {"filter":"…","follows":["…"],"steps":N}, …])
```

| Key | Meaning |
|---|---|
| `filter` | Lucene filter for that traversal level. Omitted → all matches |
| `follows` | Array of link role IDs to traverse. Omitted / `"Any"` → all roles |
| `steps` | Levels to traverse at this block. Default `1`. **Maximum 10** |

```
linkedWorkItemsOf:([{"filter":"id:DP\\-337 AND type:systemrequirement","steps":1}])
linkedWorkItemsOf:([{"filter":"id:DP\\-337 AND type:systemrequirement","steps":2,"follows":["implements","refines"]}])
linkedWorkItemsOf:([{"filter":"id:DP\\-337","follows":["refines"],"steps":1},{"filter":"NOT(id:DP\\-345)","steps":1}])
linkedWorkItemsOf:([{"filter":"id:DP\\-337","follows":["refines"]},{"filter":"type:softwarerequirement","follows":["verifies"]},{"filter":"type:softwaretestcase","follows":["triggered_by"]}])
```

**Escaping**: the UI escapes automatically; hand-written queries must **double-escape**.
- `id:DP\-337` → `"filter":"id:DP\\-337"`
- `TEST_RECORDS:("x",@any)` → `"filter":"TEST_RECORDS:(\"x\",@any)"`

**Velocity**: keep the `linkedWorkItemsOf` fragment in **single quotes** (it contains double quotes), and interpolate it into a double-quoted string so that `${projectId}` is still resolved.
```velocity
#set($hop   = 'linkedWorkItemsOf:([{"filter":"status:inprogress AND type:task","steps":1}])')
#set($query = "project.id:${projectId} AND ${hop}")
```
> The Polarion help's own example single-quotes the *entire* query, including `$projectId`. Velocity does not interpolate single-quoted strings, so that example sends the literal text `$projectId` — do not copy it verbatim.

**Classic Wiki**: you cannot inline it — save the query, then reference it by name.
```
{workitems: queryName = linkedWIQuery}
```

### 6.5 Tokenization

The system property `search.wordBoundaries` selects the algorithm; changing it requires a **full reindex**.

| Value | Behaviour |
|---|---|
| `splitByPattern` (**default**) | Split on whitespace via a regex (`search.wordBoundaries.splitByPattern` customises it), then strip leading/trailing non-alphanumerics |
| `standard` | Unicode-standard word boundaries. **Required for Asian languages** |

Practical effect — title `SW_ngcb_simulation` with default tokenization: `title:SW` ✗, `title:ngcb` ✗, `title:SW_ngcb` ✗, `title:SW_ngcb*` ✓. Title `WI-1234`: `title:WI` ✗ (default) but ✓ (standard). `title.1` always holds the whole untokenized title.

Switching after deployment changes existing query results, requires downtime for reindex, may affect performance and index size.

### 6.6 Combining Visual and Text Queries

- Appended free text is joined with **AND**: `[Type:Requirement][Assignee:Me] + severity:must_have` → `type:requirement AND assignee.id:$me AND severity:must_have`.
- Appending `OR …` implicitly parenthesises the visual part: `[aa:xx][bb:yy] + OR cc:zz` → `(aa:xx AND bb:yy) OR cc:zz`.
- With no visual filters, a leading `AND`/`OR` is ignored; a leading `NOT` behaves normally.

### 6.7 Engine Limits

| Property | Meaning | Default |
|---|---|---|
| `luceneMaxClauseCount` | Max OR/AND parts in one query (range queries expand into this form) | 20 000 |
| `luceneMaxFieldLength` | Max terms indexed per field per document. Raise when the log shows *"Lucene: maxFieldLength 50000 reached, ignoring following tokens"* — **requires a reindex** | 50 000 |
| `com.siemens.polarion.platform.hardSearchSizeLimit` | Hard result-size limit | 100 000 |

The 2512 help is inconsistent here: its syntax table says Polarion allows 2 048 clauses per query (Lucene's own default is 1 024), while the Lucene options reference and the Plans topic give `luceneMaxClauseCount` = 20 000. Check the value configured on your server. Either way, over-generic wildcards are what exhaust it.

---

## 7. SQL Query Development

Polarion's data layer is PostgreSQL. SQL queries are available as a query type in widgets, in the `SQL:(…)` prefix inside Lucene queries, and via the Rendering API's `searchBySql`.

> SQL is for complex join-type queries that would be inefficient in Lucene. Prefer Lucene otherwise.

**Without direct database access**, the schema of *your* server is documented by the SDK it serves:
`https://<host>/polarion/sdk/doc/database/TablesReferenceDetails.html` and `FullDBSchema.pdf` in the
same folder. Queries can be tested in the Work Items search bar with the `SQL:(…)` prefix (they must
return `WORKITEM.C_URI`) or inside a widget.

### 7.1 SQL Safety Rules

Polarion applies the configurable `com.polarion.platform.sql.invalidCommands` blocklist from `polarion.properties`. The exact list can vary by installation, so check the *System Configuration Properties Reference* and the target server before relying on a function or token. Rejected PostgreSQL queries may be logged as errors without a detailed client response.

**Rules**:
- Generate read-only, single-`SELECT` queries only. Never produce DDL, `INSERT`, `UPDATE`, or `DELETE` statements.
- Do not include SQL comments or chain statements with semicolons.
- Treat user-provided identifiers and values as untrusted input; validate identifiers against an allowlist and bind values where the calling API supports parameters.
- Scope report queries narrowly, normally by project, and select only the columns required by the consumer.
- Check the configured invalid-command list instead of assuming that a query accepted by one Polarion installation will run on another.

### 7.2 Query Shape & Environment Conventions

- **SHOULD** write table/column names **unqualified** (no `polarion.` prefix).
- **MUST** default output to `WORKITEM.C_URI` (not `C_ID` or `*`) for Polarion report engine queries.
- **MUST** ask the user if it is unclear whether the query feeds the report engine (→ select `C_URI` only) or is raw data extraction (→ select business columns).
- **NOTE**: the report engine resolves `C_URI` to live objects, so skip `C_DELETED` filtering and revision dedup in those queries.
- **CONSEQUENCE**: report-engine/widget SQL (`$transaction.objects().searchBySql`, `IDataService.sqlSearch`, tracker `SQL:(…)`) returns **objects**, not result rows. A query that returns aggregates (counts, pairs of documents) cannot feed them back directly. Return object URIs instead and aggregate in Velocity, or use one query per group.
- **MUST** always scope by project: `JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI` and filter `PROJECT.C_ID = '...'`.
- **MUST** preserve project ID casing exactly (case-sensitive).
- **SHOULD** use `LIKE` with `%`/`_` wildcards for pattern matching.
- **SHOULD** use `LENGTH(column) > n` for text-length filters.
- **NEVER** produce DDL, INSERT, UPDATE, or DELETE statements.

### 7.3 Schema Reference

#### Core Tables

**WORKITEM**:
`C_PK`, `C_URI`, `C_REV`, `C_DELETED`, `C_ID`, `C_TITLE`, `C_TYPE`, `C_STATUS`, `C_PREVIOUSSTATUS`, `C_PRIORITY`, `C_SEVERITY`, `C_RESOLUTION`, `C_DESCRIPTION` (HTML), `C_OUTLINENUMBER`, `C_LOCATION`, `C_CREATED`, `C_UPDATED`, `C_RESOLVEDON`, `C_DUEDATE`, `C_PLANNEDSTART`, `C_PLANNEDEND`, `C_INITIALESTIMATE`, `C_REMAININGESTIMATE`, `C_TIMESPENT`, `FK_PROJECT`/`FK_URI_PROJECT`, `FK_AUTHOR`/`FK_URI_AUTHOR`, `FK_MODULE`/`FK_URI_MODULE`, `FK_TIMEPOINT`/`FK_URI_TIMEPOINT`

**PROJECT**:
`C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID` (case-sensitive), `C_NAME`, `C_DESCRIPTION`, `C_ACTIVE`, `C_COLOR`, `C_ICON`, `C_TRACKERPREFIX`, `C_START`, `C_FINISH`, `C_LOCATION`, `C_LOCKWORKRECORDSDATE`, `FK_LEAD`/`FK_URI_LEAD`, `FK_PROJECTGROUP`/`FK_URI_PROJECTGROUP`

**T_USER**:
`C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID` (login), `C_NAME`, `C_EMAIL`, `C_INITIALS`, `C_DESCRIPTION`, `C_HOMEPAGECONTENT` (HTML), `C_AVATARFILENAME`, `C_DISABLEDNOTIFICATIONS`

**CATEGORY**:
`C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID`, `C_NAME`, `C_DESCRIPTION`, `FK_PROJECT`/`FK_URI_PROJECT`

**ENUM_OPTIONS**:
Composite PK `(C_PROJECT, C_TYPE, C_ENUMID, C_ID)`. `C_NAME`, `C_SORTORDER`, `C_HIDDEN`, `C_COLOR`, `C_ICONURL`, `C_URL`, `C_UILINK`, `C_DESCRIPTION`

**CF_WORKITEM** (Custom Fields, EAV):
`FK_WORKITEM`/`FK_URI_WORKITEM`, `C_NAME`, `C_BOOLEAN_VALUE`, `C_LONG_VALUE`, `C_FLOAT_VALUE`, `C_CURRENCY_VALUE`, `C_DATE_VALUE`, `C_DATEONLY_VALUE`, `C_DURATIONTIME_VALUE`, `C_STRING_VALUE`, `C_TEXT_VALUE`, `C_TESTSTEPS_VALUE` (jsonb)

**STRUCT_WORKITEM_LINKEDWORKITEMS**:
`C_PK`/`C_URI` (`struct_pk` type), `C_REV`, `C_DELETED`, `FK_P_WORKITEM`/`FK_URI_P_WORKITEM` (source), `FK_WORKITEM`/`FK_URI_WORKITEM` (target), `C_ROLE`, `C_SUSPECT` (bool), `C_REVISION` (text)

**Plain Relation Tables** (no PK/versioning):
- `REL_MODULE_WORKITEM`: `C_ID`, `FK_URI_MODULE`, `FK_WORKITEM`/`FK_URI_WORKITEM`
- `REL_WORKITEM_USER_ASSIGNEE`: `FK_WORKITEM`/`FK_URI_WORKITEM`, `FK_USER`/`FK_URI_USER`
- `REL_WORKITEM_CATEGORY_CATEGORIES`: `FK_WORKITEM`/`FK_URI_WORKITEM`, `FK_CATEGORY`/`FK_URI_CATEGORY`
- `REL_USER_WORKITEM_WATCHES`, `REL_USER_WORKITEM_VOTES`: `FK_USER`/`FK_URI_USER`, `FK_WORKITEM`/`FK_URI_WORKITEM`

**TESTRUN**:
`C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID`, `C_IDPREFIX`, `C_TITLE`, `C_TYPE`, `C_STATUS`, `C_GROUPID`, `C_QUERY`, `C_SELECTTESTCASESBY`, `C_ISTEMPLATE`, `C_USEREPORTFROMTEMPLATE`, `C_KEEPINHISTORY`, `C_HOMEPAGECONTENT` (HTML), `C_CREATED`, `C_UPDATED`, `C_FINISHEDON`, `FK_PROJECT`/`FK_URI_PROJECT`, `FK_AUTHOR`/`FK_URI_AUTHOR`, `FK_DOCUMENT`/`FK_URI_DOCUMENT`, `FK_SUMMARYDEFECT`/`FK_URI_SUMMARYDEFECT`, `FK_TEMPLATE`/`FK_URI_TEMPLATE`

**STRUCT_TESTRUN_RECORDS**:
`C_PK`/`C_URI` (`struct_pk`), `C_REV`, `C_DELETED`, `FK_P_TESTRUN`/`FK_URI_P_TESTRUN`, `FK_TESTCASE`/`FK_URI_TESTCASE`, `C_TESTCASEREVISION`, `FK_DEFECT`/`FK_URI_DEFECT`, `C_RESULT`, `FK_EXECUTEDBY`/`FK_URI_EXECUTEDBY`, `C_EXECUTED`, `C_DURATION`, `C_COMMENT`, `C_ITERATION`, `C_SIGNED`, `C_TESTSTEPRESULTS` (jsonb), `C_TESTPARAMETERS` (jsonb), `C_CUSTOM_FIELDS` (jsonb)

**PLAN**:
`C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID`, `C_NAME`, `C_STATUS`, `C_COLOR`, `C_DESCRIPTION`, `C_HOMEPAGECONTENT` (HTML), `C_ALLOWEDTYPES` (`_text` array), `C_CALCULATIONTYPE`, `C_ESTIMATIONFIELD`, `C_PRIORITIZATIONFIELD`, `C_CAPACITY`, `C_DEFAULTESTIMATE`, `C_PREVIOUSTIMESPENT`, `C_SORTORDER`, `C_STARTDATE`, `C_DUEDATE`, `C_STARTEDON`, `C_FINISHEDON`, `C_ISTEMPLATE`, `C_USEREPORTFROMTEMPLATE`, `FK_PROJECT`/`FK_URI_PROJECT`, `FK_AUTHOR`/`FK_URI_AUTHOR`, `FK_PARENT`/`FK_URI_PARENT`, `FK_TEMPLATE`/`FK_URI_TEMPLATE`

**STRUCT_PLAN_RECORDS**:
`C_PK`/`C_URI` (`struct_pk`), `C_REV`, `C_DELETED`, `FK_P_PLAN`/`FK_URI_P_PLAN`, `FK_ITEM`/`FK_URI_ITEM`

**BASELINE**:
`C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID`, `C_NAME`, `C_DESCRIPTION`, `C_LOCATION`, `C_BASEREVISION`, `FK_PROJECT`/`FK_URI_PROJECT`, `FK_AUTHOR`/`FK_URI_AUTHOR`, `FK_BASEOBJECT`/`FK_URI_BASEOBJECT`

**MODULE** (LiveDoc), verified in the 2512 schema documentation: `C_PK`/`C_URI`/`C_REV`/`C_DELETED`, `C_ID`, `C_TITLE`, `C_TYPE`, `C_STATUS`, `C_CREATED`, `C_UPDATED`, `C_LOCATION`, `C_MODULEFOLDER` (space), `C_MODULENAME`, `C_MODULELOCATION`, `C_MODULEABSOLUTELOCATION`, `C_STRUCTURELINKROLE`, `FK_AUTHOR`/`FK_URI_AUTHOR`, `FK_UPDATEDBY`/`FK_URI_UPDATEDBY`, `FK_PROJECT`/`FK_URI_PROJECT`; branching/reuse metadata `FK_BRANCHEDFROM`/`FK_URI_BRANCHEDFROM`, `C_BRANCHEDWITHQUERY`, `C_BRANCHEDWITHINITIALIZEDFIELDS`, `FK_DERIVEDFROM`/`FK_URI_DERIVEDFROM`, `C_DERIVEDFROMLINKROLE`, `C_DERIVEDFIELDS`, `FK_VARIANT`/`FK_URI_VARIANT`. Work items reference their containing document through `WORKITEM.FK_URI_MODULE`.
> Work items that a branched document only *references* (not overwritten) keep `FK_URI_MODULE` pointing to the original document, so a branch without overwritten items is visible only through `MODULE.FK_URI_BRANCHEDFROM`.
> **Verified on 2512**: `FK_URI_BRANCHEDFROM` is set on every branch (with or without overwritten items), `FK_URI_DERIVEDFROM` on documents reused with derivation; a plain copy/reuse sets neither and can only be found through its `duplicates` links. `C_ID` and `C_MODULENAME` both hold the document name. Tracker `SQL:(…)` accepts `SELECT DISTINCT` and `GROUP BY … HAVING COUNT(*)`.

**STRUCT_WORKITEM_LINKEDWORKITEMSDERIVED**: same columns as `STRUCT_WORKITEM_LINKEDWORKITEMS` (present in the 2512 schema). Its exact semantics (reverse/back-link view) are not yet verified. Query `STRUCT_WORKITEM_LINKEDWORKITEMS` for links as stored on the source item.

> The 2512 schema documentation lists `C_DELETED` as `CHAR(1)`. If `C_DELETED IS NOT TRUE` (§7.5) is rejected on your server, compare with the stored values instead.

**Document signature tables** (used in §7.9): `MODULE`, `DOCUMENTWORKFLOWSIGNATURE`, `STRUCT_DOCUMENTWORKFLOWSIGNATURE_SIGNATURES` (`FK_URI_SIGNEDBY`, `C_VERDICT`).

**Collection tables**: `COL_MODULE` (`c_uri`, `c_col_rev`) and siblings — used only in the Collection context (§2.8).

### 7.4 Work Item Links

**Directionality**:
- `FK_P_WORKITEM`/`FK_URI_P_WORKITEM` = **source** (owns/defines the link)
- `FK_WORKITEM`/`FK_URI_WORKITEM` = **target**
- `C_ROLE` = link role (e.g. `'verifies'`, `'implements'`)

**Items that ARE the source of a link to X**:
```sql
SELECT WORKITEM2.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
INNER JOIN STRUCT_WORKITEM_LINKEDWORKITEMS AS SWL ON SWL.FK_URI_WORKITEM = WORKITEM.C_URI
INNER JOIN WORKITEM AS WORKITEM2 ON WORKITEM2.C_URI = SWL.FK_URI_P_WORKITEM
WHERE Project.C_ID='TestDP2310_2'
  AND WORKITEM2.C_TYPE= 'issue'
  AND WORKITEM.C_TYPE = 'testcase'
```

**Rules**:
- MUST decide direction deliberately.
- SHOULD filter `C_ROLE` when a specific link role is requested.
- SHOULD use `OR` chains on `C_TYPE` for "linked to any of several types".

**NOT Linked Pattern**:
```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
WHERE Project.C_ID='PerfoT1'
  AND WORKITEM.C_TYPE= 'requirement'
  AND WORKITEM.C_URI NOT IN (
    SELECT WORKITEM.C_URI
    FROM WORKITEM
    INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
    INNER JOIN STRUCT_WORKITEM_LINKEDWORKITEMS AS SWL ON SWL.FK_URI_WORKITEM = WORKITEM.C_URI
    INNER JOIN WORKITEM AS WORKITEM2 ON WORKITEM2.C_URI = SWL.FK_URI_P_WORKITEM
    WHERE Project.C_ID='PerfoT1'
      AND WORKITEM.C_TYPE= 'requirement'
      AND WORKITEM2.C_TYPE = 'testcase'
  )
```

**Both Directions Pattern (UNION)**:
```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
INNER JOIN STRUCT_WORKITEM_LINKEDWORKITEMS AS SWL ON SWL.FK_URI_WORKITEM = WORKITEM.C_URI
INNER JOIN WORKITEM AS WORKITEM2 ON WORKITEM2.C_URI = SWL.FK_URI_P_WORKITEM
WHERE Project.C_ID='TestDP2310_2'
  AND WORKITEM2.C_TYPE= 'issue'
  AND WORKITEM.C_TYPE = 'testcase'
UNION
SELECT WORKITEM2.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
INNER JOIN STRUCT_WORKITEM_LINKEDWORKITEMS AS SWL ON SWL.FK_URI_WORKITEM = WORKITEM.C_URI
INNER JOIN WORKITEM AS WORKITEM2 ON WORKITEM2.C_URI = SWL.FK_URI_P_WORKITEM
WHERE Project.C_ID='TestDP2310_2'
  AND WORKITEM2.C_TYPE= 'issue'
  AND WORKITEM.C_TYPE = 'testcase'
```

### 7.5 Versioning Model

**Apply only for raw/analytical queries, NOT report-engine `C_URI` queries**.

| Column | Meaning |
|---|---|
| `C_PK` | Primary key of this specific revision row |
| `C_URI` | Stable identity of the logical object across all revisions |
| `C_REV` | Revision number of this row |
| `C_DELETED` | `true` if this revision is a deletion |

**Rules**:
- MUST filter `C_DELETED IS NOT TRUE` on every versioned table.
- MUST deduplicate to the latest revision per `C_URI`:

```sql
SELECT w.*
FROM WORKITEM w
INNER JOIN (
    SELECT c_uri, MAX(c_rev) AS max_rev
    FROM WORKITEM
    WHERE c_deleted IS NOT TRUE
    GROUP BY c_uri
) latest ON latest.c_uri = w.c_uri AND latest.max_rev = w.c_rev
WHERE w.c_deleted IS NOT TRUE
```

- NEVER join two versioned tables on `FK_X = C_PK` for "current data" (it pins to a historical snapshot). Use `FK_URI_X = C_URI`.
- Plain relation tables have **no** `C_DELETED`/`C_REV` columns — apply deletion filtering via the joined entity table.

### 7.6 Custom Fields (EAV Model)

Custom fields are rows in `CF_WORKITEM` (not columns on `WORKITEM`):
- `FK_WORKITEM`/`FK_URI_WORKITEM`
- `C_NAME` (field key)
- Exactly one populated value column per type (`C_BOOLEAN_VALUE`, `C_LONG_VALUE`, `C_FLOAT_VALUE`, `C_CURRENCY_VALUE`, `C_DATE_VALUE`, `C_DATEONLY_VALUE`, `C_DURATIONTIME_VALUE`, `C_STRING_VALUE`, `C_TEXT_VALUE`, `C_TESTSTEPS_VALUE`)

**Rules**: pivot via a join filtered on `C_NAME`; pick the value column matching the field's actual type.

```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
INNER JOIN CF_WORKITEM cf ON cf.FK_URI_WORKITEM = WORKITEM.C_URI AND cf.C_NAME = 'customerPriority'
WHERE Project.C_ID='PerfoT1'
  AND cf.C_STRING_VALUE = 'High'
```

### 7.7 Enum-Coded Columns

`C_STATUS`, `C_SEVERITY`, `C_PRIORITY`, `C_TYPE`, `C_RESOLUTION` store the Polarion enum **ID/code**, not the UI display label.

- SHOULD filter directly on the raw code (e.g. `WORKITEM.C_TYPE = 'testcase'`).
- MUST join through `ENUM_OPTIONS` if the user supplies a UI label.

### 7.8 Mixed Lucene + SQL Queries

```sql
SQL:(Select WORKITEM.C_URI FROM WORKITEM inner join PROJECT on WORKITEM.FK_URI_PROJECT = PROJECT.C_URI WHERE Project.C_ID='DS_SOLUTION' and WORKITEM.C_TYPE= 'businessusecase' and WORKITEM.C_STATUS NOT LIKE 'Obsolete') AND bucTargetRelease.KEY:(23_04 23_07 Release_23_10_T4) AND NOT status:obsolete
```

Treat the `SQL:(...)` portion as a normal single-`SELECT` query subject to all SQL firewall rules.

### 7.9 Struct Queries — Test Steps, Test Parameters, Signatures

> **Warning**: these use PostgreSQL-specific `jsonb` operators. Siemens recommends ISO SQL Standard 2017 JSON operators where possible — `jsonb` behaviour can change between PostgreSQL versions and break reports without notice.

**Test records matched by test parameter**:
```sql
select TESTRUN.C_URI
from TESTRUN
inner join PROJECT on PROJECT.C_URI = TESTRUN.FK_URI_PROJECT
inner join STRUCT_TESTRUN_RECORDS on TESTRUN.C_URI = STRUCT_TESTRUN_RECORDS.FK_URI_P_TESTRUN
inner join WORKITEM on STRUCT_TESTRUN_RECORDS.FK_URI_TESTCASE=WORKITEM.C_URI
where true
and PROJECT.C_ID='drivepilot'
and TESTRUN.C_TYPE = 'manual'
and STRUCT_TESTRUN_RECORDS.C_RESULT='passed'
and STRUCT_TESTRUN_RECORDS.C_TESTPARAMETERS->>'Browser' similar to '%Chrome'
```

**Test step results correlated with the test case's steps**:
```sql
select TESTRUN.C_URI
from TESTRUN
inner join PROJECT on PROJECT.C_URI = TESTRUN.FK_URI_PROJECT
inner join STRUCT_TESTRUN_RECORDS on TESTRUN.C_URI = STRUCT_TESTRUN_RECORDS.FK_URI_P_TESTRUN
inner join WORKITEM on STRUCT_TESTRUN_RECORDS.FK_URI_TESTCASE=WORKITEM.C_URI
inner join CF_WORKITEM on CF_WORKITEM.FK_WORKITEM=WORKITEM.C_PK
cross join jsonb_array_elements(STRUCT_TESTRUN_RECORDS.C_TESTSTEPRESULTS) with ordinality step_result_arr(step_result, step_result_index)
cross join jsonb_array_elements(CF_WORKITEM.c_testSteps_value) with ordinality steps_arr(steps, steps_index)
where true
and PROJECT.C_ID = 'drivepilot'
and TESTRUN.C_ID='Initial System Verification Test'
and step_result_arr.step_result->>'result'::text = 'failed'
and steps_index=step_result_index
```

**Documents awaiting a given user's signature**:
```sql
SELECT distinct module.c_id, t_user.c_name
FROM struct_documentworkflowsignature_signatures, documentworkflowsignature, module, t_user
where documentworkflowsignature.c_pk=struct_documentworkflowsignature_signatures.fk_p_documentworkflowsignature
and documentworkflowsignature.FK_WORKFLOWOBJECT=module.c_pk
and struct_documentworkflowsignature_signatures.FK_URI_SIGNEDBY = t_user.c_pk
and t_user.c_id='tina'
and struct_documentworkflowsignature_signatures.c_verdict='invited'
```

**Work Items by a value inside Test Step parameters**:
```sql
select fk_workitem, testparameter_expectedresult_arr.param::text
from cf_workitem
cross join jsonb_array_elements(cf_workitem.c_teststeps_value) with ordinality test_steps_arr(step, step_index)
cross join jsonb_array_elements(test_steps_arr.step->'testParameter'->'expectedResult') with ordinality testparameter_expectedresult_arr(param, param_index)
where testparameter_expectedresult_arr.param::text similar to '%(Linux)%'
```

---

## 8. REST API

Modern integration surface. Based on **JSON:API**, with documented deviations (notably bulk create/update/delete). SOAP Web Services still exist but are legacy.

### 8.1 Discovery

| Resource | URL |
|---|---|
| Swagger UI | `https://<host>/polarion/rest/v1` |
| OpenAPI definition | `https://<host>/polarion/rest/v1/openapi.json` |
| SDK & Javadoc | `https://<host>/polarion/sdk/index.html` |

Coverage started with Work Items and their most-used companions (linked work items, attachments, comments) and has grown release by release. The `openapi.json` on **your** server is the authoritative list of resources and operations for your version — generate clients from it rather than from memory.

### 8.2 Authentication

**Personal Access Token (PAT) — the normal path**:
```
Authorization: Bearer <personal_access_token>
```
- Create at **My Account → Personal Access Token**: enter a Name and an expiry date, click **Create Token**, then **copy it immediately — it is never shown again**.
- Max lifetime is capped by `com.siemens.polarion.security.personalAccessToken.maxDaysBeforeExpiry` (default **90** days; 90–180 recommended).
- Users manage their own tokens; administrators can revoke any token.
- Missing/invalid token → `401 Unauthorized`.
- Polarion REST calls are authenticated via **JWT**; currently only PAT-based JWTs are supported.

**From inside a Polarion page/widget — no PAT needed**:
Enable it first:
```properties
com.siemens.polarion.rest.security.restApiToken.enabled=true
```
Then use the session-bound `X-Polarion-REST-Token` header, obtained from `top.getRestApiToken()`. It dies with the session.

```html
<script>
function fetchRestAPI(resource, options) {
  var restToken = top.getRestApiToken();
  if (options == undefined) { options = {}; }
  if (options.headers == undefined) { options.headers = new Headers(); }
  if (options.headers instanceof Headers) {
    options.headers.set("X-Polarion-REST-Token", restToken);
    options.headers.set("Accept", "application/json");
  } else {
    options.headers["X-Polarion-REST-Token"] = restToken;
    options.headers["Accept"] = "application/json";
  }
  return fetch(resource, options);
}

fetchRestAPI("/polarion/rest/v1/projects/drivepilot/workitems/DP-584")
  .then(response => {
    if (!response.ok) { throw new Error("HTTP error! Status: " + response.status); }
    return response.json();
  })
  .then(json => console.log("fetchRestAPI json: ", json));
</script>
```

> When this script sits inside a Velocity widget, avoid `${…}` template literals and `$`: Velocity would try to resolve them (§3.1.9).
>
> **Security**: this token performs read/write **as the user viewing the page**. Restrict page write permissions to trusted authors, or a malicious widget acts on viewers without their knowledge. REST API Endpoint permissions must also be configured before users can call endpoints.

**Other token types**: `X-Polarion-token-type: jwt` (external JWT; requires a JWT authenticator in `authentication.xml`) and `X-Polarion-token-type: tcss` + `X-Polarion-user-id` (Teamcenter SSO).

**SOAP with a token**:
```java
sessionService.logInWithToken("AccessToken", null, "<yourPersonalAccessToken>");
// replaces sessionService.logIn("user", "pass");
```

### 8.3 URL & Resource Shape

```
/polarion/rest/v1/projects/{projectId}/workitems
/polarion/rest/v1/projects/{projectId}/workitems/{workItemId}
/polarion/rest/v1/all/workitems                                   # cross-project
/polarion/rest/v1/projects/{projectId}/workitems/{id}/linkedworkitems
/polarion/rest/v1/projects/{projectId}/workitems/{id}/comments
/polarion/rest/v1/projects/{projectId}/workitems/{id}/attachments
```

Every resource carries three identifiers: `type` (e.g. `workitems`), `id` (**fully qualified**, e.g. `myProject/WI-123`), and an optional `revision`.

```json
{
  "data": {
    "type": "workitems",
    "id": "myProject/WI-123",
    "attributes": { "id": "WI-123", "type": "requirement" },
    "relationships": { }
  }
}
```

**Headers**: requests send `Content-Type: application/json` (or `multipart/form-data` for attachments); responses are `application/json` (or `application/octet-stream` for file content). Typical statuses: `200` GET, `201` POST create, `204` PATCH / POST without body, `400/401/403` errors.

### 8.4 Query Parameters

| Parameter | Example | Notes |
|---|---|---|
| `fields[<type>]` | `?fields[projects]=id,trackerPrefix` | Sparse fieldsets. `@basic` = minimal set, `@all` = everything (expensive) |
| `include` | `?include=project,author&fields[users]=name` | Related resources returned in the `included` array |
| `page[size]`, `page[number]` | `?page[size]=10&page[number]=5` | Default page size 100 (configurable). `meta.totalCount` is returned |
| `query` | `?query=type:systemrequirement AND status:reviewed` | Same Lucene syntax as the UI's *Convert to Text* output — see §6 |
| `sort` | `?sort=~created` | `~` = descending; multiple criteria separated by spaces |
| `revision` | `?revision=15357` | Historical read |

Responses carry `self`, `related`, `portal`, `first`/`prev`/`next`/`last`, and `content` links. **Treat links as opaque** — do not parse them.

### 8.5 Relationships

**Via the primary resource (PATCH)**:
```json
{
  "data": {
    "type": "workitems",
    "id": "myProject/WI-100",
    "relationships": {
      "assignee": { "data": [{ "type": "users", "id": "mTest" }] }
    }
  }
}
```

**Via the relationship endpoint (POST `…/workitems/WI-100/comments`)**:
```json
{
  "data": [{
    "type": "workitem_comments",
    "attributes": {
      "title": "Test title",
      "text": { "type": "text/html", "value": "Comment content" }
    }
  }]
}
```

### 8.6 Constraints

- **Project-level objects need fully qualified IDs**: `"myProject/interface"`, not `"interface"`. An unqualified reference in a PATCH/POST returns `400 Bad Request`.
- Relationship arrays are truncated at a configurable maximum.
- Included resources are capped by `com.siemens.polarion.rest.maxIncludedSize` (≈500 by default).
- `@all` fieldsets are expensive — enumerate the fields you actually need.

---

## 9. Java Extensions & the SDK

### 9.1 The SDK

Installed with Polarion at `[POLARION_HOME]/polarion/sdk`, and served at `https://<host>/polarion/sdk/index.html`. It contains:

- **Javadoc** for the Open API (`sdk/doc/javadoc/…`) and the Rendering API (`sdk/doc/javadoc-rendering/…`)
- The **embedded database schema** documentation
- The **Scripting API** section — the allowlisted methods usable in Polarion Scripting
- Supported scripting languages and engines
- Libraries, source code, and example extension projects
- *SQL Query Examples for Collections*

You can copy the SDK to developer machines or host it internally.

### 9.2 Key Open API Types

| Type | Role |
|---|---|
| `com.polarion.alm.tracker.ITrackerService` | Main entry point. `queryWorkItems(project, luceneQuery, sortField)`, `findWorkItem(...)`, `getWorkItem(...)`, `getModuleManager()`, `getBaselineCollectionsManager()`, `getDataService()` |
| `com.polarion.alm.tracker.model.IWorkItem` | Work Item; extends `IWorkflowObject` and `IWithAttachments` |
| `com.polarion.alm.tracker.model.IModule` | Document (LiveDoc) |
| `com.polarion.alm.tracker.model.ITestRun` | Test Run |
| `com.polarion.alm.tracker.model.IModuleComment` | Document comment (`isResolvedComment()`) |
| `com.polarion.alm.projects.IProjectService` | Projects, users |
| `com.polarion.platform.security.ISecurityService` | Roles, permissions, `getCurrentUser()` |
| `com.polarion.alm.tracker.ITestManagementService` | Test data |
| `com.polarion.platform.persistence.IDataService` | Underlying data service |
| `com.polarion.platform.ITransactionService` | Transactions |
| `com.polarion.core.util.types.Text` | `Text.plain(...)`, `Text.html(...)` for rich fields |

Note: almost everything is documented via its **interface** (`I…`). A class whose package contains `ws` is a **Web Service** DTO, not the Open API type — do not confuse `com.polarion.alm.ws.client.types.tracker.WorkItem` with `IWorkItem`.

### 9.3 Extension Structure & Deployment

- Extensions are **OSGi bundles** (JARs) built in Java; Eclipse is the conventional IDE.
- Deploy under `<Polarion>/polarion/extensions/` — conventionally `extensions/<your.extension>/eclipse/plugins/<bundle>.jar` — and **restart Polarion**.
- Declare Polarion bundles you depend on via the `Require-Bundle` OSGi manifest header.
- Set `Bundle-Activator` when the bundle contributes a form extension or otherwise needs lifecycle hooks.
- Keep an eye on the JDK/`javax` package requirements of your target Polarion version — newer Polarion releases reject bundles referencing removed `javax` packages.
- Unlike Velocity widgets, a Java extension **requires a server restart** and is therefore not suitable for rapid iteration.

### 9.4 When to Choose Java

Choose Java only when Velocity + Polarion Scripting genuinely cannot do the job:
- The UI needs a stateful, interactive control (form extension, custom editor).
- Work exceeds the scripting timeouts (10 s interactive / 600 s scheduled).
- You need APIs outside the scripting allowlist.
- You need to package and version the logic as a product across many servers.

Otherwise prefer Polarion Scripting — no restart, repository-versioned, permission-controlled, and monitorable.

---

## 10. Configuration Reference

### 10.1 Custom Field Types

**Basic types**: String (single line), Text (multi-line), Rich Text, Integer, Float, Currency, Time, Date, Date time, Duration, Boolean, **Enum** (requires an existing Enumeration), **Test Steps** (renders a Test Steps table), **Table** (renders a configurable table field).

### 10.2 Dynamic Enumeration Types

These `@…` IDs produce lists from live Polarion data and are what you pass as the second argument to `$factory.enumeration(label, id)` or select as an Enum custom field's source. Most accept an optional Lucene `QUERY`; without one they return everything visible in the current project.

| ID | UI Name | Returns |
|---|---|---|
| `@build ( +[QUERY] )` | Build | Builds |
| `@category` | Category | Categories configured for the current project |
| `@collection ( +[QUERY] )` | Collection | Collections |
| `@document ( +[QUERY] )` | Document | Documents |
| `@documentWiki ( +[QUERY] )` | Documents & Pages | Documents, Pages and Wiki Pages |
| `@plan ( +[QUERY] )` | Plan | Plans (not user-sortable) |
| `@project ( +[PROJECT GROUP] )` | Project | Projects in a group; all active projects if no group given |
| `@projectGroup ( +[PROJECT GROUP] )` | Project Group | Project Groups |
| `@richPage ( +[QUERY] )` | Page | Pages |
| `@role` | Role | Roles in the current project |
| `@testRun ( +[QUERY] )` | Test Run | Test Runs |
| `@timePoint ( +[QUERY] )` | Time Point | Time Points |
| `@user ( +[QUERY] )` | User | Users |
| `@wiki ( +[QUERY] )` | Wiki Page | Wiki Pages |

Whenever a Query is used (including none), values are restricted to the current project — except for inherently global objects (`@role`, `@project`, `@projectGroup`).

There is no `@space` type: spaces cannot be offered as a dynamic enumeration (checked against the 2512 list). Verified
selector behaviour (`@document` current project only, object classes) is in §2.1.

Tip: build the query in the relevant topic's Query Builder, use **Convert to text**, and paste the result into the Query field.

### 10.3 Default Enumeration Configuration Files (repository scope)

| Work Item Field | File | Applies to |
|---|---|---|
| Hyperlinks: Role | `hyperlink-role-enum.xml` | All |
| Priority | `priority-enum.xml` | All |
| Resolution | `resolution-enum.xml` | All |
| Resolution | `requirement-resolution-enum.xml` | Requirement |
| Risk | `risk-enum.xml` | All |
| Severity | `severity-enum.xml` | All |
| Severity | `requirement-severity-enum.xml` | Requirement |
| Status | `status-enum.xml` | All |
| Status | `requirement-status-enum.xml` | Requirement |
| Link Role | `workitem-link-role-enum.xml` | All |
| Type (of Work Item) | `workitem-type-enum.xml` | All |
| Work Records: Type | `work-record-type-enum.xml` | All |

Project templates may ship different files for template-specific types.

### 10.4 Link Roles

Configured in `workitem-link-role-enum.xml` (Administration → Work Items → Enumerations).

| Attribute | Rules |
|---|---|
| **ID** | Required. No spaces; ASCII letters, digits, underscore only |
| **Name** | Required. Spaces allowed. What the source item shows |
| **Opposite Name** | Required. Spaces allowed. What the *linked* item shows |
| **Default** | The role pre-selected in the Linked Work Items section |
| **Parent** | Marks the role as defining the parent/child hierarchy. This drives **Calculated Field aggregation** (sum, multiply, average, min, max are *always* computed over this hierarchy) and makes children move with the parent into a Document |
| **Description** | Free text |

> **Verified on 2512**: read the roles in a widget with
> `$trackerService.getTrackerProject($projectId).getWorkItemLinkRoleEnum().getAllOptions()` → `getId()`, `getName()`,
> `getOppositeName()` (e.g. `satisfies` / `satisfies` / `is satisfied by`). Label a link with the **name** from the source
> item's side and the **opposite name** from the target item's side (e.g. a traceability matrix of the target document).
> `satisfies` links are stored on the downstream item (source) and point to the specification item (target).

**Rules** on each role restrict which Work Item types may be linked with it (e.g. `verifies` only from Test Case to Requirement). Defining rules is important — they drive the UI and prevent users from creating traceability that is wrong but looks valid in dashboards.

For links between **Reused or Branched** Documents, use a standard role such as `duplicates` rather than system roles like `branched` or `derived`.

Roles observed in the Siemens standard configuration (reported by a project owner on 2512, configurable per project):

| Operation | Link role created between the work items |
|---|---|
| Document copy / LiveDoc reuse | `duplicates` |
| Branch, work item overwritten in the branch | `branched_from` |
| Reuse with the derivation option | `derived_from` |

**Direction (verified on 2512)**: for all three roles the link is stored on the copy/branch/derived item (`STRUCT_WORKITEM_LINKEDWORKITEMS.FK_URI_P_WORKITEM`, link source) and points to the original item (`FK_URI_WORKITEM`). A branch links only its *overwritten* items; a branch with nothing overwritten has no such links and is visible only through the document's "branched from" metadata.

Copied documents are linked to their source through a "branched from" document field, and copied work items through a "branched from" link (Siemens, Polarion 2016 compare/merge and 2310 bulk branching announcements). Never hard-code these IDs: read them from `workitem-link-role-enum.xml` or expose them as widget parameters.

**Inherited links (verified on 2512)**: copying a document that is itself a copy keeps the copied items' existing links. Items of the copy of a copy link with `duplicates` both to their direct source and to the original (the inherited link keeps its older link revision). Any document-level inference from item links must remove these transitive relations.

### 10.5 Form Layout (Work Item Editor)

**Administration → Work Items → Form Configuration → Form Layouts.** An XML file per (Interface View × Work Item type). The global `-- Default --` view with the `-- unspecific --` type cannot be deleted (everything else derives from it).

- Adding a custom field whose ID collides with a built-in field (`id`, `title`, `description`, …) is **not supported** and causes undefined behaviour.
- Read-only flags set here do **not** apply to Work Item tables — configure read-only fields separately if you need that.
- Inline editing can still bypass a form-layout read-only flag.
- Work Item extensions load **asynchronously** by default, so a failing external integration does not block the rest of the item. `com.siemens.polarion.ui.synchronousFormExtensions=true` disables this (deprecated; expected to be removed).

### 10.6 Calculated Fields

**Administration → Work Items → Calculated Fields.**

- Calculated fields are **not committed to the repository** and are therefore **not available in SQL queries or the repository index** — do not try to query them.
- They aggregate over the parent/child hierarchy defined by the `Parent` link-role flag (§10.4).
- In Burn-up/Burn-down charts, only **direct children** are used — multi-level calculation is unsupported.
- Calculated fields do not appear in a Document when **On-demand Work Item Loading** is active (items are loaded from baselines); they still appear in the Work Item Properties sidebar and Editor.
- Scripts *can* write to calculated/derived fields — guard against it (§4.12).

### 10.7 Scheduled Jobs

Jobs live in `.polarion/jobs/schedule.xml` (accessible via the Repository Browser).

```xml
<job name="Work Report" id="tracker.workreport" cronExpression="0 0 0 ? * *" scope="system">
  <fileName>scheduled_work_report_{yyyy-MM-dd}.xls</fileName>
  <overwrite>true</overwrite>
  <title>Work Report</title>
  <scale>week</scale>
  <grouping>project,user</grouping>
  <query></query>
  <periodStart></periodStart>
  <periodFinish></periodFinish>
</job>
```

- `scale`: `day`, `week`, `month`.
- `grouping`: comma-separated from `project`, `projectGroup`, `category`, `user`, `workItem`, `type`.
- `periodStart` / `periodFinish`: `date:yyyy-MM-dd`, `timePoint:TIMEPOINT_ID`, `firstTimePoint`, `lastTimePoint`, `projectStart`, `projectFinish`.
- `fileName` accepts a `{…}` Java `SimpleDateFormat` block, replaced with the formatted current date.
- `overwrite=false` + an existing file → the job **fails**.
- If `query` is omitted, both `periodStart` and `periodFinish` are mandatory.

### 10.8 Build Configuration (`artifacts.xml`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<artifacts xmlns="http://polarion.com/schema/Builder/Artifacts"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="http://polarion.com/schema/Builder/Artifacts"
           auto-recognition="false">
  <artifact>
    <type>TYPE</type>
    <location>BASE_LOCATION_RELATIVE_TO_PROJECTS_REPOSITORY_LOCATION</location>
    <resources>
      <resource source="REPOSITORY_LOCATION_RELATIVE_TO_BASE_LOCATION"
                target="TARGET_LOCATION_IN_LOCAL_DEPLOYMENT_SPACE"
                recurse="true"/>
    </resources>
  </artifact>
</artifacts>
```
`location` may be omitted (defaults to the project's location); `resources` may be omitted (the whole base location becomes one resource).

### 10.9 Collections Configuration

Add to Navigation via the project's Topic configuration:
```xml
<topic id="collections"/>
```
Creating Collections requires **both** `CREATE NEW` and `MODIFY` permissions. In 2512+ installs, default Collection permissions are pre-defined in `permission.xml`. **After a Polarion update, all global and project-level Collection permissions must be redefined** (only `admin` keeps them by default). SVN access for `.polarion/collection/instances` must be granted manually for custom project templates (the folder only appears once a Collection exists).

### 10.10 Custom Work Item Form Panels (Velocity)

Render a custom panel inside the Work Item Editor with Velocity + HTML + JavaScript — the lightest way to add UI to the Work Item form without a Java extension.

1. Write the `.vm` script.
2. Place it in one of these locations. They are searched **in this order**, and the first match wins:
   1. Project: `<project root>/.polarion/scripts/<script>.vm`
   2. Global: `<repository root>/.polarion/scripts/<script>.vm`
   3. Installation: `/opt/polarion/scripts/<script>.vm` (Linux) · `C:\Polarion\polarion\scripts\<script>.vm` (Windows). If nothing is found, an error is thrown.
3. **Administration → Work Items → Form Configuration**, edit the Form Layout for the target type, and add:

```xml
<extension id="velocity_form" label="Test Form" script="my_script.vm" myParam1="myValue1" myParam2="myValue2"/>
<!-- sub-folders are allowed: script="sub_folder/my_script.vm" -->
```

- `id` **must** be `velocity_form`.
- `label` is the panel title.
- Any extra attribute becomes a parameter, read in the script as `$attributes.myParam1`.

Inside the script:

| Variable | Meaning |
|---|---|
| `$object` | The current Work Item (Open API) |
| `$attributes` | Parameters from the `<extension>` tag |
| `$trackerService`, other Open API services | Available |
| `$transaction` | Rendering API |

```velocity
#if(!$object.isUnresolvable() && $object.isPersisted())
  #set($wi = $transaction.workItems().getBy().oldApiObject($object))
  ## In form panels .render() needs an explicit format and target:
  $wi.render().htmlFor().forFrame()
#end
```

**Limitations**: panel content **cannot be printed**. JavaScript runs in Work Item Editor extensions from Polarion 2019 SR3 onward.

### 10.11 Limiting Links Shown in Work Item Headers

To keep items with hundreds of links usable:

1. Set `workitems.linkedWorkItemsLimit` in Configuration Properties. The limit applies to links and backlinks independently; `-1` disables it.
2. In `workitem-link-role-enum.xml`, tick **Limited** on the roles to cap. **Nothing is capped until at least one role is Limited**, and non-limited roles are listed first.

Caveats: the limited list sorts differently from the full Linked Work Items section; clicking the link count does nothing if the layout lacks `<field id="linkedWorkItems"/>`; hidden-link counts can be inexact; Suspect flags on hidden links raise no notification; print and email output show only the limited list, with no indication that it is truncated.

---

## 11. Best Practices

### 11.1 Velocity Scripting

1. **Always use `.render()` for display**: `$workItem.fields.id.render()`, not `$workItem.id`.
2. **Use quiet references for optional values**: `$!variable`.
3. **Check field emptiness properly**: `.isUnset()` for Rendering API fields.
4. **No newlines inside directives**; control directives on their own lines.
5. **Guard linked items**: `$target && !$target.isUnresolvable() && type != "heading"`; use `getIfCan()` on Rendering API struct fields.
6. **Prefer the Rendering API for display**; switch to the Open API only when it falls short.
7. **Use the Open API for cross-project gathering**, then convert with `oldApiObject(...)` to render.
8. **Single-quote any query containing `linkedWorkItemsOf`**.
9. **Render a warning** (`$renderingContext.renderWarning(...)`) when a required parameter is missing, instead of producing an empty widget.
10. **Escape user-supplied field values** before putting them in HTML.

### 11.2 Polarion Scripting

1. **Mind the terminal-expression contract** — Conditions return the last value; Save Hooks must end `true` or nothing. Wrap stray return values in `console.log(...)`.
2. **Use `throw new PolarionScriptingException(msg)`** to block a save with a user-visible reason.
3. **Never start or commit transactions**; call `save()` on changed objects.
4. **Keep interactive scripts under the 10 s budget** — they run while the user waits.
5. **Give Save Hooks distinct `Order` numbers**.
6. **Never derive logic from revision numbers.**
7. **Put shared code in Global scripts** and `import` it; cross-project imports are impossible.
8. **Disable monitoring in production**; never monitor Conditions.
9. **Allowlist HTTP hosts explicitly** and wrap every external call in `try/catch`.
10. **Read secrets from the vault**, never hard-code them.
11. **Test on a sandbox project** — a bad Save Hook can block saving for everyone.

### 11.3 SQL Queries

1. **Check the target server’s SQL blocklist** (§7.1).
2. **Use read-only, single-`SELECT` queries without SQL comments or statement chaining.**
3. **Validate external identifiers against an allowlist and bind values where supported.**
4. **Always scope by project** via `PROJECT.C_ID`.
5. **Preserve case sensitivity** for `PROJECT.C_ID` and `WORKITEM.C_ID`.
6. **Select `C_URI`** for report-engine queries.
7. **Apply versioning rules** (`C_DELETED`, latest `C_REV`) for analytical queries only.
8. **Use `CASE WHEN`** for conditionals and null handling.
9. **Avoid wide text columns** (`C_DESCRIPTION`, `C_HOMEPAGECONTENT`) unless requested.
10. **Treat `jsonb` operators as fragile** — they are PostgreSQL-version-specific.
11. **Do not query Calculated Fields** — they are not in the database.

### 11.4 Queries (Lucene)

1. **Parenthesise anything with mixed operators.**
2. **Restrict every query** with `type`, `status`, and `project.id`.
3. **Use `.KEY` for enum custom fields** and `HAS_VALUE` for emptiness.
4. **Scope outline-number queries to a Document.**
5. **Avoid over-generic wildcards** — they explode into clauses and hit `luceneMaxClauseCount`.
6. **Use index IDs, not field IDs**, in the query portion.

### 11.5 Performance

1. **Pre-fetch once, filter in memory** (e.g. work item histories for time series).
2. **Build maps** for link traversal outside rendering loops.
3. **Use count queries** when you only need counts.
4. **Limit result sizes** with `queryWorkItemsLimited()` or equivalent.
5. **Avoid `PLAN:(*)` and other unbounded wildcard queries.**
6. **Do the heavy lifting once in a Page Script** and share it via `$pageContext` (thread-safe objects only).
7. **Do not grow a large string in a loop** (`#set($s = "${s};${x}")` in a `#foreach` is quadratic): collect values in a
   list and print them with a `#foreach` directly in the output (practice).
8. **Pass data to inline JavaScript as hidden `data-*` attributes**, escaped with `$esc.html`, with separators replaced
   inside values. Cap what is written per page and show a warning when the cap is reached (practice).

### 11.6 CSS & Export

1. **Prefix CSS classes** (e.g. `.kpi-table`) to avoid clashes; reuse `polarion-rpw-*` where you want the native look.
2. **Put `<style>` blocks at the top** of `render.vm`.
3. **Use inline CSS** for PDF/Print rendering (external stylesheets may not load).
4. **Avoid `overflow:hidden`** in PDF (content can be clipped).
5. **Branch on `$widgetContext.target().isPdf()` / `isPrint()`** and drop JavaScript in those modes.

---

## 12. Common Patterns

### 12.1 Velocity Patterns

#### Parameter Reading with Fallback
```velocity
#if($pageParameters.myParam)
  #set($myParam = $pageParameters.myParam.value())
#else
  #set($myParam = "default")
#end
```

#### Safe Work Item Access
```velocity
#set($wi = $trackerService.getWorkItem($projectId, $wiId))
#if($wi && !$wi.isUnresolvable())
  ## Safe to use $wi
#end
```

#### Aggregated Warning Pattern
```velocity
#set($invalidItems = [])
#foreach($id in $inputIds)
  #set($wi = $trackerService.getWorkItem($projectId, $id))
  #if(!$wi || $wi.isUnresolvable())
    $!invalidItems.add($id).null
  #end
#end
#if($invalidItems.size() > 0)
  <div style="color:red;border:1px solid red;padding:8px;">
    Warning: The following IDs could not be resolved: $invalidItems
  </div>
#end
```

#### Context-Aware Rendering
```velocity
#set($isEditor = $widgetContext.target().isEditor())
#set($isPDF    = $widgetContext.target().isPdf())
#set($isPrint  = $widgetContext.target().isPrint())

#if($isPDF || $isPrint)
  ## Minimal styling, no JavaScript
  <div style="font-size:10pt;">$content</div>
#elseif($isEditor)
  ## Full interactive output
  <div style="font-size:13px;">$content</div>
#end
```

#### Sum a Duration Field Across Linked Items
```velocity
#set($sum = false)
#foreach($workRecord in $workItem.fields().workRecords())
  #set($durationValue = $workRecord.fields().timeSpent().getIfCan())
  #if($durationValue)
    #if(!$sum)
      #set($sum = $durationValue)
    #else
      #set($sum = $sum.add($durationValue))
    #end
  #end
#end
#if(!$sum)
  #set($sumToRender = "0")
#else
  #set($sumToRender = $sum.normalize().toString())
#end
$sumToRender
```

### 12.2 Polarion Scripting Patterns

> These are illustrative patterns composed from documented Open API methods, not verbatim Siemens examples. Before deploying, confirm every method used is on your server's Scripting API allowlist (SDK → *Scripting API*), and test on a sandbox project.

#### Require a field before a transition (Condition)
```javascript
var wi = context.getTarget();
var result = true;
if (wi.getCustomField("ReqCompliance") == null) {
  result = "Set 'Compliance' before moving this requirement to Released.";
}
result;
```

#### Copy a value onto linked items (Function)
```javascript
const wi    = context.getTarget();
const links = Java.from(wi.getLinkedWorkItemsStructsDirect());
for (let i = 0; i < links.length; i++) {
  const ls = links[i];
  if (ls.getLinkRole().getId() !== "verifies") { continue; }
  const target = ls.getLinkedItem();
  if (!target || target.isUnresolvable()) { continue; }
  target.setCustomField("lastVerifiedBy", wi.getId());
  target.save();
}
```

#### Validate on save (Save Hook)
```javascript
const wi = context.getTarget();
if (wi.getType().getId() === "requirement") {
  const puid = wi.getCustomField("puid");
  if (puid === null || puid === "") {
    throw new PolarionScriptingException("Every requirement must have a PUID.");
  }
}
true;
```

### 12.3 SQL Patterns

#### Basic Project-Scoped Query
```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
WHERE Project.C_ID='PerfoT1'
  AND WORKITEM.C_TYPE = 'testcase'
  AND WORKITEM.C_ID LIKE 'PTA-1567%'
```

#### Work Items with Long Descriptions
```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
WHERE Project.C_ID='PerfoT6'
  AND (WORKITEM.C_TYPE= 'testcase' OR WORKITEM.C_TYPE= 'testsuite')
  AND LENGTH(WORKITEM.C_DESCRIPTION) > 250
```

#### Requirements Containing a Specific Token
```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
WHERE Project.C_ID='SmokProj'
  AND WORKITEM.C_DESCRIPTION LIKE '%PUID=035%'
  AND WORKITEM.C_TYPE = 'requirement'
```

#### Work Items NOT in a Specific Status
```sql
SELECT WORKITEM.C_URI
FROM WORKITEM
INNER JOIN PROJECT ON WORKITEM.FK_URI_PROJECT = PROJECT.C_URI
WHERE Project.C_ID='DS_SOLUTION'
  AND WORKITEM.C_TYPE= 'businessusecase'
  AND WORKITEM.C_STATUS NOT LIKE 'Obsolete'
  AND (WORKITEM.C_TITLE NOT LIKE '%[Mission]%')
```

#### Latest Revision Query (Analytical)
```sql
SELECT w.*
FROM WORKITEM w
INNER JOIN (
    SELECT c_uri, MAX(c_rev) AS max_rev
    FROM WORKITEM
    WHERE c_deleted IS NOT TRUE
    GROUP BY c_uri
) latest ON latest.c_uri = w.c_uri AND latest.max_rev = w.c_rev
WHERE w.c_deleted IS NOT TRUE
  AND w.C_TYPE = 'requirement'
```

### 12.4 Lucene Query Patterns

#### Base Query
```velocity
#set($projectId  = $page.getReference().projectId())
#set($baseQuery  = "project.id:${projectId} AND type:requirement")
```

#### Status Filter
```velocity
#set($query = $baseQuery + " AND status:released")
```

#### Multi-Hop Link Traversal
```velocity
#set($hop   = 'linkedWorkItemsOf:([{"filter":"type:requirement","follows":["verifies"]}])')
#set($query = "project.id:${projectId} AND type:testcase AND ${hop}")
```

#### Date Range
```velocity
## Option A — query-engine constant. Keep it single-quoted so Velocity does not treat $today as a reference.
#set($dateClause = 'updated:[$today-30d$ TO $today$]')
#set($query = "project.id:${projectId} AND ${dateClause}")

## Option B — compute the dates in Velocity
#set($todayStr  = $date.format('yyyyMMdd', $date.get()))
#set($lastMonth = $date.format('yyyyMMdd', $date.get(-2592000000)))
#set($query = "project.id:${projectId} AND updated:[${lastMonth} TO ${todayStr}]")
```

#### Enum Field with `.KEY`
```velocity
#set($query = "project.id:${projectId} AND type:requirement AND ReqCompliance.KEY:met")
```

#### HAS_VALUE Check
```velocity
#set($query = "project.id:${projectId} AND type:requirement AND HAS_VALUE:ReqCompliance")
```

#### Items in a Document, at an Outline Level
```velocity
#set($q = '"')
#set($query = "project.id:${projectId} AND document.id:${q}Specification/Functional Specification${q} AND outlineNumber:1.1*")
```

### 12.5 Collection Patterns

#### Building an ID Allowlist from a Collection
```velocity
#set($collectionWIidList  = [])
#set($collectionManager   = $trackerService.getBaselineCollectionsManager())
#foreach($collectionParameter in $collectionListParameter.values())
  #set($collection = $collectionManager.getCollection($projectId, $collectionParameter.id))
  #if($collection && !$collection.isUnresolvable())
    #foreach($element in $collection.getElements())
      #set($document = $element.getObjectWithRevision())
      #if($document && !$document.isUnresolvable())
        #foreach($wi in $document.filterWorkItems("NOT type:heading"))
          $!collectionWIidList.add($wi.getId()).null
        #end
      #end
    #end
  #end
#end
```

#### Collection Documents and Items at the Collection Revision (verified on 2512)
```velocity
#set($colRef = false)
#set($ctx = $transaction.context())
#if($ctx)
  #set($colRef = $ctx.contextCollection())
#end
## No context (PDF export, page outside the collection): fall back to an @collection parameter
#if(!$colRef && $parameters.collection.values().size() > 0)
  #set($colRef = $parameters.collection.values().get(0).getModelObject().getReference())
#end
#if($colRef)
  #set($docs = $transaction.objects().searchBySql("select c_uri, c_col_rev from col_module").collection($colRef))
  #set($itemSql = "select w.c_uri, w.c_col_rev from col_workitem w inner join col_module m on m.c_uri = w.fk_uri_module")
  #foreach($cw in $transaction.objects().searchBySql($itemSql).collection($colRef))
    #set($wi = $cw.getOldApi())
    ## group $wi by $wi.getModule() (document at the collection revision)
  #end
#end
```
One query for all items, grouped in Velocity, is faster than one query per document. Check `isUnresolvable()` on the
selected collection's model object before using it.

#### Filtering by Collection
```velocity
#foreach($wi in $allWorkItems)
  #set($wiId = $wi.getId())
  #if($collectionWIidList.size() == 0 || $collectionWIidList.contains($wiId))
    ## Process $wi
  #end
#end
```

---

## 13. Validation & Debugging

### 13.1 Pre-Submission Checklist — Velocity

1. [ ] All `#if`, `#foreach`, `#set`, `#macro` directives are on single lines
2. [ ] Control directives (`#if`, `#else`, `#end`, …) are on their own lines
3. [ ] All work item IDs use `.render()`
4. [ ] Optional values use `$!` or explicit `#if` checks
5. [ ] Rendering API fields use `.isUnset()` for emptiness checks
6. [ ] Linked items are guarded (`$target && !$target.isUnresolvable() && type != "heading"`, or `getIfCan()`)
7. [ ] Lucene queries include `project.id:${projectId}`
8. [ ] No bare `*` in Lucene queries; no leading wildcards
9. [ ] `linkedWorkItemsOf` uses `([...])` and is in a **single-quoted** Velocity string
10. [ ] All parameters have fallbacks/defaults, and missing required parameters render a warning
11. [ ] User-supplied field values are escaped before being emitted as HTML
12. [ ] PDF/Print branch avoids JavaScript and external stylesheets
13. [ ] Velocity 1.4 dialect only (§3.1.9): single-line method chains, no `{}` map literals, no backslashes in string literals, no directive names in plain text; `#[[ ]]#`, `#break` and `$foreach` do nothing
14. [ ] Every `.vm` file parses with `velocity-1.4.jar` before upload
15. [ ] Collection-aware widgets: fallback `@collection` parameter for the PDF export (no context there); link targets resolved through the collection tables, not `getLinkedItem()` (HEAD)

### 13.2 Pre-Submission Checklist — Polarion Scripting

1. [ ] Script **Type** matches the intended use (it cannot be changed later)
2. [ ] **Reference Name** is unique case-insensitively and ends in `.js`
3. [ ] Conditions end with `true` / `false` / an explanatory `String` as the **last statement**
4. [ ] Save Hooks end with `true` or nothing — no stray value as the last expression
5. [ ] Blocking uses `throw new PolarionScriptingException(userFacingMessage)`
6. [ ] No explicit transaction start/commit; every modified object has `save()` called
7. [ ] Save Hooks have distinct `Order` values
8. [ ] No logic depends on revision numbers
9. [ ] Only allowlisted API methods are used
10. [ ] External HTTP hosts are allowlisted, requests have timeouts, and failures throw
11. [ ] Interactive scripts fit within the ~10 s budget
12. [ ] Monitoring is disabled for production scripts (and always for Conditions)
13. [ ] Secrets come from `userAccountVault`, not literals
14. [ ] Imports use the exact-case Reference Name, and only `/global/` or same-project paths

### 13.3 Pre-Submission Checklist — SQL

1. [ ] Query is compatible with the target server’s configured SQL blocklist (§7.1)
2. [ ] Query contains no SQL comments (`--` or `/* */`)
3. [ ] It is a read-only, single `SELECT` statement with no chained statements
4. [ ] It is scoped to a project via `PROJECT.C_ID`, with exact casing
5. [ ] Context is clear: report engine (→ `C_URI` only) vs raw analytical (→ business columns + versioning)
6. [ ] If links are involved, direction (`FK_P_WORKITEM` vs `FK_WORKITEM`) is correct
7. [ ] `C_ROLE` is filtered when a specific link role was requested
8. [ ] Conditional/null-handling uses `CASE WHEN … END`
9. [ ] Wide/HTML text columns are excluded unless requested
10. [ ] No attempt to query Calculated Fields
11. [ ] All types, custom fields, statuses, UID fields, and link roles match the target project's vocabulary

### 13.4 Pre-Submission Checklist — Queries

1. [ ] Mixed `AND`/`OR`/`NOT` expressions are parenthesised
2. [ ] Enum custom fields use `.KEY`
3. [ ] Emptiness uses `HAS_VALUE` / `NOT HAS_VALUE`, not `######NULL` / `CUSTOM_FIELDS` / `ALL:NO_VALUE`
4. [ ] Index IDs (not field IDs) appear in the query portion
5. [ ] Outline-number queries name a Document
6. [ ] `linkedWorkItemsOf` special characters are double-escaped
7. [ ] `steps` ≤ 10

### 13.5 Debugging Techniques

#### Velocity
1. **Show Log** in LiveReport edit mode surfaces `#error`, `#warning` and exceptions. **Show Result** in the Page Script sidebar shows the script's output.
2. **Temporary debug output**: `<pre>DEBUG: myVar=$myVar</pre>`.
3. **Silent-failure decoder**:
   - Blank output → unclosed `#if`/`#foreach`
   - Directive printed as literal text → newline inside the directive
   - `$variable` printed literally → typo, or the variable is undefined (Velocity renders undefined references verbatim)
   - Wrong count → wrong API (Open vs Rendering), or a missing `project.id` scope
   - Widget shows nothing after a config change → check the Velocity Widgets Administration page; the widget may have been overwritten or deleted
4. **Unknown-API bisection**: when a chain of calls against an Open/Rendering API object produces
   empty results and you are not certain every method name and argument type is correct, do not
   just keep guessing against the live page — print `$!object` (toString, often reveals field names
   directly, e.g. a struct's `field=value` dump) and `$!object.getClass().getName()` (works even
   when broader reflection is sandboxed) after each step of the chain to confirm what actually came
   back before trusting the next call in the chain. See §3.7 for a worked example of tracking down
   a silently-empty result this way.

#### Polarion Scripting
1. `console.log()` is the only instrument — no debugger exists.
2. Read `log4j-scripts-TIMESTAMP.log` under `[POLARION]/polarion/data/logs/main`.
3. Enable **Monitored** + **Logs Stored** temporarily and use **Script Monitor** for live logs, timings, and failure status.
4. `UNABLE TO START` (Scheduled) → schedule too tight, or all scheduler workers busy.
5. `FAILED` (Scheduled) → often the `Updated By` user cannot log in.
6. Save silently blocked → check whether an earlier Save Hook in the `Order` chain threw.
7. Workflow action permanently greyed out → a **missing workflow function**; a missing *condition* instead fails at save time.

#### SQL
1. **Test in the Query Builder** with the `SQL:` prefix.
2. If rejected, inspect the server log and check the configured `com.polarion.platform.sql.invalidCommands` blocklist.
3. Verify project scoping and exact casing.
4. For report-engine queries, verify `C_URI` is what is selected.

#### REST
1. `401` → missing/expired/invalid token.
2. `400` on PATCH/POST → an object reference is not fully qualified (`myProject/interface`).
3. Truncated `included` array → raise or respect `com.siemens.polarion.rest.maxIncludedSize`.

### 13.6 Common Pitfalls

#### Velocity
- Newlines inside directives break the parser, and so do method chains split across lines (also in `parameters.vm`)
- Velocity 1.5+/1.7 syntax is rejected (`{}` map literals) or silently ignored (`#[[ ]]#`, `#break`, `$foreach`) by 2512 widgets (§3.1.9)
- `#if(...)$var#end` inline on one line does not work
- Undefined variables are rendered as literal text
- Wrong API for the job (Rendering API for cross-project gathering, or vice versa)
- Missing `isUnresolvable()` / `getIfCan()` guards
- Double-quoted `linkedWorkItemsOf` strings
- Calling a nonexistent method (e.g. `StructureNodeStruct.getWorkItemId()`, which does not exist —
  use `.getWorkItem()`, see §3.7) does not error; it silently evaluates to nothing, so a `#foreach`
  or `#if` built on it just produces zero results with no diagnostic
- `getModuleManager().getModule(project, path)` needs a `Location` object
  (`$projectLocation.getLocation($path)`) as the second argument, not a raw path string — a raw
  string also silently resolves to nothing (§3.7)
- Raw Java reflection (`.getClass().getMethods()`) is sandboxed and returns an empty list rather
  than erroring — it looks like "no methods matched" when it actually means "reflection is
  blocked here"; `.getClass().getName()` still works and is the reliable way to identify a class

- Collection context is null in the Polarion PDF export; `getLinkedItem()` returns the HEAD target even for an item read at a collection revision (§2.8)
- The `@document` selector lists the current project only, even with other projects in scope (§2.1)

#### Polarion Scripting
- Wrong terminal expression (Save Hook returning a number → save always fails)
- Assuming `return` works at top level (it does not)
- Building logic on revision numbers
- Expecting a Save Hook to run on a move/delete
- Expecting a hook on Baseline creation for a Document/Collection
- Forgetting `save()`
- Forgetting that Scheduled Scripts run as the *last editor*, not as you

#### SQL
- Blocked commands (`COALESCE`, `NULLIF`, …)
- Comments anywhere, even inside string literals
- `;`-chained statements
- Missing project scope
- Case-sensitivity of `PROJECT.C_ID`
- Missing `C_DELETED` / revision dedup in analytical queries
- Joining versioned tables on `FK_X = C_PK` instead of `FK_URI_X = C_URI`

#### Queries
- Unparenthesised `NOT … OR …`
- Leading wildcards
- Enum custom field without `.KEY`
- Outline-number query without a Document scope
- `PLAN:(*)` on a large repository

---

## Appendix A: Velocity Context Variables

### A.1 LiveReport Pages & Widgets

| Variable | Type | Description |
|---|---|---|
| `$page` | LiveReport page | `$page.getReference().projectId()` for the current project |
| `$transaction` | ReadOnlyTransaction | Rendering API entry point; `$transaction.context().contextCollection()` for Collection context (null outside a collection and in the PDF export, verified on 2512) |
| `$trackerService` | `ITrackerService` | Open API entry point |
| `$projectService` | `IProjectService` | Project operations |
| `$securityService` | `ISecurityService` | `getCurrentUser()` |
| `$testManagementService` | `ITestManagementService` | Test data |
| `$document` | `IModule` | Current document (Wiki Content Blocks only) |
| `$date` | — | Date utilities |
| `$widgetContext` | — | `target().isEditor()`, `isPdf()`, `isPrint()` (widgets only) |
| `$renderingContext` | RichPage(Widget)RenderingContext | `createChartBuilder()`, `createJsActionsBuilder()`, `renderWarning()`, `columnWidth` |
| `$objectFactory` | — | `newMap()`, `newSet()` |
| `$math` | — | `round()`, `floor()`, `ceil()` |
| `$parameters` | — | Widget parameters (widgets only — **not** in a Page Script) |
| `$pageParameters` | — | Current page/widget parameters |
| `$pageContext` | — | Data shared from the Page Script; read-only for widgets; must be thread-safe |
| `$factory` | ParameterFactory | Builds parameters in `parameters.vm` |
| `$esc` | — | Escaping helper (`${esc.d}` → `$`) |
| `$isPDF` | boolean | Convenience PDF flag |

### A.2 Classic Wiki Pages, LiveReport Pages & LiveDocs

Officially documented Velocity variables and their API classes:

| Variable | API Class | Notes |
|---|---|---|
| `$calendarTool` | `com.polarion.wiki.util.CalendarTool` | |
| `$document` | `com.polarion.alm.tracker.model.IModule` | **Wiki Content Blocks only**, not Wiki Pages |
| `$me` | — | Velocity context only; the current user's ID |
| `$page` | `com.polarion.alm.wiki.model.IWikiPage` | |
| `$plan` | `com.polarion.alm.tracker.model.IPlan` | Old wiki pages used as Plan pages |
| `$platformService` | `com.polarion.platform.IPlatformService` | |
| `$projectService` | `com.polarion.alm.projects.IProjectService` | |
| `$securityService` | `com.polarion.platform.security.ISecurityService` | |
| `$testManagementService` | `com.polarion.alm.tracker.ITestManagementService` | |
| `$testRun` | `com.polarion.alm.tracker.model.ITestRun` | Old wiki pages used as Test Run pages |
| `$trackerService` | `com.polarion.alm.tracker.ITrackerService` | |
| `$transactionService` | `com.polarion.platform.ITransactionService` | |
| `$wikiService` | `com.polarion.alm.wiki.IWikiService` | |

> Velocity variables and Page parameters can be used in PDF header/footer configurations, **but only for Classic Wiki pages**.

### A.3 Work Item Form Panels (`velocity_form`)

| Variable | Description |
|---|---|
| `$object` | Current Work Item (Open API `IWorkItem`) |
| `$attributes` | Custom attributes declared on the `<extension>` tag |
| `$transaction` | Rendering API; use `.render().htmlFor().forFrame()` |
| `$trackerService` etc. | Open API services |

---

## Appendix B: Configuration File Map

Paths are relative to the repository root (global scope) or a project folder (project scope).

| Path | Contents |
|---|---|
| `.polarion/polarion-project.xml` | Project definition |
| `.polarion/tracker/workflow/{type}-workflow.xml` | Work Item workflow per type |
| `.polarion/tracker/fields/workitem-type-enum.xml` | Work Item types |
| `.polarion/tracker/fields/{type}-custom-fields.xml` | Custom field definitions |
| `.polarion/tracker/fields/{type}-status-enum.xml` | Status enumerations |
| `.polarion/tracker/fields/workitem-link-role-enum.xml` | Link roles and rules |
| `.polarion/tracker/templates/` | Template Work Items, round-trip templates (`roundtrip.docx`) |
| `.polarion/tracker/export_templates/excel` | Excel export templates |
| `.polarion/tracker/import_configurations/word`, `…/excel` | Saved import configurations |
| `.polarion/hats/_default/tracker/{type}-form-layout.xml` | Work Item Editor form layouts |
| `.polarion/savehooks/savehooks.xml` | Save Hook configuration |
| `.polarion/scripts/` | Velocity scripts for custom Work Item form panels (`velocity_form`, §10.10); looked up project → global → installation `scripts/` |
| `.polarion/jobs/schedule.xml` | Scheduled jobs |
| `.polarion/security/permissions.xml` | Permissions |
| `.polarion/security/user-roles.xml` | Role assignments |
| `.polarion/access` | SVN access rules |
| `.polarion/pages/widgets/<widgetId>/` | Uploaded Velocity widgets |
| `.polarion/pages/spaces/<Space>/permissions.xml` | Space permissions |
| `.polarion/collection/instances` | Collection instances (SVN access must be granted) |
| `.polarion/testing/configuration/configuration.xml` | Test configuration |
| `.polarion/testing/configuration/testrecord-table-settings.xml` | Test record table |
| `.polarion/builder/artifacts.xml`, `build.properties`, `descriptors.xml` | Build management |
| `.polarion/reports/calculation.properties` | Report calculations |
| `.polarion/reqif/configurations`, `.polarion/reqif/documents` | ReqIF import/export |
| `.polarion/wiki/watermarks/<name>/` | PDF watermarks |
| `.polarion/projects/templates/` | Project templates |
| `.polarion/user-management/` | User management config |

Server filesystem (not in SVN):

| Path | Contents |
|---|---|
| `[POLARION_HOME]\polarion\configuration\polarion.properties` (Windows) · `[POLARION_HOME]/etc/polarion.properties` (Linux) | System properties — restart required after changes |
| `[POLARION_HOME]/polarion/configuration/log4j2.xml` | log4j override |
| `[POLARION_HOME]/polarion/extensions/` | Java extensions (restart required) |
| `[POLARION_HOME]/polarion/sdk/` | SDK, Javadoc, examples |
| `[POLARION_HOME]/polarion/data/logs/main/` | Logs |
| `[POLARION_HOME]/polarion/plugins/com.polarion.alm.wiki_*/…/macros.vm` | Built-in Velocity macros |
| `/opt/polarion/scripts/` (Linux) · `C:\Polarion\polarion\scripts\` (Windows) | Legacy Groovy/JS workflow scripts, `script.job` scripts, fallback form-panel `.vm` scripts |

Windows default `[POLARION_HOME]` = `C:\Polarion`; Linux = `/opt/polarion` with data under `/opt/polarion/data`.

---

## Appendix C: Key System Properties

Set in `polarion.properties` unless noted. Those marked *(runtime)* are also editable under **Global Administration → Configuration Properties**.

### Scripting
| Property | Default |
|---|---|
| `com.siemens.polarion.scripting.enabled` | `true` |
| `com.siemens.polarion.scripting.scheduledScripts.enabled` | `true` |
| `com.siemens.polarion.scripting.maxTotalScriptsExecutionTime` | 10 s |
| `com.siemens.polarion.scripting.maxScriptExecutionTime` | 10 s |
| `com.siemens.polarion.scripting.maxScheduledScriptExecutionTime` | 600 s |
| `com.siemens.polarion.jobs.scheduler.threadCount` | 10 |
| `com.siemens.polarion.jobs.scheduler.jobMisfireThresholdMs` | 10000 |
| `com.siemens.polarion.scripting.monitoringDb.connectionUri` / `scripting.monitoringDb.connectionUri` *(runtime)* | — |
| `com.siemens.polarion.scripting.monitoringDb.recreateTableOnRestart` | `false` |
| `scripting.httpClient.allowedHosts` *(runtime)* | empty |
| `com.polarion.scripting.allowedSecurityServiceMethods` | empty (legacy scripts) |
| `com.polarion.scripting.job.allowedSecurityServiceMethods` | empty (legacy job scripts) |
| `com.polarion.wiki.allowedSecurityServiceMethods` | empty (Classic Wiki) |
| `com.polarion.scripting.servlet.enabled` | disabled — enables the `/polarion/scripting` direct-run page (admins only) |

### Search & Query
| Property | Default |
|---|---|
| `luceneMaxClauseCount` | 20 000 |
| `luceneMaxFieldLength` | 50 000 |
| `com.siemens.polarion.platform.hardSearchSizeLimit` | 100 000 |
| `search.wordBoundaries` | `splitByPattern` |
| `search.wordBoundaries.splitByPattern` | (regex) |
| `com.siemens.polarion.lucene.outlineNumbers.historicalIndexing.enabled` | `false` |
| `com.polarion.platform.sql.invalidCommands` | (blocklist) |
| `com.polarion.ui.defaultQuery` | `NOT HAS_VALUE:resolution` |

### REST & Security
| Property | Default |
|---|---|
| `com.siemens.polarion.rest.security.restApiToken.enabled` | `false` |
| `com.siemens.polarion.rest.maxIncludedSize` | ~500 |
| `com.siemens.polarion.security.personalAccessToken.maxDaysBeforeExpiry` | 90 |

### UI & Widgets
| Property | Default |
|---|---|
| `velocityWidgets.directoryDepthLimit` *(runtime)* | 10 |
| `velocityWidgets.zipFileNameLengthLimit` *(runtime)* | 30 |
| `velocityWidgets.entryNameLengthLimit` *(runtime)* | 30 |
| `velocityWidgets.maxNumberOfEntries` *(runtime)* | 30 |
| `velocityWidgets.entrySizeLimitMB` *(runtime)* | 30 |
| `maxAttachmentSize` | — |
| `com.siemens.polarion.ui.document.lazyLoad.enabledByDefault` | 200 |
| `com.siemens.polarion.ui.synchronousFormExtensions` | `false` |
| `workitems.linkedWorkItemsLimit` *(runtime)* | — (`-1` = no limit) |
| `com.polarion.ui.lock.timeout` | — |
| `attachments.indexingOfAttachmentContent.enabled` | — |

### NodeJS (formula rendering)
| Property | Default |
|---|---|
| `com.siemens.polarion.nodeJsServer.autoStart` | `true` |
| `com.siemens.polarion.nodeJsServer.host` | `127.0.0.1` |
| `com.siemens.polarion.nodeJsServer.port` | 34568 |
| `com.siemens.polarion.nodeJsServer.queueLength` | 511 |
| `com.siemens.polarion.nodeJsServer.killOldProcess` | `true` |

---

## Sources

- Siemens, *Polarion Administrator and User Help*, Software Version **Polarion 2512** (2025) — chapters 2–9, in particular the *Polarion Scripting Guide* (ch. 5), *Authentication guide* (ch. 6), *Administration reference* (ch. 8) and *Polarion SDK* (ch. 9).
- [Polarion REST API — Basic Concepts](https://developer.siemens.com/polarion/basic-concepts.html)
- [Polarion REST API — Authentication](https://developer.siemens.com/polarion/authentication.html)
- [Polarion SDK](https://developer.siemens.com/polarion/sdk.html)
- [Polarion REST API v1 Swagger UI (example instance)](https://industry-solutions.polarion.com/polarion/rest/v1)
- [Rendering vs Open API — The Polarion Blog](https://polarion.code.blog/2020/06/16/rendering-vs-open-api/)
- [ITrackerService Javadoc (example instance)](https://testdrive.polarion.com/polarion/sdk/doc/javadoc/com/polarion/alm/tracker/ITrackerService.html)
- [Polarion database schema reference (example instance)](https://testdrive.polarion.com/polarion/sdk/doc/database/TablesReferenceDetails.html)
- Findings from the Polarion Branches Widget project spike on a Polarion 2512 instance (2026-10-27): Velocity 1.4 parser behaviour (§3.1.9), link-role conventions (§10.4)

*Last updated: 2026-10-27*
