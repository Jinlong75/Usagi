import type { MoveRequest, WindowInfo } from '../../shared/types';

export type State = 'idle' | 'turn' | 'act' | 'move' | 'click' | 'drag';
export type Reaction = 'happy' | 'surprised' | 'shout';
export type Action = 'jump' | 'stretch' | 'shake' | 'spin';
export const ACTIONS: Action[] = ['jump', 'stretch', 'shake', 'spin'];
export const DURATIONS = { idle: 3500, turn: 450, jump: 1200, stretch: 2200, shake: 1200, spin: 1800,
  happy: 1200, surprised: 1100, shout: 1300 } as const;
export const SPEED = 90;
export const TURN_ANGLE = 50 * Math.PI / 180;
export type Command = { type: 'move'; request: MoveRequest } | { type: 'cancel' } |
  { type: 'sound'; use: 'click_happy' | 'click_surprise' | 'click_shout' | 'drag' };
export interface Snapshot {
  state: State; startedAt: number; durationMs: number; action?: Action; reaction?: Reaction;
  direction: -1 | 1; fromAngle: number; toAngle: number;
}
function pick<T>(pool: readonly T[], previous: T | undefined, random: () => number): T | undefined {
  const choices = pool.length > 1 ? pool.filter((item) => item !== previous) : pool;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
export function inwardDirection(info: WindowInfo, previous: -1 | 1): -1 | 1 {
  const left = info.workArea.x + 20;
  const right = info.workArea.x + info.workArea.width - info.bounds.width - 20;
  const middle = (left + right) / 2;
  const band = Math.max(0, right - left) * 0.07;
  return info.bounds.x < middle - band ? 1 : info.bounds.x > middle + band ? -1 : previous;
}
export function planMove(info: WindowInfo, random: () => number): (MoveRequest & { direction: -1 | 1 }) | null {
  const left = Math.max(0, info.bounds.x - (info.workArea.x + 20));
  const right = Math.max(0, info.workArea.x + info.workArea.width - 20 - info.bounds.width - info.bounds.x);
  if (left < 60 && right < 60) return null;
  const direction = left >= 60 && right >= 60 ? (random() < 0.5 ? -1 : 1) : left >= 60 ? -1 : 1;
  const maximum = Math.floor(Math.min(240, direction === -1 ? left : right));
  const distance = 60 + Math.min(maximum - 60, Math.floor(random() * (maximum - 60 + 1)));
  return { x: info.bounds.x + direction * distance, y: info.bounds.y,
    durationMs: distance / SPEED * 1000, direction };
}

/** Times are injected milliseconds. No timers, DOM, IPC or model dependencies. */
export class BehaviorMachine {
  snapshot: Snapshot;
  private commands: Command[] = [];
  private lastAction?: Action;
  private lastReaction?: Reaction;
  private pending: ReturnType<typeof planMove> = null;
  private pressed = false;
  constructor(private random = Math.random, private now = () => performance.now(), private pool: readonly Action[] = ACTIONS) {
    this.snapshot = { state: 'idle', startedAt: now(), durationMs: DURATIONS.idle, direction: 1, fromAngle: 0, toAngle: 0 };
  }
  drain(): Command[] { return this.commands.splice(0); }
  private enter(state: State, durationMs: number, extras: Partial<Snapshot> = {}): void {
    this.snapshot = { state, startedAt: this.now(), durationMs, direction: this.snapshot.direction,
      fromAngle: 0, toAngle: 0, ...extras };
  }
  private cancel(): void { this.pending = null; this.commands.push({ type: 'cancel' }); }
  press(active: boolean): void {
    this.pressed = active;
    this.cancel();
    this.enter('idle', DURATIONS.idle);
  }
  click(): Reaction {
    this.cancel();
    const reaction = pick<Reaction>(['happy', 'surprised', 'shout'], this.lastReaction, this.random)!;
    this.lastReaction = reaction;
    this.enter('click', DURATIONS[reaction], { reaction });
    this.commands.push({ type: 'sound', use: reaction === 'surprised' ? 'click_surprise' : `click_${reaction}` });
    return reaction;
  }
  drag(active: boolean): void {
    this.cancel();
    this.enter(active ? 'drag' : 'idle', active ? Infinity : DURATIONS.idle);
    if (active && this.random() < 0.30) this.commands.push({ type: 'sound', use: 'drag' });
  }
  moveDone(): void {
    if (this.snapshot.state !== 'move') return;
    this.pending = null;
    this.enter('turn', DURATIONS.turn, { fromAngle: this.snapshot.direction * TURN_ANGLE, toAngle: 0 });
  }
  private act(): void {
    const action = pick(this.pool, this.lastAction, this.random);
    if (!action) { this.enter('idle', DURATIONS.idle); return; }
    this.lastAction = action;
    this.enter('act', DURATIONS[action], { action });
  }
  tick(info: WindowInfo | null): Snapshot {
    const state = this.snapshot;
    if (this.pressed || state.state === 'drag' || state.state === 'move' || this.now() - state.startedAt < state.durationMs) return state;
    if (state.state === 'turn') {
      if (this.pending) {
        const { direction, ...request } = this.pending;
        this.enter('move', request.durationMs, { direction });
        this.commands.push({ type: 'move', request });
      } else if (state.toAngle !== 0) this.enter('turn', DURATIONS.turn, { fromAngle: state.toAngle, toAngle: 0 });
      else this.enter('idle', DURATIONS.idle);
    } else if (state.state === 'click') this.enter('idle', DURATIONS.idle);
    else {
      const roll = this.random();
      const bucket = roll < 0.30 ? 'idle' : roll < 0.40 ? 'turn' : roll < 0.80 ? 'act' : 'move';
      const inward = info ? inwardDirection(info, state.direction) : state.direction;
      // The facing gate corrects outward idle, and downgrades an already-correct turn.
      if (bucket === 'idle' || bucket === 'turn') {
        if (inward !== state.direction) this.enter('turn', DURATIONS.turn, { direction: inward, toAngle: inward * TURN_ANGLE });
        else this.enter('idle', DURATIONS.idle);
      } else if (bucket === 'act') this.act();
      else {
        this.pending = info ? planMove(info, this.random) : null;
        if (!this.pending) this.act();
        else this.enter('turn', DURATIONS.turn, { direction: this.pending.direction, toAngle: this.pending.direction * TURN_ANGLE });
      }
    }
    return this.snapshot;
  }
}
