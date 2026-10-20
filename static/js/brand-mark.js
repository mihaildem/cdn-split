/**
 * brand-mark.js — Animated SVG Brand Mark (cdn/split)
 * States: intro, debt, spin, merge, busy
 * Respects prefers-reduced-motion
 */

export function getBrandMarkSVG({
  className = '',
  width = 26,
  height = 26,
  rx = 9,
  ariaHidden = true,
} = {}) {
  return `<svg class="lg ${className}" viewBox="0 0 32 32" width="${width}" height="${height}" ${ariaHidden ? 'aria-hidden="true"' : ''}>
  <rect class="tile" width="32" height="32" rx="${rx}"/>
  <circle class="ring" cx="16" cy="16" r="10" fill="none" stroke-width="1.5"/>
  <g class="rot">
    <path class="h1" d="M16 6a10 10 0 0 0 0 20z"/>
    <path class="h2" d="M16 6a10 10 0 0 1 0 20z"/>
  </g>
</svg>`;
}

export function triggerLogoAnim(animClass) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  document.querySelectorAll('.lgm').forEach((el) => {
    el.classList.remove(animClass);
    // Force layout reflow
    void el.getBoundingClientRect();
    el.classList.add(animClass);
    setTimeout(() => el.classList.remove(animClass), 1000);
  });
}

export function updateBrandDebtState(hasDebt) {
  document.querySelectorAll('.lgm').forEach((el) => {
    el.classList.toggle('debt', Boolean(hasDebt));
  });
}
