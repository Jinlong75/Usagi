export const TICK_MS = 1000 / 60;

/** Schedule against monotonic deadlines, skipping missed ticks instead of catching up.
 * A coarse Windows timer may still wake late; neither lateness nor callback work
 * accumulates into drift. Consumers must use elapsed time, never a tick count.
 */
export function startTickLoop(tick: () => void, period = TICK_MS,
  now = () => performance.now()): () => void {
  let active = true;
  let deadline = now() + period;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => { timer = setTimeout(run, Math.max(1, deadline - now())); };
  const run = () => {
    if (!active) return;
    tick();
    if (!active) return;
    deadline += period;
    const current = now();
    if (deadline <= current) deadline += (Math.floor((current - deadline) / period) + 1) * period;
    schedule();
  };
  schedule();
  return () => { active = false; clearTimeout(timer); };
}
