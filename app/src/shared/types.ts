import type { BubbleBridge, ChatBridge, SettingsBridge } from './ui';
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
  routine: {
    enabled: boolean; quiet: boolean; weather: boolean;
    morning: [string, string]; lunch: [string, string]; nap: [string, string]; dinner: [string, string];
    bedtime: string; sleep: [string, string];
  };
  volume: number;
  mousePassthrough: boolean;
  showFps: boolean;
}
export interface FpsSample { fps: number; maxFrameMs: number }
export interface CursorSample { point: Point; bounds: Rect; workArea: Rect }
export interface ModelData { bytes: Uint8Array; path: string; smoke: boolean }
export interface RenderResult { ok: boolean; reason?: string; vrmVersion?: string; expressions?: string[]; behavior?: SmokeBehavior; face?: Rect; earDegrees?: number; propOpaqueRatios?: Record<string, number>; propsInFrame?: boolean }
export type FoodActivity = 'eatRiceball' | 'eatWatermelon' | 'iceCream';
export type Activity = 'jumpRope' | 'blowBubbles' | FoodActivity;
export interface FeedRequest { activity: FoodActivity; feedId: number }
export type ActivityRequest = Exclude<Activity, FoodActivity> | FeedRequest;
export type RoutineState = 'nap' | 'sleep' | 'awake';
export interface PetBridge {
  readonly platform: string;
  reportFps(sample: FpsSample): void;
  contextMenu(): void;
  getConfig(): Promise<Config>;
  activityDone(request: FeedRequest): void;
  onActivity(callback: (request: ActivityRequest) => void): () => void;
  onRoutine(callback: (state: RoutineState) => void): () => void;
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
export type SmokeBehavior = 'idle' | 'walk' | 'happy' | 'surprised' | 'shout' | 'stretch' | 'drag' | 'ear-shake' | Activity | 'napPillow' | 'sneakSnack';

export type PetExpression = 'happy' | 'surprised' | 'angry' | 'sad';

/** Question bubbles share the ordinary bubble payload and add a trusted answer action. */
export interface QuestionBubbleBridge extends BubbleBridge {
  onText(callback: (value: { text: string; side: import('./ui').BubbleSide; visible: boolean; question: boolean }) => void): () => void;
  answer(): Promise<void>;
}

/** Reload persisted routine questions without discarding a hidden chat's draft. */
export interface RoutineChatBridge extends ChatBridge {
  onHistoryChanged(callback: () => void): () => void;
}

export interface WeatherSettingsBridge extends SettingsBridge {
  weatherCity(): Promise<string | null>;
}
