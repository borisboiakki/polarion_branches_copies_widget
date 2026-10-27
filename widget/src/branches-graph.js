/*
 * Polarion Branches Widget - client-side graph.
 *
 * Inlined into render.vm by tools/build-widget.py. Velocity parses render.vm, so this file
 * must not contain the dollar sign, the hash sign or backslashes (the build checks this).
 * Use HASH for the hash character in URLs.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var HASH = String.fromCharCode(35);
  var KINDS = ['branch', 'derived', 'copy'];
  var KIND_STYLE = {
    branch: { color: 'rgb(198,40,40)', dash: '9,5', name: 'branch' },
    derived: { color: 'rgb(26,127,55)', dash: '2,4', name: 'derived' },
    copy: { color: 'rgb(51,103,214)', dash: '', name: 'copy' }
  };
  var KIND_LABEL = { branch: 'Branches', derived: 'Derived', copy: 'Copies' };
  var INDIRECT_COLOR = 'rgb(150,150,150)';
  var EXTRA_FIELDS = [
    ['type', 'Type'], ['status', 'Status'], ['author', 'Author'],
    ['created', 'Created'], ['updated', 'Updated'], ['items', 'Work items']
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

  function docUrl(project, node) {
    return basePath() + HASH + '/project/' + encodeURIComponent(project) + '/wiki/' +
      encodeURIComponent(node.space) + '/' + encodeURIComponent(node.id);
  }

  function itemUrl(project, id) {
    return basePath() + HASH + '/project/' + encodeURIComponent(project) + '/workitem?id=' + encodeURIComponent(id);
  }

  // ------------------------------------------------------------------ model

  function readModel(root) {
    var nodes = [];
    var byKey = {};
    var nEls = root.querySelectorAll('.bw-model .bw-n');
    for (var i = 0; i < nEls.length; i++) {
      var d = nEls[i].dataset;
      var n = {
        key: d.k, id: d.id || '', title: d.title || d.id || '', space: d.space || '',
        type: d.type || '', status: d.status || '', author: d.author || '',
        created: d.created || '', updated: d.updated || '',
        items: d.items === '' || d.items === undefined ? -1 : toInt(d.items)
      };
      if (n.key && !byKey[n.key]) {
        byKey[n.key] = n;
        nodes.push(n);
      }
    }
    var edges = [];
    var eEls = root.querySelectorAll('.bw-model .bw-e');
    for (var j = 0; j < eEls.length; j++) {
      var a = eEls[j].dataset;
      if (!byKey[a.o] || !byKey[a.c] || a.o === a.c) { continue; }
      edges.push({
        o: a.o, c: a.c,
        kinds: { copy: toInt(a.kc), branch: toInt(a.kb), derived: toInt(a.kd) },
        meta: { branch: a.mb === '1', derived: a.md === '1' },
        oi: toInt(a.oi), ci: toInt(a.ci), total: toInt(a.n),
        indirect: a.ind === '1',
        samples: parseSamples(a.s)
      });
    }
    return { nodes: nodes, byKey: byKey, edges: edges };
  }

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

  function mainKind(e) {
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      if (e.kinds[k] > 0 || e.meta[k]) { return k; }
    }
    return 'copy';
  }

  function kindsLabel(e) {
    var parts = [];
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      if (e.kinds[k] > 0) { parts.push(KIND_STYLE[k].name + ' ' + e.kinds[k]); }
      else if (e.meta[k]) { parts.push(KIND_STYLE[k].name); }
    }
    return parts.join(' + ');
  }

  // ------------------------------------------------------------------ layout

  function nodeHeight(state) {
    return PAD * 2 + LINE_H * (3 + state.extras.length);
  }

  function relFromData(s) {
    var r = {};
    var parts = (s || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      if (KIND_STYLE[parts[i]]) { r[parts[i]] = true; }
    }
    if (!r.copy && !r.branch && !r.derived) { r = { copy: true, branch: true, derived: true }; }
    return r;
  }

  // Edge restricted to the selected kinds (null when none of its kinds is selected).
  function restrictEdge(e, rel) {
    var kinds = {};
    var meta = {};
    var any = false;
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      kinds[k] = rel[k] ? e.kinds[k] : 0;
      meta[k] = rel[k] ? !!e.meta[k] : false;
      if (kinds[k] > 0 || meta[k]) { any = true; }
    }
    if (!any) { return null; }
    var r = {};
    for (var p in e) { if (Object.prototype.hasOwnProperty.call(e, p)) { r[p] = e[p]; } }
    r.kinds = kinds;
    r.meta = meta;
    return r;
  }

  function visibleEdges(model, state) {
    var out = [];
    for (var i = 0; i < model.edges.length; i++) {
      var e = model.edges[i];
      if (e.indirect && !state.indirect) { continue; }
      var r = restrictEdge(e, state.rel);
      if (r) { out.push(r); }
    }
    return out;
  }

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
      return (x.space + '/' + x.title).localeCompare(y.space + '/' + y.title);
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
    function bary(list, rel) {
      if (!list || !list.length) { return null; }
      var s = 0;
      for (var t = 0; t < list.length; t++) { s += order[list[t]]; }
      return s / list.length;
    }
    function sortCol(col, rel) {
      var keyed = col.map(function (n2, idx) {
        var bv = bary(rel[n2.key], rel);
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
        return (x.space + '/' + x.title).localeCompare(y.space + '/' + y.title);
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

  // ------------------------------------------------------------------ widget

  function Widget(root) {
    this.root = root;
    this.model = readModel(root);
    var ds = root.dataset;
    this.project = ds.project || '';
    this.state = {
      mode: ds.mode === 'all' ? 'all' : 'related',
      indirect: ds.indirect === '1',
      rel: relFromData(ds.rel),
      extras: (ds.extras || '').split(',').filter(function (x) { return x; }),
      filter: '',
      zoom: 1,
      view: 'graph'
    };
    this.height = toInt(ds.height) || 600;
    this.build();
    this.render(true);
  }

  Widget.prototype.build = function () {
    var self = this;
    var root = this.root;
    var bar = el('div', { 'class': 'bw-toolbar' }, root);

    var mode = el('select', { 'class': 'bw-ctl', title: 'Documents shown' }, bar);
    el('option', { value: 'related' }, mode, 'Only documents with relations');
    el('option', { value: 'all' }, mode, 'All documents');
    mode.value = this.state.mode;
    mode.addEventListener('change', function () { self.state.mode = mode.value; self.render(true); });

    var ind = this.checkbox(bar, 'Indirect relations', this.state.indirect, function (on) {
      self.state.indirect = on; self.render(true);
    });
    ind.title = 'Relations inherited through an intermediate copy (hidden by default)';

    var kindsBox = el('span', { 'class': 'bw-fields' }, bar);
    el('span', { 'class': 'bw-muted' }, kindsBox, 'Relations:');
    KINDS.forEach(function (k) {
      self.checkbox(kindsBox, KIND_LABEL[k], self.state.rel[k], function (on) {
        self.state.rel[k] = on; self.render(true);
      });
    });

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

    var search = el('input', { 'class': 'bw-ctl bw-search', type: 'search', placeholder: 'Highlight documents' + ELLIPSIS }, bar);
    search.addEventListener('input', function () { self.state.filter = search.value.trim().toLowerCase(); self.render(false); });

    var btns = el('span', { 'class': 'bw-btns' }, bar);
    this.button(btns, 'Fit', 'Fit the graph to the view', function () { self.fit(); });
    this.button(btns, MINUS, 'Zoom out', function () { self.setZoom(self.state.zoom / 1.25); });
    this.button(btns, '+', 'Zoom in', function () { self.setZoom(self.state.zoom * 1.25); });
    this.viewBtn = this.button(btns, 'Table', 'Switch between graph and table', function () {
      self.state.view = self.state.view === 'graph' ? 'table' : 'graph';
      self.render(false);
    });
    this.button(btns, 'SVG', 'Download the graph as SVG', function () { self.exportSvg(); });
    this.button(btns, 'Refresh', 'Re-run the analysis (reloads the page)', function () { window.location.reload(); });

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

  function fieldIndex(f) {
    for (var i = 0; i < EXTRA_FIELDS.length; i++) { if (EXTRA_FIELDS[i][0] === f) { return i; } }
    return 99;
  }

  Widget.prototype.checkbox = function (parent, label, checked, onChange) {
    var lab = el('label', { 'class': 'bw-check' }, parent);
    var cb = el('input', { type: 'checkbox' }, lab);
    cb.checked = !!checked;
    el('span', null, lab, label);
    cb.addEventListener('change', function () { onChange(cb.checked); });
    return lab;
  };

  Widget.prototype.button = function (parent, label, title, onClick) {
    var b = el('button', { type: 'button', 'class': 'bw-btn', title: title }, parent, label);
    b.addEventListener('click', onClick);
    return b;
  };

  Widget.prototype.legend = function (box) {
    KINDS.forEach(function (k) {
      var item = el('span', { 'class': 'bw-leg' }, box);
      var s = svg('svg', { width: 34, height: 10 }, item);
      svg('line', { x1: 1, y1: 5, x2: 33, y2: 5, stroke: KIND_STYLE[k].color, 'stroke-width': 2.5, 'stroke-dasharray': KIND_STYLE[k].dash || null }, s);
      el('span', null, item, KIND_STYLE[k].name);
    });
    var it = el('span', { 'class': 'bw-leg' }, box);
    var s2 = svg('svg', { width: 34, height: 10 }, it);
    svg('line', { x1: 1, y1: 5, x2: 33, y2: 5, stroke: INDIRECT_COLOR, 'stroke-width': 1.5, 'stroke-dasharray': '4,4' }, s2);
    el('span', null, it, 'indirect');
    el('span', { 'class': 'bw-muted' }, box, 'Arrow: original ' + ARROW + ' copy / branch / derived. Click a document to open it, a line for details.');
  };

  Widget.prototype.render = function (refit) {
    var st = this.state;
    var edges = visibleEdges(this.model, st);
    this.lay = layout(this.model, st, edges);
    this.edges = edges;
    var hidden = this.model.edges.length - edges.length;
    var shown = this.lay.linked.length + this.lay.isolated.length;
    this.status.textContent = shown + ' of ' + this.model.nodes.length + ' documents, ' + edges.length + ' relations' +
      (hidden > 0 ? ' (' + hidden + ' hidden by the indirect / relation filters)' : '');
    this.viewBtn.textContent = st.view === 'graph' ? 'Table' : 'Graph';
    this.view.style.display = st.view === 'graph' ? '' : 'none';
    this.table.style.display = st.view === 'table' ? '' : 'none';
    this.drawGraph();
    this.drawTable();
    if (refit) { this.fit(); } else { this.applyZoom(); }
  };

  Widget.prototype.drawGraph = function () {
    var self = this;
    var root = this.svgEl;
    while (root.firstChild) { root.removeChild(root.firstChild); }
    var lay = this.lay;
    var h = lay.nodeH;
    svg('rect', { x: 0, y: 0, width: lay.width, height: lay.height, fill: 'rgb(255,255,255)' }, root);
    if (!lay.linked.length && !lay.isolated.length) {
      svg('text', { x: MARGIN, y: MARGIN + 14, 'font-family': FONT, 'font-size': 13, fill: 'rgb(90,90,90)' }, root,
        'No relation found between the documents with the current settings.');
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
      var k = mainKind(e);
      var color = e.indirect ? INDIRECT_COLOR : KIND_STYLE[k].color;
      var g = svg('g', { 'class': 'bw-edge' }, gEdges);
      svg('path', {
        d: d, fill: 'none', stroke: color, 'stroke-width': e.indirect ? 1.4 : 2.2,
        'stroke-dasharray': e.indirect ? '4,4' : (KIND_STYLE[k].dash || null),
        opacity: e.indirect ? 0.7 : 1
      }, g);
      svg('polygon', { points: (x2 - 10) + ',' + (y2 - 5) + ' ' + x2 + ',' + y2 + ' ' + (x2 - 10) + ',' + (y2 + 5), fill: color }, g);
      var hit = svg('path', { d: d, fill: 'none', stroke: 'rgb(0,0,0)', 'stroke-opacity': 0, 'stroke-width': 12, 'class': 'bw-hit' }, g);
      // Label near the arrow head so that each label sits next to its target document.
      var lt = 0.8;
      var mx = bez(x1, c1x, c2x, x2, lt);
      var my = bez(y1, c1y, c2y, y2, lt) - 3;
      var label = kindsLabel(e) + (e.indirect ? ' (indirect)' : '');
      var lg = svg('g', { 'class': 'bw-edge-label' }, gLabels);
      var bg = svg('rect', { fill: 'rgb(255,255,255)', opacity: 0.9, rx: 3 }, lg);
      var t = svg('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 11, fill: color }, lg, label);
      try {
        var bb = t.getBBox();
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
      var match = !filter || (n.id + ' ' + n.title + ' ' + n.space).toLowerCase().indexOf(filter) >= 0;
      var a = svg('a', { href: docUrl(self.project, n), target: '_top', 'class': 'bw-node' }, gNodes);
      var g = svg('g', { opacity: match ? 1 : 0.3 }, a);
      svg('rect', {
        x: p.x, y: p.y, width: NODE_W, height: h, rx: 6,
        fill: 'rgb(246,248,252)', stroke: filter && match ? 'rgb(230,126,34)' : 'rgb(120,132,155)',
        'stroke-width': filter && match ? 2.5 : 1.2
      }, g);
      var lines = [
        { text: n.id, weight: 600, color: 'rgb(25,35,55)' },
        { text: n.title, weight: 400, color: 'rgb(25,35,55)' },
        { text: n.space, weight: 400, color: 'rgb(110,118,135)' }
      ];
      self.state.extras.forEach(function (f) {
        var v = n[f];
        if (f === 'items') { v = n.items >= 0 ? String(n.items) : ''; }
        lines.push({ text: fieldLabel(f) + ': ' + (v || DASH), weight: 400, color: 'rgb(80,88,105)' });
      });
      lines.forEach(function (ln, i) {
        svg('text', {
          x: p.x + PAD, y: p.y + PAD + 11 + i * LINE_H, 'font-family': FONT, 'font-size': 12,
          'font-weight': ln.weight, fill: ln.color
        }, g, trunc(ln.text, 36));
      });
      svg('title', null, a, n.space + ' / ' + n.id + ' ' + DASH + ' ' + n.title);
    });
  };

  function bez(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  function fieldLabel(f) {
    for (var i = 0; i < EXTRA_FIELDS.length; i++) { if (EXTRA_FIELDS[i][0] === f) { return EXTRA_FIELDS[i][1]; } }
    return f;
  }

  Widget.prototype.edgeSummary = function (e) {
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var lines = [o.id + '  ' + ARROW + '  ' + c.id, kindsLabel(e) + (e.indirect ? '  (indirect, inherited links)' : '')];
    if (e.total > 0) {
      var pc = pct(e.ci, c.items);
      var po = pct(e.oi, o.items);
      lines.push(e.total + ' linked items' +
        (pc !== null ? ', ' + pc + '% of ' + c.id : '') + (po !== null ? ', ' + po + '% of ' + o.id : ''));
    } else {
      lines.push('No linked item: relation from document metadata only');
    }
    if (e.meta.branch) { lines.push('Document metadata: branched from ' + o.id); }
    if (e.meta.derived) { lines.push('Document metadata: derived from ' + o.id); }
    return lines;
  };

  Widget.prototype.showTip = function (ev, lines) {
    var tip = this.tip;
    tip.textContent = '';
    lines.forEach(function (l, i) { el('div', i === 0 ? { 'class': 'bw-tip-head' } : null, tip, l); });
    var r = this.root.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = (ev.clientX - r.left + 14) + 'px';
    tip.style.top = (ev.clientY - r.top + 14) + 'px';
  };

  Widget.prototype.hideTip = function () { this.tip.style.display = 'none'; };

  Widget.prototype.showDetails = function (e) {
    var self = this;
    var box = this.details;
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    box.textContent = '';
    box.style.display = 'block';
    var head = el('div', { 'class': 'bw-details-head' }, box);
    el('a', { href: docUrl(this.project, o), target: '_top' }, head, o.id);
    el('span', null, head, '  ' + ARROW + '  ');
    el('a', { href: docUrl(this.project, c), target: '_top' }, head, c.id);
    var close = this.button(head, 'Close', 'Close the details', function () { box.style.display = 'none'; });
    close.style.marginLeft = '12px';
    this.edgeSummary(e).slice(1).forEach(function (l) { el('div', null, box, l); });
    if (e.samples.length) {
      el('div', { 'class': 'bw-muted' }, box, 'Linked work items (copy ' + ARROW + ' original):');
      var ul = el('ul', { 'class': 'bw-items' }, box);
      e.samples.forEach(function (s) {
        var li = el('li', null, ul);
        el('a', { href: itemUrl(self.project, s.c), target: '_top' }, li, s.c);
        el('span', null, li, ' ' + ARROW + ' ');
        el('a', { href: itemUrl(self.project, s.o), target: '_top' }, li, s.o);
        el('span', { 'class': 'bw-muted' }, li, ' (' + KIND_STYLE[s.k].name + ')');
      });
      if (e.total > e.samples.length) {
        el('div', { 'class': 'bw-muted' }, box, ELLIPSIS + ' and ' + (e.total - e.samples.length) + ' more');
      }
    }
  };

  Widget.prototype.drawTable = function () {
    var self = this;
    var wrap = this.table;
    wrap.textContent = '';
    if (this.state.view !== 'table') { return; }
    var t = el('table', { 'class': 'bw-table' }, wrap);
    var hr = el('tr', null, el('thead', null, t));
    ['Original', 'Relation', 'Copy / branch / derived', 'Linked items', 'Coverage of copy'].forEach(function (x) { el('th', null, hr, x); });
    var tb = el('tbody', null, t);
    var rows = this.edges.slice().sort(function (a, b) {
      var oa = self.model.byKey[a.o], ob = self.model.byKey[b.o];
      var ca = self.model.byKey[a.c], cb = self.model.byKey[b.c];
      return (oa.space + '/' + oa.id).localeCompare(ob.space + '/' + ob.id) ||
        (ca.space + '/' + ca.id).localeCompare(cb.space + '/' + cb.id);
    });
    rows.forEach(function (e) {
      var o = self.model.byKey[e.o];
      var c = self.model.byKey[e.c];
      var tr = el('tr', null, tb);
      el('a', { href: docUrl(self.project, o), target: '_top' }, el('td', null, tr), o.space + ' / ' + o.id);
      el('td', null, tr, kindsLabel(e) + (e.indirect ? ' (indirect)' : ''));
      el('a', { href: docUrl(self.project, c), target: '_top' }, el('td', null, tr), c.space + ' / ' + c.id);
      el('td', null, tr, String(e.total));
      var pc = pct(e.ci, c.items);
      el('td', null, tr, pc === null ? DASH : pc + '% (' + e.ci + '/' + c.items + ')');
    });
    if (!rows.length) { el('div', { 'class': 'bw-muted' }, wrap, 'No relation found.'); }
  };

  Widget.prototype.setZoom = function (z) {
    this.state.zoom = Math.max(0.1, Math.min(3, z));
    this.applyZoom();
  };

  Widget.prototype.applyZoom = function () {
    var lay = this.lay;
    var z = this.state.zoom;
    setAttrs(this.svgEl, {
      viewBox: '0 0 ' + lay.width + ' ' + lay.height,
      width: Math.round(lay.width * z), height: Math.round(lay.height * z)
    });
  };

  Widget.prototype.fit = function () {
    var lay = this.lay;
    var w = this.view.clientWidth || 800;
    var h = this.view.clientHeight || this.height;
    var z = Math.min(1, (w - 12) / lay.width, (h - 12) / lay.height);
    this.setZoom(Math.max(z, 0.2));
  };

  Widget.prototype.svgString = function () {
    var clone = this.svgEl.cloneNode(true);
    setAttrs(clone, { xmlns: SVG_NS, width: this.lay.width, height: this.lay.height });
    return new XMLSerializer().serializeToString(clone);
  };

  Widget.prototype.fileName = function (ext) {
    return 'document-relations-' + (this.project || 'project') + '.' + ext;
  };

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name }, document.body);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.parentNode.removeChild(a); }, 1000);
  }

  Widget.prototype.exportSvg = function () {
    download(new Blob([this.svgString()], { type: 'image/svg+xml' }), this.fileName('svg'));
  };

  // ------------------------------------------------------------------ start

  function start() {
    var roots = document.querySelectorAll('.bw-root');
    for (var i = 0; i < roots.length; i++) {
      if (roots[i].getAttribute('data-bw-ready') === '1') { continue; }
      roots[i].setAttribute('data-bw-ready', '1');
      try {
        new Widget(roots[i]);
      } catch (err) {
        roots[i].appendChild(el('div', { 'class': 'bw-error' }, null, 'Branches widget error: ' + err));
      }
    }
  }

  start();
})();
