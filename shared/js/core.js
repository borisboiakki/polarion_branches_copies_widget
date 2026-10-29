  /*
   * Shared client core of the document widgets (docBranches, docCoverage).
   *
   * tools/build-widget.py places this fragment inside each widget's IIFE, before the widget's own
   * graph.js code, so nothing is global. Velocity parses the result: no dollar sign, hash sign,
   * backslash or non-ASCII character in this file (the build checks it). Use HASH in URLs.
   *
   * Edge categories ("cats") describe the kinds of relation a widget draws:
   *   [{ id: 'branch', name: 'branch', label: 'Branches', color: 'rgb(...)', dash: '9,5' }, ...]
   * in precedence order (the first category present on an edge gives its line style). An edge is
   *   { o: originKey, c: targetKey, kinds: { catId: count }, meta: { catId: bool }, indirect: bool,
   *     samples: [{ c: itemInTarget, o: itemInOrigin, k: catId }], ... widget fields }
   */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var HASH = String.fromCharCode(35);
  var INDIRECT_COLOR = 'rgb(150,150,150)';
  var EXTRA_FIELDS = [
    ['type', 'Type'], ['status', 'Status'], ['created', 'Created'], ['updated', 'Updated'], ['items', 'Work items']
  ];
  var NODE_W = 240;
  var LINE_H = 15;
  var PAD = 8;
  var COL_GAP = 130;
  var ROW_GAP = 22;
  var MARGIN = 20;
  var FONT = 'Segoe UI, Arial, sans-serif';
  // Non-ASCII characters are built at runtime so the template stays ASCII-only.
  var ARROW = String.fromCharCode(8594);
  var ELLIPSIS = String.fromCharCode(8230);
  var MINUS = String.fromCharCode(8722);
  var DASH = String.fromCharCode(8211);

  // ------------------------------------------------------------------ helpers

  function el(tag, attrs, parent, text) {
    var e = document.createElement(tag);
    setAttrs(e, attrs);
    if (text !== undefined) { e.textContent = text; }
    if (parent) { parent.appendChild(e); }
    return e;
  }

  function svg(tag, attrs, parent, text) {
    var e = document.createElementNS(SVG_NS, tag);
    setAttrs(e, attrs);
    if (text !== undefined) { e.textContent = text; }
    if (parent) { parent.appendChild(e); }
    return e;
  }

  function setAttrs(e, attrs) {
    if (!attrs) { return; }
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
        e.setAttribute(k, attrs[k]);
      }
    }
  }

  function trunc(s, n) {
    s = s || '';
    return s.length > n ? s.substring(0, n - 1) + ELLIPSIS : s;
  }

  function toInt(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  function pct(part, whole) {
    if (!whole || whole <= 0) { return null; }
    return Math.round(100 * part / whole);
  }

  function basePath() {
    var p = window.location.pathname;
    return p.substring(0, p.lastIndexOf('/') + 1);
  }

  // Documents and work items open in their own project (node.project, from the page model). In a collection (col =
  // "collection project/collection id", root data-col) they open in the collection context, at the collection revision:
  // .../project/P/collection/ID/... for the collection's project, .../project/P/collection/CP//ID/... for another
  // project (formats rendered by Polarion 2512, docCoverage spike K2/K3).
  function projectPath(project, col) {
    var p = basePath() + HASH + '/project/' + encodeURIComponent(project);
    if (!col) { return p; }
    var i = col.lastIndexOf('/');
    var cp = col.substring(0, i);
    var cid = encodeURIComponent(col.substring(i + 1));
    return p + '/collection/' + (cp === project ? cid : encodeURIComponent(cp) + '//' + cid);
  }

  function docUrl(node) {
    return projectPath(node.project, node.col) + '/wiki/' + encodeURIComponent(node.space) + '/' + encodeURIComponent(node.id);
  }

  function itemUrl(project, id, col) {
    return projectPath(project, col) + '/workitem?id=' + encodeURIComponent(id);
  }

  function absUrl(u) {
    return window.location.protocol + '//' + window.location.host + u;
  }

  function bez(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  function fieldIndex(f) {
    for (var i = 0; i < EXTRA_FIELDS.length; i++) { if (EXTRA_FIELDS[i][0] === f) { return i; } }
    return 99;
  }

  function fieldLabel(f) {
    for (var i = 0; i < EXTRA_FIELDS.length; i++) { if (EXTRA_FIELDS[i][0] === f) { return EXTRA_FIELDS[i][1]; } }
    return f;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name }, document.body);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.parentNode.removeChild(a); }, 1000);
  }

  // ------------------------------------------------------------------ model helpers

  function readNodes(root) {
    var nodes = [];
    var byKey = {};
    var nEls = root.querySelectorAll('.bw-model .bw-n');
    for (var i = 0; i < nEls.length; i++) {
      var d = nEls[i].dataset;
      var n = {
        key: d.k, project: d.p || root.dataset.project || '', id: d.id || '', title: d.title || d.id || '', space: d.space || '',
        col: root.dataset.col || '', rev: d.rev || '',
        type: d.type || '', status: d.status || '',
        created: d.created || '', updated: d.updated || '',
        items: d.items === '' || d.items === undefined ? -1 : toInt(d.items),
        el: nEls[i]
      };
      if (n.key && !byKey[n.key]) {
        byKey[n.key] = n;
        nodes.push(n);
      }
    }
    return { nodes: nodes, byKey: byKey };
  }

  // "c|o|k;c|o|k" -> [{ c, o, k }]
  function parseSamples(s) {
    var out = [];
    if (!s) { return out; }
    var parts = s.split(';');
    for (var i = 0; i < parts.length; i++) {
      var f = parts[i].split('|');
      if (f.length === 3) { out.push({ c: f[0], o: f[1], k: f[2] }); }
    }
    return out;
  }

  // Sort key of a document: project, space, name.
  function docSortKey(n) {
    return n.project + '/' + n.space + '/' + n.id;
  }

  function catById(cats, id) {
    for (var i = 0; i < cats.length; i++) { if (cats[i].id === id) { return cats[i]; } }
    return null;
  }

  // First category present on the edge (precedence order); the last category as fallback.
  function mainKind(e, cats) {
    for (var i = 0; i < cats.length; i++) {
      var k = cats[i].id;
      if (e.kinds[k] > 0 || e.meta[k]) { return cats[i]; }
    }
    return cats[cats.length - 1];
  }

  // noCounts: kind names only (line labels when the viewer hides the linked item counts).
  function kindsLabel(e, cats, noCounts) {
    var parts = [];
    for (var i = 0; i < cats.length; i++) {
      var k = cats[i].id;
      if (e.kinds[k] > 0) { parts.push(cats[i].name + (noCounts ? '' : ' ' + e.kinds[k])); }
      else if (e.meta[k]) { parts.push(cats[i].name); }
    }
    return parts.join(' + ');
  }

  // "a,b" -> { a: true, b: true }; empty or unknown -> every category.
  function relFromData(s, cats) {
    var r = {};
    var any = false;
    var parts = (s || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      if (catById(cats, parts[i])) { r[parts[i]] = true; any = true; }
    }
    if (!any) { cats.forEach(function (c) { r[c.id] = true; }); }
    return r;
  }

  // Edge restricted to the selected categories (null when none of its categories is selected).
  function restrictEdge(e, cats, rel) {
    var kinds = {};
    var meta = {};
    var any = false;
    for (var i = 0; i < cats.length; i++) {
      var k = cats[i].id;
      kinds[k] = rel[k] ? e.kinds[k] : 0;
      meta[k] = rel[k] ? !!e.meta[k] : false;
      if (kinds[k] > 0 || meta[k]) { any = true; }
    }
    if (!any) { return null; }
    var r = {};
    for (var p in e) { if (Object.prototype.hasOwnProperty.call(e, p)) { r[p] = e[p]; } }
    r.kinds = kinds;
    r.meta = meta;
    r.samples = e.samples.filter(function (sm) { return !catById(cats, sm.k) || rel[sm.k]; });
    return r;
  }

  // ------------------------------------------------------------------ layout

  function nodeHeight(state) {
    return PAD * 2 + LINE_H * ((state.baseLines || 3) + state.extras.length);
  }

  // Layered layout: origin documents on the left (longest path over direct edges), barycentre
  // ordering to reduce crossings, documents without a shown edge in a grid below (mode 'all').
  // state.keep(node) can force a node without edges into the grid.
  function layout(model, state, edges) {
    var h = nodeHeight(state);
    var degree = {};
    for (var i = 0; i < edges.length; i++) {
      degree[edges[i].o] = (degree[edges[i].o] || 0) + 1;
      degree[edges[i].c] = (degree[edges[i].c] || 0) + 1;
    }
    var linked = [];
    var isolated = [];
    for (var j = 0; j < model.nodes.length; j++) {
      var n = model.nodes[j];
      if (state.hidden && state.hidden[n.key]) { continue; }
      if (degree[n.key]) { linked.push(n); }
      else if (state.mode === 'all') { isolated.push(n); }
    }

    // Levels: longest path over direct edges (sources on the left).
    var lvl = {};
    for (var a = 0; a < linked.length; a++) { lvl[linked[a].key] = 0; }
    var direct = [];
    for (var b = 0; b < edges.length; b++) { if (!edges[b].indirect) { direct.push(edges[b]); } }
    for (var pass = 0; pass <= linked.length; pass++) {
      var changed = false;
      for (var c = 0; c < direct.length; c++) {
        var e = direct[c];
        if (lvl[e.c] < lvl[e.o] + 1 && lvl[e.o] + 1 < 50) { lvl[e.c] = lvl[e.o] + 1; changed = true; }
      }
      if (!changed) { break; }
    }

    var cols = [];
    linked.sort(function (x, y) {
      return (x.project + '/' + x.space + '/' + x.title).localeCompare(y.project + '/' + y.space + '/' + y.title);
    });
    for (var d = 0; d < linked.length; d++) {
      var L = lvl[linked[d].key];
      if (!cols[L]) { cols[L] = []; }
      cols[L].push(linked[d]);
    }
    for (var f = 0; f < cols.length; f++) { if (!cols[f]) { cols[f] = []; } }

    // Barycentre ordering to reduce crossings.
    var parents = {};
    var children = {};
    for (var g = 0; g < direct.length; g++) {
      (children[direct[g].o] = children[direct[g].o] || []).push(direct[g].c);
      (parents[direct[g].c] = parents[direct[g].c] || []).push(direct[g].o);
    }
    var order = {};
    function index() {
      for (var q = 0; q < cols.length; q++) {
        for (var r = 0; r < cols[q].length; r++) { order[cols[q][r].key] = r; }
      }
    }
    function bary(list) {
      if (!list || !list.length) { return null; }
      var s = 0;
      for (var t = 0; t < list.length; t++) { s += order[list[t]]; }
      return s / list.length;
    }
    function sortCol(col, rel) {
      var keyed = col.map(function (n2, idx) {
        var bv = bary(rel[n2.key]);
        return { n: n2, v: bv === null ? idx : bv, idx: idx };
      });
      keyed.sort(function (x, y) { return x.v - y.v || x.idx - y.idx; });
      return keyed.map(function (k) { return k.n; });
    }
    index();
    for (var sweep = 0; sweep < 4; sweep++) {
      for (var u = 1; u < cols.length; u++) { cols[u] = sortCol(cols[u], parents); index(); }
      for (var v = cols.length - 2; v >= 0; v--) { cols[v] = sortCol(cols[v], children); index(); }
    }

    // Edges that skip a level arc over the graph; reserve room above the first row.
    var topPad = 0;
    for (var sk = 0; sk < edges.length; sk++) {
      if (lvl[edges[sk].c] - lvl[edges[sk].o] > 1) { topPad = 40; break; }
    }
    var pos = {};
    var maxRows = 0;
    for (var w = 0; w < cols.length; w++) {
      maxRows = Math.max(maxRows, cols[w].length);
      for (var z = 0; z < cols[w].length; z++) {
        pos[cols[w][z].key] = { x: MARGIN + w * (NODE_W + COL_GAP), y: MARGIN + topPad + z * (h + ROW_GAP) };
      }
    }
    var width = MARGIN * 2 + Math.max(1, cols.length) * NODE_W + Math.max(0, cols.length - 1) * COL_GAP;
    var height = MARGIN * 2 + topPad + maxRows * (h + ROW_GAP);
    var isoTop = linked.length ? height + ROW_GAP : MARGIN + 18;
    var gridCols = Math.max(3, cols.length);
    if (isolated.length) {
      isolated.sort(function (x, y) {
        return (x.project + '/' + x.space + '/' + x.title).localeCompare(y.project + '/' + y.space + '/' + y.title);
      });
      for (var m = 0; m < isolated.length; m++) {
        pos[isolated[m].key] = {
          x: MARGIN + (m % gridCols) * (NODE_W + 40),
          y: isoTop + Math.floor(m / gridCols) * (h + ROW_GAP)
        };
      }
      width = Math.max(width, MARGIN * 2 + Math.min(gridCols, isolated.length) * (NODE_W + 40));
      height = isoTop + Math.ceil(isolated.length / gridCols) * (h + ROW_GAP) + MARGIN;
    }
    return {
      pos: pos, width: width, height: Math.max(height, 80), nodeH: h,
      linked: linked, isolated: isolated, isoTop: linked.length ? height : MARGIN, topPad: topPad
    };
  }

  // ------------------------------------------------------------------ base widget
  // Methods shared by the widgets; each widget constructor calls initBase(this, root) and
  // defines cats, filePrefix, emptyText, edgeSummary(e), showDetails(e), drawTable(), exportExcel().

  var Base = {};

  function initBase(self, root, model) {
    self.root = root;
    self.model = model;
    var ds = root.dataset;
    self.project = ds.project || '';
    // Several projects in scope: documents are labelled with their project.
    self.multi = (ds.projects || '').split(',').filter(function (x) { return x; }).length > 1;
    self.height = toInt(ds.height) || 600;
    self.state = {
      mode: ds.mode === 'all' ? 'all' : 'related',
      counts: ds.counts !== '0',
      extras: (ds.extras || '').split(',').filter(function (x) { return x; }),
      filter: '',
      zoom: 1,
      view: 'graph'
    };
  }

  function extendBase(Ctor) {
    for (var k in Base) { if (Object.prototype.hasOwnProperty.call(Base, k)) { Ctor.prototype[k] = Base[k]; } }
  }

  Base.checkbox = function (parent, label, checked, onChange) {
    var lab = el('label', { 'class': 'bw-check' }, parent);
    var cb = el('input', { type: 'checkbox' }, lab);
    cb.checked = !!checked;
    el('span', null, lab, label);
    cb.addEventListener('change', function () { onChange(cb.checked); });
    return lab;
  };

  Base.button = function (parent, label, title, onClick) {
    var b = el('button', { type: 'button', 'class': 'bw-btn', title: title }, parent, label);
    b.addEventListener('click', onClick);
    return b;
  };

  // Toolbar group with one checkbox per category (state.rel).
  Base.kindChecks = function (bar, title) {
    var self = this;
    var box = el('span', { 'class': 'bw-fields' }, bar);
    el('span', { 'class': 'bw-muted' }, box, title);
    this.cats.forEach(function (cat) {
      self.checkbox(box, cat.label, self.state.rel[cat.id], function (on) {
        self.state.rel[cat.id] = on; self.render(true);
      });
    });
    return box;
  };

  Base.countsCheck = function (bar) {
    var self = this;
    var cnt = this.checkbox(bar, 'Item counts', this.state.counts, function (on) {
      self.state.counts = on; self.render(false);
    });
    cnt.title = 'Show the number of linked work items on the lines';
    return cnt;
  };

  Base.fieldChecks = function (bar) {
    var self = this;
    var fields = el('span', { 'class': 'bw-fields' }, bar);
    el('span', { 'class': 'bw-muted' }, fields, 'Fields:');
    EXTRA_FIELDS.forEach(function (f) {
      self.checkbox(fields, f[1], self.state.extras.indexOf(f[0]) >= 0, function (on) {
        var ex = self.state.extras.filter(function (x) { return x !== f[0]; });
        if (on) { ex.push(f[0]); }
        ex.sort(function (x, y) { return fieldIndex(x) - fieldIndex(y); });
        self.state.extras = ex;
        self.render(false);
      });
    });
    return fields;
  };

  Base.searchBox = function (bar) {
    var self = this;
    var search = el('input', { 'class': 'bw-ctl bw-search', type: 'search', placeholder: 'Highlight documents' + ELLIPSIS }, bar);
    search.addEventListener('input', function () { self.state.filter = search.value.trim().toLowerCase(); self.render(false); });
    return search;
  };

  Base.viewButtons = function (bar) {
    var self = this;
    var btns = el('span', { 'class': 'bw-btns' }, bar);
    this.button(btns, 'Fit', 'Fit the graph to the view', function () { self.fit(); });
    this.button(btns, MINUS, 'Zoom out', function () { self.setZoom(self.state.zoom / 1.25); });
    this.button(btns, '+', 'Zoom in', function () { self.setZoom(self.state.zoom * 1.25); });
    this.viewBtn = this.button(btns, 'Table', 'Switch between graph and table', function () {
      self.state.view = self.state.view === 'graph' ? 'table' : 'graph';
      self.render(false);
    });
    this.button(btns, 'SVG', 'Download the graph as SVG', function () { self.exportSvg(); });
    this.button(btns, 'Excel', 'Download the shown documents and relations as an Excel workbook', function () { self.exportExcel(); });
    // Polarion cannot re-render one widget alone in view mode: the analysis runs again by reloading the page.
    this.button(btns, 'Reload page', 'Reload the whole page to run the analysis again (all widgets of the page are reloaded)', function () { window.location.reload(); });
    return btns;
  };

  // Areas below the toolbar: legend, status, details, graph view, table, tooltip.
  Base.buildAreas = function () {
    var root = this.root;
    this.legend(el('div', { 'class': 'bw-legend' }, root));
    this.status = el('div', { 'class': 'bw-status' }, root);
    this.details = el('div', { 'class': 'bw-details' }, root);
    this.details.style.display = 'none';
    this.view = el('div', { 'class': 'bw-view' }, root);
    this.view.style.height = this.height + 'px';
    this.svgEl = svg('svg', { xmlns: SVG_NS, 'class': 'bw-svg' }, this.view);
    this.table = el('div', { 'class': 'bw-table-wrap' }, root);
    this.tip = el('div', { 'class': 'bw-tip' }, root);
    this.tip.style.display = 'none';
  };

  Base.legendKinds = function (box) {
    this.cats.forEach(function (cat) {
      var item = el('span', { 'class': 'bw-leg' }, box);
      var s = svg('svg', { width: 34, height: 10 }, item);
      svg('line', { x1: 1, y1: 5, x2: 33, y2: 5, stroke: cat.color, 'stroke-width': 2.5, 'stroke-dasharray': cat.dash || null }, s);
      el('span', null, item, cat.name);
    });
  };

  // Redraws graph and table after a state change; statusText(edges) gives the status line.
  Base.layoutAndDraw = function (edges, refit) {
    var st = this.state;
    this.lay = layout(this.model, st, edges);
    this.edges = edges;
    this.viewBtn.textContent = st.view === 'graph' ? 'Table' : 'Graph';
    this.view.style.display = st.view === 'graph' ? '' : 'none';
    this.table.style.display = st.view === 'table' ? '' : 'none';
    this.drawGraph();
    this.drawTable();
    if (refit) { this.fit(); } else { this.applyZoom(); }
  };

  // Text lines of a document box; widgets can override it (keep it in line with state.baseLines).
  Base.nodeLines = function (n) {
    var lines = [
      { text: n.id, weight: 600, color: 'rgb(25,35,55)' },
      { text: n.title, weight: 400, color: 'rgb(25,35,55)' },
      { text: (this.multi ? n.project + ' / ' + n.space : n.space) + (n.rev === 'HEAD' ? '  (HEAD)' : ''), weight: 400, color: 'rgb(110,118,135)' }
    ];
    this.state.extras.forEach(function (f) {
      var v = n[f];
      if (f === 'items') { v = n.items >= 0 ? String(n.items) : ''; }
      lines.push({ text: fieldLabel(f) + ': ' + (v || DASH), weight: 400, color: 'rgb(80,88,105)' });
    });
    return lines;
  };

  Base.drawGraph = function () {
    var self = this;
    var root = this.svgEl;
    while (root.firstChild) { root.removeChild(root.firstChild); }
    var lay = this.lay;
    var h = lay.nodeH;
    svg('rect', { x: 0, y: 0, width: lay.width, height: lay.height, fill: 'rgb(255,255,255)' }, root);
    if (!lay.linked.length && !lay.isolated.length) {
      svg('text', { x: MARGIN, y: MARGIN + 14, 'font-family': FONT, 'font-size': 13, fill: 'rgb(90,90,90)' }, root,
        this.emptyText);
      return;
    }
    if (lay.isolated.length && lay.linked.length) {
      svg('text', { x: MARGIN, y: lay.isoTop + 14, 'font-family': FONT, 'font-size': 12, fill: 'rgb(110,110,110)' }, root,
        'Documents without relations');
    }
    var gEdges = svg('g', null, root);
    var gNodes = svg('g', null, root);
    var gLabels = svg('g', null, root);
    var filter = this.state.filter;

    this.edges.forEach(function (e) {
      var p = lay.pos[e.o];
      var q = lay.pos[e.c];
      if (!p || !q) { return; }
      var x1 = p.x + NODE_W, y1 = p.y + h / 2, x2 = q.x, y2 = q.y + h / 2;
      var dx = x2 > x1 ? Math.max(30, (x2 - x1) / 2) : 70;
      var c1x = x1 + dx, c2x = x2 - dx, c1y = y1, c2y = y2;
      if (x2 - x1 > COL_GAP + NODE_W) {
        // Skips at least one level: arc above the graph instead of crossing documents.
        c1x = x1 + COL_GAP;
        c2x = x2 - COL_GAP;
        c1y = c2y = Math.max(4, Math.min(y1, y2) - h / 2 - lay.topPad - 30);
      }
      var d = 'M' + x1 + ',' + y1 + ' C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + (x2 - 2) + ',' + y2;
      var cat = mainKind(e, self.cats);
      var color = e.indirect ? INDIRECT_COLOR : cat.color;
      var g = svg('g', { 'class': 'bw-edge' }, gEdges);
      svg('path', {
        d: d, fill: 'none', stroke: color, 'stroke-width': e.indirect ? 1.4 : 2.2,
        'stroke-dasharray': e.indirect ? '4,4' : (cat.dash || null),
        opacity: e.indirect ? 0.7 : 1
      }, g);
      // Arrow head at the target document, or at the origin when the widget draws arrows backwards
      // (docCoverage: origin = upstream on the left, arrow in the link direction downstream -> upstream).
      var head = self.arrowAtOrigin ?
        (x1 + 10) + ',' + (y1 - 5) + ' ' + x1 + ',' + y1 + ' ' + (x1 + 10) + ',' + (y1 + 5) :
        (x2 - 10) + ',' + (y2 - 5) + ' ' + x2 + ',' + y2 + ' ' + (x2 - 10) + ',' + (y2 + 5);
      svg('polygon', { points: head, fill: color }, g);
      var hit = svg('path', { d: d, fill: 'none', stroke: 'rgb(0,0,0)', 'stroke-opacity': 0, 'stroke-width': 12, 'class': 'bw-hit' }, g);
      // Label near the target end (one per edge there, while several edges can share an origin).
      var lt = 0.8;
      var mx = bez(x1, c1x, c2x, x2, lt);
      var my = bez(y1, c1y, c2y, y2, lt) - 3;
      var label = kindsLabel(e, self.cats, !self.state.counts) + (e.indirect ? ' (indirect)' : '');
      var lg = svg('g', { 'class': 'bw-edge-label' }, gLabels);
      var bg = svg('rect', { fill: 'rgb(255,255,255)', opacity: 0.9, rx: 3 }, lg);
      var t = svg('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 11, fill: color }, lg, label);
      try {
        var bb = t.getBBox();
        // Keep the label clear of the target document box.
        var over = bb.x + bb.width + 6 - x2;
        if (over > 0) { setAttrs(t, { x: mx - over }); bb = t.getBBox(); }
        setAttrs(bg, { x: bb.x - 3, y: bb.y - 1, width: bb.width + 6, height: bb.height + 2 });
      } catch (err) { /* not rendered yet */ }
      [hit, lg].forEach(function (target) {
        target.addEventListener('mousemove', function (ev) { self.showTip(ev, self.edgeSummary(e)); });
        target.addEventListener('mouseleave', function () { self.hideTip(); });
        target.addEventListener('click', function () { self.showDetails(e); });
      });
    });

    var nodes = lay.linked.concat(lay.isolated);
    nodes.forEach(function (n) {
      var p = lay.pos[n.key];
      var match = !filter || (n.id + ' ' + n.title + ' ' + n.space + ' ' + n.project).toLowerCase().indexOf(filter) >= 0;
      var a = svg('a', { href: docUrl(n), target: '_top', 'class': 'bw-node' }, gNodes);
      var g = svg('g', { opacity: match ? 1 : 0.3 }, a);
      svg('rect', {
        x: p.x, y: p.y, width: NODE_W, height: h, rx: 6,
        fill: 'rgb(246,248,252)', stroke: filter && match ? 'rgb(230,126,34)' : 'rgb(120,132,155)',
        'stroke-width': filter && match ? 2.5 : 1.2
      }, g);
      self.nodeLines(n).forEach(function (ln, i) {
        svg('text', {
          x: p.x + PAD, y: p.y + PAD + 11 + i * LINE_H, 'font-family': FONT, 'font-size': 12,
          'font-weight': ln.weight, fill: ln.color
        }, g, trunc(ln.text, 36));
      });
      svg('title', null, a, self.docLabel(n) + ' ' + DASH + ' ' + n.title);
      if (self.onNode) { self.onNode(a, n); }
    });
  };

  Base.showTip = function (ev, lines) {
    var tip = this.tip;
    tip.textContent = '';
    lines.forEach(function (l, i) { el('div', i === 0 ? { 'class': 'bw-tip-head' } : null, tip, l); });
    var r = this.root.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = (ev.clientX - r.left + 14) + 'px';
    tip.style.top = (ev.clientY - r.top + 14) + 'px';
  };

  Base.hideTip = function () { this.tip.style.display = 'none'; };

  // "space / name", prefixed with the project when several projects are in scope; "(HEAD)" for a document of a
  // collection without a pinned revision.
  Base.docLabel = function (n) {
    return (this.multi ? n.project + ' / ' : '') + n.space + ' / ' + n.id + (n.rev === 'HEAD' ? ' (HEAD)' : '');
  };

  // Opens the details box with a header "origin -> target" and a Close button; returns the box.
  Base.openDetails = function (o, c) {
    var box = this.details;
    box.textContent = '';
    box.style.display = 'block';
    var head = el('div', { 'class': 'bw-details-head' }, box);
    el('a', { href: docUrl(o), target: '_top' }, head, o.id);
    if (c) {
      el('span', null, head, '  ' + ARROW + '  ');
      el('a', { href: docUrl(c), target: '_top' }, head, c.id);
    }
    var close = this.button(head, 'Close', 'Close the details', function () { box.style.display = 'none'; });
    close.style.marginLeft = '12px';
    return box;
  };

  // List of work item pairs (target item -> origin item) with the category name. Each item opens in the project
  // of its document.
  Base.sampleList = function (box, e, title) {
    var self = this;
    var nc = this.model.byKey[e.c];
    var no = this.model.byKey[e.o];
    if (!e.samples.length) { return; }
    el('div', { 'class': 'bw-muted' }, box, title);
    var ul = el('ul', { 'class': 'bw-items' }, box);
    e.samples.forEach(function (s) {
      var li = el('li', null, ul);
      el('a', { href: itemUrl(nc.project, s.c, nc.col), target: '_top' }, li, s.c);
      el('span', null, li, ' ' + ARROW + ' ');
      el('a', { href: itemUrl(no.project, s.o, no.col), target: '_top' }, li, s.o);
      var cat = catById(self.cats, s.k);
      el('span', { 'class': 'bw-muted' }, li, ' (' + (cat ? cat.name : s.k) + ')');
    });
    if (e.total > e.samples.length) {
      el('div', { 'class': 'bw-muted' }, box, ELLIPSIS + ' and ' + (e.total - e.samples.length) + ' more');
    }
  };

  // Simple HTML table: header names and rows of cells ({ text, href } or plain text).
  Base.htmlTable = function (headers, rows, emptyText) {
    var wrap = this.table;
    var t = el('table', { 'class': 'bw-table' }, wrap);
    var hr = el('tr', null, el('thead', null, t));
    headers.forEach(function (x) { el('th', null, hr, x); });
    var tb = el('tbody', null, t);
    rows.forEach(function (row) {
      var tr = el('tr', null, tb);
      row.forEach(function (cell) {
        var td = el('td', null, tr);
        if (cell && cell.href) { el('a', { href: cell.href, target: '_top' }, td, cell.text); }
        else { td.textContent = cell === null || cell === undefined ? '' : String(cell); }
      });
    });
    if (!rows.length) { el('div', { 'class': 'bw-muted' }, wrap, emptyText); }
  };

  Base.setZoom = function (z) {
    this.state.zoom = Math.max(0.1, Math.min(3, z));
    this.applyZoom();
  };

  Base.applyZoom = function () {
    var lay = this.lay;
    var z = this.state.zoom;
    setAttrs(this.svgEl, {
      viewBox: '0 0 ' + lay.width + ' ' + lay.height,
      width: Math.round(lay.width * z), height: Math.round(lay.height * z)
    });
  };

  Base.fit = function () {
    var lay = this.lay;
    var w = this.view.clientWidth || 800;
    var h = this.view.clientHeight || this.height;
    var z = Math.min(1, (w - 12) / lay.width, (h - 12) / lay.height);
    this.setZoom(Math.max(z, 0.2));
  };

  Base.svgString = function () {
    var clone = this.svgEl.cloneNode(true);
    setAttrs(clone, { xmlns: SVG_NS, width: this.lay.width, height: this.lay.height });
    return new XMLSerializer().serializeToString(clone);
  };

  Base.fileName = function (ext) {
    return this.filePrefix + (this.project || 'project') + '.' + ext;
  };

  Base.exportSvg = function () {
    download(new Blob([this.svgString()], { type: 'image/svg+xml' }), this.fileName('svg'));
  };

  Base.shownDocs = function () {
    return this.lay.linked.concat(this.lay.isolated).slice().sort(function (a, b) {
      return docSortKey(a).localeCompare(docSortKey(b));
    });
  };

  Base.sortedEdges = function () {
    var by = this.model.byKey;
    return this.edges.slice().sort(function (a, b) {
      var oa = by[a.o], ob = by[b.o], ca = by[a.c], cb = by[b.c];
      return docSortKey(oa).localeCompare(docSortKey(ob)) || docSortKey(ca).localeCompare(docSortKey(cb));
    });
  };

  // ------------------------------------------------------------------ Excel export
  // Uses the XLSX library (xlsx-js-style) loaded from the widget resources with loadWidgetJs.
  // sheets: [{ name, rows (first row = header), widths, links: [{ r, c, url }] }]; name = file name (default fileName).
  // Falls back to a CSV of the first sheet when the library is not available.

  function sheetFromRows(X, rows, widths, links) {
    var ws = X.utils.aoa_to_sheet(rows);
    var head = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3367D6' } }, alignment: { vertical: 'center' } };
    for (var c = 0; c < rows[0].length; c++) {
      var ref = X.utils.encode_cell({ r: 0, c: c });
      if (ws[ref]) { ws[ref].s = head; }
    }
    (links || []).forEach(function (lk) {
      var cell = ws[X.utils.encode_cell({ r: lk.r, c: lk.c })];
      if (cell) { cell.l = { Target: lk.url }; cell.s = { font: { color: { rgb: '1A4DB3' }, underline: true } }; }
    });
    ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    if (rows.length > 1) {
      ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
    }
    return ws;
  }

  function csvCell(v) {
    var t = v === null || v === undefined ? '' : String(v);
    return /[",;]|[^ -~]/.test(t) ? '"' + t.split('"').join('""') + '"' : t;
  }

  Base.exportWorkbook = function (sheets, name) {
    var X = window.XLSX;
    if (!X || !X.utils || !X.write) { this.exportCsv(sheets[0].rows, sheets[0].what); return; }
    var wb = X.utils.book_new();
    sheets.forEach(function (sh) {
      X.utils.book_append_sheet(wb, sheetFromRows(X, sh.rows, sh.widths, sh.links), sh.name);
    });
    var data = X.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name || this.fileName('xlsx'));
  };

  Base.exportCsv = function (rows, what) {
    var nl = String.fromCharCode(13, 10);
    var lines = rows.map(function (row) { return row.map(csvCell).join(','); });
    download(new Blob([String.fromCharCode(65279) + lines.join(nl) + nl], { type: 'text/csv' }), this.fileName('csv'));
    this.status.textContent += ' ' + DASH + ' Excel library not loaded: ' + (what || 'data') + ' exported as CSV.';
  };

  // ------------------------------------------------------------------ start

  function startWidgets(rootClass, Ctor, name) {
    var roots = document.querySelectorAll('.' + rootClass);
    for (var i = 0; i < roots.length; i++) {
      if (roots[i].getAttribute('data-bw-ready') === '1') { continue; }
      roots[i].setAttribute('data-bw-ready', '1');
      try {
        new Ctor(roots[i]);
      } catch (err) {
        roots[i].appendChild(el('div', { 'class': 'bw-error' }, null, name + ' widget error: ' + err));
      }
    }
  }
