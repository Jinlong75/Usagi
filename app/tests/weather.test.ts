import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prefetchMorning, Weather } from '../src/main/weather';

let directory: string;
const HOUR = 3_600_000;
const geo = { latitude: 13.75, longitude: 100.5, city: 'Bangkok' };
const forecast = (code = 0, rain = 49) => ({ daily: { weather_code: [code], temperature_2m_min: [12.4],
  temperature_2m_max: [20.6], precipitation_probability_max: [rain] } });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function setup() {
  let now = new Date(2026, 10, 16, 7).getTime(), enabled = true;
  const fetcher = vi.fn<typeof fetch>(async url => response(String(url).includes('open-meteo') ? forecast() : geo));
  const log = vi.fn(), path = join(directory, 'weather-cache.json');
  const options = { path, fetch: fetcher, now: () => now, enabled: () => enabled, log };
  return { weather: new Weather(options), fetcher, options, path, log,
    advance: (ms: number) => { now += ms; }, disable: () => { enabled = false; } };
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'usagi-weather-')); });
afterEach(() => { vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }); });

describe('IP weather without network', () => {
  it('falls back in order, converting geojs strings and exposing only cached city', async () => {
    const c = setup(); expect(c.weather.city()).toBeNull(); expect(c.fetcher).not.toHaveBeenCalled();
    c.fetcher.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response({ ...geo, latitude: '13.75', longitude: '100.5' }));
    expect(await c.weather.line()).toBe('今天晴，12～21°C');
    expect(c.fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      'https://api.ip.sb/geoip', 'https://get.geojs.io/v1/ip/geo.json', expect.stringContaining('api.open-meteo.com')]);
    expect(c.weather.city()).toBe('Bangkok');
  });
  it('returns null if both locations fail, including nonfinite or missing coordinates', async () => {
    const c = setup(); c.fetcher.mockResolvedValueOnce(response({ ...geo, latitude: null })).mockResolvedValueOnce(response({ ...geo, longitude: 'NaN' }));
    expect(await c.weather.line()).toBeNull(); expect(c.fetcher).toHaveBeenCalledTimes(2); expect(c.log).toHaveBeenCalledTimes(2);
  });
  it('persists weather for one hour and location for 24 hours across instances', async () => {
    const c = setup(); await c.weather.line(); c.fetcher.mockClear(); c.advance(HOUR - 1);
    expect(await new Weather(c.options).line()).toBe('今天晴，12～21°C'); expect(c.fetcher).not.toHaveBeenCalled();
    c.advance(1); await c.weather.line(); expect(c.fetcher).toHaveBeenCalledTimes(1);
    expect(String(c.fetcher.mock.calls[0]![0])).toContain('open-meteo');
    c.advance(23 * HOUR); await c.weather.line(); expect(c.fetcher).toHaveBeenCalledTimes(3);
    expect(String(c.fetcher.mock.calls[1]![0])).toContain('ip.sb');
    expect(JSON.parse(readFileSync(c.path, 'utf8')).location.at).toBe(c.options.now());
  });
  it.each([[0, '晴'], [1, '多云'], [2, '多云'], [3, '阴'], [45, '雾'], [48, '雾'], [51, '毛毛雨'],
    [57, '毛毛雨'], [61, '雨'], [65, '大雨'], [67, '大雨'], [71, '雪'], [77, '雪'], [80, '阵雨'],
    [82, '阵雨'], [85, '阵雪'], [86, '阵雪'], [95, '雷雨'], [99, '雷雨'], [100, '']])('WMO %s and rounded temperatures', async (code, word) => {
    const c = setup(); c.fetcher.mockResolvedValueOnce(response(geo)).mockResolvedValueOnce(response(forecast(Number(code))));
    expect(await c.weather.line()).toBe(`今天${word ? word + '，' : ''}12～21°C`);
  });
  it.each([49, 50, 100])('umbrella at precipitation %s', async rain => {
    const c = setup(); c.fetcher.mockResolvedValueOnce(response(geo)).mockResolvedValueOnce(response(forecast(0, rain)));
    expect(await c.weather.line()).toBe('今天晴，12～21°C' + (rain >= 50 ? '，记得带伞' : ''));
  });
  it('times out even when injected fetch ignores abort', async () => {
    vi.useFakeTimers(); const c = setup(); c.fetcher.mockImplementation(() => new Promise(() => {}));
    const pending = c.weather.line(); await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull(); expect(c.fetcher).toHaveBeenCalledTimes(2);
    expect((c.fetcher.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['http', 'missing', 'timeout'])('weather failure %s returns null', async failure => {
    vi.useFakeTimers(); const c = setup(); c.fetcher.mockResolvedValueOnce(response(geo));
    if (failure === 'http') c.fetcher.mockResolvedValueOnce(response({}, 500));
    else if (failure === 'missing') c.fetcher.mockResolvedValueOnce(response({ daily: {} }));
    else c.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const pending = c.weather.line(); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull(); expect(c.log).toHaveBeenCalled();
  });
  it('disabled weather never requests, including with populated cache', async () => {
    const c = setup(); c.disable(); expect(await c.weather.line()).toBeNull(); expect(c.fetcher).not.toHaveBeenCalled();
    const d = setup(); await d.weather.line(); d.fetcher.mockClear(); d.disable();
    expect(await d.weather.line()).toBeNull(); expect(d.fetcher).not.toHaveBeenCalled();
  });
  it.each(['{broken', '{"location":{"latitude":null}}'])('recovers corrupt cache %s', async contents => {
    const c = setup(); writeFileSync(c.path, contents);
    expect(await c.weather.line()).toBe('今天晴，12～21°C'); expect(c.fetcher).toHaveBeenCalledTimes(2);
    expect(c.log).toHaveBeenCalled();
  });
  it('coalesces simultaneous greeting and prefetch requests', async () => {
    const c = setup(); expect(await Promise.all([c.weather.line(), c.weather.line()])).toEqual(['今天晴，12～21°C', '今天晴，12～21°C']);
    expect(c.fetcher).toHaveBeenCalledTimes(2);
  });
  it('stops before starting weather if disabled during location', async () => {
    const c = setup(); c.fetcher.mockImplementationOnce(async () => { c.disable(); return response(geo); });
    expect(await c.weather.line()).toBeNull(); expect(c.fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('startup prefetch', () => {
  it('prefetches once immediately in the morning', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 7));
    const line = vi.fn(async () => null); prefetchMorning({ line }, () => ({ weather: true, morning: ['06:00', '10:00'] }));
    await vi.advanceTimersByTimeAsync(6 * 60_000); expect(line).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([true, false])('checks morning within five minutes, enabled=%s', async weather => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 5, 58));
    const line = vi.fn(async () => null); prefetchMorning({ line }, () => ({ weather, morning: ['06:00', '10:00'] }));
    await vi.advanceTimersByTimeAsync(6 * 60_000); expect(line).toHaveBeenCalledTimes(weather ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('expires or cancels outside morning', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 5, 54));
    const line = vi.fn(async () => null); prefetchMorning({ line }, () => ({ weather: true, morning: ['06:00', '10:00'] }));
    await vi.advanceTimersByTimeAsync(7 * 60_000); expect(line).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    const stop = prefetchMorning({ line }, () => ({ weather: false, morning: ['06:00', '10:00'] })); stop(); expect(vi.getTimerCount()).toBe(0);
  });
});
