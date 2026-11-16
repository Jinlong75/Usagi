import type { Emotion } from './types';

const emotions = { 开心: 'happy', 惊讶: 'surprised', 生气: 'angry', 难过: 'sad', 平静: 'neutral' } as const;
const tags = Object.keys(emotions).flatMap(name => [`[${name}]`, `【${name}】`]);
export function parseEmotion(text: string): { emotion: Emotion; text: string } {
  const match = /^\s*(?:\[(开心|惊讶|生气|难过|平静)\]|【(开心|惊讶|生气|难过|平静)】)/.exec(text);
  if (!match) return { emotion: 'neutral', text };
  const name = (match[1] ?? match[2]) as keyof typeof emotions;
  return { emotion: emotions[name], text: text.slice(match[0].length) };
}

export class EmotionStreamFilter {
  emotion: Emotion = 'neutral';
  private buffer = '';
  private resolved = false;

  push(chunk: string): string {
    if (this.resolved) return chunk;
    let output = '';
    // Consume only enough characters to decide, even if a whole answer arrives at once.
    for (const char of chunk) {
      if (this.resolved) { output += char; continue; }
      this.buffer += char;
      const parsed = parseEmotion(this.buffer);
      if (parsed.text !== this.buffer) {
        this.emotion = parsed.emotion;
        this.resolved = true;
        output += parsed.text;
        this.buffer = '';
      } else {
        const start = this.buffer.trimStart();
        if (this.buffer.length >= 8 || (start && !tags.some(tag => tag.startsWith(start)))) {
          this.resolved = true;
          output += this.buffer;
          this.buffer = '';
        }
      }
    }
    return output;
  }
  finish(): string {
    this.resolved = true;
    const tail = this.buffer;
    this.buffer = '';
    return tail;
  }
}
