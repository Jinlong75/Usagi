export type Size = 'small' | 'medium' | 'large';
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Config {
  modelPath: string | null;
  size: Size;
  position: Point | null;
  alwaysOnTop: boolean;
}
export interface CursorSample { point: Point; bounds: Rect }
export interface ModelData { bytes: Uint8Array; path: string; smoke: boolean }
export interface RenderResult { ok: boolean; reason?: string; vrmVersion?: string; expressions?: string[] }
export interface PetBridge {
  loadModel(): Promise<ModelData>;
  setHit(hit: boolean): void;
  beginDrag(): void;
  endDrag(cancelled: boolean): void;
  onCursor(callback: (sample: CursorSample) => void): () => void;
  onClick(callback: () => void): () => void;
  onReload(callback: () => void): () => void;
  rendered(result: RenderResult): void;
  logError(message: string): void;
}
