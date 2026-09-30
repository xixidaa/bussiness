import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardScope, dashboardChange, dashboardChannelRows, dashboardExportData, dashboardPeriods, dashboardSourceRecords, emptyDashboardSummary, scopedDashboardSummary, zeroExpectedChannels } from '../client/src/utils/dashboard.js';

function row(period, wechat, cash = 0, people = 1) {
  const summary = emptyDashboardSummary();
  summary.wechat = { amount: wechat, people };
  summary.cash = { amount: cash, people: cash ? 1 : 0 };
  summary.total = { amount: wechat + cash, people: people + (cash ? 1 : 0) };
  return { period, summary };
}

test('当前周期的指标和趋势采用同一范围，不包含父级周期其他记录', () => {
  const scope = buildDashboardScope({ range: 'current', dimension: 'month', period: '2026-09' }, [row('2026-08', 100), row('2026-09', 30), row('2026-10', 999)]);
  assert.deepEqual(scope.rows.map((item) => item.period), ['2026-09']);
  assert.equal(scope.summary.total.amount, 30);
  assert.equal(scope.previousSummary.total.amount, 100);
});

test('近7天跨月范围和上期同为7天，未录入周期补零且不伪造上期增长率', () => {
  const scope = buildDashboardScope({ range: 'last7', period: '2026-09-03' }, [row('2026-08-28', 40), row('2026-09-03', 60), row('2026-08-20', 999)]);
  assert.equal(scope.dimension, 'day');
  assert.deepEqual(scope.periods, ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(scope.previousPeriods[0], '2026-08-21');
  assert.equal(scope.previousPeriods.at(-1), '2026-08-27');
  assert.equal(scope.previousPeriods.length, scope.periods.length);
  assert.equal(scope.summary.total.amount, 100);
  assert.equal(dashboardChange(scope.summary.total.amount, scope.previousSummary.total.amount).text, '暂无可比数据');
});

test('近12个月跨年，渠道筛选同样作用于金额人数和对比', () => {
  const scope = buildDashboardScope({ range: 'last12', period: '2026-03' }, [row('2025-04', 30, 70), row('2026-03', 10, 90), row('2024-04', 50, 100)]);
  assert.equal(scope.periods[0], '2025-04');
  assert.equal(scope.previousPeriods[0], '2024-04');
  assert.equal(scope.previousPeriods.at(-1), '2025-03');
  const current = scopedDashboardSummary(scope.summary, 'cash');
  const previous = scopedDashboardSummary(scope.previousSummary, 'cash');
  assert.equal(current.total.amount, 160);
  assert.equal(previous.total.amount, 100);
  assert.equal(current.total.people, 2);
  assert.equal(dashboardChange(current.total.amount, previous.total.amount).text, '较上期增长 60.0%');
});

test('年度对比指标合计所选年份，上期为相同数量且不与当前年份重叠', () => {
  const selection = { range: 'yearCompare', dimension: 'year', years: ['2026', '2025'] };
  assert.deepEqual(dashboardPeriods(selection).previousPeriods, ['2023', '2024']);
  const scope = buildDashboardScope(selection, [row('2025', 50), row('2026', 70), row('2024', 20)]);
  assert.equal(scope.summary.total.amount, 120);
  assert.equal(scope.previousSummary.total.amount, 20);
});

test('渠道分析含金额、占比和上期变化，零基数返回暂无可比数据', () => {
  const scope = buildDashboardScope({ range: 'current', dimension: 'day', period: '2026-09-30' }, [row('2026-09-30', 80, 20), row('2026-09-29', 40)]);
  const rows = dashboardChannelRows(scope.summary, scope.previousSummary, [{ value: 'wechat', label: '微信' }, { value: 'cash', label: '现金' }]);
  assert.deepEqual(rows.map((item) => [item.value, item.percent, item.change]), [[80, 80, '较上期增长 100.0%'], [20, 20, '暂无可比数据']]);
});

test('零收款提醒只针对预期收款且当前筛选可见的渠道', () => {
  const summary = row('2026-09', 10).summary;
  const channels = [{ value: 'wechat' }, { value: 'cash' }, { value: 'alipay' }];
  assert.deepEqual(zeroExpectedChannels(summary, [], channels), []);
  assert.deepEqual(zeroExpectedChannels(summary, ['cash'], channels), [{ value: 'cash' }]);
  assert.deepEqual(zeroExpectedChannels(summary, ['cash'], channels.slice(0, 1)), []);
});

test('月年台账定位日数据优先、同渠道月记录不重复计入，其他渠道月金额保留', () => {
  const records = [
    { id: 'd1', channel: 'wechat', granularity: 'day', period: '2026-09-01', amount: 10 },
    { id: 'd2', channel: 'wechat', granularity: 'day', period: '2026-09-02', amount: 20 },
    { id: 'm1', channel: 'wechat', granularity: 'month', period: '2026-09', amount: 999 },
    { id: 'm2', channel: 'cash', granularity: 'month', period: '2026-09', amount: 40 },
    { id: 'm3', channel: 'wechat', granularity: 'month', period: '2026-08', amount: 100 }
  ];
  const month = dashboardSourceRecords(records, 'month', '2026-09');
  assert.deepEqual(month.map((item) => item.id), ['d1', 'd2', 'm2']);
  assert.equal(month.reduce((sum, item) => sum + item.amount, 0), 70);
  assert.deepEqual(dashboardSourceRecords(records, 'day', '2026-09-02', 'wechat').map((item) => item.id), ['d2']);
  assert.deepEqual(dashboardSourceRecords(records, 'year', '2026').map((item) => item.id), ['d1', 'd2', 'm2', 'm3']);
});

test('导出与当前筛选指标趋势渠道一致，人数0的平均值不伪造为0', () => {
  const scope = buildDashboardScope({ range: 'current', dimension: 'month', period: '2026-09' }, [row('2026-09', 25, 0, 0)]);
  const channels = dashboardChannelRows(scope.summary, scope.previousSummary, [{ value: 'wechat', label: '微信' }]);
  const report = dashboardExportData({ rangeLabel: '2026-09', dimensionLabel: '月度', channelLabel: '微信', comparisonLabel: '2026-08', summary: scope.summary, previousSummary: scope.previousSummary, trendRows: scope.rows, previousTrendRows: scope.previousRows, channelRows: channels });
  assert.equal(report.metrics.find((item) => item.指标 === '当前范围收款金额').值, 25);
  assert.equal(report.metrics.find((item) => item.指标 === '平均每人收款').值, null);
  assert.equal(report.trend[0].收款金额, 25);
  assert.equal(report.channels[0].收款金额, 25);
  assert.equal(report.metrics.find((item) => item.指标 === '较上期变化').值, '暂无可比数据');
});
