import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config, RoutineState } from '../shared/types';
import { BUBBLE_DURATION, chooseLine, type TalkClock } from './selfTalk';

type Period = 'morning' | 'lunch' | 'nap' | 'dinner' | 'sleep';
export const ROUTINE_LINES: Record<Period | 'welcome', string[]> = {
  morning: ['呀哈！（早上好～早饭吃了什么？）', '呀哈呀哈！（起床啦～早饭吃了没？）', '哈？（天亮了！早饭吃了什么呀？）'],
  lunch: ['乌拉！（中午啦，吃饭没？）', '呀哈～（午饭吃什么呀？）', '噗噜噜……（肚子饿了，你吃饭没？）'],
  nap: ['呼……噗噜……（困了，午睡一下）', '哈啊～（好困……睡一会儿）'],
  dinner: ['呀哈！（晚饭时间到～吃什么？）', '乌拉～（晚饭吃了没？）'],
  sleep: ['呼……（晚安）'], welcome: ['呀哈！（回来啦～）', '哈？（去哪了？回来啦！）'],
};
export const BEDTIME_LINES = ['哈？（这么晚了，早点睡哦）', '乌拉！（还不睡？快去睡觉！）', '噗噜噜……（我先睡了，你也快睡）'];
const HALF_HOUR = 30 * 60_000;
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();
/** Local calendar arithmetic preserves the 05:00 boundary across DST changes. */
export function logicalDay(now: Date): string {
  const date = new Date(now); if (date.getHours() < 5) date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function inRange(now: Date, [start, end]: [string, string]): boolean {
  const minute = minuteOfDay(now), from = minutes(start), to = minutes(end);
  return from < to ? minute >= from && minute < to : from > to && (minute >= from || minute < to);
}
// A continuous sleep/nap crossing 05:00 belongs to its start, avoiding a second goodnight at 05:00.
function periodDay(now: Date, range: [string, string]): string {
  const start = new Date(now); start.setHours(Math.floor(minutes(range[0]) / 60), minutes(range[0]) % 60, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return logicalDay(start);
}
/** TODO(D10): Replace with foreground fullscreen detection when desktop absorption lands. */
export function isForegroundFullscreen(): boolean { return false; }
export function questionText(line: string): string { return line.slice(line.indexOf('（') + 1, line.lastIndexOf('）')); }
export function insertWeather(line: string, weather: string): string {
  const opening = line.indexOf('（') + 1, greetingEnd = line.indexOf('～', opening);
  const insert = greetingEnd >= 0 ? greetingEnd + 1 : line.indexOf('！', opening) + 1;
  return line.slice(0, insert) + weather + line.slice(insert);
}
interface StoredState {
  days: Partial<Record<Period, string>>;
  bedtime: { day: string; count: number; lastAt: number };
  lastWelcome: number | null;
}
const fresh = (): StoredState => ({ days: {}, bedtime: { day: '', count: 0, lastAt: 0 }, lastWelcome: null });
function readState(path: string, onError: (error: unknown) => void): StoredState {
  if (!existsSync(path)) return fresh();
  let value: StoredState | undefined;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { /* Quarantine below, as for config.json. */ }
  if (value && typeof value === 'object' && value.days && typeof value.days === 'object' && !Array.isArray(value.days)
    && Object.entries(value.days).every(([key, day]) => ['morning', 'lunch', 'nap', 'dinner', 'sleep'].includes(key)
      && typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
    && value.bedtime && typeof value.bedtime.day === 'string' && Number.isInteger(value.bedtime.count)
    && value.bedtime.count >= 0 && value.bedtime.count <= 3 && Number.isFinite(value.bedtime.lastAt)
    && (value.lastWelcome === null || (typeof value.lastWelcome === 'number' && Number.isFinite(value.lastWelcome)))) return value;
  try { renameSync(path, path.replace(/\.json$/, '') + `.broken-${Date.now()}.json`); }
  catch (error) { onError(error); }
  return fresh();
}
export interface RoutineOptions {
  path: string;
  config(): Config['routine']; now(): Date; idleSeconds(): number; blocked(): boolean;
  show(text: string, duration: number, question: boolean): void | Promise<void>;
  sound(): void; state(state: RoutineState): void;
  weatherLine(): Promise<string | null>;
  fullscreen?: () => boolean; random?: () => number; clock?: TalkClock;
  onError?: (error: unknown) => void;
}
export class Routine {
  private saved: StoredState;
  private previous = new Map<string, string>();
  private current: RoutineState = 'awake';
  private away = false;
  private lastTickAt?: number;
  private errors = new Set<string>();
  private busy = false;
  private running = false;
  private generation = 0;
  private timer?: unknown;
  constructor(private options: RoutineOptions) { this.saved = readState(options.path, error => this.report(error)); }
  private report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.errors.has(message)) return;
    this.errors.add(message);
    console.error('作息状态读写失败', error);
  }
  /** Power events can arrive after the idle counter has already reset. */
  markAway(): void { this.away = true; }
  private get clock(): TalkClock { return this.options.clock ?? { set: (fn, delay) => setTimeout(fn, delay), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) }; }
  get resting(): boolean {
    const config = this.options.config(), now = this.options.now();
    return config.enabled && (inRange(now, config.sleep) || inRange(now, config.nap));
  }
  start(): void {
    this.stop(); this.running = true;
    const generation = this.generation;
    const check = () => {
      if (!this.running || generation !== this.generation) return;
      this.timer = this.clock.set(check, 30_000);
      void this.tick().catch(error => this.options.onError?.(error));
    };
    this.timer = this.clock.set(check, 30_000);
  }
  stop(): void {
    this.running = false; ++this.generation;
    if (this.timer !== undefined) this.clock.clear(this.timer);
    this.timer = undefined;
  }
  private persist(candidate: StoredState): void {
    mkdirSync(dirname(this.options.path), { recursive: true });
    writeFileSync(`${this.options.path}.tmp`, JSON.stringify(candidate, null, 2) + '\n', 'utf8');
    renameSync(`${this.options.path}.tmp`, this.options.path);
  }
  private commit(candidate: StoredState, clearAway = false): boolean {
    try { this.persist(candidate); }
    catch (error) { this.report(error); return false; }
    this.saved = candidate;
    if (clearAway) this.away = false;
    return true;
  }
  private blocked(): boolean { return this.options.blocked() || (this.options.fullscreen ?? isForegroundFullscreen)(); }
  private line(key: Period | 'welcome'): string {
    return chooseLine(ROUTINE_LINES[key], this.previous.get(key), this.options.random ?? Math.random);
  }
  private async weather(): Promise<string | null> {
    let timer: unknown;
    try {
      return await Promise.race([Promise.resolve().then(() => this.options.weatherLine()).catch(() => null),
        new Promise<null>(resolve => { timer = this.clock.set(() => resolve(null), 3000); })]);
    } finally { if (timer !== undefined) this.clock.clear(timer); }
  }
  private async display(text: string, question = false): Promise<void> {
    if (this.options.config().quiet) return;
    await this.options.show(text, question ? 10_000 : BUBBLE_DURATION, question);
    this.options.sound();
  }
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const generation = this.generation;
    try {
      const config = this.options.config(); if (!config.enabled) return;
      const now = this.options.now(), idle = this.options.idleSeconds();
      if (idle >= 1800 || (this.lastTickAt !== undefined && now.getTime() - this.lastTickAt >= HALF_HOUR)) this.markAway();
      this.lastTickAt = now.getTime();
      // TODO(lead): Confirm overlap priority for custom times; sleep currently precedes nap and meals.
      const state: RoutineState = inRange(now, config.sleep) ? 'sleep' : inRange(now, config.nap) ? 'nap' : 'awake';
      if (state !== this.current) { this.current = state; this.options.state(state); }
      // State transitions follow the clock even while quiet, idle, hidden or in another window.
      if (idle >= 60 || this.blocked()) return;
      if (this.away) {
        if (state === 'awake' && (this.saved.lastWelcome === null || now.getTime() - this.saved.lastWelcome >= 4 * HALF_HOUR)) {
          const candidate = { ...this.saved, lastWelcome: now.getTime() };
          if (!this.commit(candidate, true)) return;
          const line = this.line('welcome'); this.previous.set('welcome', line);
          await this.display(line); return;
        }
        // Even a suppressed welcome only consumes the away marker after a successful write.
        if (!this.commit({ ...this.saved }, true)) return;
      }
      for (const key of ['sleep', 'nap', 'morning', 'lunch', 'dinner'] as const) {
        if (!inRange(now, config[key])) continue;
        const day = key === 'sleep' || key === 'nap' ? periodDay(now, config[key]) : logicalDay(now);
        if (this.saved.days[key] === day) continue;
        const originalLine = this.line(key);
        let line = originalLine;
        if (key === 'morning' && !config.quiet) {
          const weather = await this.weather();
          if (weather) line = insertWeather(line, weather);
          // A pending weather lookup must not leak a stale greeting after settings/clock changes.
          const latest = this.options.config();
          if (generation !== this.generation || !latest.enabled || !inRange(this.options.now(), latest[key])
            || logicalDay(this.options.now()) !== day || this.options.idleSeconds() >= 60 || this.blocked()) return;
        }
        const candidate = { ...this.saved, days: { ...this.saved.days, [key]: day } };
        if (!this.commit(candidate)) return;
        this.previous.set(key, originalLine);
        await this.display(line, ['morning', 'lunch', 'dinner'].includes(key)); return;
      }
      const start = new Date(now), from = minutes(config.bedtime);
      start.setHours(Math.floor(from / 60), from % 60, 0, 0);
      if (start > now) start.setDate(start.getDate() - 1);
      const elapsed = now.getTime() - start.getTime(), day = logicalDay(start);
      if (elapsed < 0 || elapsed >= 3 * HALF_HOUR) return;
      const prior = this.saved.bedtime.day === day ? this.saved.bedtime : { day, count: 0, lastAt: 0 };
      if (prior.count >= 3 || (prior.count > 0 && now.getTime() - prior.lastAt < HALF_HOUR)) return;
      const candidate = { ...this.saved, bedtime: { day, count: prior.count + 1, lastAt: now.getTime() } };
      if (!this.commit(candidate)) return;
      await this.display(BEDTIME_LINES[prior.count]!);
    } finally { this.busy = false; }
  }
}
