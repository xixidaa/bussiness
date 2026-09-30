export const DASHBOARD_CHANNELS = ['wechat', 'alipay', 'cash', 'other'];

export function emptyDashboardSummary() {
  return Object.fromEntries([...DASHBOARD_CHANNELS, 'total'].map((key) => [key, { amount: 0, people: 0 }]));
}

export function shiftDashboardPeriod(period, offset, dimension) {
  if (dimension === 'year') return String(Number(period) + offset);
  const date = new Date(`${period}${dimension === 'month' ? '-01' : ''}T00:00:00Z`);
  if (dimension === 'month') date.setUTCMonth(date.getUTCMonth() + offset);
  else date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, dimension === 'month' ? 7 : 10);
}

export function dashboardPeriodSequence(end, count, dimension) {
  return Array.from({ length: count }, (_, index) => shiftDashboardPeriod(end, index - count + 1, dimension));
}

export function dashboardPeriods(selection) {
  const dimension = selection.range === 'last7' ? 'day' : selection.range === 'last12' ? 'month' : selection.dimension;
  const periods = dimension === 'year'
    ? [...new Set(selection.years)].sort()
    : dashboardPeriodSequence(selection.period, selection.range === 'last7' ? 7 : selection.range === 'last12' ? 12 : 1, dimension);
  const previousEnd = shiftDashboardPeriod(periods[0], -1, dimension);
  return { dimension, periods, previousPeriods: dashboardPeriodSequence(previousEnd, periods.length, dimension) };
}

export function sumDashboardRows(rows) {
  const summary = emptyDashboardSummary();
  for (const row of rows) {
    for (const channel of DASHBOARD_CHANNELS) {
      summary[channel].amount += Number(row.summary[channel].amount);
      summary[channel].people += Number(row.summary[channel].people);
    }
  }
  for (const channel of DASHBOARD_CHANNELS) {
    summary[channel].amount = Math.round(summary[channel].amount * 100) / 100;
    summary.total.amount += summary[channel].amount;
    summary.total.people += summary[channel].people;
  }
  summary.total.amount = Math.round(summary.total.amount * 100) / 100;
  return summary;
}

export function scopedDashboardSummary(summary, channel) {
  if (channel === 'all') return summary;
  const scoped = emptyDashboardSummary();
  scoped[channel] = { ...summary[channel] };
  scoped.total = { ...summary[channel] };
  return scoped;
}

export function buildDashboardScope(selection, sourceRows) {
  const scope = dashboardPeriods(selection);
  const byPeriod = new Map(sourceRows.map((row) => [row.period, row]));
  const complete = (periods) => periods.map((period) => ({
    period,
    hasData: byPeriod.has(period),
    summary: byPeriod.has(period) ? byPeriod.get(period).summary : emptyDashboardSummary()
  }));
  const rows = complete(scope.periods);
  const previousRows = complete(scope.previousPeriods);
  return { ...scope, rows, previousRows, summary: sumDashboardRows(rows), previousSummary: sumDashboardRows(previousRows) };
}

export function dashboardChange(current, previous) {
  if (Number(previous) <= 0) return { percent: null, text: '暂无可比数据' };
  const percent = ((Number(current) - Number(previous)) / Number(previous)) * 100;
  return { percent, text: `较上期${percent >= 0 ? '增长' : '下降'} ${Math.abs(percent).toFixed(1)}%` };
}

export function dashboardChannelRows(summary, previousSummary, channels) {
  return channels.map((channel) => ({
    key: channel.value,
    label: channel.label,
    value: summary[channel.value].amount,
    previousValue: previousSummary[channel.value].amount,
    percent: summary.total.amount ? Number((summary[channel.value].amount / summary.total.amount * 100).toFixed(1)) : 0,
    change: dashboardChange(summary[channel.value].amount, previousSummary[channel.value].amount).text
  }));
}

// 台账定位保留原始日记录；同渠道同月份已有日记录时，月记录不再重复计入。
export function dashboardSourceRecords(records, dimension, period, channel = 'all') {
  const scoped = records.filter((row) => (channel === 'all' || row.channel === channel)
    && (dimension === 'day' ? row.granularity === 'day' && row.period === period : row.period.startsWith(period)));
  const dayMonths = new Set(scoped.filter((row) => row.granularity === 'day').map((row) => `${row.channel}:${row.period.slice(0, 7)}`));
  return scoped.filter((row) => row.granularity === 'day' || !dayMonths.has(`${row.channel}:${row.period}`));
}

export function zeroExpectedChannels(summary, expectedChannels, channels) {
  return channels.filter((channel) => expectedChannels.includes(channel.value) && summary[channel.value].amount === 0);
}

export function dashboardExportData({ rangeLabel, dimensionLabel, channelLabel, comparisonLabel, summary, previousSummary, trendRows, previousTrendRows, channelRows }) {
  const context = { 时间范围: rangeLabel, 统计粒度: dimensionLabel, 渠道筛选: channelLabel };
  return {
    metrics: [
      { ...context, 指标: '当前范围收款金额', 值: summary.total.amount, 计算说明: '当前范围有效收款金额合计；同渠道同月份日数据优先，月数据不重复计入' },
      { ...context, 指标: '当前范围录入人数', 值: summary.total.people, 计算说明: '录入人数求和；未去重，不等于真实交易笔数' },
      { ...context, 指标: '平均每人收款', 值: summary.total.people ? summary.total.amount / summary.total.people : null, 计算说明: '收款金额 ÷ 录入人数；人数为0时不可计算' },
      { ...context, 指标: '上期金额', 值: previousSummary.total.amount, 计算说明: comparisonLabel },
      { ...context, 指标: '较上期变化', 值: dashboardChange(summary.total.amount, previousSummary.total.amount).text, 计算说明: '（当前金额 - 上期金额）÷ 上期金额；上期金额为0或无记录时暂无可比数据' }
    ],
    trend: trendRows.map((row, index) => ({
      ...context,
      周期: row.period,
      收款金额: row.summary.total.amount,
      录入人数: row.summary.total.people,
      上期周期: previousTrendRows[index].period,
      上期金额: previousTrendRows[index].summary.total.amount,
      上期录入人数: previousTrendRows[index].summary.total.people
    })),
    channels: channelRows.map((row) => ({ ...context, 收款渠道: row.label, 收款金额: row.value, 占比百分数: row.percent, 上期金额: row.previousValue, 较上期变化: row.change }))
  };
}
