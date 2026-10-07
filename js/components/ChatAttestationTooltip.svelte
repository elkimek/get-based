<script lang="ts">
  import { flushSync } from 'svelte';
  const id = 'e2ee-attestation-tooltip';
  let tooltip: HTMLDivElement;
  let text = $state(''), visible = $state(false), left = $state(10), top = $state(10);
  let target: Element | null = null;
  function badge(value: EventTarget | null): Element | null { return value instanceof Element ? value.closest('.e2ee-attestation-badge[data-attestation-tooltip]') : null; }
  function hide() { target?.setAttribute('aria-expanded', 'false'); target?.removeAttribute('aria-describedby'); target = null; visible = false; }
  function position() {
    if (!target?.isConnected) { hide(); return; }
    const rect = target.getBoundingClientRect(), box = tooltip.getBoundingClientRect(), doc = target.ownerDocument.documentElement;
    left = Math.round(Math.max(10, Math.min(rect.left + (rect.width - box.width) / 2, doc.clientWidth - box.width - 10)));
    top = Math.round(rect.bottom + 8 + box.height <= doc.clientHeight - 10 ? rect.bottom + 8 : Math.max(10, rect.top - box.height - 8));
  }
  function show(next: Element) {
    const value = next.getAttribute('data-attestation-tooltip'); if (!value) return;
    if (target !== next) hide(); target = next;
    flushSync(() => { text = value; visible = true; }); position();
    next.setAttribute('aria-expanded', 'true'); next.setAttribute('aria-describedby', id);
  }
  function over(event: PointerEvent | FocusEvent) { const next = badge(event.target); if (next) show(next); }
  function out(event: PointerEvent | FocusEvent) { const previous = badge(event.target); if (previous && !(event.relatedTarget instanceof Node && (previous.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)))) hide(); else if (event.target instanceof Node && tooltip.contains(event.target) && !(event.relatedTarget instanceof Node && (tooltip.contains(event.relatedTarget) || target?.contains(event.relatedTarget)))) hide(); }
  function click(event: MouseEvent) { const next = badge(event.target); if (next) show(next); else if (!(event.target instanceof Node && tooltip.contains(event.target))) hide(); }
  function key(event: KeyboardEvent) { const next = badge(event.target); if (next && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); show(next); } else if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopImmediatePropagation(); hide(); } }
  function watch(element: HTMLElement) {
    const observer = new MutationObserver(() => { if (target && (!target.isConnected || target.closest('[hidden], [inert]') || target.getAttribute('data-attestation-tooltip') !== text)) hide(); });
    observer.observe(element.ownerDocument.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-attestation-tooltip', 'hidden', 'inert'] });
    return { destroy() { observer.disconnect(); hide(); } };
  }
</script>
<svelte:document onpointerover={over} onpointerout={out} onfocusin={over} onfocusout={out} onclick={click} onkeydowncapture={key} onscrollcapture={position}/>
<svelte:window onresize={position}/>
<div bind:this={tooltip} use:watch data-chat-attestation-view {id} role="tooltip" tabindex="-1" hidden={!visible} style:left="{left}px" style:top="{top}px" class="e2ee-attestation-tooltip gb:attestation:fixed gb:attestation:z-[1400] gb:attestation:w-max gb:attestation:max-w-[min(380px,calc(100vw-20px))] gb:attestation:max-h-[calc(100dvh-20px)] gb:attestation:overflow-auto gb:attestation:break-words gb:attestation:px-3 gb:attestation:py-2.5 gb:attestation:border gb:attestation:border-line gb:attestation:rounded-lg gb:attestation:bg-select-popup gb:attestation:text-ink gb:attestation:shadow-dialog gb:attestation:font-mono gb:attestation:text-[11px] gb:attestation:font-normal gb:attestation:leading-normal gb:attestation:pointer-events-auto gb:attestation:whitespace-pre-line gb:attestation:[&[hidden]]:hidden">{text}</div>
