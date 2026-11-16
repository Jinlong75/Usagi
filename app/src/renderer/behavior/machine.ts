import type { MoveRequest, MoveResult, WindowInfo, Activity, FoodActivity, RoutineState } from '../../shared/types';

export type State = 'idle' | 'turn' | 'act' | 'move' | 'click' | 'drag' | 'nap' | 'caught';
export type Reaction = 'happy' | 'surprised' | 'shout';
export type Action = 'jump' | 'stretch' | 'shake' | 'spin' | Activity | 'sneakSnack';
export const ACTIONS: Action[] = ['jump', 'stretch', 'shake', 'spin', 'jumpRope', 'blowBubbles', 'sneakSnack'];
export const ACTION_WEIGHTS: Record<Action, number> = { jump: 1, stretch: 1, shake: 1, spin: 1, jumpRope: 0.5, blowBubbles: 0.5, sneakSnack: 0.5, eatRiceball: 0.5, eatWatermelon: 0.5, iceCream: 0.5 };
export function pickAction(pool: readonly Action[], previous: Action | undefined, value: number): Action | undefined {
  const choices = pool.length > 1 ? pool.filter(action => action !== previous) : pool;
  let roll = value * choices.reduce((sum, action) => sum + ACTION_WEIGHTS[action], 0);
  return choices.find(action => (roll -= ACTION_WEIGHTS[action]) < 0) ?? choices.at(-1);
}
export const DURATIONS = { idle: 3500, turn: 450, jump: 1200, stretch: 2200, shake: 1200, spin: 1800, jumpRope: 6500, blowBubbles: 5000,
  eatRiceball: 6000, eatWatermelon: 5000, iceCream: 5500, sneakSnack: 4500,
  happy: 1200, surprised: 1100, shout: 1300 } as const;
export const SPEED = 90;
export const TURN_ANGLE = 50 * Math.PI / 180;
export type Command = { type: 'move'; request: MoveRequest } | { type: 'cancel' } |
  { type: 'activityDone'; activity: FoodActivity } |
  { type: 'sound'; use: 'click_happy' | 'click_surprise' | 'click_shout' | 'drag' };
export interface Snapshot {
  snackAge?: number;
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
  const minimumX = info.workArea.x + 20;
  const maximumX = info.workArea.x + info.workArea.width - info.bounds.width - 20;
  if (maximumX < minimumX) return null;
  const x = Math.round(Math.max(minimumX, Math.min(maximumX, info.bounds.x + direction * distance)));
  const actualDistance = Math.abs(x - info.bounds.x);
  if (!actualDistance) return null;
  return { x, y: info.bounds.y, durationMs: actualDistance / SPEED * 1000, direction };
}

/** Times are injected milliseconds. No timers, DOM, IPC or model dependencies. */
export class BehaviorMachine {
  snapshot: Snapshot;
  private commands: Command[] = [];
  private lastAction?: Action;
  private lastReaction?: Reaction;
  private pending: ReturnType<typeof planMove> = null;
  private pressed = false;
  private visible = true;
  private routineState: RoutineState = 'awake';
  private awakeUntil = 0;
  private resumeNapAt = 0;
  private pressedNap = false;
  private pressedSnackAge?: number;
  private sleepingGesture = false;
  private wakeStretch = false;
  private startNap(): void { this.cancel(); this.enter('nap', Infinity); }
  disableRoutine(): void {
    this.routineState = 'awake';
    this.awakeUntil = 0; this.resumeNapAt = 0;
    this.pressedNap = false; this.sleepingGesture = false; this.wakeStretch = false;
    // Keep an ongoing pointer gesture; otherwise resume ordinary idle immediately.
    if (this.snapshot.state === 'nap') { this.cancel(); this.enter('idle', DURATIONS.idle); }
  }
  routine(state: RoutineState): void {
    if (state === this.routineState) return;
    this.routineState = state;
    if (state === 'awake') {
      this.wakeStretch = true;
      if (this.snapshot.state !== 'drag' && !this.pressed) this.stretchAwake();
    } else if (this.visible && !this.pressed && this.snapshot.state !== 'drag' && this.now() >= Math.max(this.awakeUntil, this.resumeNapAt)) this.startNap();
  }
  private stretchAwake(): void { this.cancel(); this.wakeStretch = false; this.enter('act', DURATIONS.stretch, { action: 'stretch' }); }
  activity(action: Activity): void {
    if (!this.visible || this.snapshot.state === 'drag' || this.pressed) return;
    this.cancel();
    // 休息时手动玩耍与点击一致：保持清醒 60 秒后再按作息回到打盹。
    if (this.routineState !== 'awake') this.awakeUntil = this.now() + 60_000;
    this.pressedSnackAge = undefined;
    this.lastAction = action; this.enter('act', DURATIONS[action], { action });
  }
  constructor(private random = Math.random, private now = () => performance.now(), private pool: readonly Action[] = ACTIONS) {
    this.snapshot = { state: 'idle', startedAt: now(), durationMs: DURATIONS.idle, direction: 1, fromAngle: 0, toAngle: 0 };
  }
  drain(): Command[] { return this.commands.splice(0); }
  private enter(state: State, durationMs: number, extras: Partial<Snapshot> = {}): void {
    this.snapshot = { state, startedAt: this.now(), durationMs, direction: this.snapshot.direction,
      fromAngle: 0, toAngle: 0, ...extras };
  }
  private cancel(): void { this.pending = null; this.commands.push({ type: 'cancel' }); }
  visibility(visible: boolean): void {
    this.visible = visible;
    this.pressed = false;
    this.pressedNap = false; this.sleepingGesture = false; this.pressedSnackAge = undefined;
    this.cancel();
    this.enter('idle', DURATIONS.idle);
  }
  press(active: boolean): void {
    if (active) {
      this.pressedNap = this.snapshot.state === 'nap';
      this.pressedSnackAge = this.snapshot.state === 'act' && this.snapshot.action === 'sneakSnack'
        ? (this.now() - this.snapshot.startedAt) / 1000 : undefined;
    }
    this.pressed = active;
    this.cancel();
    if (active && this.pressedSnackAge !== undefined) this.enter('caught', Infinity, { snackAge: this.pressedSnackAge });
    else this.enter('idle', DURATIONS.idle);
  }
  click(): Reaction {
    const snackAge = this.pressedSnackAge ?? (this.snapshot.state === 'act' && this.snapshot.action === 'sneakSnack'
      ? (this.now() - this.snapshot.startedAt) / 1000 : undefined);
    this.pressedSnackAge = undefined;
    if (snackAge !== undefined) {
      this.cancel(); this.enter('caught', 400, { snackAge });
      return 'surprised';
    }
    return this.clickReaction();
  }
  private clickReaction(forced?: Reaction): Reaction {
    this.cancel();
    const sleeping = this.snapshot.state === 'nap' || this.pressedNap;
    this.pressedNap = false;
    if (sleeping) this.awakeUntil = this.now() + 60_000;
    const reaction = forced ?? (sleeping ? 'surprised' : pick<Reaction>(['happy', 'surprised', 'shout'], this.lastReaction, this.random)!);
    this.lastReaction = reaction;
    this.enter('click', DURATIONS[reaction], { reaction });
    this.commands.push({ type: 'sound', use: reaction === 'surprised' ? 'click_surprise' : `click_${reaction}` });
    return reaction;
  }
  drag(active: boolean): void {
    this.pressedSnackAge = undefined;
    if (active) { this.sleepingGesture = this.snapshot.state === 'nap' || this.pressedNap; this.pressedNap = false; }
    else if (this.sleepingGesture) { this.resumeNapAt = this.now() + 2000; this.sleepingGesture = false; }
    this.cancel();
    this.enter(active ? 'drag' : 'idle', active ? Infinity : DURATIONS.idle);
    if (active && this.random() < 0.30) this.commands.push({ type: 'sound', use: 'drag' });
  }
  moveDone(result: MoveResult): void {
    if (this.snapshot.state !== 'move') return;
    this.pending = null;
    if (!result.ok) { this.enter('idle', DURATIONS.idle); return; }
    this.enter('turn', DURATIONS.turn, { fromAngle: this.snapshot.direction * TURN_ANGLE, toAngle: 0 });
  }
  private act(): void {
    const action = pickAction(this.pool, this.lastAction, this.random());
    if (!action) { this.enter('idle', DURATIONS.idle); return; }
    this.lastAction = action;
    this.enter('act', DURATIONS[action], { action });
  }
  tick(info: WindowInfo | null): Snapshot {
    const state = this.snapshot;
    if (!this.visible || this.pressed || state.state === 'drag') return state;
    if (state.state === 'caught') {
      if (this.now() - state.startedAt >= state.durationMs) this.clickReaction('surprised');
      return this.snapshot;
    }
    if (this.wakeStretch) { this.stretchAwake(); return this.snapshot; }
    if (this.routineState !== 'awake' && this.now() >= Math.max(this.awakeUntil, this.resumeNapAt)) {
      if (state.state !== 'nap') this.startNap();
      return this.snapshot;
    }
    if (state.state === 'nap') return state;
    if (state.state === 'move') {
      if (this.now() - state.startedAt >= state.durationMs + 1000) {
        this.cancel();
        this.enter('idle', DURATIONS.idle);
      }
      return this.snapshot;
    }
    if (this.now() - state.startedAt < state.durationMs) return state;
    if (state.state === 'act' && ['eatRiceball', 'eatWatermelon', 'iceCream'].includes(state.action!)) {
      this.commands.push({ type: 'activityDone', activity: state.action as FoodActivity });
      if (state.action === 'eatRiceball') this.commands.push({ type: 'sound', use: 'click_happy' });
    }
    if (state.state === 'act' && state.action === 'jumpRope') this.commands.push({ type: 'sound', use: 'click_shout' });
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
