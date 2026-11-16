import type { BubbleBridge } from '../shared/ui';
declare global { interface Window { bubble: BubbleBridge } }
const bubble = document.querySelector<HTMLDivElement>('#bubble')!;
window.bubble.onText(({ text, side, visible }) => {
  bubble.textContent = text; bubble.dataset.side = side; bubble.classList.toggle('visible', visible);
});
new ResizeObserver(() => window.bubble.resize(Math.ceil(bubble.getBoundingClientRect().height + 24))).observe(bubble);
