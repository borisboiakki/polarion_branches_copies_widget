const { chromium } = require('playwright');
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
  console.log('status:', await p.textContent('.bw-status'));
  // indirect on + all docs + hover an edge
  await p.click('text=Indirect relations');
  await p.selectOption('select.bw-ctl', 'all');
  await p.waitForTimeout(200);
  console.log('status2:', await p.textContent('.bw-status'));
  await p.screenshot({ path: dir + '/shot-all-indirect.png', fullPage: true });
  // relation kind filter: only branches
  await p.click('label:has-text("Copies") input');
  await p.click('label:has-text("Derived") input');
  await p.waitForTimeout(200);
  const stBranch = await p.textContent('.bw-status');
  console.log('status branch only:', stBranch);
  if (stBranch === (await p.evaluate(() => ''))) { throw new Error('unexpected'); }
  const nLabels = (await p.$$('.bw-edge-label')).length;
  console.log('edge labels with branches only:', nLabels);
  if (nLabels < 1) { throw new Error('branch filter removed every relation'); }
  await p.click('label:has-text("Copies") input');
  await p.click('label:has-text("Derived") input');
  await p.waitForTimeout(200);
  // hide the linked item counts on the lines
  await p.click('label:has-text("Item counts") input');
  await p.waitForTimeout(200);
  const noCount = await p.$$eval('.bw-edge-label', els => els.map(e => e.textContent));
  console.log('labels without counts:', JSON.stringify(noCount));
  if (noCount.some(t => /[0-9]/.test(t))) { throw new Error('item counts still shown on the lines'); }
  await p.click('label:has-text("Item counts") input');
  await p.waitForTimeout(200);
  // click an edge label -> details
  const labels = await p.$$('.bw-edge-label');
  await labels[0].click();
  console.log('details:', (await p.textContent('.bw-details')).slice(0, 200));
  await p.click('button:has-text("Table")');
  await p.screenshot({ path: dir + '/shot-table.png', fullPage: true });
  // export downloads
  await p.click('button:has-text("Graph")');
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("SVG")')]);
  await d1.saveAs(dir + '/export.svg');
  const svgText = require('fs').readFileSync(dir + '/export.svg', 'utf8');
  if (!svgText.startsWith('<svg') || svgText.indexOf('SRS_Test') < 0) { throw new Error('SVG export is empty or incomplete'); }
  if (await p.locator('button:has-text("PNG")').count() !== 0) { throw new Error('PNG button should not exist'); }
  console.log('downloads:', d1.suggestedFilename(), '(' + svgText.length + ' chars)');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Excel")')]);
  await d2.saveAs(dir + '/export.xlsx');
  if (!d2.suggestedFilename().endsWith('.xlsx')) { throw new Error('Excel export did not produce an xlsx: ' + d2.suggestedFilename()); }
  console.log('downloads:', d2.suggestedFilename());
  // CSV fallback when the library is missing
  await p.evaluate(() => { window.XLSX_SAVED = window.XLSX; window.XLSX = undefined; });
  const [d3] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Excel")')]);
  await d3.saveAs(dir + '/export.csv');
  const csv = require('fs').readFileSync(dir + '/export.csv', 'utf8');
  if (!d3.suggestedFilename().endsWith('.csv') || csv.indexOf('Original space') < 0) { throw new Error('CSV fallback failed'); }
  console.log('downloads:', d3.suggestedFilename(), '(fallback)');
  await p.goto('file://' + dir + '/pdf.html');
  await p.screenshot({ path: dir + '/shot-pdf.png', fullPage: true });
  // Two projects in scope: scope line, project in the boxes, links into the document's own project.
  await p.goto('file://' + dir + '/multi.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: dir + '/shot-multi.png', fullPage: true });
  if ((await p.textContent('.bw-root')).indexOf('Projects: VforIA, VforIB') < 0) { throw new Error('two projects: scope line missing'); }
  const hrefs = await p.$$eval('a.bw-node', els => els.map(a => a.getAttribute('href')));
  if (hrefs.filter(h => h.indexOf('/project/VforIB/wiki/Requirements/SRS_Test') >= 0).length !== 1 ||
      hrefs.filter(h => h.indexOf('/project/VforIA/wiki/Requirements/SRS_Test') >= 0).length < 1) {
    throw new Error('two projects: documents do not open in their own project: ' + JSON.stringify(hrefs));
  }
  const boxes = await p.$$eval('a.bw-node', els => els.map(a => a.textContent));
  if (!boxes.some(t => t.indexOf('VforIB / Requirements') >= 0)) { throw new Error('two projects: project not shown in the boxes'); }
  await p.click('button:has-text("Table")');
  const tbl = await p.textContent('.bw-table-wrap');
  if (tbl.indexOf('VforIA / Requirements / SRS_Test') < 0 || tbl.indexOf('VforIB / Requirements / SRS_Test') < 0) { throw new Error('two projects: table labels'); }
  console.log('two projects: scope line, boxes, links and table ok');
  console.log('errors:', JSON.stringify(errors));
  await b.close();
})();
