  /*
   * Document Branches and Copies - client-side graph (widget-specific part).
   *
   * tools/build-widget.py inlines shared/js/core.js and this file into render.vm, inside one IIFE.
   * Same restrictions as core.js: no dollar sign, hash sign, backslash or non-ASCII character.
   */

  // Precedence order for the line style: branch > derived > copy.
  var CATS = [
    { id: 'branch', name: 'branch', label: 'Branches', color: 'rgb(198,40,40)', dash: '9,5' },
    { id: 'derived', name: 'derived', label: 'Derived', color: 'rgb(26,127,55)', dash: '2,4' },
    { id: 'copy', name: 'copy', label: 'Copies', color: 'rgb(51,103,214)', dash: '' }
  ];

  function readModel(root) {
    var model = readNodes(root);
    var byKey = model.byKey;
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
    model.edges = edges;
    return model;
  }

  function visibleEdges(model, state) {
    var out = [];
    for (var i = 0; i < model.edges.length; i++) {
      var e = model.edges[i];
      if (e.indirect && !state.indirect) { continue; }
      var r = restrictEdge(e, CATS, state.rel);
      if (r) { out.push(r); }
    }
    return out;
  }

  function Widget(root) {
    initBase(this, root, readModel(root));
    this.cats = CATS;
    this.filePrefix = 'document-relations-';
    this.emptyText = 'No relation found between the documents with the current settings.';
    this.state.indirect = root.dataset.indirect === '1';
    this.state.rel = relFromData(root.dataset.rel, CATS);
    this.build();
    this.render(true);
  }
  extendBase(Widget);

  Widget.prototype.build = function () {
    var self = this;
    var bar = el('div', { 'class': 'bw-toolbar' }, this.root);

    var mode = el('select', { 'class': 'bw-ctl', title: 'Documents shown' }, bar);
    el('option', { value: 'related' }, mode, 'Only documents with relations');
    el('option', { value: 'all' }, mode, 'All documents');
    mode.value = this.state.mode;
    mode.addEventListener('change', function () { self.state.mode = mode.value; self.render(true); });

    var ind = this.checkbox(bar, 'Indirect relations', this.state.indirect, function (on) {
      self.state.indirect = on; self.render(true);
    });
    ind.title = 'Relations inherited through an intermediate copy (hidden by default)';

    this.kindChecks(bar, 'Relations:');
    this.countsCheck(bar);
    this.fieldChecks(bar);
    this.searchBox(bar);
    this.viewButtons(bar);
    this.buildAreas();
  };

  Widget.prototype.legend = function (box) {
    this.legendKinds(box);
    var it = el('span', { 'class': 'bw-leg' }, box);
    var s2 = svg('svg', { width: 34, height: 10 }, it);
    svg('line', { x1: 1, y1: 5, x2: 33, y2: 5, stroke: INDIRECT_COLOR, 'stroke-width': 1.5, 'stroke-dasharray': '4,4' }, s2);
    el('span', null, it, 'indirect');
    el('span', { 'class': 'bw-muted' }, box, 'Arrow: original ' + ARROW + ' copy / branch / derived. Click a document to open it, a line for details.');
  };

  Widget.prototype.render = function (refit) {
    var edges = visibleEdges(this.model, this.state);
    this.layoutAndDraw(edges, refit);
    var hidden = this.model.edges.length - edges.length;
    var shown = this.lay.linked.length + this.lay.isolated.length;
    this.status.textContent = shown + ' of ' + this.model.nodes.length + ' documents, ' + edges.length + ' relations' +
      (hidden > 0 ? ' (' + hidden + ' hidden by the indirect / relation filters)' : '');
  };

  Widget.prototype.edgeSummary = function (e) {
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var lines = [o.id + '  ' + ARROW + '  ' + c.id, kindsLabel(e, CATS) + (e.indirect ? '  (indirect, inherited links)' : '')];
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

  Widget.prototype.showDetails = function (e) {
    var o = this.model.byKey[e.o];
    var c = this.model.byKey[e.c];
    var box = this.openDetails(o, c);
    this.edgeSummary(e).slice(1).forEach(function (l) { el('div', null, box, l); });
    this.sampleList(box, e, 'Linked work items (copy ' + ARROW + ' original):');
  };

  Widget.prototype.drawTable = function () {
    var self = this;
    this.table.textContent = '';
    if (this.state.view !== 'table') { return; }
    var rows = this.sortedEdges().map(function (e) {
      var o = self.model.byKey[e.o];
      var c = self.model.byKey[e.c];
      var pc = pct(e.ci, c.items);
      return [
        { text: self.docLabel(o), href: docUrl(o) },
        kindsLabel(e, CATS) + (e.indirect ? ' (indirect)' : ''),
        { text: self.docLabel(c), href: docUrl(c) },
        String(e.total),
        pc === null ? DASH : pc + '% (' + e.ci + '/' + c.items + ')'
      ];
    });
    this.htmlTable(['Original', 'Relation', 'Copy / branch / derived', 'Linked items', 'Coverage of copy'], rows, 'No relation found.');
  };

  // ------------------------------------------------------------------ Excel export (current filters)

  Widget.prototype.relationRows = function () {
    var self = this;
    var rows = [['Original project', 'Original space', 'Original document', 'Original title', 'Relation',
      'Copy / branch / derived project', 'Copy / branch / derived space', 'Copy / branch / derived document',
      'Copy / branch / derived title',
      'Copy items', 'Branch items', 'Derived items', 'Branch metadata', 'Derived metadata', 'Indirect',
      'Linked items', 'Work items in copy', 'Coverage of copy (%)']];
    this.sortedEdges().forEach(function (e) {
      var o = self.model.byKey[e.o];
      var c = self.model.byKey[e.c];
      var pc = pct(e.ci, c.items);
      rows.push([o.project, o.space, o.id, o.title, kindsLabel(e, CATS), c.project, c.space, c.id, c.title,
        e.kinds.copy, e.kinds.branch, e.kinds.derived, e.meta.branch ? 'yes' : 'no', e.meta.derived ? 'yes' : 'no',
        e.indirect ? 'yes' : 'no', e.total, c.items < 0 ? '' : c.items, pc === null ? '' : pc]);
    });
    return rows;
  };

  Widget.prototype.documentRows = function () {
    var deg = {};
    this.edges.forEach(function (e) { deg[e.o] = (deg[e.o] || 0) + 1; deg[e.c] = (deg[e.c] || 0) + 1; });
    var rows = [['Project', 'Space', 'Document', 'Title', 'Type', 'Status', 'Created', 'Updated', 'Work items', 'Relations shown']];
    this.shownDocs().forEach(function (n) {
      rows.push([n.project, n.space, n.id, n.title, n.type, n.status, n.created, n.updated,
        n.items < 0 ? '' : n.items, deg[n.key] || 0]);
    });
    return rows;
  };

  Widget.prototype.itemRows = function () {
    var self = this;
    var rows = [['Original document', 'Copy / branch / derived document', 'Item in copy', 'Original item', 'Relation']];
    this.sortedEdges().forEach(function (e) {
      var o = self.model.byKey[e.o];
      var c = self.model.byKey[e.c];
      e.samples.forEach(function (sm) {
        rows.push([self.docLabel(o), self.docLabel(c), sm.c, sm.o, sm.k]);
      });
    });
    return rows;
  };

  Widget.prototype.exportExcel = function () {
    var self = this;
    var by = this.model.byKey;
    var relLinks = [];
    var itemLinks = [];
    var r = 1;
    this.sortedEdges().forEach(function (e, i) {
      relLinks.push({ r: i + 1, c: 2, url: absUrl(docUrl(by[e.o])) });
      relLinks.push({ r: i + 1, c: 7, url: absUrl(docUrl(by[e.c])) });
      // Item rows follow the same edge order (itemRows): the copy item is in e.c, the original item in e.o.
      e.samples.forEach(function (sm) {
        itemLinks.push({ r: r, c: 2, url: absUrl(itemUrl(by[e.c].project, sm.c)) });
        itemLinks.push({ r: r, c: 3, url: absUrl(itemUrl(by[e.o].project, sm.o)) });
        r++;
      });
    });
    var docLinks = this.shownDocs().map(function (n, i) { return { r: i + 1, c: 2, url: absUrl(docUrl(n)) }; });
    var items = this.itemRows();
    this.exportWorkbook([
      { name: 'Relations', what: 'relations', rows: this.relationRows(), links: relLinks,
        widths: [14, 14, 28, 34, 22, 14, 14, 28, 34, 10, 10, 10, 10, 10, 9, 11, 12, 12] },
      { name: 'Documents', rows: this.documentRows(), links: docLinks, widths: [14, 14, 28, 40, 14, 14, 18, 18, 11, 11] },
      { name: 'Linked items (max 30 per pair)', rows: items, links: itemLinks, widths: [34, 34, 14, 14, 10] }
    ]);
  };

  startWidgets('bw-root', Widget, 'Branches');
