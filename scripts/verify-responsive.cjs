/* 在隔离数据库的真实 API 上验证手机和电脑操作；不拦截业务接口。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const XLSX = require('../client/node_modules/xlsx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const outputPath = path.resolve(process.env.QA_ARTIFACTS || '.artifacts/responsive-qa');
const widths = (process.env.QA_WIDTHS || '375,390,1280,1440').split(',').map(Number);
if (process.env.QA_ISOLATED_ENV !== '1') {
  console.error('请先启动隔离 MongoDB/API，并设置 QA_ISOLATED_ENV=1 后运行，避免写入正式台账。');
  process.exit(1);
}

function field(page, label) {
  return page.locator('.entry-form .el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: label }) });
}
async function chooseChannel(page, scope, label) {
  await scope.locator('.el-select').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function assertNoOverflow(page, stage) {
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(overflow.width <= overflow.viewport + 1, `${stage} 横向溢出：${JSON.stringify(overflow)}`);
}
async function screenshot(page, width, stage) {
  await assertNoOverflow(page, `${width}px ${stage}`);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(outputPath, `${width}-${stage}.png`), fullPage: true });
  await page.screenshot({ path: path.join(outputPath, `${width}-${stage}-viewport.png`), fullPage: false });
}
async function save(page, buttonClass, expected, confirmAppend = false) {
  const requestPromise = page.waitForResponse((response) => response.url().includes('/api/receipts') && response.request().method() === 'POST');
  await page.locator(buttonClass).click();
  if (confirmAppend) await page.locator('.el-message-box').getByRole('button', { name: /确认|累计/ }).click();
  let response;
  try { response = await requestPromise; } catch (error) {
    const width = page.viewportSize().width;
    await page.screenshot({ path: path.join(outputPath, `${width}-failed-save.png`), fullPage: true });
    const text = await page.locator('body').innerText();
    await fs.writeFile(path.join(outputPath, `${width}-failed-save.txt`), text);
    console.error(text);
    throw error;
  }
  const requestData = response.request().postDataJSON();
  assert.equal(requestData.period, expected.period, '提交周期应与显示的日期一致');
  assert.equal(requestData.channel, expected.channel, '提交渠道应与用户选择一致');
  assert.equal(requestData.granularity, expected.granularity, '提交粒度应与用户选择一致');
  assert.equal(response.status(), 200, await response.text());
  await page.waitForFunction(() => !document.querySelector('.el-loading-mask') || [...document.querySelectorAll('.el-loading-mask')].every((item) => getComputedStyle(item).display === 'none'));
  await page.waitForTimeout(250);
}
async function navigate(page, view) {
  const route = page.locator(`.nav-item`).filter({ has: page.locator(`span`, { hasText: view }) });
  await route.first().click();
  await page.waitForTimeout(300);
}

(async () => {
  await fs.mkdir(outputPath, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const results = [];
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 760 ? 844 : 900 }, deviceScaleFactor: 1, acceptDownloads: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      assert.ok(!(await page.locator('body').innerText()).includes('admin123'), '登录页不得公开管理员默认密码');
      await screenshot(page, width, 'login');

      const userId = `qa-${width}-${Date.now().toString(36)}`;
      const password = 'Isolated-Receipt-QA-2026';
      const userResponse = await context.request.post(`${baseURL}/api/users`, { data: { id: userId, name: userId, password } });
      assert.equal(userResponse.status(), 200, await userResponse.text());
      await page.locator('.login-card .el-input input').nth(0).fill(userId);
      await page.locator('.login-card .el-input input').nth(1).fill(password);
      await page.locator('.login-button').click();
      await page.locator('.app-shell').waitFor();
      await page.locator('.topbar-actions').getByRole('button', { name: '新建收款', exact: true }).click();
      await page.locator('.entry-form').waitFor();
      await field(page, '统计粒度').getByText('日度', { exact: true }).click();
      await chooseChannel(page, field(page, '收款渠道'), '现金');
      const dateInput = field(page, '收款日期').locator('input');
      await dateInput.click();
      await page.locator('.el-date-picker .el-date-table td.available:not(.prev-month):not(.next-month)').filter({ has: page.locator('.el-date-table-cell__text', { hasText: /^10$/ }) }).click();
      const periodDisplay = await dateInput.inputValue();
      const period = periodDisplay.match(/\d+/g).join('-');
      assert.match(period, /^\d{4}-\d{2}-10$/);
      await field(page, '收款金额').locator('input').fill('125.50');
      await field(page, '收款人数').locator('input').fill('5');
      await field(page, '备注 / 异常说明').locator('textarea').fill(`${width}px 连续录入验证`);
      await screenshot(page, width, 'entry');
      await save(page, '.continue-entry-button', { period, channel: 'cash', granularity: 'day' });
      assert.equal(await dateInput.inputValue(), periodDisplay, '保存并继续应保留日期');
      assert.ok((await field(page, '收款渠道').innerText()).includes('现金'), '保存并继续应保留渠道');
      assert.equal(await field(page, '收款金额').locator('input').inputValue(), '', '保存并继续应清空已提交的金额');

      await field(page, '收款金额').locator('input').fill('24.50');
      await field(page, '收款人数').locator('input').fill('1');
      await page.locator('.continue-entry-button').click();
      await page.locator('.el-message-box').waitFor();
      await screenshot(page, width, 'append-confirm');
      await page.locator('.el-message-box').getByRole('button', { name: '返回修改', exact: true }).click();
      const singleURL = `${baseURL}/api/receipts/single?granularity=day&channel=cash&period=${period}`;
      const before = await context.request.get(singleURL, { headers: { 'X-User-Id': userId } });
      assert.equal((await before.json()).data[0].amount, 125.50, '取消累计不得写入数据');
      await save(page, '.continue-entry-button', { period, channel: 'cash', granularity: 'day' }, true);
      const after = await context.request.get(singleURL, { headers: { 'X-User-Id': userId } });
      const accumulated = (await after.json()).data[0];
      assert.equal(accumulated.amount, 150, '确认后应累计本次金额');
      assert.equal(accumulated.people, 6, '确认后应累计本次人数');
      assert.equal(await dateInput.inputValue(), periodDisplay, '累计并继续应保留日期');
      assert.ok((await field(page, '收款渠道').innerText()).includes('现金'), '累计并继续应保留渠道');

      await chooseChannel(page, field(page, '收款渠道'), '其他');
      await field(page, '收款金额').locator('input').fill('36.25');
      await field(page, '收款人数').locator('input').fill('1');
      await save(page, '.save-entry-button', { period, channel: 'other', granularity: 'day' });
      await page.locator('.topbar-actions').getByRole('button', { name: '新建收款', exact: true }).click();
      assert.equal(await dateInput.inputValue(), periodDisplay, '普通保存后新建应沿用日期');
      assert.ok((await field(page, '收款渠道').innerText()).includes('其他'), '普通保存后新建应沿用渠道');
      await field(page, '收款金额').locator('input').fill('18.50');
      await field(page, '备注 / 异常说明').locator('textarea').fill('草稿恢复验证');
      await page.waitForTimeout(300);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await field(page, '收款日期').locator('input').inputValue(), periodDisplay, '草稿恢复应保留日期');
      assert.ok((await field(page, '收款渠道').innerText()).includes('其他'), '草稿恢复应保留渠道');
      assert.equal(await field(page, '收款金额').locator('input').inputValue(), '18.50', '草稿恢复应保留金额');

      await navigate(page, '收款台账');
      const ledgerChannel = page.locator('.ledger-filter-row .field').filter({ has: page.locator('label', { hasText: /^渠道$/ }) });
      await chooseChannel(page, ledgerChannel, '现金');
      await page.waitForTimeout(400);
      const ledgerList = page.locator(width < 760 ? '.mobile-record-list' : '.desktop-table');
      assert.ok((await ledgerList.innerText()).includes('150.00'), '台账现金筛选应包含已保存金额');
      assert.ok(!(await ledgerList.innerText()).includes('36.25'), '台账现金筛选不得包含其他渠道金额');
      await screenshot(page, width, 'ledger');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出当前筛选', exact: true }).click();
      const download = await downloadPromise;
      await download.saveAs(path.join(outputPath, `${width}-ledger-export.xlsx`));
      await ledgerList.getByRole('button', { name: width < 760 ? '编辑收款' : '编辑', exact: true }).first().click();
      assert.equal(await field(page, '收款日期').locator('input').inputValue(), periodDisplay, '编辑应显示已保存日期');
      assert.ok((await field(page, '收款渠道').innerText()).includes('现金'), '编辑应显示已保存渠道');
      assert.equal(await field(page, '收款金额').locator('input').inputValue(), '150.00', '编辑应显示已保存金额');

      await navigate(page, '经营看板');
      const dashboardChannel = page.locator('.dashboard-filter-row .field').filter({ has: page.locator('label', { hasText: /^渠道$/ }) });
      await chooseChannel(page, dashboardChannel, '现金');
      await page.waitForTimeout(400);
      assert.ok((await page.locator('.metric-card').first().innerText()).includes('150.00'), '看板渠道筛选应与台账金额一致');
      assert.ok((await page.locator('.metric-card').first().innerText()).includes('暂无可比数据'), '没有上期收款不得生成增长率');
      await screenshot(page, width, 'dashboard');
      const reportDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出报表', exact: true }).click();
      const report = await reportDownload;
      const reportPath = path.join(outputPath, `${width}-dashboard-export.xlsx`);
      await report.saveAs(reportPath);
      const workbook = XLSX.readFile(reportPath);
      const metrics = XLSX.utils.sheet_to_json(workbook.Sheets['范围指标']);
      assert.equal(metrics.find((item) => item['指标'] === '当前范围收款金额')['值'], 150, '导出指标应使用看板渠道筛选');
      assert.ok(metrics.every((item) => item['渠道筛选'] === '现金'), '导出应标注与看板一致的渠道');
      assert.ok(await page.locator('.chart-box canvas').count() > 0, '看板趋势应正常渲染');
      assert.ok(await page.locator('.dashboard-trend-controls .el-checkbox').count() >= 2, '手机和电脑都应支持上期与渠道曲线开关');
      await page.locator('.dashboard-trend-controls').getByText('查看渠道曲线', { exact: true }).click();
      await page.waitForTimeout(100);
      await page.locator('.dashboard-trend-controls').getByText('查看渠道曲线', { exact: true }).click();
      await page.locator('.chart-box').scrollIntoViewIfNeeded();
      const trendPoint = await page.evaluate(async () => {
        const moduleURL = performance.getEntriesByType('resource').find((item) => item.name.includes('/echarts.js')).name;
        const echarts = await import(moduleURL);
        const element = document.querySelector('.chart-box');
        const chart = echarts.getInstanceByDom(element);
        const option = chart.getOption();
        const series = option.series[0];
        const index = series.data.findIndex((value) => value === 150);
        const coordinate = chart.convertToPixel({ seriesIndex: 0 }, [index, series.type === 'bar' ? 75 : 150]);
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x + coordinate[0], y: bounds.y + coordinate[1] };
      });
      await page.mouse.click(trendPoint.x, trendPoint.y);
      await page.waitForURL('**/#ledger');
      await page.waitForTimeout(400);
      const drillList = page.locator(width < 760 ? '.mobile-record-list' : '.desktop-table');
      assert.ok((await drillList.innerText()).includes('150.00'), '点击趋势数据点应定位真实现金台账');
      assert.ok((await page.locator('.context-alert').innerText()).includes('现金'), '趋势定位应带渠道筛选');
      await screenshot(page, width, 'trend-ledger');

      await page.locator('.topbar-actions').getByRole('button', { name: '新建收款', exact: true }).click();
      await field(page, '统计粒度').getByText('月度', { exact: true }).click();
      await chooseChannel(page, field(page, '收款渠道'), '微信');
      await field(page, '收款日期').locator('input').click();
      await page.locator('.el-month-table td').filter({ hasText: '八月' }).click();
      const monthlyDisplay = await field(page, '收款日期').locator('input').inputValue();
      const monthlyPeriod = monthlyDisplay.match(/\d+/g).join('-');
      assert.match(monthlyPeriod, /^\d{4}-08$/);
      await field(page, '收款金额').locator('input').fill('88');
      await field(page, '收款人数').locator('input').fill('4');
      await save(page, '.continue-entry-button', { period: monthlyPeriod, channel: 'wechat', granularity: 'month' });
      assert.equal(await field(page, '收款日期').locator('input').inputValue(), monthlyDisplay, '月度保存并继续应保留周期');
      assert.ok((await field(page, '收款渠道').innerText()).includes('微信'), '月度保存并继续应保留渠道');
      await screenshot(page, width, 'monthly-entry');

      await navigate(page, '导入导出');
      const duplicateCSV = `\uFEFF收款日期,统计粒度,收款渠道,收款金额,收款人数,备注\n${period},日度,现金,150,6,${accumulated.remark}\n`;
      await page.locator('.hidden-file-input').setInputFiles({ name: '重复导入核对.csv', mimeType: 'text/csv', buffer: Buffer.from(duplicateCSV) });
      await page.locator('.import-reconciliation').waitFor();
      assert.ok((await page.locator('.import-reconciliation').innerText()).includes('重复导入，跳过'), '重复导入须提示并跳过');
      await screenshot(page, width, 'duplicate-import');
      const conflictCSV = `\uFEFF收款日期,统计粒度,收款渠道,收款金额,收款人数,备注\n${period},日度,现金,175,6,冲突核对验证\n`;
      await page.locator('.hidden-file-input').setInputFiles({ name: '冲突差额核对.csv', mimeType: 'text/csv', buffer: Buffer.from(conflictCSV) });
      await page.locator('.import-confirmation').waitFor();
      assert.ok((await page.locator('.import-reconciliation').innerText()).includes('25.00'), '应显示同日同渠道的25元差额');
      assert.ok(await page.getByRole('button', { name: '确认导入通过校验的数据', exact: true }).isDisabled(), '未经确认的冲突记录不得写入');
      const afterPreview = await context.request.get(singleURL, { headers: { 'X-User-Id': userId } });
      assert.equal((await afterPreview.json()).data[0].amount, 150, '预校验不得改变已保存金额');
      await screenshot(page, width, 'import');
      assert.equal(errors.length, 0, `页面异常：${errors.join('; ')}`);
      results.push({ width, checks: ['登录凭据隐藏', '真实API提交日期渠道', '保存并继续', '取消累计无写入', '确认累计金额人数', '普通保存沿用', '草稿恢复', '月度连续录入', '台账渠道筛选', '台账编辑', '台账导出', '图表与统计开关', '实际趋势数据点定位台账', '看板筛选及导出一致', '重复导入提示', '冲突差额核对未确认不写入', '无横向溢出'], errors });
      await context.close();
      console.log(`${width}px 验证通过`);
    }
    await fs.writeFile(path.join(outputPath, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ status: 'passed', widths, artifacts: outputPath }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});