export type Size = 'small' | 'medium' | 'large';
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Config {
  modelPath: string | null;
  size: Size;
  position: Point | null;
  alwaysOnTop: boolean;
  chat: { baseUrl: string; model: string; temperature: number; maxTokens: number; thinking: 'enabled' | 'disabled' };
  selfTalk: { enabled: boolean; minSec: number; maxSec: number; lines: string[] };
  volume: number;
  mousePassthrough: boolean;
}
export interface CursorSample { point: Point; bounds: Rect; workArea: Rect }
export interface ModelData { bytes: Uint8Array; path: string; smoke: boolean }
export interface RenderResult { ok: boolean; reason?: string; vrmVersion?: string; expressions?: string[]; behavior?: SmokeBehavior; face?: Rect; earDegrees?: number }
export interface PetBridge {
  contextMenu(): void;
  getConfig(): Promise<Config>;
  onConfig(callback: (config: Config) => void): () => void;
  onExpression(callback: (expression: PetExpression) => void): () => void;
  onSound(callback: (use: SoundUse) => void): () => void;
  loadModel(): Promise<ModelData>;
  windowInfo(): Promise<WindowInfo>;
  moveTo(request: MoveRequest): void;
  cancelMove(): void;
  loadSound(use: SoundUse): Promise<ArrayBuffer | null>;
  onMoveDone(callback: (result: MoveResult) => void): () => void;
  onVisibility(callback: (visibility: { visible: boolean }) => void): () => void;
  onPress(callback: (pressed: boolean) => void): () => void;
  onDrag(callback: (sample: DragSample) => void): () => void;
  onSmokePose(callback: (behavior: SmokeBehavior) => void): () => void;
  setHit(hit: boolean): void;
  beginDrag(): void;
  endDrag(cancelled: boolean): void;
  onCursor(callback: (sample: CursorSample) => void): () => void;
  onClick(callback: () => void): () => void;
  onReload(callback: () => void): () => void;
  rendered(result: RenderResult): void;
  framed(aspect: number, headTop: number): void;
  logError(message: string): void;
}

export interface MoveRequest extends Point { durationMs: number }
export type MoveResult = { ok: true; distance: number } | { ok: false; reason: string };
export interface WindowInfo { bounds: Rect; workArea: Rect }
export interface DragSample { active: boolean; velocity: Point; timestamp: number }
export type SoundUse = 'click_happy' | 'click_surprise' | 'click_shout' | 'drag' | 'idle_talk' | 'chat_reply';
export type SmokeBehavior = 'idle' | 'walk' | 'happy' | 'surprised' | 'shout' | 'stretch' | 'drag' | 'ear-shake';

export type PetExpression = 'happy' | 'surprised' | 'angry' | 'sad';
