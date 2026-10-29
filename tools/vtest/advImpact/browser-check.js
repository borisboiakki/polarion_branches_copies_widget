// Chromium check of the advImpact browser view rendered by ImpactHarness (see its test set): downstream from
// CustomerSpec, 3 levels, roles satisfies + verifies.
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

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const dir = process.argv[2];
  await p.goto('file://' + dir + '/browser.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: dir + '/shot-graph.png', fullPage: true });
  const status = async () => p.textContent('.bw-status');
  console.log('status:', await status());
  expect((await status()).startsWith('4 start items, 8 impacted work items in 4 documents, downstream, 3 levels'), 'status: start items, impacted items, documents');

  // Columns: start document left, then downstream levels 1, 2, 3 to the right.
  const xs = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('.bw-node').forEach(a => {
      const name = a.querySelector('text').textContent;
      out[name] = Number(a.querySelector('rect').getAttribute('x'));
    });
    return out;
  });
  console.log('columns:', JSON.stringify(xs));
  expect(xs.CustomerSpec < xs.SysReq_A && xs.SysReq_A === xs.SysReq_B && xs.SysReq_B < xs.SwReq_C && xs.SwReq_C < xs.Test_T,
    'columns by level: start, level 1 (SysReq_A, SysReq_B), level 2, level 3');
  const labels = await p.$$eval('.bw-edge-label', els => els.map(e => e.textContent).sort());
  console.log('labels:', JSON.stringify(labels));
  expect(JSON.stringify(labels) === JSON.stringify(['satisfies 1', 'satisfies 1', 'satisfies 2', 'satisfies 3', 'verifies 1']),
    'relations along the paths with role names and link counts (same-document and cycle links not drawn)');
  const tips = await p.$$eval('.bw-edge', gs => gs.map(g => {
    const pts = g.querySelector('polygon').getAttribute('points').split(' ').map(s => s.split(',').map(Number));
    const d = g.querySelector('path').getAttribute('d');
    const startX = Number(d.substring(1).split(',')[0]);
    return Math.abs(pts[1][0] - startX) < 0.5 && pts[0][0] > pts[1][0];
  }));
  expect(tips.length === 5 && tips.every(x => x), 'arrows point to the link targets (left)');
  const nodeText = async id => p.evaluate(key => {
    const a = Array.from(document.querySelectorAll('.bw-node')).find(n => n.querySelector('title').textContent.indexOf('/ ' + key + ' ') >= 0);
    return a ? Array.from(a.querySelectorAll('text')).map(t => t.textContent).join(' | ') : '';
  }, id);
  expect((await nodeText('SysReq_A')).indexOf('Downstream level 1 | Impacted: 3 / 3') >= 0, 'box: position and impacted items');
  expect((await nodeText('CustomerSpec')).indexOf('Start document | Start items: 4 / 4') >= 0, 'start document box');

  // Document details: impacted items with level and the item they were reached from.
  await clickDoc(p, 'SwReq_C');
  const det = await p.textContent('.bw-details');
  console.log('details:', det.slice(0, 260));
  expect(det.indexOf('2 impacted work items') >= 0 && det.indexOf('VIA-31') >= 0 && det.indexOf('from VIA-11 (is satisfied by)') >= 0,
    'document details: impacted items, level and parent with the role');
  const [dm] = await Promise.all([p.waitForEvent('download'), p.click('.bw-details button:has-text("Traceability matrix")')]);
  await dm.saveAs(dir + '/matrix-c.xlsx');
  const mrows = (await readBook(p, dir + '/matrix-c.xlsx'))[0].rows;
  console.log('matrix SwReq_C:', JSON.stringify(mrows));
  expect(dm.suggestedFilename() === 'traceability-SwReq_C.xlsx' &&
    mrows.some(r => r.join('|') === 'VIA-31|Title VIA-31|VIA-11|Title VIA-11|satisfies|_default / SysReq_A|downstream 1') &&
    mrows.some(r => r.join('|') === 'VIA-31|Title VIA-31|VIA-41|Title VIA-41|is verified by|_default / Test_T|downstream 3') &&
    mrows.some(r => r.join('|') === 'VIA-31|Title VIA-31|VIA-41|Title VIA-41|verifies|_default / Test_T|downstream 3'),
    'traceability matrix: outgoing (role name) and incoming (opposite name) links, linked document and level');

  // Levels toggle: 2 levels -> Test_T gone.
  await p.selectOption('.bw-toolbar select', '2');
  await p.waitForTimeout(150);
  expect((await status()).startsWith('4 start items, 7 impacted work items in 3 documents, downstream, 2 levels'), 'levels toggle: level 3 left out');
  await p.selectOption('.bw-toolbar select', '3');
  await p.waitForTimeout(150);
  // Role toggle: without verifies, Test_T is not reached.
  await p.click('label:has-text("verifies") input');
  await p.waitForTimeout(150);
  expect((await status()).indexOf('7 impacted work items in 3 documents') >= 0 && (await nodeText('Test_T')) === '', 'role toggle recomputes the analysis');
  await p.click('label:has-text("verifies") input');
  await p.waitForTimeout(150);
  // Document picker: hiding SysReq_A hides it only; the analysis still goes through it (SwReq_C stays).
  await p.click('button:has-text("Documents")');
  await p.click('.ai-pick-panel label:has-text("SysReq_A") input');
  await p.waitForTimeout(150);
  expect((await nodeText('SysReq_A')) === '' && (await nodeText('SwReq_C')) !== '', 'hidden document: not drawn, analysis unchanged');
  await p.click('.ai-pick-panel label:has-text("SysReq_A") input');
  await p.click('button:has-text("Documents")');
  await p.waitForTimeout(150);

  // Counts toggle, table, exports.
  await p.click('label:has-text("Item counts") input');
  await p.waitForTimeout(150);
  expect((await p.$$eval('.bw-edge-label', els => els.map(e => e.textContent))).every(t => !/[0-9]/.test(t)), 'link counts can be hidden');
  await p.click('label:has-text("Item counts") input');
  await p.click('button:has-text("Table")');
  const tableText = await p.textContent('.bw-table-wrap');
  expect(tableText.indexOf('Downstream level 2') >= 0 && tableText.indexOf('Document (link sources)') >= 0, 'table view');
  await p.screenshot({ path: dir + '/shot-table.png', fullPage: true });
  await p.click('button:has-text("Graph")');
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("SVG")')]);
  await d1.saveAs(dir + '/export.svg');
  expect(fs.readFileSync(dir + '/export.svg', 'utf8').indexOf('SwReq_C') > 0, 'SVG export');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Excel")')]);
  await d2.saveAs(dir + '/export.xlsx');
  const book = await readBook(p, dir + '/export.xlsx');
  expect(d2.suggestedFilename() === 'impact-analysis-VforIA.xlsx' &&
    book.map(s => s.name).join('|') === 'Relations|Documents|Impacted items|Impact paths', 'Excel export: four sheets');
  const items = book[2].rows;
  const paths = book[3].rows;
  console.log('paths:', JSON.stringify(paths.slice(0, 4)));
  expect(items.length === 9 && items.some(r => r[0] === 'VIA-41' && r[4] === 'downstream' && r[5] === 3), 'Excel: 8 impacted items with direction and level');
  expect(paths.some(r => r[0] === 'VIA-41' && r[5] === 'VIA-1 > VIA-11 > VIA-31 > VIA-41' &&
    r[6] === 'is satisfied by > is satisfied by > is verified by'), 'Excel: impact path from a start item');
  await p.evaluate(() => { window.XLSX = undefined; });
  const [d3] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Excel")')]);
  await d3.saveAs(dir + '/export.csv');
  expect(d3.suggestedFilename().endsWith('.csv') && fs.readFileSync(dir + '/export.csv', 'utf8').indexOf('Source space') >= 0, 'CSV fallback');

  await p.goto('file://' + dir + '/pdf.html');
  await p.screenshot({ path: dir + '/shot-pdf.png', fullPage: true });
  expect((await p.$$('script')).length === 0 && (await p.textContent('body')).indexOf('Downstream level 3') >= 0, 'PDF view: static, no script');
  expect(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
