import type { Point, Rect } from '../../shared/types';

/** Native application windows, in front-to-back order. Titles are deliberately not collected. */
export interface WindowInfo { id: string; bounds: Rect; minimized: boolean; ownerPid?: number; title?: string }
export interface Seat { id: string; offsetX: number }
export const HOP_COOLDOWN = 10 * 60_000;
const contains = (r: Rect, p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
/** seatOffsetY is the reported local seat coordinate multiplied by the pet window height, in DIP. */
export function canSit(windows: WindowInfo[], index: number, x: number, area: Rect, seatOffsetY = 0): boolean {
  const target = windows[index];
  if (!target || target.minimized) return false;
  const r = target.bounds;
  return r.width >= 240 && r.y >= area.y + 40 && r.y < area.y + area.height &&
    r.y - seatOffsetY >= area.y &&
    x >= Math.max(r.x + 30, area.x) && x <= Math.min(r.x + r.width - 30, area.x + area.width) &&
    !windows.slice(0, index).some(w => !w.minimized && contains(w.bounds, { x, y: r.y }));
}
export function dropTarget(windows: WindowInfo[], seat: Point, area: Rect, seatOffsetY = 0): Seat | undefined {
  const i = windows.findIndex((w, i) => Math.abs(w.bounds.y - seat.y) <= 30 && canSit(windows, i, seat.x, area, seatOffsetY));
  return i < 0 ? undefined : { id: windows[i]!.id, offsetX: seat.x - windows[i]!.bounds.x };
}
export function followSeat(windows: WindowInfo[], seat: Seat, area: Rect, seatOffsetY = 0): Point | undefined {
  const i = windows.findIndex(w => w.id === seat.id);
  const target = windows[i];
  if (!target) return;
  const x = target.bounds.x + seat.offsetX;
  return canSit(windows, i, x, area, seatOffsetY) ? { x, y: target.bounds.y } : undefined;
}
/** Search exposed intervals too, so a covered centre does not hide a usable edge. */
export function hopTarget(windows: WindowInfo[], seat: Point, area: Rect,
  options: { enabled: boolean; auto: boolean; fullscreen: boolean; now: number; lastHop: number }, seatOffsetY = 0): Seat | undefined {
  if (!options.enabled || !options.auto || options.fullscreen || options.now - options.lastHop < HOP_COOLDOWN) return;
  const candidates = windows.flatMap((w, i) => {
    const r = w.bounds;
    if (r.y >= seat.y) return [];
    const left = Math.max(r.x + 30, seat.x - 400, area.x), right = Math.min(r.x + r.width - 30, seat.x + 400, area.x + area.width);
    const xs = [Math.max(left, Math.min(right, seat.x)), left, right,
      ...windows.slice(0, i).flatMap(w => [w.bounds.x - 1, w.bounds.x + w.bounds.width + 1])];
    return xs.filter(x => x >= left && x <= right && canSit(windows, i, x, area, seatOffsetY)).map(x =>
      ({ id: w.id, offsetX: x - r.x, distance: Math.hypot(x - seat.x, r.y - seat.y) }));
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0];
}
export function coversDisplay(window: WindowInfo | undefined, display: Rect): boolean {
  if (!window || window.minimized) return false;
  const r = window.bounds;
  return Math.abs(r.x - display.x) <= 2 && Math.abs(r.y - display.y) <= 2 &&
    Math.abs(r.x + r.width - display.x - display.width) <= 2 && Math.abs(r.y + r.height - display.y - display.height) <= 2;
}
/** A ballistic arc with a specified apex above both endpoints. */
export function arc(from: Point, to: Point, t: number, clearance = 60): Point {
  const rise = Math.max(0, from.y - to.y) + clearance, fall = Math.max(0, to.y - from.y) + clearance;
  const a = (Math.sqrt(rise) + Math.sqrt(fall)) ** 2;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - a * t * (1 - t) };
}
