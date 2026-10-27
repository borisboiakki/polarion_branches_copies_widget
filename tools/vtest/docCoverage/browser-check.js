// Chromium check of the docCoverage browser view rendered by CoverageHarness (see its test set).
// Usage: node browser-check.js <outDir>   (needs browser.html / pdf.html written by tools/test-widget.sh)
const { chromium } = require('playwright');
const fs = require('fs');

function expect(ok, what) {
  if (!ok) { throw new Error('CHECK FAILED: ' + what); }
  console.log('check ok: ' + what);
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
  console.log('errors:', JSON.stringify(errors));
  expect(errors.length === 0, 'no JavaScript errors');
  await b.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
