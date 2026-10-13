import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue';

// 只处理录入时的可见区域，不改变表单值或草稿。
export function useEntryInputViewport(panelRef) {
  const isMobile = shallowRef(false);
  const isInputFocused = shallowRef(false);
  const keyboardInset = shallowRef(0);
  let viewport;
  let mobile;
  let frame = 0;
  let blurTimer;

  function focusedInput() {
    const input = document.activeElement;
    if (!panelRef.value || !panelRef.value.contains(input)) return null;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return null;
    return input.disabled || input.readOnly ? null : input;
  }

  function keepInputVisible() {
    frame = 0;
    const input = focusedInput();
    if (!isInputFocused.value || !input) return;
    const top = (viewport ? viewport.offsetTop : 0) + 16;
    const viewportBottom = top + (viewport ? viewport.height : window.innerHeight) - 16;
    let bottom = viewportBottom - 16;
    const actions = panelRef.value.querySelector('.entry-actions');
    if (actions && window.getComputedStyle(actions).position === 'sticky') {
      const actionBounds = actions.getBoundingClientRect();
      if (actionBounds.bottom > top && actionBounds.top < viewportBottom) bottom = Math.min(bottom, actionBounds.top - 8);
    }
    const field = input.closest('.el-form-item');
    const fieldBounds = field.getBoundingClientRect();
    // 输入框过高时优先显示输入内容；空间充足时同时显示字段名称。
    const bounds = fieldBounds.height <= bottom - top ? fieldBounds : input.getBoundingClientRect();
    const offset = bounds.top < top ? bounds.top - top : bounds.bottom > bottom ? bounds.bottom - bottom : 0;
    if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: 'auto' });
  }

  function updateViewport() {
    const input = focusedInput();
    isMobile.value = mobile.matches;
    isInputFocused.value = isMobile.value && Boolean(input);
    const visibleHeight = viewport ? viewport.height : window.innerHeight;
    if (!isInputFocused.value) {
      keyboardInset.value = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    // 浏览器已经随键盘缩小布局时不再额外补出整块键盘高度。
    const coveredHeight = window.innerHeight - visibleHeight;
    // 地址栏伸缩与页面缩放不当作键盘，避免额外留白。
    keyboardInset.value = (!viewport || viewport.scale === 1) && coveredHeight > 120 ? coveredHeight : 0;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(keepInputVisible);
  }

  function handleFocusIn() {
    clearTimeout(blurTimer);
    updateViewport();
  }

  function handleFocusOut() {
    clearTimeout(blurTimer);
    // 等待下一字段接收焦点，切换金额和人数时不反复恢复吸附栏。
    blurTimer = setTimeout(updateViewport, 0);
  }

  onMounted(() => {
    viewport = window.visualViewport;
    mobile = window.matchMedia('(max-width: 760px)');
    updateViewport();
    window.addEventListener('resize', updateViewport);
    if (viewport) {
      viewport.addEventListener('resize', updateViewport);
      viewport.addEventListener('scroll', updateViewport);
    }
  });

  onBeforeUnmount(() => {
    clearTimeout(blurTimer);
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('resize', updateViewport);
    if (viewport) {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
    }
  });

  return { isMobile: readonly(isMobile), isInputFocused: readonly(isInputFocused), keyboardInset: readonly(keyboardInset), handleFocusIn, handleFocusOut };
}
