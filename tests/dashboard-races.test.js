import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDashboardScope, dashboardPeriodSequence, dashboardSourceRecords, emptyDashboardSummary } from '../client/src/utils/dashboard.js';

const appSource = fs.readFileSync(new URL('../client/src/App.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function loadRefresh(name, context) {
  const start = appSource.indexOf(`async function ${name}(`);
  const end = appSource.indexOf('\n}\n', start) + 3;
  assert.ok(start >= 0 && end > start, `App.vue应提供${name}`);
  return new Function(...Object.keys(context), `${appSource.slice(start, end)}; return ${name};`)(...Object.values(context));
}

function amountRow(period, amount) {
  const summary = emptyDashboardSummary();
  summary.wechat = { amount, people: 1 };
  summary.total = { amount, people: 1 };
  return { period, summary };
}

function analyticsContext() {
  const requests = [];
  const summary = emptyDashboardSummary();
  return {
    requests,
    values: {
      analyticsRequestSequence: 0,
      isLoggedIn: { value: true },
      currentUserId: { value: 'u1' },
      analytics: { range: 'current', dimension: 'day', period: '2026-09-29', years: ['2026', '2025'], channel: 'all' },
      analyticsLoading: { value: false },
      analyticsInitialLoad: { value: true },
      analyticsFallbackNotice: { value: '' },
      dashboardScope: { value: null },
      summary,
      compareSummary: emptyDashboardSummary(),
      coreSummary: { year: emptyDashboardSummary() },
      analyticsSourceRecords: { value: [] },
      trendRows: { value: [] },
      previousMonthTrendRows: { value: [] },
      yearCompareSummaries: { value: [] },
      visibleSummary: { value: summary },
      buildDashboardScope,
      dashboardPeriodSequence,
      emptyDashboardSummary,
      getCurrentPeriod: () => '2026',
      assignSummary: (target, source) => {
        for (const key of Object.keys(target)) target[key] = { ...source[key] };
      },
      receiptApi: {
        trend: ({ dimension }) => {
          if (dimension !== 'day') return Promise.resolve([]);
          const request = deferred();
          requests.push(request);
          return request.promise;
        },
        list: async () => []
      },
      nextTick: async () => {},
      renderCharts: () => {},
      ElMessage: { error: (message) => assert.fail(message) }
    }
  };
}

test('快速切换看板日期，较早返回/较晚返回的旧请求都不能覆盖最新范围', async () => {
  const { requests, values } = analyticsContext();
  const refresh = loadRefresh('refreshAnalytics', values);
  const first = refresh();
  values.analytics.period = '2026-09-30';
  const latest = refresh();
  requests[1].resolve([amountRow('2026-09-30', 100)]);
  await latest;
  requests[0].resolve([amountRow('2026-09-29', 900)]);
  await first;
  assert.deepEqual(values.dashboardScope.value.periods, ['2026-09-30']);
  assert.equal(values.summary.total.amount, 100);
  assert.equal(values.analyticsLoading.value, false);
  assert.deepEqual(values.analytics.years, ['2025', '2026']);
});

test('用户切换后旧看板请求不提交到新用户界面', async () => {
  const { requests, values } = analyticsContext();
  const refresh = loadRefresh('refreshAnalytics', values);
  const oldUserRequest = refresh();
  values.currentUserId.value = 'u2';
  values.analytics.period = '2026-09-30';
  const newUserRequest = refresh();
  requests[1].resolve([amountRow('2026-09-30', 25)]);
  await newUserRequest;
  requests[0].resolve([amountRow('2026-09-29', 999)]);
  await oldUserRequest;
  assert.equal(values.summary.total.amount, 25);
  assert.deepEqual(values.dashboardScope.value.periods, ['2026-09-30']);
});

function recordsContext(drill = false) {
  const requests = [];
  return {
    requests,
    values: {
      recordsRequestSequence: 0,
      isLoggedIn: { value: true },
      currentUserId: { value: 'u1' },
      recordFilters: { granularity: 'day', period: '2026-09', channel: 'all', exactPeriod: drill ? '2026-09' : '', drillDimension: drill ? 'month' : '', drillPeriods: drill ? ['2026-09'] : [] },
      recordsInitialLoad: { value: false },
      recordsLoading: { value: false },
      records: { value: [] },
      pagination: { currentPage: 3 },
      selectedRows: { value: [{}] },
      recordFallbackNotice: { value: '' },
      recordFilterPeriodLabel: { value: '筛选月份' },
      dashboardSourceRecords,
      channelText: (channel) => channel,
      getParentPeriod: (dimension, period) => period.slice(0, dimension === 'day' ? 7 : 4),
      receiptApi: { list: () => {
        const request = deferred();
        requests.push(request);
        return request.promise;
      } },
      ElMessage: { error: (message) => assert.fail(message) }
    }
  };
}

test('快速切换台账周期，旧请求不覆盖最新筛选结果', async () => {
  const { requests, values } = recordsContext();
  const refresh = loadRefresh('refreshRecords', values);
  const first = refresh();
  values.recordFilters.period = '2026-10';
  const second = refresh();
  requests[1].resolve([{ id: 'latest', period: '2026-10-01' }]);
  await second;
  requests[0].resolve([{ id: 'old', period: '2026-09-01' }]);
  await first;
  assert.equal(values.records.value[0].id, 'latest');
  assert.equal(values.recordsLoading.value, false);
});

test('快速切换看板台账定位，使用定位快照并拒绝旧源数据覆盖', async () => {
  const { requests, values } = recordsContext(true);
  const refresh = loadRefresh('refreshRecords', values);
  const first = refresh();
  values.recordFilters.exactPeriod = '2026-10';
  values.recordFilters.drillPeriods = ['2026-10'];
  const second = refresh();
  const source = [
    { id: 'old', granularity: 'day', channel: 'wechat', period: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'latest', granularity: 'day', channel: 'wechat', period: '2026-10-01', updatedAt: '2026-10-01' }
  ];
  requests[1].resolve(source);
  await second;
  requests[0].resolve(source);
  await first;
  assert.deepEqual(values.records.value.map((item) => item.id), ['latest']);
  assert.ok(values.recordFallbackNotice.value.includes('2026-10'));
  assert.ok(!values.recordFallbackNotice.value.includes('2026-09'));
});
