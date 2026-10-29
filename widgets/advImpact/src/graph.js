  /*
   * Advanced Impact Analysis - client-side graph (widget-specific part).
   *
   * tools/build-widget.py inlines shared/js/core.js and this file into render.vm, inside one IIFE.
   * Same restrictions as core.js: no dollar sign, hash sign, backslash or non-ASCII character.
   *
   * The page model holds the start items, every work item the server reached (levels up to the parameter, in the
   * parameter direction) and every link of the selected roles between them. The browser recomputes the analysis for
   * the shown roles, directions and levels: one breadth-first search per direction from the start items (a path never
   * changes direction, SPEC Q12), each item at its lowest level. Columns: upstream levels on the left, the start
   * document, downstream levels on the right. Edges: o = document of the link targets (left), c = document of the link
   * sources; arrows follow the link direction (arrowAtOrigin).
   */

  var ROLE_STYLES = [
    { color: 'rgb(51,103,214)', dash: '' },
    { color: 'rgb(198,40,40)', dash: '9,5' },
    { color: 'rgb(26,127,55)', dash: '2,4' },
    { color: 'rgb(142,68,173)', dash: '6,3' },
    { color: 'rgb(211,84,0)', dash: '12,4,2,4' }
  ];
  // Links listed per relation and impacted items listed per document in the details box (Excel lists all of them).
  var SAMPLE_CAP = 30;
  var DETAIL_CAP = 200;
  var GT = String.fromCharCode(62);

  // data-roles "id|name|opposite name;..." -> categories in selection order.
  function readCats(s) {
    var cats = [];
    (s || '').split(';').forEach(function (part) {
      var f = part.split('|');
      if (!f[0] || cats.length >= ROLE_STYLES.length) { return; }
      var st = ROLE_STYLES[cats.length];
      var name = f[1] || f[0];
      cats.push({ id: f[0], name: name, label: name, opp: f[2] || name, color: st.color, dash: st.dash });
    });
    return cats;
  }

  // Work item ids in natural order: prefix, then number (VIA-2 before VIA-10).
  function idCompare(a, b) {
    var na = a.split('-');
    var nb = b.split('-');
    var pa = na.slice(0, -1).join('-');
    var pb = nb.slice(0, -1).join('-');
    if (pa !== pb) { return pa < pb ? -1 : 1; }
    var ia = parseInt(na[na.length - 1], 10);
    var ib = parseInt(nb[nb.length - 1], 10);
    if (isNaN(ia) || isNaN(ib) || ia === ib) { return a < b ? -1 : (a > b ? 1 : 0); }
    return ia - ib;
  }

  function readModel(root) {
    var model = readNodes(root);
    var nEls = root.querySelectorAll('.bw-model .bw-n');
    var byIndex = [];
    for (var i = 0; i < nEls.length; i++) { byIndex.push(model.byKey[nEls[i].dataset.k] || null); }
    model.start = model.byKey[root.dataset.start] || null;
    // Items "id|doc index|type|start|title;"
    model.items = [];
    model.byId = {};
    var it = root.querySelector('.bw-model .ai-it');
    ((it && it.dataset.v) || '').split(';').forEach(function (part) {
      var f = part.split('|');
      if (f.length < 5 || !f[0] || model.byId[f[0]]) { return; }
      var item = {
        id: f[0], doc: byIndex[toInt(f[1])] || null, type: f[2], start: f[3] === '1', title: f.slice(4).join('|')
      };
      if (toInt(f[1]) < 0) { item.doc = null; }
      model.items.push(item);
      model.byId[item.id] = item;
    });
    // Links "source|target|role;" between reached items, indexed both ways.
    model.links = [];
    model.bySource = {};
    model.byTarget = {};
    var ln = root.querySelector('.bw-model .ai-ln');
    ((ln && ln.dataset.v) || '').split(';').forEach(function (part) {
      var f = part.split('|');
      if (f.length !== 3 || !model.byId[f[0]] || !model.byId[f[1]]) { return; }
      var l = { s: f[0], t: f[1], k: f[2], i: model.links.length };
      model.links.push(l);
      (model.bySource[l.s] = model.bySource[l.s] || []).push(l);
      (model.byTarget[l.t] = model.byTarget[l.t] || []).push(l);
    });
    return model;
  }

  function Widget(root) {
    this.cats = readCats(root.dataset.roles);
    initBase(this, root, readModel(root));
    this.filePrefix = 'impact-analysis-';
    this.emptyText = 'No document to show.';
    this.arrowAtOrigin = true;
    this.warn = root.dataset.warn || '';
    this.query = root.dataset.query || '';
    this.dirParam = root.dataset.dir === 'up' || root.dataset.dir === 'both' ? root.dataset.dir : 'down';
    this.levels = Math.max(1, Math.min(7, toInt(root.dataset.levels) || 3));
    var st = this.state;
    st.rel = relFromData('', this.cats);
    st.dirs = { down: this.dirParam !== 'up', up: this.dirParam !== 'down' };
    st.maxLevel = this.levels;
    st.hidden = {};
    st.baseLines = 5;
    this.build();
    this.render(true);
  }
  extendBase(Widget);

  Widget.prototype.build = function () {
    var self = this;
    var bar = el('div', { 'class': 'bw-toolbar' }, this.root);
    this.docPicker(bar);
    this.kindChecks(bar, 'Roles:');
    if (this.dirParam === 'both') {
      var dbox = el('span', { 'class': 'bw-fields' }, bar);
      el('span', { 'class': 'bw-muted' }, dbox, 'Direction:');
      [['down', 'Downstream'], ['up', 'Upstream']].forEach(function (d) {
        self.checkbox(dbox, d[1], true, function (on) { self.state.dirs[d[0]] = on; self.render(true); });
      });
    }
    var lab = el('label', { 'class': 'bw-check' }, bar);
    el('span', { 'class': 'bw-muted' }, lab, 'Levels:');
    var sel = el('select', { 'class': 'bw-ctl', title: 'Levels of analysis shown (the widget parameter sets the maximum)' }, lab);
    for (var i = 1; i <= this.levels; i++) { el('option', { value: String(i) }, sel, String(i)); }
    sel.value = String(this.levels);
    sel.addEventListener('change', function () { self.state.maxLevel = toInt(sel.value); self.render(true); });
    this.countsCheck(bar).title = 'Show the number of links on the lines';
    this.fieldChecks(bar);
    this.searchBox(bar);
    this.viewButtons(bar);
    this.buildAreas();
  };

  // In-widget document selector: hides documents from the graph (the analysis still goes through them).
  Widget.prototype.docPicker = function (bar) {
    var self = this;
    var wrap = el('span', { 'class': 'ai-pick' }, bar);
    var btn = this.button(wrap, 'Documents', 'Choose the documents shown', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    var panel = el('div', { 'class': 'ai-pick-panel' }, wrap);
    panel.style.display = 'none';
    var all = this.checkbox(panel, '(all)', true, function (on) {
      self.model.nodes.forEach(function (n) { if (on) { delete self.state.hidden[n.key]; } else { self.state.hidden[n.key] = true; } });
      boxes.forEach(function (b) { b.checked = on; });
      update();
    });
    all.style.fontWeight = '600';
    var boxes = [];
    this.model.nodes.slice().sort(function (a, b) {
      return docSortKey(a).localeCompare(docSortKey(b));
    }).forEach(function (n) {
      var lab = self.checkbox(panel, self.docLabel(n), true, function (on) {
        if (on) { delete self.state.hidden[n.key]; } else { self.state.hidden[n.key] = true; }
        update();
      });
      lab.style.display = 'flex';
      boxes.push(lab.querySelector('input'));
    });
    function update() {
      var shown = self.model.nodes.filter(function (n) { return !self.state.hidden[n.key]; }).length;
      btn.textContent = 'Documents (' + shown + '/' + self.model.nodes.length + ')';
      self.render(true);
    }
    btn.textContent = 'Documents (' + this.model.nodes.length + '/' + this.model.nodes.length + ')';
  };

  Widget.prototype.legend = function (box) {
    this.legendKinds(box);
    el('span', { 'class': 'bw-muted' }, box, 'Upstream documents on the left, the start document, downstream documents on the right; ' +
      'arrows follow the link direction. Click a document for its impacted work items, a line for its links.');
  };

  // ------------------------------------------------------------------ analysis (current roles, directions, levels)

  Widget.prototype.compute = function () {
    var st = this.state;
    var m = this.model;
    var res = { lvl: {}, dir: {}, parents: {}, pathLinks: [], docs: {} };
    var per = {};
    ['down', 'up'].forEach(function (d) {
      if (!st.dirs[d]) { return; }
      var lv = {};
      var frontier = [];
      m.items.forEach(function (it) { if (it.start) { lv[it.id] = 0; frontier.push(it.id); } });
      for (var k = 1; k <= st.maxLevel && frontier.length; k++) {
        var next = [];
        frontier.forEach(function (id) {
          var ls = (d === 'down' ? m.byTarget[id] : m.bySource[id]) || [];
          ls.forEach(function (l) {
            if (!st.rel[l.k]) { return; }
            var other = d === 'down' ? l.s : l.t;
            if (lv[other] === undefined) { lv[other] = k; next.push(other); }
          });
        });
        frontier = next;
      }
      per[d] = lv;
    });
    // Item level: lowest over the shown directions (downstream first on a tie).
    ['down', 'up'].forEach(function (d) {
      var lv = per[d];
      if (!lv) { return; }
      Object.keys(lv).forEach(function (id) {
        if (res.lvl[id] === undefined || lv[id] < res.lvl[id]) { res.lvl[id] = lv[id]; res.dir[id] = d; }
      });
    });
    // Links along a path of the analysis (each link once) and the parents of each reached item.
    var seen = {};
    m.links.forEach(function (l) {
      if (!st.rel[l.k]) { return; }
      var dn = per.down, up = per.up;
      if (dn && dn[l.s] !== undefined && dn[l.t] !== undefined && dn[l.s] === dn[l.t] + 1) {
        (res.parents[l.s] = res.parents[l.s] || []).push({ id: l.t, k: l.k, d: 'down' });
        if (!seen[l.i]) { seen[l.i] = true; res.pathLinks.push(l); }
      }
      if (up && up[l.s] !== undefined && up[l.t] !== undefined && up[l.t] === up[l.s] + 1) {
        (res.parents[l.t] = res.parents[l.t] || []).push({ id: l.s, k: l.k, d: 'up' });
        if (!seen[l.i]) { seen[l.i] = true; res.pathLinks.push(l); }
      }
    });
    // Documents: side and level of their lowest item (start document: 0), impacted items.
    var start = m.start;
    if (start) { res.docs[start.key] = { side: 'start', level: 0, items: [], starts: 0 }; }
    m.items.forEach(function (it) {
      if (!it.doc || res.lvl[it.id] === undefined) { return; }
      var L = res.lvl[it.id];
      var info = res.docs[it.doc.key];
      if (!info) { info = res.docs[it.doc.key] = { side: res.dir[it.id], level: L, items: [], starts: 0 }; }
      else if (info.side !== 'start' && L < info.level) { info.side = res.dir[it.id]; info.level = L; }
      if (L > 0) { info.items.push(it); } else { info.starts++; }
    });
    Object.keys(res.docs).forEach(function (k) {
      res.docs[k].items.sort(function (a, b) { return res.lvl[a.id] - res.lvl[b.id] || idCompare(a.id, b.id); });
    });
    return res;
  };

  // Relations between the shown documents: o = document of the link targets, c = of the link sources.
  Widget.prototype.relations = function (res) {
    var st = this.state;
    var cats = this.cats;
    var by = {};
    var list = [];
    var m = this.model;
    res.pathLinks.forEach(function (l) {
      var so = m.byId[l.s].doc;
      var ta = m.byId[l.t].doc;
      if (!so || !ta || so === ta || st.hidden[so.key] || st.hidden[ta.key]) { return; }
      var key = ta.key + GT + so.key;
      var e = by[key];
      if (!e) {
        e = by[key] = { o: ta.key, c: so.key, kinds: {}, meta: {}, indirect: false, pairs: [], samples: [], total: 0 };
        cats.forEach(function (c) { e.kinds[c.id] = 0; });
        list.push(e);
      }
      e.kinds[l.k]++;
      e.pairs.push({ c: l.s, o: l.t, k: l.k });
    });
    list.forEach(function (e) {
      e.pairs.sort(function (a, b) { return idCompare(a.c, b.c) || idCompare(a.o, b.o); });
      e.samples = e.pairs.slice(0, SAMPLE_CAP);
      e.total = e.pairs.length;
      e.links = e.pairs.length;
    });
    return list;
  };

  function posLabel(info) {
    if (!info) { return DASH; }
    if (info.side === 'start') { return 'Start document'; }
    return (info.side === 'up' ? 'Upstream' : 'Downstream') + ' level ' + info.level;
  }

  function dirLabel(d) { return d === 'up' ? 'upstream' : 'downstream'; }

  Widget.prototype.nodeLines = function (n) {
    var lines = Base.nodeLines.call(this, n);
    var info = this.res.docs[n.key];
    var count = info && info.side === 'start' ?
      'Start items: ' + info.starts + ' / ' + (n.items >= 0 ? n.items : DASH) :
      'Impacted: ' + (info ? info.items.length : 0) + ' / ' + (n.items >= 0 ? n.items : DASH);
    lines.splice(3, 0,
      { text: posLabel(info), weight: 600, color: info && info.side === 'start' ? 'rgb(176,96,0)' : 'rgb(26,90,60)' },
      { text: count, weight: 400, color: 'rgb(80,88,105)' });
    return lines;
  };

  Widget.prototype.onNode = function (a, n) {
    var self = this;
    a.addEventListener('click', function (ev) { ev.preventDefault(); self.showDocDetails(n); });
  };

  // ------------------------------------------------------------------ layout (columns by signed level)

  Widget.prototype.layoutAndDraw = function (edges, refit) {
    var st = this.state;
    this.lay = this.columns(edges);
    this.edges = edges;
    this.viewBtn.textContent = st.view === 'graph' ? 'Table' : 'Graph';
    this.view.style.display = st.view === 'graph' ? '' : 'none';
    this.table.style.display = st.view === 'table' ? '' : 'none';
    this.drawGraph();
    this.drawTable();
    if (refit) { this.fit(); } else { this.applyZoom(); }
  };

  Widget.prototype.columns = function (edges) {
    var st = this.state;
    var res = this.res;
    var h = PAD * 2 + LINE_H * (st.baseLines + st.extras.length);
    var shown = this.model.nodes.filter(function (n) { return res.docs[n.key] && !st.hidden[n.key]; });
    var upMax = 0;
    shown.forEach(function (n) { var i = res.docs[n.key]; if (i.side === 'up') { upMax = Math.max(upMax, i.level); } });
    var colOf = {};
    var cols = [];
    shown.forEach(function (n) {
      var i = res.docs[n.key];
      var c = i.side === 'up' ? upMax - i.level : (i.side === 'down' ? upMax + i.level : upMax);
      colOf[n.key] = c;
      (cols[c] = cols[c] || []).push(n);
    });
    for (var f = 0; f < cols.length; f++) {
      cols[f] = (cols[f] || []).sort(function (x, y) { return docSortKey(x).localeCompare(docSortKey(y)); });
    }
    // Barycentre ordering over the relations (both ends) to reduce crossings.
    var nb = {};
    edges.forEach(function (e) {
      (nb[e.o] = nb[e.o] || []).push(e.c);
      (nb[e.c] = nb[e.c] || []).push(e.o);
    });
    var order = {};
    function index() { cols.forEach(function (col) { col.forEach(function (n, r) { order[n.key] = r; }); }); }
    index();
    for (var sweep = 0; sweep < 4; sweep++) {
      for (var c2 = 0; c2 < cols.length; c2++) {
        cols[c2] = cols[c2].map(function (n, idx) {
          var l = (nb[n.key] || []).filter(function (k) { return order[k] !== undefined && colOf[k] !== colOf[n.key]; });
          var v = l.length ? l.reduce(function (s, k) { return s + order[k]; }, 0) / l.length : idx;
          return { n: n, v: v, idx: idx };
        }).sort(function (x, y) { return x.v - y.v || x.idx - y.idx; }).map(function (x) { return x.n; });
        index();
      }
    }
    var topPad = 0;
    edges.forEach(function (e) { if (Math.abs(colOf[e.c] - colOf[e.o]) > 1) { topPad = 40; } });
    var pos = {};
    var maxRows = 0;
    cols.forEach(function (col, w) {
      maxRows = Math.max(maxRows, col.length);
      col.forEach(function (n, z) {
        pos[n.key] = { x: MARGIN + w * (NODE_W + COL_GAP), y: MARGIN + topPad + z * (h + ROW_GAP) };
      });
    });
    var width = MARGIN * 2 + Math.max(1, cols.length) * NODE_W + Math.max(0, cols.length - 1) * COL_GAP;
    var height = MARGIN * 2 + topPad + maxRows * (h + ROW_GAP);
    return { pos: pos, width: width, height: Math.max(height, 80), nodeH: h, linked: shown, isolated: [], isoTop: height, topPad: topPad };
  };

  Widget.prototype.render = function (refit) {
    this.res = this.compute();
    var edges = this.relations(this.res);
    this.layoutAndDraw(edges, refit);
    var res = this.res;
    var nImp = 0;
    var nDocs = 0;
    Object.keys(res.docs).forEach(function (k) { var i = res.docs[k]; nImp += i.items.length; if (i.items.length) { nDocs++; } });
    var dirs = [];
    if (this.state.dirs.down) { dirs.push('downstream'); }
    if (this.state.dirs.up) { dirs.push('upstream'); }
    var starts = this.model.items.filter(function (it) { return it.start; }).length;
    this.status.textContent = starts + ' start items' + (this.query ? ' (query: ' + this.query + ')' : '') + ', ' +
      nImp + ' impacted work items in ' + nDocs + ' documents, ' + (dirs.join(' and ') || 'no direction') + ', ' +
      this.state.maxLevel + ' levels' + (this.warn ? ' ' + DASH + ' ' + this.warn : '');
    if (this.details.style.display !== 'none') {
      if (this.detailDoc && !this.state.hidden[this.detailDoc.key] && res.docs[this.detailDoc.key]) { this.showDocDetails(this.detailDoc); }
      else { this.details.style.display = 'none'; }
    }
  };

  // ------------------------------------------------------------------ details

  Widget.prototype.edgeSummary = function (e) {
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    return [c.id + '  ' + ARROW + '  ' + o.id, kindsLabel(e, this.cats) + ' (' + e.links + ' links)'];
  };

  Widget.prototype.showDetails = function (e) {
    this.detailDoc = null;
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var box = this.openDetails(c, o);
    this.edgeSummary(e).slice(1).forEach(function (l) { el('div', null, box, l); });
    this.sampleList(box, e, 'Links (source ' + ARROW + ' target):');
  };

  // Ids of the parents ("reached from") of an item, with their roles.
  Widget.prototype.parentText = function (id) {
    var self = this;
    return (this.res.parents[id] || []).map(function (p) {
      var cat = catById(self.cats, p.k);
      return p.id + ' (' + (cat ? (p.d === 'down' ? cat.opp : cat.name) : p.k) + ')';
    }).join(', ');
  };

  Widget.prototype.showDocDetails = function (n) {
    var self = this;
    this.detailDoc = n;
    var info = this.res.docs[n.key];
    var box = this.openDetails(n, null);
    var b = this.button(box.firstChild, 'Traceability matrix (Excel)', 'Download the links of the work items of this document as an Excel workbook', function () {
      self.exportDocMatrix(n);
    });
    b.style.marginLeft = '8px';
    el('div', null, box, n.title + ' ' + DASH + ' ' + (this.multi ? n.project + ' / ' : '') + n.space + ' ' + DASH + ' ' + posLabel(info));
    if (!info || !info.items.length) {
      el('div', { 'class': 'bw-muted' }, box, info && info.side === 'start' ? info.starts + ' start items, no other work item of this document is reached.' : 'No impacted work item.');
      return;
    }
    el('div', null, box, info.items.length + ' impacted work items' + (info.side === 'start' ? ' (besides ' + info.starts + ' start items)' : '') + ':');
    var ul = el('ul', { 'class': 'bw-items' }, box);
    info.items.slice(0, DETAIL_CAP).forEach(function (it) {
      var li = el('li', null, ul);
      el('a', { href: itemUrl(n.project, it.id, n.col), target: '_top' }, li, it.id);
      el('span', null, li, ' ' + it.title + ' ');
      el('span', { 'class': 'bw-muted' }, li, DASH + ' ' + dirLabel(self.res.dir[it.id]) + ' level ' + self.res.lvl[it.id] +
        ', from ' + self.parentText(it.id));
    });
    if (info.items.length > DETAIL_CAP) {
      el('div', { 'class': 'bw-muted' }, box, ELLIPSIS + ' and ' + (info.items.length - DETAIL_CAP) + ' more (Excel lists all of them)');
    }
  };

  // ------------------------------------------------------------------ table

  Widget.prototype.shownDocInfo = function () {
    var res = this.res;
    var st = this.state;
    return this.model.nodes.filter(function (n) { return res.docs[n.key] && !st.hidden[n.key]; }).sort(function (a, b) {
      var ia = res.docs[a.key], ib = res.docs[b.key];
      var sa = ia.side === 'up' ? -ia.level : ia.level;
      var sb = ib.side === 'up' ? -ib.level : ib.level;
      return sa - sb || docSortKey(a).localeCompare(docSortKey(b));
    });
  };

  Widget.prototype.drawTable = function () {
    var self = this;
    this.table.textContent = '';
    if (this.state.view !== 'table') { return; }
    var docs = this.shownDocInfo().map(function (n) {
      var info = self.res.docs[n.key];
      return [{ text: self.docLabel(n), href: docUrl(n) }, posLabel(info),
        String(info.side === 'start' ? info.starts + ' start' : info.items.length), n.items >= 0 ? String(n.items) : ''];
    });
    this.htmlTable(['Document', 'Position', 'Impacted work items', 'Work items'], docs, 'No document.');
    var rows = this.sortedEdges().map(function (e) {
      var o = self.model.byKey[e.o];
      var c = self.model.byKey[e.c];
      return [{ text: self.docLabel(c), href: docUrl(c) }, kindsLabel(e, self.cats), { text: self.docLabel(o), href: docUrl(o) }];
    });
    if (rows.length) { this.htmlTable(['Document (link sources)', 'Roles (links)', 'Document (link targets)'], rows, ''); }
  };

  // ------------------------------------------------------------------ Excel export (current filters)

  // Path from a start item to the item: first parent at each step.
  Widget.prototype.pathOf = function (id) {
    var ids = [id];
    var roles = [];
    var cur = id;
    for (var guard = 0; guard < 10; guard++) {
      var ps = this.res.parents[cur];
      if (!ps || !ps.length) { break; }
      var cat = catById(this.cats, ps[0].k);
      roles.unshift(cat ? (ps[0].d === 'down' ? cat.opp : cat.name) : ps[0].k);
      cur = ps[0].id;
      ids.unshift(cur);
    }
    return { ids: ids, roles: roles };
  };

  Widget.prototype.exportExcel = function () {
    var self = this;
    var by = this.model.byKey;
    var cats = this.cats;
    var res = this.res;
    var edges = this.sortedEdges();
    var rel = [['Source project', 'Source space', 'Source document', 'Source title', 'Roles',
      'Target project', 'Target space', 'Target document', 'Target title']
      .concat(cats.map(function (c) { return c.name + ' links'; })).concat(['Links'])];
    var relLinks = [];
    edges.forEach(function (e, i) {
      var o = by[e.o];
      var c = by[e.c];
      rel.push([c.project, c.space, c.id, c.title, kindsLabel(e, cats), o.project, o.space, o.id, o.title]
        .concat(cats.map(function (k) { return e.kinds[k.id]; })).concat([e.links]));
      relLinks.push({ r: i + 1, c: 2, url: absUrl(docUrl(c)) });
      relLinks.push({ r: i + 1, c: 7, url: absUrl(docUrl(o)) });
    });
    var shown = this.shownDocInfo();
    var docs = [['Project', 'Space', 'Document', 'Title', 'Type', 'Status', 'Created', 'Updated', 'Work items',
      'Position', 'Direction', 'Level', 'Impacted work items', 'Start items']];
    shown.forEach(function (n) {
      var info = res.docs[n.key];
      docs.push([n.project, n.space, n.id, n.title, n.type, n.status, n.created, n.updated, n.items < 0 ? '' : n.items,
        posLabel(info), info.side === 'start' ? '' : dirLabel(info.side), info.level, info.items.length, info.starts]);
    });
    var docLinks = shown.map(function (n, i) { return { r: i + 1, c: 2, url: absUrl(docUrl(n)) }; });
    var items = [['Work item', 'Title', 'Type', 'Document', 'Direction', 'Level', 'Reached from']];
    var itemLinks = [];
    var paths = [['Work item', 'Title', 'Document', 'Direction', 'Level', 'Path from a start item', 'Links along the path']];
    var pathLinks = [];
    shown.forEach(function (n) {
      res.docs[n.key].items.forEach(function (it) {
        items.push([it.id, it.title, it.type, self.docLabel(n), dirLabel(res.dir[it.id]), res.lvl[it.id], self.parentText(it.id)]);
        itemLinks.push({ r: items.length - 1, c: 0, url: absUrl(itemUrl(n.project, it.id, n.col)) });
        var p = self.pathOf(it.id);
        paths.push([it.id, it.title, self.docLabel(n), dirLabel(res.dir[it.id]), res.lvl[it.id],
          p.ids.join(' ' + GT + ' '), p.roles.join(' ' + GT + ' ')]);
        pathLinks.push({ r: paths.length - 1, c: 0, url: absUrl(itemUrl(n.project, it.id, n.col)) });
      });
    });
    this.exportWorkbook([
      { name: 'Relations', what: 'relations', rows: rel, links: relLinks,
        widths: [14, 14, 28, 34, 24, 14, 14, 28, 34].concat(cats.map(function () { return 10; })).concat([8]) },
      { name: 'Documents', rows: docs, links: docLinks, widths: [14, 14, 28, 40, 14, 14, 12, 12, 11, 20, 12, 7, 12, 10] },
      { name: 'Impacted items', rows: items, links: itemLinks, widths: [16, 50, 16, 34, 12, 7, 40] },
      { name: 'Impact paths', rows: paths, links: pathLinks, widths: [16, 50, 34, 12, 7, 50, 50] }
    ]);
  };

  // Traceability matrix of a document: one row per link of the selected (shown) roles of each of its reached work items
  // to another reached item (item repeated when it has several links); "not linked" when it has none.
  Widget.prototype.exportDocMatrix = function (n) {
    var self = this;
    var m = this.model;
    var res = this.res;
    var st = this.state;
    var cats = this.cats;
    var rows = [['Work item', 'Title', 'Linked item', 'Linked item title', 'Link', 'Linked document', 'Linked item level']];
    var urls = [];
    var its = m.items.filter(function (it) { return it.doc === n && res.lvl[it.id] !== undefined; });
    its.sort(function (a, b) { return idCompare(a.id, b.id); });
    its.forEach(function (it) {
      var ls = [];
      (m.bySource[it.id] || []).forEach(function (l) { if (st.rel[l.k] && res.lvl[l.t] !== undefined) { ls.push({ id: l.t, k: l.k, out: true }); } });
      (m.byTarget[it.id] || []).forEach(function (l) { if (st.rel[l.k] && res.lvl[l.s] !== undefined) { ls.push({ id: l.s, k: l.k, out: false }); } });
      if (!ls.length) {
        rows.push([it.id, it.title, 'not linked', '', '', '', '']);
        urls.push({ r: rows.length - 1, c: 0, url: absUrl(itemUrl(n.project, it.id, n.col)) });
        return;
      }
      ls.sort(function (a, b) { return idCompare(a.id, b.id); });
      ls.forEach(function (l) {
        var other = m.byId[l.id];
        var cat = catById(cats, l.k);
        var od = other.doc;
        rows.push([it.id, it.title, l.id, other.title, cat ? (l.out ? cat.name : cat.opp) : l.k, od ? self.docLabel(od) : '',
          res.lvl[l.id] === 0 ? 'start' : dirLabel(res.dir[l.id]) + ' ' + res.lvl[l.id]]);
        urls.push({ r: rows.length - 1, c: 0, url: absUrl(itemUrl(n.project, it.id, n.col)) });
        if (od) { urls.push({ r: rows.length - 1, c: 2, url: absUrl(itemUrl(od.project, l.id, od.col)) }); }
      });
    });
    this.exportWorkbook([{ name: 'Traceability', what: 'traceability matrix', rows: rows, links: urls,
      widths: [16, 50, 16, 50, 22, 40, 16] }], 'traceability-' + n.id.replace(/[^A-Za-z0-9_.-]+/g, '_') + '.xlsx');
  };

  startWidgets('ai-root', Widget, 'Impact');
