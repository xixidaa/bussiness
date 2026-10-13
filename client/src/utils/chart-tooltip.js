// 提示框同时限制在图表和当前屏幕内，长内容可在框内滚动。
export function createChartTooltip(element, { trigger, unit, mobile }) {
  return {
    trigger,
    renderMode: 'html',
    appendTo: element,
    confine: true,
    enterable: true,
    transitionDuration: 0,
    padding: mobile ? 8 : 10,
    textStyle: { fontSize: mobile ? 12 : 14 },
    extraCssText: 'box-sizing:border-box;white-space:normal;overflow:auto;overflow-wrap:anywhere;',
    valueFormatter: (value) => `${value}${unit}`,
    position: (point, params, dom, rect, size) => {
      const bounds = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport ? viewport.offsetLeft : 0;
      const viewportTop = viewport ? viewport.offsetTop : 0;
      const viewportRight = viewportLeft + (viewport ? viewport.width : window.innerWidth);
      const viewportBottom = viewportTop + (viewport ? viewport.height : window.innerHeight);
      const left = Math.max(8, viewportLeft - bounds.left + 8);
      const top = Math.max(8, viewportTop - bounds.top + 8);
      const right = Math.min(size.viewSize[0] - 8, viewportRight - bounds.left - 8);
      const bottom = Math.min(size.viewSize[1] - 8, viewportBottom - bounds.top - 8);
      if (right <= left || bottom <= top) {
        dom.style.visibility = 'hidden';
        return [0, 0];
      }
      dom.style.visibility = 'visible';
      dom.style.maxWidth = `${right - left}px`;
      dom.style.maxHeight = `${bottom - top}px`;
      const width = dom.offsetWidth;
      const height = dom.offsetHeight;
      const x = point[0] + width + 12 <= right ? point[0] + 12 : point[0] - width - 12;
      const y = point[1] + height + 12 <= bottom ? point[1] + 12 : point[1] - height - 12;
      return [Math.max(left, Math.min(x, right - width)), Math.max(top, Math.min(y, bottom - height))];
    }
  };
}
