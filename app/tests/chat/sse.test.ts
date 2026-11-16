import { describe, expect, it } from 'vitest';
import { SSEParser } from '../../src/main/chat/sse';
import { ChatError } from '../../src/main/chat/errors';

describe('SSEParser', () => {
  const data = ': comment\r\n\r\ndata:\n\ndata: not-json\n\ndata: {"choices":[{"delta":{"reasoning_content":"想一想","content":"呀哈🐰"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\n\ndata: ignored\n\n';
  const expected = [
    { type: 'reasoning', text: '想一想' }, { type: 'content', text: '呀哈🐰' }, { type: 'done', finishReason: 'stop' },
  ];
  it('handles every possible byte split, including UTF-8 and CRLF boundaries', () => {
    const bytes = new TextEncoder().encode(data);
    for (let split = 0; split <= bytes.length; split++) {
      const parser = new SSEParser();
      expect([...parser.push(bytes.slice(0, split)), ...parser.push(bytes.slice(split))]).toEqual(expected);
      expect(parser.badJsonCount).toBe(1);
      expect(parser.done).toBe(true);
      expect(parser.push('data: [DONE]\n\n')).toEqual([]);
    }
  });
  it('handles individual bytes, string chunks, heartbeats, irrelevant JSON and malformed lines', () => {
    const parser = new SSEParser();
    const events = [...new TextEncoder().encode(data)].flatMap(byte => parser.push(Uint8Array.of(byte)));
    expect(events).toEqual(expected);
    const strings = new SSEParser();
    expect(strings.push('data: null\n\ndata: {}\n\ndata: {oops}\n\n')).toEqual([]);
    expect(strings.badJsonCount).toBe(1);
    expect(strings.push('data: [DO')).toEqual([]);
    expect(strings.push('NE]\n\n')).toEqual([{ type: 'done', finishReason: null }]);
  });
  it('enforces 1 MiB in bytes before an event is complete and after complete events', () => {
    const parser = new SSEParser();
    parser.push('x'.repeat(1024 * 1024));
    expect(() => parser.push('x')).toThrow(expect.objectContaining({ code: 'stream_too_large' }));
    expect(() => new SSEParser().push('兔'.repeat(350000))).toThrow(ChatError);
    expect(() => new SSEParser().push('x'.repeat(1024 * 1024 + 1) + '\n\n')).toThrow(ChatError);
    expect(() => new SSEParser().push('data:\n\n' + 'x'.repeat(1024 * 1024 + 1))).toThrow(ChatError);
  });
});
