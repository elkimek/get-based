<script lang="ts">
  import { onDestroy } from 'svelte';
  import { beginChatLayoutDrag, endChatLayoutDrag, isChatLayoutCurrent, resizeChatLayout,
    type ChatLayoutView, type ChatResizeKind } from '../chat-layout-view.js';
  import { PANEL_SPLITTER, RAIL_SPLITTER } from '../chat-layout-classes.js';
  let { kind, layout }: { kind: ChatResizeKind; layout: ChatLayoutView } = $props();
  let handle: HTMLDivElement;
  let drag: { pointer: number; startX: number; width: number } | null = null;
  const fallback = () => kind === 'panel' ? 600 : 220;
  const available = () => layout.desktop && layout.open && (kind === 'panel' ? !layout.fullscreen : layout.railOpen);
  $effect(() => { if (!available()) finish(); });
  function finish() {
    if (!drag) return;
    const pointer = drag.pointer; drag = null;
    endChatLayoutDrag(handle);
    if (handle.hasPointerCapture?.(pointer)) handle.releasePointerCapture(pointer);
  }
  function start(event: PointerEvent) {
    if (!available() || event.button !== 0 || !beginChatLayoutDrag(handle)) return;
    event.preventDefault();
    const target = handle.closest('#chat-shell')?.querySelector(kind === 'panel' ? '#chat-panel' : '#chat-thread-rail');
    drag = { pointer: event.pointerId, startX: event.clientX, width: target?.getBoundingClientRect().width || fallback() };
    handle.setPointerCapture?.(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!available() || !isChatLayoutCurrent(handle)) { finish(); return; }
    const delta = (event.clientX - drag.startX) * (kind === 'panel' ? -1 : 1);
    resizeChatLayout(handle, kind, drag.width + delta);
  }
  function key(event: KeyboardEvent) {
    if (!available() || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key) || !isChatLayoutCurrent(handle)) return;
    event.preventDefault();
    const target = handle.closest('#chat-shell')?.querySelector(kind === 'panel' ? '#chat-panel' : '#chat-thread-rail');
    const width = target?.getBoundingClientRect().width || fallback();
    resizeChatLayout(handle, kind, event.key === 'Home' ? fallback() : width + (event.key === 'ArrowLeft' ? -16 : 16) * (kind === 'panel' ? -1 : 1));
  }
  function endPointer(event: PointerEvent) { if (event.pointerId === drag?.pointer) finish(); }
  onDestroy(finish);
</script>
<svelte:window onblur={finish} onpointerup={endPointer} onpointercancel={endPointer} onresize={finish} />
<!-- A focusable separator implements the keyboard-operated window splitter;
     pointer and keyboard handlers are required by that ARIA interaction. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div bind:this={handle} class={kind === 'panel' ? PANEL_SPLITTER : RAIL_SPLITTER}
  id={kind === 'panel' ? 'chat-panel-resize-handle' : 'chat-rail-resize-handle'}
  role="separator" aria-label={kind === 'panel' ? 'Resize chat' : 'Resize conversation sidebar'}
  aria-orientation="vertical" aria-valuemin={kind === 'panel' ? layout.panelMin : 180}
  aria-valuemax={kind === 'panel' ? layout.panelMax : layout.railMax}
  aria-valuenow={kind === 'panel' ? layout.panelWidth : layout.railWidth} tabindex="0"
  onpointerdown={start} onpointermove={move} onpointerup={endPointer} onpointercancel={endPointer}
  onlostpointercapture={finish} onkeydown={key}
  ondblclick={() => { if (available()) resizeChatLayout(handle, kind, fallback()); }}></div>
