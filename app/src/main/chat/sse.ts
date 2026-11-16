import { ChatError } from './errors';
import type { StreamEvent } from './types';

const LIMIT = 1024 * 1024;
export class SSEParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  done = false;
  badJsonCount = 0;
  finishReason: string | null = null;

  push(chunk: Uint8Array | string): StreamEvent[] {
    if (this.done) return [];
    this.buffer += typeof chunk === 'string' ? this.decoder.decode() + chunk : this.decoder.decode(chunk, { stream: true });
    const result: StreamEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const event = this.buffer.slice(0, match.index);
      if (Buffer.byteLength(event) > LIMIT) throw new ChatError('stream_too_large');
      this.buffer = this.buffer.slice(match.index + match[0].length);
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          this.done = true;
          result.push({ type: 'done', finishReason: this.finishReason });
          this.buffer = '';
          return result;
        }
        let value;
        try { value = JSON.parse(data); }
        catch { this.badJsonCount++; continue; }
        const choice = value?.choices?.[0];
        if (typeof choice?.delta?.reasoning_content === 'string' && choice.delta.reasoning_content) {
          result.push({ type: 'reasoning', text: choice.delta.reasoning_content });
        }
        if (typeof choice?.delta?.content === 'string' && choice.delta.content) result.push({ type: 'content', text: choice.delta.content });
        if (typeof choice?.finish_reason === 'string') this.finishReason = choice.finish_reason;
      }
    }
    if (Buffer.byteLength(this.buffer) > LIMIT) throw new ChatError('stream_too_large');
    return result;
  }
}
