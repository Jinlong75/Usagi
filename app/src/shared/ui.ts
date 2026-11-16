import type { ChatEvent } from '../main/chat/service';
import type { Emotion, Session } from '../main/chat/types';
import type { SaveKeyResult } from '../main/chat/keyStore';
import type { Config, PetExpression, Rect } from './types';
export type { ChatEvent };
export const emotionEmoji: Record<Emotion, string> = { happy: '😆', surprised: '😮', angry: '😤', sad: '🥺', neutral: '🙂' };
export function emotionExpression(emotion: Emotion): PetExpression | null { return emotion === 'neutral' ? null : emotion; }
export function typewriterCount(pending: number): number { return Math.max(1, Math.min(10, Math.ceil(pending / 40))); }
export function preview(text: string, length = 60): string { const chars = Array.from(text); return chars.slice(0, length).join('') + (chars.length > length ? '…' : ''); }
export type BubbleSide = 'top' | 'left' | 'right';
export function bubblePosition(pet: Rect, area: Rect, width: number, height: number): Rect & { side: BubbleSide } {
  const side: BubbleSide = pet.y - area.y >= height + 8 ? 'top' :
    pet.x - area.x > area.x + area.width - pet.x - pet.width ? 'left' : 'right';
  const x = side === 'top' ? pet.x + (pet.width - width) / 2 : side === 'left' ? pet.x - width - 8 : pet.x + pet.width + 8;
  const y = side === 'top' ? pet.y - height - 8 : pet.y + (pet.height - height) / 2;
  return { x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, x))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height, y))), width, height, side };
}
export function companionBounds(pet: Rect, area: Rect, width: number, height: number): Rect {
  width = Math.min(width, area.width); height = Math.min(height, area.height);
  const left = pet.x - area.x, right = area.x + area.width - pet.x - pet.width;
  const x = right >= width + 8 || right >= left ? pet.x + pet.width + 8 : pet.x - width - 8;
  return { x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, x))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height, pet.y + (pet.height - height) / 2))), width, height };
}
export function menuState(config: Config, visible: boolean) {
  return { selfTalk: config.selfTalk.enabled, mousePassthrough: config.mousePassthrough,
    alwaysOnTop: config.alwaysOnTop, size: config.size, visibility: visible ? '隐藏桌宠' : '显示桌宠' };
}
export interface SettingsSnapshot { config: Config; maskedKey: string; needsReentry: boolean; version: string }
export interface ChatSnapshot { session: Session; active: boolean; text: string }
export interface ChatBridge {
  load(): Promise<ChatSnapshot>;
  send(text: string): Promise<{ requestId?: string; message?: string }>;
  stop(): Promise<void>;
  clear(): Promise<boolean>;
  settings(): void;
  onEvent(callback: (event: ChatEvent) => void): () => void;
}
export interface SettingsBridge {
  load(): Promise<SettingsSnapshot>;
  save(config: Config, key?: string): Promise<{ config: Config; key?: SaveKeyResult; maskedKey: string }>;
  revealKey(): Promise<string>;
  test(): Promise<{ ok: true; models: string[] } | { ok: false; message: string }>;
  onConfig(callback: (config: Config) => void): () => void;
  onSaveClose(callback: () => void): () => void;
  closeReady(): void;
}
export interface BubbleBridge {
  onText(callback: (value: { text: string; side: BubbleSide; visible: boolean }) => void): () => void;
  resize(height: number): void;
}
