export type Emotion = 'happy' | 'surprised' | 'angry' | 'sad' | 'neutral';
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  emotion?: Emotion;
}
export interface Session {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type StreamEvent = { type: 'content'; text: string } | { type: 'reasoning'; text: string }
  | { type: 'done'; finishReason: string | null };
export interface ChatSettings {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  thinking?: 'auto' | 'enabled' | 'disabled';
  persona?: string;
}
