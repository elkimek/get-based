import { expect, test } from './coverage-fixture.js';

const THEMES = ['cyberterm', 'glass', 'synth-sunrise', 'neuromancer'];

function parseCssColor(value) {
  const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(',').map(part => part.trim());
  return {
    r: Number(parts[0]),
    g: Number(parts[1]),
    b: Number(parts[2]),
    a: parts[3] === undefined ? 1 : Number(parts[3]),
  };
}

function compositeOver(color, under) {
  const alpha = Number.isFinite(color.a) ? color.a : 1;
  return {
    r: color.r * alpha + under.r * (1 - alpha),
    g: color.g * alpha + under.g * (1 - alpha),
    b: color.b * alpha + under.b * (1 - alpha),
  };
}

function luminance(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground, background) {
  const fg = 0.2126 * luminance(foreground.r) + 0.7152 * luminance(foreground.g) + 0.0722 * luminance(foreground.b);
  const bg = 0.2126 * luminance(background.r) + 0.7152 * luminance(background.g) + 0.0722 * luminance(background.b);
  const light = Math.max(fg, bg);
  const dark = Math.min(fg, bg);
  return (light + 0.05) / (dark + 0.05);
}

test('custom dark theme primary dashboard CTA hover text stays readable', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'networkidle' });

  for (const theme of THEMES) {
    await page.evaluate(async (nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
      document.body.insertAdjacentHTML(
        'beforeend',
        `<button id="hover-contrast-cta" class="dashboard-action-btn dashboard-action-btn-primary" style="position:fixed;left:24px;top:24px;z-index:9999">Primary CTA</button>`
      );
      await new Promise(requestAnimationFrame);
    }, theme);

    const button = page.locator('#hover-contrast-cta');
    await button.hover();
    const styles = await button.evaluate((el) => {
      const buttonStyle = getComputedStyle(el);
      const bodyStyle = getComputedStyle(document.body);
      return {
        color: buttonStyle.color,
        backgroundColor: buttonStyle.backgroundColor,
        bodyBackgroundColor: bodyStyle.backgroundColor,
      };
    });
    await button.evaluate(el => el.remove());

    const foreground = parseCssColor(styles.color);
    const background = parseCssColor(styles.backgroundColor);
    const bodyBackground = parseCssColor(styles.bodyBackgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
    expect(foreground, `${theme} foreground ${styles.color}`).toBeTruthy();
    expect(background, `${theme} background ${styles.backgroundColor}`).toBeTruthy();

    const compositedBackground = compositeOver(background, bodyBackground);
    const ratio = contrastRatio(foreground, compositedBackground);
    expect(ratio, `${theme} hover contrast ${ratio.toFixed(2)} (${styles.color} on ${styles.backgroundColor})`).toBeGreaterThanOrEqual(4.5);
  }
});
