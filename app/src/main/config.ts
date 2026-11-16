import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from '../shared/types';

export const DEFAULT_CONFIG: Config = {
  modelPath: null, size: 'medium', position: null, alwaysOnTop: true,
  chat: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', temperature: 0.7, maxTokens: 2048, thinking: 'disabled' },
  routine: { enabled: true, quiet: false, morning: ['06:00', '10:00'], lunch: ['11:30', '13:00'],
    nap: ['13:00', '14:00'], dinner: ['17:30', '19:00'], bedtime: '22:30', sleep: ['00:00', '06:00'] },
  selfTalk: { enabled: true, minSec: 20, maxSec: 60, lines: [] }, volume: 0.7, mousePassthrough: false, showFps: false,
};
const finite = (value: unknown, fallback: number, min: number, max = Infinity) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};


export function normalizeConfig(value: unknown): Config {
  const result = structuredClone(DEFAULT_CONFIG);
  if (!value || typeof value !== 'object') return result;
  const data = value as Record<string, unknown>;
  if (typeof data.modelPath === 'string' && data.modelPath.trim()) result.modelPath = data.modelPath;
  if (data.size === 'small' || data.size === 'medium' || data.size === 'large') result.size = data.size;
  if (typeof data.alwaysOnTop === 'boolean') result.alwaysOnTop = data.alwaysOnTop;
  if (data.position && typeof data.position === 'object') {
    const { x, y } = data.position as Record<string, unknown>;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      result.position = { x: Math.round(x), y: Math.round(y) };
    }
  }
  const chat = record(data.chat), talk = record(data.selfTalk);
  for (const key of ['baseUrl', 'model'] as const) {
    if (typeof chat[key] === 'string' && chat[key].trim()) result.chat[key] = chat[key].trim();
  }
  result.chat.temperature = finite(chat.temperature, result.chat.temperature, 0, 1.5);
  result.chat.maxTokens = Math.round(finite(chat.maxTokens, result.chat.maxTokens, 1));
  if (chat.thinking === 'enabled' || chat.thinking === 'disabled') result.chat.thinking = chat.thinking;
  if (typeof talk.enabled === 'boolean') result.selfTalk.enabled = talk.enabled;
  result.selfTalk.minSec = finite(talk.minSec, result.selfTalk.minSec, 5);
  result.selfTalk.maxSec = Math.max(result.selfTalk.minSec, finite(talk.maxSec, result.selfTalk.maxSec, 5));
  if (Array.isArray(talk.lines)) result.selfTalk.lines = [...new Set(talk.lines
    .filter((line): line is string => typeof line === 'string').map(line => line.trim()).filter(Boolean))];
  const routine = record(data.routine);
  for (const key of ['enabled', 'quiet'] as const) if (typeof routine[key] === 'boolean') result.routine[key] = routine[key];
  const validTime = (time: unknown): time is string => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  for (const key of ['morning', 'lunch', 'nap', 'dinner', 'sleep'] as const) {
    const range = routine[key];
    if (Array.isArray(range) && range.length === 2) {
      result.routine[key] = [validTime(range[0]) ? range[0] : result.routine[key][0],
        validTime(range[1]) ? range[1] : result.routine[key][1]];
    }
  }
  if (validTime(routine.bedtime)) result.routine.bedtime = routine.bedtime;
  result.volume = finite(data.volume, result.volume, 0, 1);
  if (typeof data.mousePassthrough === 'boolean') result.mousePassthrough = data.mousePassthrough;
  if (typeof data.showFps === 'boolean') result.showFps = data.showFps;
  return result;
}

export function readConfig(path: string): Config {
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);
  const contents = readFileSync(path, 'utf8');
  let data: unknown;
  try { data = JSON.parse(contents); }
  catch {
    renameSync(path, path.replace(/\.json$/, '') + `.broken-${Date.now()}.json`);
    return structuredClone(DEFAULT_CONFIG);
  }
  return normalizeConfig(data);
}

export function writeConfig(path: string, config: Config): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(normalizeConfig(config), null, 2) + '\n', 'utf8');
  renameSync(temporary, path);
}
