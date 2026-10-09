<script lang="ts">
  import type {TourPresentationProps} from '../tour-presentation.js';
  import {tourClasses as c} from '../tour-classes.js';

  let {title, text, dots, back, next}: TourPresentationProps = $props();
</script>

<h4 id="tour-tooltip-heading" class={c('tour-heading')}>{title}</h4>
<p class={c('tour-copy')}>{text}</p>
<div data-tour-view class={c('tour-nav')}>
  <div class={c('tour-dots')}>
    {#each dots as active}
      <div class={`${c('tour-dot')}${active ? ' active' : ''}`}></div>
    {/each}
  </div>
  <div class={c('tour-btns')}>
    <button
      type="button"
      class={c('tour-btn tour-btn-secondary')}
      data-tour-action={back.action}
      data-tour-index={back.index}
    >{back.label}</button>
    <button
      type="button"
      class={c('tour-btn tour-btn-primary')}
      data-tour-action={next.action}
      data-tour-index={next.index}
    >{next.label}</button>
  </div>
</div>
