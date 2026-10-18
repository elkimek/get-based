<script lang="ts">
  import type { TweaksPanelView } from '../tweaks-presentation.js';
  import { tweaksClasses as c, tweaksThemeSwatchClasses } from '../tweaks-classes.js';

  let { view }: { view: TweaksPanelView } = $props();
</script><svelte:options preserveWhitespace={true} />{'\n    '}<div class={c('tweaks-overlay', 'overlay')} id="tweaks-panel-overlay">
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role (Preserve the accepted native aside dialog contract.) --><aside class={c('tweaks-panel', 'panel')} id="tweaks-panel" role="dialog" aria-modal="true" aria-label="Tweaks">
        <div class={c('tweaks-head', 'head')}>
          <div>
            <div class="gb-modal-title">Tweaks</div>
          </div>
          <button class={c('modal-close', 'close')} aria-label="Close" data-tweaks-action="close">&times;</button>
        </div>
        <div class={c('tweaks-body', 'body')}>
          <section class={c('tweaks-section', 'section')}>
            <div class={c('tweaks-section-title', 'section-title')}>Theme world</div>
            <div class={c('tweaks-theme-grid', 'theme-grid')}>{#each view.themes as theme}{'\n    '}<button type="button" class={c('tweaks-theme-btn' + (theme.active ? ' active' : ''), 'theme-button')} data-theme-id={theme.id} data-tweaks-action="select-theme">
      <span class={tweaksThemeSwatchClasses('settings-theme-swatch settings-theme-swatch-' + theme.id, theme.id)} aria-hidden="true"></span>
      <span>{theme.label}</span>
    </button>{'\n  '}{/each}</div>
          </section>
          <section class={c('tweaks-section', 'section')}>
            <div class={c('tweaks-section-title', 'section-title')}>Accent color</div>
            <div class={c('tweaks-accent-row', 'accent-row')}>{#each view.accents as accent}{'\n    '}<button type="button" class={c('tweaks-accent-btn' + (accent.active ? ' active' : ''), 'accent-button')} data-accent-id={accent.id} data-tweaks-action="select-accent" title={accent.title} aria-label={accent.ariaLabel}>
      <span class={c('tweaks-accent-swatch', 'accent-swatch')} style={'--tweak-accent:' + accent.color + ';--tweak-gradient:' + accent.gradient}></span>
    </button>{/each}</div>
          </section>
          <section class={c('tweaks-section', 'section')}>
            <div class={c('tweaks-section-title', 'section-title')}>Visual modes</div>
            <div class={c('tweaks-option-row', 'option-row')}>
              <div class={c('settings-copy', 'option-copy')}>
                <div class={c('settings-copy-title', 'option-title')}>Sunset mode</div>
                <div class={c('settings-copy-desc', 'option-description')}>Warm high-contrast palette for red blue-blocking glasses.</div>
              </div>
              <label class="toggle-switch" title="Use warm tokens that remain legible through red lenses">
                <input type="checkbox" id="tweaks-sunset-mode" checked={view.sunset} data-tweaks-action="toggle-sunset">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class={c('tweaks-option-row', 'option-row')} id="tweaks-crt-effects-row" hidden={!view.crtSupported}>
              <div class={c('settings-copy', 'option-copy')}>
                <div class={c('settings-copy-title', 'option-title')}>CRT effects</div>
                <div class={c('settings-copy-desc', 'option-description')}>Scanlines and phosphor glow for Terminal, Synth Sunrise, and Neuromancer.</div>
              </div>
              <label class="toggle-switch" title="Apply CRT scanline effects to terminal-style themes">
                <input type="checkbox" id="tweaks-crt-effects" checked={view.crt} disabled={!view.crtSupported} data-tweaks-action="toggle-crt">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </section>
          <section class={c('tweaks-section', 'section')}>
            <div class={c('tweaks-section-title', 'section-title')}>Dashboard</div>
            <div class={c('tweaks-action-grid', 'action-grid')}>
              <button type="button" class={c('', 'action-button')} data-tweaks-action="reset-dashboard">Reset layout</button>
              <button type="button" class={c('', 'action-button')} data-tweaks-action="clear-dashboard">Clear all widgets</button>
              <button type="button" class={c('', 'action-button')} data-tweaks-action="organize-dashboard">Organize widgets</button>
              <button type="button" class={c('', 'action-button')} data-tweaks-action="send-feedback">Send feedback</button>
            </div>
          </section>
        </div>
      </aside>
    </div>{'\n  '}
