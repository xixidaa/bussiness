// 提示绘制在图表画布内，由 ECharts 按图表坐标约束，避免滚动后漂移到其他卡片。
export function createChartTooltip({ trigger, unit, mobile }) {
  return {
    trigger,
    renderMode: 'richText',
    confine: true,
    enterable: false,
    alwaysShowContent: false,
    showDelay: 0,
    hideDelay: 0,
    transitionDuration: 0,
    padding: mobile ? 8 : 10,
    textStyle: { fontSize: mobile ? 12 : 14 },
    valueFormatter: (value) => `${value}${unit}`
  };
}
