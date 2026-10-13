import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue';

// 只处理录入时的可见区域，不改变表单值或草稿。
export function useEntryInputViewport(panelRef) {
  const isInputFocused = shallowRef(false);
  const keyboardInset = shallowRef(0);
  let viewport;
  let mobile;
  let fullHeight = 0;
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
    const bottom = top + (viewport ? viewport.height : window.innerHeight) - 32;
    const field = input.closest('.el-form-item');
    const fieldBounds = field.getBoundingClientRect();
    // 输入框过高时优先显示输入内容；空间充足时同时显示字段名称。
    const bounds = fieldBounds.height <= bottom - top ? fieldBounds : input.getBoundingClientRect();
    const offset = bounds.top < top ? bounds.top - top : bounds.bottom > bottom ? bounds.bottom - bottom : 0;
    if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: 'auto' });
  }

  function updateViewport() {
    const input = focusedInput();
    isInputFocused.value = mobile.matches && Boolean(input);
    const visibleHeight = viewport ? viewport.height : window.innerHeight;
    if (!isInputFocused.value) {
      fullHeight = Math.max(window.innerHeight, visibleHeight);
      keyboardInset.value = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    fullHeight = Math.max(fullHeight, window.innerHeight, visibleHeight);
    const coveredHeight = fullHeight - visibleHeight;
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

  return { isInputFocused: readonly(isInputFocused), keyboardInset: readonly(keyboardInset), handleFocusIn, handleFocusOut };
}
