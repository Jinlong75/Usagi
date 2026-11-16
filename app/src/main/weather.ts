import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { inRange } from './routine';

const HOUR = 60 * 60_000;
const SOURCES = ['https://api.ip.sb/geoip', 'https://get.geojs.io/v1/ip/geo.json'];
interface Location { latitude: number; longitude: number; city: string; at: number }
interface Forecast { code: number; min: number; max: number; rain: number; at: number; latitude: number; longitude: number }
interface Cache { location?: Location; forecast?: Forecast }
export interface WeatherOptions {
  path: string; fetch: typeof fetch; now(): number; enabled(): boolean;
  log?: (reason: string) => void;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const fresh = (at: number, now: number, ttl: number) => finite(at) && now >= at && now - at < ttl;
function validLocation(value: Location | undefined): value is Location {
  return !!value && finite(value.latitude) && finite(value.longitude) && typeof value.city === 'string' && finite(value.at);
}
function validForecast(value: Forecast | undefined): value is Forecast {
  return !!value && [value.code, value.min, value.max, value.rain, value.at, value.latitude, value.longitude].every(finite);
}
function readCache(path: string): Cache {
  if (!existsSync(path)) return {};
  const cache: Cache = JSON.parse(readFileSync(path, 'utf8'));
  if (!cache || typeof cache !== 'object' || (cache.location !== undefined && !validLocation(cache.location))
    || (cache.forecast !== undefined && !validForecast(cache.forecast))) throw new Error('缓存字段无效');
  return cache;
}
export function weatherWord(code: number): string {
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '多云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '雾';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code === 65 || code === 67) return '大雨';
  if (code >= 61 && code <= 67) return '雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code === 85 || code === 86) return '阵雪';
  if (code >= 95 && code <= 99) return '雷雨';
  return '';
}
export class Weather {
  private pending?: Promise<string | null>;
  constructor(private options: WeatherOptions) {}
  private log(error: unknown): void {
    (this.options.log ?? (reason => console.error(`[weather] ${reason}`)))(String(error).replace(/[\r\n]+/g, ' '));
  }
  private cache(): Cache {
    try { return readCache(this.options.path); }
    catch (error) { this.log(`缓存读取失败：${String(error)}`); return {}; }
  }
  city(): string | null { return this.cache().location?.city || null; }
  private save(cache: Cache): void {
    mkdirSync(dirname(this.options.path), { recursive: true });
    writeFileSync(`${this.options.path}.tmp`, JSON.stringify(cache) + '\n', 'utf8');
    renameSync(`${this.options.path}.tmp`, this.options.path);
  }
  private async json(url: string): Promise<any> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await this.options.fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new Error('请求超时（5 秒）'));
        }, 5000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  line(): Promise<string | null> {
    if (!this.options.enabled()) return Promise.resolve(null);
    if (!this.pending) this.pending = this.lookup().finally(() => { this.pending = undefined; });
    return this.pending.then(line => this.options.enabled() ? line : null);
  }
  private async lookup(): Promise<string | null> {
    try {
      const cache = this.cache();
      let location = cache.location;
      if (!location || !fresh(location.at, this.options.now(), 24 * HOUR)) {
        location = undefined;
        for (const [index, source] of SOURCES.entries()) {
          if (!this.options.enabled()) return null;
          try {
            const data = await this.json(source);
            const coordinate = (value: unknown) => index === 1 && typeof value === 'string' && value.trim() ? Number(value) : value;
            const latitude = coordinate(data.latitude), longitude = coordinate(data.longitude);
            if (!finite(latitude) || !finite(longitude) || typeof data.city !== 'string' || !data.city.trim()) throw new Error('定位字段缺失或无效');
            location = { latitude, longitude, city: data.city, at: this.options.now() }; break;
          } catch (error) { this.log(`${source}：${String(error)}`); }
        }
        if (!location) return null;
        cache.location = location; this.save(cache);
      }
      let forecast = cache.forecast;
      if (!forecast || !fresh(forecast.at, this.options.now(), HOUR)
        || forecast.latitude !== location.latitude || forecast.longitude !== location.longitude) {
        if (!this.options.enabled()) return null;
        const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
          latitude: String(location.latitude), longitude: String(location.longitude), current: 'temperature_2m,weather_code',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '1',
        });
        const data = await this.json(url), daily = data.daily;
        forecast = { code: daily?.weather_code?.[0], min: daily?.temperature_2m_min?.[0], max: daily?.temperature_2m_max?.[0],
          rain: daily?.precipitation_probability_max?.[0], at: this.options.now(), latitude: location.latitude, longitude: location.longitude };
        if (!validForecast(forecast)) throw new Error('天气字段缺失或无效');
        cache.forecast = forecast; this.save(cache);
      }
      const word = weatherWord(forecast.code);
      return `今天${word ? word + '，' : ''}${Math.round(forecast.min)}～${Math.round(forecast.max)}°C${forecast.rain >= 50 ? '，记得带伞' : ''}`;
    } catch (error) { this.log(error); return null; }
  }
}

/** Check immediately and every 30 seconds, stopping after the startup five-minute window. */
export function prefetchMorning(weather: Pick<Weather, 'line'>, config: () => { weather: boolean; morning: [string, string] }, now = () => new Date()): () => void {
  const started = now().getTime();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => clearInterval(timer);
  const check = () => {
    if (now().getTime() - started > 5 * 60_000) { stop(); return; }
    const settings = config();
    if (settings.weather && inRange(now(), settings.morning)) { stop(); void weather.line(); }
  };
  timer = setInterval(check, 30_000); check();
  return stop;
}
