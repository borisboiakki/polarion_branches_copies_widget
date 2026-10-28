  /*
   * Document Coverage - client-side graph (widget-specific part).
   *
   * tools/build-widget.py inlines shared/js/core.js and this file into render.vm, inside one IIFE.
   * Same restrictions as core.js: no dollar sign, hash sign, backslash or non-ASCII character.
   *
   * Edges: o = upstream document (link targets, left), c = downstream document (link sources).
   * Arrows follow the link direction, downstream -> upstream (arrowAtOrigin).
   * Coverage is recomputed from the shown lines: hiding a role or a document updates it.
   */

  var ROLE_STYLES = [
    { color: 'rgb(51,103,214)', dash: '' },
    { color: 'rgb(198,40,40)', dash: '9,5' },
    { color: 'rgb(26,127,55)', dash: '2,4' },
    { color: 'rgb(142,68,173)', dash: '6,3' },
    { color: 'rgb(211,84,0)', dash: '12,4,2,4' }
  ];

  // Linked item pairs listed in the details box per relation (the Excel export and the matrix use all of them).
  var SAMPLE_CAP = 30;

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

  function words(s) {
    return (s || '').split(' ').filter(function (x) { return x; });
  }

  // "role:a b;role2:c" -> { role: ['a', 'b'], role2: ['c'] }
  function roleLists(s) {
    var out = {};
    (s || '').split(';').forEach(function (part) {
      var i = part.indexOf(':');
      if (i > 0) { out[part.substring(0, i)] = words(part.substring(i + 1)); }
    });
    return out;
  }

  function readModel(root, cats) {
    var model = readNodes(root);
    model.nodes.forEach(function (n) {
      var d = n.el.dataset;
      n.up = d.up === '1';
      n.uncBase = words(d.unc);
      n.uncBaseN = toInt(d.uncN);
      // Work items (id, title) of a related document, sorted by id, for the traceability matrix.
      n.its = [];
      n.titles = {};
      (d.it || '').split(';').forEach(function (part) {
        var i = part.indexOf('|');
        if (i <= 0) { return; }
        var id = part.substring(0, i);
        n.titles[id] = part.substring(i + 1);
        n.its.push(id);
      });
      n.its.sort(idCompare);
    });
    var byKey = model.byKey;
    var edges = [];
    var eEls = root.querySelectorAll('.bw-model .bw-e');
    for (var j = 0; j < eEls.length; j++) {
      var a = eEls[j].dataset;
      if (!byKey[a.o] || !byKey[a.c] || a.o === a.c) { continue; }
      var kinds = {};
      (a.r || '').split(';').forEach(function (part) {
        var i = part.indexOf(':');
        if (i > 0) { kinds[part.substring(0, i)] = toInt(part.substring(i + 1)); }
      });
      cats.forEach(function (c) { if (!kinds[c.id]) { kinds[c.id] = 0; } });
      edges.push({
        o: a.o, c: a.c, kinds: kinds, meta: {}, indirect: false,
        up: roleLists(a.u), down: roleLists(a.d),
        pairs: parseSamples(a.s), samples: []
      });
    }
    // Every upstream item covered by any line (all roles, all documents), per upstream document.
    model.allCovered = {};
    edges.forEach(function (e) {
      var set = model.allCovered[e.o] = model.allCovered[e.o] || {};
      cats.forEach(function (c) { (e.up[c.id] || []).forEach(function (id) { set[id] = true; }); });
    });
    model.edges = edges;
    return model;
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

  function union(lists) {
    var set = {};
    lists.forEach(function (l) { (l || []).forEach(function (id) { set[id] = true; }); });
    return set;
  }

  function size(set) { return Object.keys(set).length; }

  function Widget(root) {
    this.cats = readCats(root.dataset.roles);
    initBase(this, root, readModel(root, this.cats));
    this.filePrefix = 'document-coverage-';
    this.emptyText = 'No link of the shown roles between the shown documents.';
    this.arrowAtOrigin = true;
    this.warn = root.dataset.warn || '';
    this.state.rel = relFromData('', this.cats);
    this.state.hidden = {};
    this.state.baseLines = 4;
    this.build();
    this.render(true);
  }
  extendBase(Widget);

  Widget.prototype.build = function () {
    var self = this;
    var bar = el('div', { 'class': 'bw-toolbar' }, this.root);

    var mode = el('select', { 'class': 'bw-ctl', title: 'Documents shown' }, bar);
    el('option', { value: 'related' }, mode, 'Only documents with relations');
    el('option', { value: 'all' }, mode, 'All selected documents');
    mode.value = this.state.mode;
    mode.addEventListener('change', function () { self.state.mode = mode.value; self.render(true); });

    this.docPicker(bar);
    this.kindChecks(bar, 'Roles:');
    this.countsCheck(bar).title = 'Show the number of links on the lines';
    this.fieldChecks(bar);
    this.searchBox(bar);
    this.viewButtons(bar);
    this.buildAreas();
  };

  // In-widget document selector: a button that opens a list of checkboxes.
  Widget.prototype.docPicker = function (bar) {
    var self = this;
    var wrap = el('span', { 'class': 'cw-pick' }, bar);
    var btn = this.button(wrap, 'Documents', 'Choose the documents shown', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    var panel = el('div', { 'class': 'cw-pick-panel' }, wrap);
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
      var shown = self.model.nodes.length - size(self.state.hidden);
      btn.textContent = 'Documents (' + shown + '/' + self.model.nodes.length + ')';
      self.render(true);
    }
    btn.textContent = 'Documents (' + this.model.nodes.length + '/' + this.model.nodes.length + ')';
  };

  Widget.prototype.legend = function (box) {
    this.legendKinds(box);
    el('span', { 'class': 'bw-muted' }, box, 'Arrow: downstream ' + ARROW + ' upstream (link direction), upstream on the left. ' +
      'Click a document for its coverage, a line for details.');
  };

  // Edges restricted to the shown roles and documents; coverage of the upstream documents from them.
  Widget.prototype.compute = function () {
    var st = this.state;
    var cats = this.cats;
    var edges = [];
    this.model.edges.forEach(function (e) {
      if (st.hidden[e.o] || st.hidden[e.c]) { return; }
      var r = restrictEdge(e, cats, st.rel);
      if (!r) { return; }
      r.pairs = e.pairs.filter(function (p) { return st.rel[p.k]; });
      r.samples = r.pairs.slice(0, SAMPLE_CAP);
      var shownRoles = cats.filter(function (c) { return st.rel[c.id]; });
      r.upSet = union(shownRoles.map(function (c) { return e.up[c.id]; }));
      r.downSet = union(shownRoles.map(function (c) { return e.down[c.id]; }));
      r.links = 0;
      shownRoles.forEach(function (c) { r.links += r.kinds[c.id]; });
      r.total = size(r.downSet);
      edges.push(r);
    });
    var cov = {};
    edges.forEach(function (e) {
      var set = cov[e.o] = cov[e.o] || {};
      Object.keys(e.upSet).forEach(function (id) { set[id] = true; });
    });
    this.cov = cov;
    return edges;
  };

  // Coverage of an upstream document with the current filters: { covered, total, uncovered (list), uncoveredN }.
  Widget.prototype.coverage = function (n) {
    if (!n.up) { return null; }
    var set = this.cov[n.key] || {};
    var covered = size(set);
    // Uncovered = never covered (from the server, first 500) + covered only by hidden lines.
    var lost = Object.keys(this.model.allCovered[n.key] || {}).filter(function (id) { return !set[id]; }).sort();
    return {
      covered: covered, total: n.items,
      uncovered: lost.concat(n.uncBase), uncoveredN: n.uncBaseN + lost.length
    };
  };

  function covText(c) {
    if (!c) { return DASH; }
    var p = pct(c.covered, c.total);
    return p === null ? DASH : p + '% (' + c.covered + '/' + c.total + ')';
  }

  Widget.prototype.nodeLines = function (n) {
    var lines = Base.nodeLines.call(this, n);
    var c = this.coverage(n);
    lines.splice(3, 0, { text: 'Coverage: ' + covText(c), weight: 600, color: c ? 'rgb(26,90,60)' : 'rgb(140,146,160)' });
    return lines;
  };

  // A click on a document shows its coverage (the document link stays in the details).
  Widget.prototype.onNode = function (a, n) {
    var self = this;
    a.addEventListener('click', function (ev) { ev.preventDefault(); self.showDocDetails(n); });
  };

  Widget.prototype.render = function (refit) {
    var edges = this.compute();
    this.layoutAndDraw(edges, refit);
    var shown = this.lay.linked.length + this.lay.isolated.length;
    this.status.textContent = shown + ' of ' + this.model.nodes.length + ' documents, ' + edges.length + ' relations' +
      (this.warn ? ' ' + DASH + ' ' + this.warn : '');
    // Open details follow the filters: document details are recomputed, relation details closed.
    if (this.details.style.display !== 'none') {
      if (this.detailDoc && !this.state.hidden[this.detailDoc.key]) { this.showDocDetails(this.detailDoc); }
      else { this.details.style.display = 'none'; }
    }
  };

  Widget.prototype.edgeSummary = function (e) {
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var lines = [c.id + '  ' + ARROW + '  ' + o.id, kindsLabel(e, this.cats) + ' (' + e.links + ' links)'];
    var pd = pct(size(e.downSet), c.items);
    var pu = pct(size(e.upSet), o.items);
    lines.push(size(e.downSet) + ' items of ' + c.id + ' with links' + (pd !== null ? ' (' + pd + '%)' : ''));
    lines.push(size(e.upSet) + ' items of ' + o.id + ' covered' + (pu !== null ? ' (' + pu + '%)' : ''));
    return lines;
  };

  Widget.prototype.showDetails = function (e) {
    var self = this;
    this.detailDoc = null;
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var box = this.openDetails(c, o);
    this.matrixButton(box, function () { self.exportEdgeMatrix(e); });
    this.edgeSummary(e).slice(1).forEach(function (l) { el('div', null, box, l); });
    this.sampleList(box, e, 'Linked work items (downstream ' + ARROW + ' upstream):');
  };

  Widget.prototype.showDocDetails = function (n) {
    var self = this;
    this.detailDoc = n;
    var box = this.openDetails(n, null);
    this.matrixButton(box, function () { self.exportDocMatrix(n); });
    el('div', null, box, n.title + ' ' + DASH + ' ' + (this.multi ? n.project + ' / ' : '') + n.space);
    var c = this.coverage(n);
    if (!c) {
      el('div', { 'class': 'bw-muted' }, box, 'No shown link points to this document (not upstream).');
    } else {
      el('div', null, box, 'Coverage: ' + covText(c) + ', ' + c.uncoveredN + ' uncovered items');
      if (c.uncovered.length) {
        el('div', { 'class': 'bw-muted' }, box, 'Uncovered items:');
        var ul = el('ul', { 'class': 'bw-items' }, box);
        c.uncovered.forEach(function (id) {
          el('a', { href: itemUrl(n.project, id, n.col), target: '_top' }, el('li', null, ul), id);
        });
        if (c.uncoveredN > c.uncovered.length) {
          el('div', { 'class': 'bw-muted' }, box, ELLIPSIS + ' and ' + (c.uncoveredN - c.uncovered.length) + ' more');
        }
      }
    }
    var down = this.edges.filter(function (e) { return e.o === n.key; });
    if (down.length) {
      el('div', { 'class': 'bw-muted' }, box, 'Covered by: ' + down.map(function (e) {
        return self.model.byKey[e.c].id + ' (' + size(e.upSet) + ')';
      }).join(', '));
    }
  };

  // Downstream -> upstream relations, then the coverage of the upstream documents.
  Widget.prototype.drawTable = function () {
    var self = this;
    this.table.textContent = '';
    if (this.state.view !== 'table') { return; }
    var rows = this.sortedEdges().map(function (e) {
      var o = self.model.byKey[e.o];
      var c = self.model.byKey[e.c];
      return [
        { text: self.docLabel(c), href: docUrl(c) },
        kindsLabel(e, self.cats),
        { text: self.docLabel(o), href: docUrl(o) },
        covText({ covered: size(e.downSet), total: c.items }),
        covText({ covered: size(e.upSet), total: o.items })
      ];
    });
    this.htmlTable(['Downstream', 'Roles (links)', 'Upstream', 'Downstream items with links', 'Upstream items covered'], rows, 'No relation found.');
    var cov = this.shownDocs().filter(function (n) { return n.up; }).map(function (n) {
      var c = self.coverage(n);
      return [{ text: self.docLabel(n), href: docUrl(n) }, String(n.items), covText(c), String(c.uncoveredN)];
    });
    if (cov.length) {
      this.htmlTable(['Upstream document', 'Work items', 'Coverage', 'Uncovered items'], cov, '');
    }
  };

  // ------------------------------------------------------------------ Excel export (current filters)

  Widget.prototype.exportExcel = function () {
    var self = this;
    var by = this.model.byKey;
    var cats = this.cats;
    var edges = this.sortedEdges();
    var rel = [['Downstream project', 'Downstream space', 'Downstream document', 'Downstream title', 'Roles',
      'Upstream project', 'Upstream space', 'Upstream document', 'Upstream title']
      .concat(cats.map(function (c) { return c.name + ' links'; }))
      .concat(['Links', 'Downstream items with links', 'Downstream work items', 'Downstream with links (%)',
        'Upstream items covered', 'Upstream work items', 'Upstream covered (%)'])];
    var relLinks = [];
    edges.forEach(function (e, i) {
      var o = by[e.o];
      var c = by[e.c];
      var pd = pct(size(e.downSet), c.items);
      var pu = pct(size(e.upSet), o.items);
      rel.push([c.project, c.space, c.id, c.title, kindsLabel(e, cats), o.project, o.space, o.id, o.title]
        .concat(cats.map(function (k) { return e.kinds[k.id]; }))
        .concat([e.links, size(e.downSet), c.items < 0 ? '' : c.items, pd === null ? '' : pd,
          size(e.upSet), o.items < 0 ? '' : o.items, pu === null ? '' : pu]));
      relLinks.push({ r: i + 1, c: 2, url: absUrl(docUrl(c)) });
      relLinks.push({ r: i + 1, c: 7, url: absUrl(docUrl(o)) });
    });
    var docs = [['Project', 'Space', 'Document', 'Title', 'Type', 'Status', 'Created', 'Updated', 'Work items',
      'Upstream', 'Covered items', 'Coverage (%)', 'Uncovered items', 'Revision']];
    var shown = this.shownDocs();
    shown.forEach(function (n) {
      var c = self.coverage(n);
      var p = c ? pct(c.covered, c.total) : null;
      docs.push([n.project, n.space, n.id, n.title, n.type, n.status, n.created, n.updated, n.items < 0 ? '' : n.items,
        n.up ? 'yes' : 'no', c ? c.covered : '', p === null ? '' : p, c ? c.uncoveredN : '', n.rev]);
    });
    var docLinks = shown.map(function (n, i) { return { r: i + 1, c: 2, url: absUrl(docUrl(n)) }; });
    var unc = [['Upstream document', 'Uncovered item']];
    var uncLinks = [];
    shown.forEach(function (n) {
      var c = self.coverage(n);
      if (!c) { return; }
      c.uncovered.forEach(function (id) {
        unc.push([self.docLabel(n), id]);
        uncLinks.push({ r: unc.length - 1, c: 1, url: absUrl(itemUrl(n.project, id, n.col)) });
      });
    });
    var items = [['Downstream document', 'Upstream document', 'Downstream item', 'Upstream item', 'Role']];
    var itemLinks = [];
    edges.forEach(function (e) {
      var o = by[e.o];
      var c = by[e.c];
      e.pairs.forEach(function (sm) {
        var cat = catById(cats, sm.k);
        items.push([self.docLabel(c), self.docLabel(o), sm.c, sm.o, cat ? cat.name : sm.k]);
        itemLinks.push({ r: items.length - 1, c: 2, url: absUrl(itemUrl(c.project, sm.c, c.col)) });
        itemLinks.push({ r: items.length - 1, c: 3, url: absUrl(itemUrl(o.project, sm.o, o.col)) });
      });
    });
    this.exportWorkbook([
      { name: 'Relations', what: 'relations', rows: rel, links: relLinks,
        widths: [14, 14, 28, 34, 24, 14, 14, 28, 34].concat(cats.map(function () { return 10; })).concat([8, 12, 12, 12, 12, 12, 12]) },
      { name: 'Documents', rows: docs, links: docLinks, widths: [14, 14, 28, 40, 14, 14, 18, 18, 11, 9, 11, 11, 11, 11] },
      { name: 'Uncovered items (max 500 each)', rows: unc, links: uncLinks, widths: [40, 16] },
      { name: 'Linked items', rows: items, links: itemLinks, widths: [34, 34, 16, 16, 16] }
    ]);
  };

  // ------------------------------------------------------------------ traceability matrix (Excel, current filters)
  // One row per link of a work item (the item repeated when it has several links); an item without a link gets
  // "uncovered" (upstream document) or "not linked" in the linked item cell. Links = the shown lines and roles.

  var MATRIX_HEAD = ['Work item', 'Title', 'Linked item', 'Linked item title', 'Link'];

  Widget.prototype.matrixButton = function (box, onClick) {
    var b = this.button(box.firstChild, 'Traceability matrix (Excel)', 'Download the traceability matrix of the work items as an Excel workbook', onClick);
    b.style.marginLeft = '8px';
  };

  // Rows for the items of document n. links(id) -> [{ id, doc, kind }] of the item; empty = the text noLink.
  Widget.prototype.matrixSheet = function (n, links, noLink, withDoc) {
    var self = this;
    var rows = [withDoc ? MATRIX_HEAD.concat(['Linked document']) : MATRIX_HEAD.slice()];
    var urls = [];
    n.its.forEach(function (id) {
      var title = n.titles[id] || '';
      var ls = links[id] || [];
      if (!ls.length) {
        rows.push(withDoc ? [id, title, noLink, '', '', ''] : [id, title, noLink, '', '']);
        urls.push({ r: rows.length - 1, c: 0, url: absUrl(itemUrl(n.project, id, n.col)) });
        return;
      }
      ls.forEach(function (l) {
        var row = [id, title, l.id, l.doc.titles[l.id] || '', l.kind];
        rows.push(withDoc ? row.concat([self.docLabel(l.doc)]) : row);
        urls.push({ r: rows.length - 1, c: 0, url: absUrl(itemUrl(n.project, id, n.col)) });
        urls.push({ r: rows.length - 1, c: 2, url: absUrl(itemUrl(l.doc.project, l.id, l.doc.col)) });
      });
    });
    return { rows: rows, links: urls, widths: withDoc ? [16, 50, 16, 50, 22, 40] : [16, 50, 16, 50, 22] };
  };

  // Links of the items of document n through edge e: outgoing (n downstream) or incoming (n upstream).
  Widget.prototype.addLinks = function (links, n, e) {
    var by = this.model.byKey;
    var cats = this.cats;
    var up = e.o === n.key;
    e.pairs.forEach(function (p) {
      var cat = catById(cats, p.k);
      var id = up ? p.o : p.c;
      (links[id] = links[id] || []).push({
        id: up ? p.c : p.o, doc: by[up ? e.c : e.o],
        kind: cat ? (up ? cat.opp : cat.name) : p.k
      });
    });
  };

  Widget.prototype.matrixName = function (parts) {
    return 'traceability-' + parts.join('-').replace(/[^A-Za-z0-9_.-]+/g, '_') + '.xlsx';
  };

  Widget.prototype.exportDocMatrix = function (n) {
    var self = this;
    var links = {};
    var upstream = false;
    this.edges.forEach(function (e) {
      if (e.o === n.key) { upstream = true; }
      if (e.o === n.key || e.c === n.key) { self.addLinks(links, n, e); }
    });
    var sh = this.matrixSheet(n, links, upstream ? 'uncovered' : 'not linked', true);
    sh.name = 'Traceability';
    sh.what = 'traceability matrix';
    this.exportWorkbook([sh], this.matrixName([n.id]));
  };

  Widget.prototype.exportEdgeMatrix = function (e) {
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var cur = this.edges.filter(function (x) { return x.o === e.o && x.c === e.c; })[0] || e;
    var upLinks = {};
    var downLinks = {};
    this.addLinks(upLinks, o, cur);
    this.addLinks(downLinks, c, cur);
    var s1 = this.matrixSheet(o, upLinks, 'uncovered', false);
    s1.name = 'Upstream coverage';
    s1.what = 'traceability matrix';
    var s2 = this.matrixSheet(c, downLinks, 'not linked', false);
    s2.name = 'Downstream links';
    this.exportWorkbook([s1, s2], this.matrixName([c.id, o.id]));
  };

  startWidgets('cw-root', Widget, 'Coverage');
