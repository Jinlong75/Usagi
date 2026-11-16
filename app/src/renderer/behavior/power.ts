/** Passive breathing/blinking/gaze do not reset the eight-second inactivity clock. */
export function renderInterval(now: number, lastActivity: number, hidden: boolean): number {
  return hidden ? Infinity : now - lastActivity >= 8000 ? 1000 / 30 : 0;
}
