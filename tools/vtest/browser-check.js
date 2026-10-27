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
  await p.goto('file://' + dir + '/pdf.html');
  await p.screenshot({ path: dir + '/shot-pdf.png', fullPage: true });
  console.log('errors:', JSON.stringify(errors));
  await b.close();
})();
