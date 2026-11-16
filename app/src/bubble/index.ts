import type { QuestionBubbleBridge } from '../shared/types';
declare global { interface Window { bubble: QuestionBubbleBridge } }
const bubble = document.querySelector<HTMLDivElement>('#bubble')!;
window.bubble.onText(({ text, side, visible, question }) => {
  bubble.classList.toggle('question', question);
  bubble.setAttribute('role', question ? 'button' : 'status'); bubble.tabIndex = question ? 0 : -1;
  bubble.textContent = text; bubble.dataset.side = side; bubble.classList.toggle('visible', visible);
});
new ResizeObserver(() => window.bubble.resize(Math.ceil(bubble.getBoundingClientRect().height + 24))).observe(bubble);

bubble.addEventListener('click', () => { void window.bubble.answer().catch(() => {}); });
bubble.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void window.bubble.answer().catch(() => {}); }
});
