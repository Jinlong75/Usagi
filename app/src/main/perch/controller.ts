import type { Point, Rect, PerchStatus } from '../../shared/types';
import { arc, dropTarget, followSeat, hopTarget } from './logic';
import type { Seat, WindowInfo } from './logic';

interface Host {
  bounds(): Rect; area(): Rect; enabled(): boolean; auto(): boolean; visible(): boolean;
  seat(): Point | undefined; ground(): number; move(point: Point): void; position(): Point;
  cancelWalk(): void; notify(status: PerchStatus): void;
}
/** Native motion ownership stays here until the snap/flight completes. */
export class PerchController {
  private seat?: Seat;
  private phase: PerchStatus['phase'] = 'free';
  private flight?: { from: Point; to: Point; start: number; duration: number };
  private windows: WindowInfo[] = [];
  private fullscreen = false;
  private lastHop = -Infinity;
  private lastAvailable = false;
  constructor(private host: Host, private now = () => performance.now()) {}
  get sitting() { return this.phase === 'sit'; }
  get active() { return this.phase !== 'free'; }
  get polling() { return this.active; }
  private seatOffsetY(): number { return (this.host.seat()?.y ?? Infinity) * this.host.bounds().height; }
  private point(): Point | undefined {
    const local = this.host.seat(); if (!local) return;
    const b = this.host.bounds(); return { x: b.x + local.x * b.width, y: b.y + local.y * b.height };
  }
  private target(): Seat | undefined {
    const point = this.point();
    return point && !this.active && this.host.visible() ? hopTarget(this.windows, point, this.host.area(), {
      enabled: this.host.enabled(), auto: this.host.auto(), fullscreen: this.fullscreen, now: this.now(), lastHop: this.lastHop,
    }, this.seatOffsetY()) : undefined;
  }
  private send(): void {
    this.lastAvailable = !!this.target();
    this.host.notify({ phase: this.phase, canHop: this.lastAvailable });
  }
  update(windows: WindowInfo[], fullscreen: boolean): void {
    this.windows = windows; this.fullscreen = fullscreen;
    if (this.active && !this.host.visible()) { this.detach(); return; }
    if (this.active && !this.host.enabled() && this.phase !== 'down') { this.down(); return; }
    if (this.seat && ['sit', 'snap', 'hop'].includes(this.phase)) {
      const target = followSeat(windows, this.seat, this.host.area(), this.seatOffsetY());
      if (!target) { this.placementFailed(); return; }
      if (this.phase === 'sit' && !this.place(target)) { this.placementFailed(); return; }
      else if (this.flight) this.flight.to = target;
    }
    if (!!this.target() !== this.lastAvailable) this.send();
  }
  private place(point: Point): boolean {
    const b = this.host.bounds(), local = this.host.seat(); if (!local) return false;
    this.host.move({ x: Math.round(point.x - local.x * b.width), y: Math.round(point.y - local.y * b.height) });
    // The OS may clamp setPosition; requested coordinates are not proof of a seat.
    const actual = this.host.position();
    return Math.hypot(actual.x + local.x * b.width - point.x, actual.y + local.y * b.height - point.y) <= 4;
  }
  private placementFailed(): void {
    if (this.phase === 'snap') this.detach();
    else this.down();
  }
  drop(): boolean {
    const point = this.point(); if (!point || !this.host.enabled() || !this.host.visible()) return false;
    const seat = dropTarget(this.windows, point, this.host.area(), this.seatOffsetY());
    if (!seat) return false;
    this.seat = seat; this.begin('snap', followSeat(this.windows, seat, this.host.area(), this.seatOffsetY())!, 180); return true;
  }
  hop(): void {
    const seat = this.target(); if (!seat) { this.send(); return; }
    this.lastHop = this.now(); this.seat = seat;
    this.begin('hop', followSeat(this.windows, seat, this.host.area(), this.seatOffsetY())!, 1040);
  }
  down(): void {
    const point = this.point(); if (!point || !this.active) return;
    this.seat = undefined;
    const b = this.host.bounds(), local = this.host.seat()!;
    this.begin('down', { x: point.x, y: this.host.ground() + local.y * b.height }, 720);
  }
  private begin(phase: 'snap' | 'hop' | 'down', to: Point, duration: number): void {
    const from = this.point(); if (!from) return;
    this.host.cancelWalk(); this.phase = phase;
    this.flight = { from, to, start: this.now(), duration }; this.send();
  }
  detach(): void { this.phase = 'free'; this.seat = undefined; this.flight = undefined; this.send(); }
  tick(): void {
    const f = this.flight; if (!f) return;
    const age = this.now() - f.start;
    let placed: boolean;
    if (this.phase === 'snap') {
      const t = Math.min(1, age / f.duration), smooth = t * t * (3 - 2 * t);
      placed = this.place({ x: f.from.x + (f.to.x - f.from.x) * smooth, y: f.from.y + (f.to.y - f.from.y) * smooth });
    } else {
      const crouch = this.phase === 'hop' ? 120 : 0, duration = this.phase === 'hop' ? 700 : 500;
      placed = this.place(arc(f.from, f.to, Math.min(1, Math.max(0, (age - crouch) / duration))));
    }
    if (!placed && this.phase !== 'down') { this.placementFailed(); return; }
    if (age >= f.duration) {
      this.phase = this.seat ? 'sit' : 'free'; this.flight = undefined; this.send();
    }
  }
}
