// Chromium check of the docCoverage browser view rendered by CoverageHarness (see its test set).
// Usage: node browser-check.js <outDir>   (needs browser.html / pdf.html written by tools/test-widget.sh)
const { chromium } = require('playwright');
const fs = require('fs');

function expect(ok, what) {
  if (!ok) { throw new Error('CHECK FAILED: ' + what); }
  console.log('check ok: ' + what);
}

// Sheets of a downloaded workbook, read with the page's XLSX library: [{ name, rows }].
async function readBook(p, path) {
  const b64 = fs.readFileSync(path).toString('base64');
  return p.evaluate(data => {
    const wb = window.XLSX.read(data, { type: 'base64' });
    return wb.SheetNames.map(n => ({ name: n, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }) }));
  }, b64);
}

async function clickDoc(p, name) {
  await p.evaluate(key => {
    const a = Array.from(document.querySelectorAll('.bw-node')).find(n => n.querySelector('title').textContent.indexOf('/ ' + key + ' ') >= 0);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, name);
  await p.waitForTimeout(100);
}

async function matrix(p, dir, file) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('.bw-details button:has-text("Traceability matrix")')]);
  await d.saveAs(dir + '/' + file);
  return { name: d.suggestedFilename(), sheets: await readBook(p, dir + '/' + file) };
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1220, height: 900 } });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const dir = process.argv[2];
  await p.goto('file://' + dir + '/browser.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: dir + '/shot-graph.png', fullPage: true });
  const status = await p.textContent('.bw-status');
  console.log('status:', status);
  expect(status.startsWith('4 of 4 documents, 3 relations'), 'status: 4 documents, 3 relations');

  const labels = await p.$$eval('.bw-edge-label', els => els.map(e => e.textContent).sort());
  console.log('labels:', JSON.stringify(labels));
  expect(labels.indexOf('satisfies 3 + verifies 1') >= 0 && labels.indexOf('satisfies 2') >= 0, 'line labels with role names and link counts');

  // Arrow heads at the upstream (left) end: the polygon tip is the leftmost point of each edge.
  const tips = await p.$$eval('.bw-edge', gs => gs.map(g => {
    const pts = g.querySelector('polygon').getAttribute('points').split(' ').map(s => s.split(',').map(Number));
    const d = g.querySelector('path').getAttribute('d');
    const startX = Number(d.substring(1).split(',')[0]);
    return Math.abs(pts[1][0] - startX) < 0.5 && pts[0][0] > pts[1][0];
  }));
  expect(tips.length === 3 && tips.every(x => x), 'arrows point to the upstream document (link direction)');

  const nodeText = async id => p.evaluate(key => {
    const a = Array.from(document.querySelectorAll('.bw-node')).find(n => n.querySelector('title').textContent.indexOf('/ ' + key + ' ') >= 0);
    return a ? Array.from(a.querySelectorAll('text')).map(t => t.textContent).join(' | ') : '';
  }, id);
  const specText = await nodeText('CustomerSpec');
  console.log('CustomerSpec box:', specText);
  expect(specText.indexOf('Coverage: 67% (4/6)') >= 0, 'CustomerSpec box: coverage 67% (4/6)');
  expect((await nodeText('SysReq_A')).indexOf('Coverage: 50% (2/4)') >= 0, 'SysReq_A box: coverage 50% (2/4)');

  // Click the upstream document: coverage details with the uncovered items.
  await p.evaluate(() => {
    const a = Array.from(document.querySelectorAll('.bw-node')).find(n => n.querySelector('title').textContent.indexOf('CustomerSpec') >= 0);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const det = await p.textContent('.bw-details');
  console.log('details:', det.slice(0, 200));
  expect(det.indexOf('2 uncovered items') >= 0 && det.indexOf('VIA-5') >= 0 && det.indexOf('VIA-6') >= 0, 'document details list the uncovered items');

  // Traceability matrix of an upstream document: one row per link, incoming links with the opposite name.
  const m1 = await matrix(p, dir, 'matrix-spec.xlsx');
  const r1 = m1.sheets[0].rows;
  console.log('matrix CustomerSpec:', JSON.stringify(r1));
  expect(m1.name === 'traceability-CustomerSpec.xlsx' && r1[0].join('|') === 'Work item|Title|Linked item|Linked item title|Link|Linked document',
    'document matrix: file name and columns');
  expect(r1.length === 10 && r1.filter(r => r[0] === 'VIA-1').length === 2 && r1.filter(r => r[0] === 'VIA-3').length === 2,
    'document matrix: one row per link, items repeated');
  expect(r1.some(r => r.join('|') === 'VIA-3|Title VIA-3|VIA-14|Title VIA-14|is verified by|_default / SysReq_A'),
    'document matrix: linked item, title, opposite role name and document');
  expect(r1.some(r => r[0] === 'VIA-5' && r[2] === 'uncovered' && r[3] === '') && r1.some(r => r[0] === 'VIA-6' && r[2] === 'uncovered'),
    'document matrix: uncovered items marked');
  // A document that is only downstream: outgoing links with the role name, "not linked" for items without a link.
  await clickDoc(p, 'SysReq_B');
  const r2 = (await matrix(p, dir, 'matrix-b.xlsx')).sheets[0].rows;
  expect(r2.some(r => r.join('|') === 'VIA-22|Title VIA-22|VIA-4|Title VIA-4|satisfies|Specs / CustomerSpec') && r2.some(r => r[0] === 'VIA-23' && r[2] === 'not linked'),
    'downstream document matrix: role name, not linked');
  // Relation SysReq_A -> CustomerSpec: upstream coverage and downstream links.
  await p.evaluate(() => {
    const l = Array.from(document.querySelectorAll('.bw-edge-label')).find(g => g.textContent === 'satisfies 3 + verifies 1');
    l.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(100);
  const m3 = await matrix(p, dir, 'matrix-edge.xlsx');
  console.log('matrix relation:', JSON.stringify(m3.sheets));
  const up = m3.sheets[0].rows;
  const down = m3.sheets[1].rows;
  expect(m3.name === 'traceability-SysReq_A-CustomerSpec.xlsx' && m3.sheets.map(s => s.name).join('|') === 'Upstream coverage|Downstream links',
    'relation matrix: two sheets');
  expect(up.length === 8 && up.filter(r => r[0] === 'VIA-2').length === 2 && up.some(r => r[0] === 'VIA-4' && r[2] === 'uncovered')
    && !up.some(r => r[2] === 'VIA-21'), 'relation matrix: upstream items, links of this downstream document only, uncovered');
  expect(down.length === 5 && down.some(r => r.join('|') === 'VIA-14|Title VIA-14|VIA-3|Title VIA-3|verifies'), 'relation matrix: downstream items and their links');
  // Hidden role: the matrix follows the role filter.
  await p.click('label:has-text("verifies") input');
  await p.waitForTimeout(150);
  await clickDoc(p, 'CustomerSpec');
  const r4 = (await matrix(p, dir, 'matrix-filter.xlsx')).sheets[0].rows;
  expect(!r4.some(r => r[4] === 'is verified by') && r4.filter(r => r[0] === 'VIA-3').length === 1, 'matrix follows the role filter');
  await p.click('label:has-text("verifies") input');
  await p.waitForTimeout(150);
  await clickDoc(p, 'CustomerSpec');

  // Role filter: only "verifies" -> CustomerSpec covered by VIA-3 only (1/6).
  await p.click('label:has-text("satisfies") input');
  await p.waitForTimeout(150);
  expect((await nodeText('CustomerSpec')).indexOf('Coverage: 17% (1/6)') >= 0, 'role filter recomputes the coverage (verifies only: 1/6)');
  await p.click('label:has-text("satisfies") input');
  await p.waitForTimeout(150);

  // Document picker: hide SysReq_B -> CustomerSpec covered by SysReq_A only {1,2,3} = 3/6.
  await p.click('button:has-text("Documents")');
  await p.click('.cw-pick-panel label:has-text("SysReq_B") input');
  await p.waitForTimeout(150);
  expect((await nodeText('CustomerSpec')).indexOf('Coverage: 50% (3/6)') >= 0, 'hiding a document recomputes the coverage (3/6)');
  expect((await p.textContent('.bw-status')).startsWith('3 of 4 documents, 2 relations'), 'hidden document left out of the graph');
  await p.evaluate(() => {
    const a = Array.from(document.querySelectorAll('.bw-node')).find(n => n.querySelector('title').textContent.indexOf('CustomerSpec') >= 0);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const det2 = await p.textContent('.bw-details');
  expect(det2.indexOf('VIA-4') >= 0 && det2.indexOf('3 uncovered items') >= 0, 'items covered only by the hidden document become uncovered');
  await p.click('.cw-pick-panel label:has-text("SysReq_B") input');
  await p.waitForTimeout(150);
  expect((await p.textContent('.bw-details')).indexOf('Coverage: 67% (4/6)') >= 0, 'open document details follow the filters');
  await p.click('button:has-text("Documents")');
  await p.screenshot({ path: dir + '/shot-details.png', fullPage: true });

  // Counts toggle, table view, exports.
  await p.click('label:has-text("Item counts") input');
  await p.waitForTimeout(150);
  const noCount = await p.$$eval('.bw-edge-label', els => els.map(e => e.textContent));
  expect(noCount.every(t => !/[0-9]/.test(t)), 'link counts can be hidden');
  await p.click('label:has-text("Item counts") input');
  await p.click('button:has-text("Table")');
  const tableText = await p.textContent('.bw-table-wrap');
  expect(tableText.indexOf('Upstream items covered') >= 0 && tableText.indexOf('67% (4/6)') >= 0, 'table view with relations and coverage');
  await p.screenshot({ path: dir + '/shot-table.png', fullPage: true });
  await p.click('button:has-text("Graph")');

  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("SVG")')]);
  await d1.saveAs(dir + '/export.svg');
  expect(fs.readFileSync(dir + '/export.svg', 'utf8').indexOf('CustomerSpec') > 0, 'SVG export');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Excel")')]);
  await d2.saveAs(dir + '/export.xlsx');
  expect(d2.suggestedFilename() === 'document-coverage-VforIA.xlsx', 'Excel export');
  await p.evaluate(() => { window.XLSX = undefined; });
  const [d3] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Excel")')]);
  await d3.saveAs(dir + '/export.csv');
  expect(d3.suggestedFilename().endsWith('.csv') && fs.readFileSync(dir + '/export.csv', 'utf8').indexOf('Downstream space') >= 0, 'CSV fallback');

  await p.goto('file://' + dir + '/pdf.html');
  await p.screenshot({ path: dir + '/shot-pdf.png', fullPage: true });

  // Two projects in scope: scope line, project in the boxes, links into the document's own project.
  await p.goto('file://' + dir + '/multi.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: dir + '/shot-multi.png', fullPage: true });
  expect((await p.textContent('.cw-root')).indexOf('Projects: VforIA, VforIB') >= 0, 'two projects: scope line shown');
  const xText = await p.$$eval('a.bw-node', els => els.filter(a => a.textContent.indexOf('SysReq_X') >= 0).map(a => a.textContent + '|' + a.getAttribute('href')));
  expect(xText.length === 1 && xText[0].indexOf('VforIB / _default') >= 0 && xText[0].indexOf('/project/VforIB/wiki/_default/SysReq_X') >= 0,
    'two projects: box shows the project and opens the document in its project');
  expect((await p.textContent('.cw-root')).indexOf('Coverage: 83% (5/6)') >= 0, 'two projects: cross-project coverage 5/6');
  // Collection context: documents and items open in the collection, the document without revision is marked HEAD.
  await p.goto('file://' + dir + '/collection.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: dir + '/shot-collection.png', fullPage: true });
  const colText = await p.textContent('.cw-root');
  expect(colText.indexOf('Collection: Release 1 (with upstream: Base)') >= 0 && colText.indexOf('Coverage: 80% (4/5)') >= 0,
    'collection: scope line and coverage 4/5');
  const colLinks = await p.$$eval('a.bw-node', els => els.map(a => a.textContent + '|' + a.getAttribute('href')));
  expect(colLinks.some(t => t.indexOf('/project/VforIA/collection/7/wiki/Specs/CustomerSpec') >= 0),
    'collection: document of the collection project opens in the collection');
  expect(colLinks.some(t => t.indexOf('(HEAD)') >= 0 && t.indexOf('/project/VforIB/collection/VforIA//7/wiki/_default/SysReq_Z') >= 0),
    'collection: document of another project marked HEAD, opens in the collection');
  await p.evaluate(() => {
    const a = Array.from(document.querySelectorAll('.bw-node')).find(n => n.querySelector('title').textContent.indexOf('CustomerSpec') >= 0);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(100);
  const unc = await p.$$eval('.bw-details a', els => els.map(a => a.textContent + '|' + a.getAttribute('href')));
  expect(unc.some(t => t.indexOf('VIA-4|') === 0 && t.indexOf('/project/VforIA/collection/7/workitem?id=VIA-4') >= 0),
    'collection: uncovered item opens in the collection');
  console.log('errors:', JSON.stringify(errors));
  expect(errors.length === 0, 'no JavaScript errors');
  await b.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
