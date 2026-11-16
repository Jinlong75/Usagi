import { AmbientLight, Box3, DirectionalLight, LoadingManager, Object3D, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { PetBridge, Point } from '../shared/types';
import { alphaHit, canvasPixel } from '../shared/hit';
import { breathe } from './behaviors/breathing';
import { blink, createBlink } from './behaviors/blink';
import { cursorDirection, look } from './behaviors/look';
import { click } from './behaviors/click';

declare global { interface Window { pet: PetBridge } }

const errorText = document.querySelector<HTMLParagraphElement>('#error')!;
let renderer: WebGLRenderer;
let vrm: VRM | null = null;
let smoke = false;
let frames = 0;
let reported = false;
let loadGeneration = 0;
let baseY = 0;
let clickAt = -Infinity;
let elapsed = 0;
let previous = performance.now();
let direction: Point = { x: 0, y: 0 };
let pointer: Point = { x: -1, y: -1 };
let lastHit = false;
let pointerDown = false;
let blinkState = createBlink();
const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
const lookTarget = new Object3D();
scene.add(lookTarget);
scene.add(new AmbientLight(0xffffff, 1.6));
const light = new DirectionalLight(0xffffff, 2.5);
light.position.set(-1, 2, 3);
scene.add(light);

function showError(error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  errorText.textContent = `模型加载失败：${reason}`;
  errorText.hidden = false;
  window.pet.logError(reason);
  window.pet.rendered({ ok: false, reason });
}

function frameModel(): void {
  if (!vrm) return;
  const box = new Box3().setFromObject(vrm.scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const aspect = window.innerWidth / window.innerHeight;
  const height = Math.max(size.y / 0.9, size.x / aspect / 0.9, 0.1);
  // The bottom 5% stays below the soles, even when width determines the framing.
  const bottom = box.min.y - height * 0.05;
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.position.set(center.x, bottom + height / 2, box.max.z + 5);
  camera.lookAt(center.x, bottom + height / 2, center.z);
  camera.updateProjectionMatrix();
}

async function loadModel(): Promise<void> {
  const generation = ++loadGeneration;
  errorText.hidden = true;
  if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); vrm = null; }
  try {
    const data = await window.pet.loadModel();
    smoke = data.smoke;
    const failedResources: string[] = [];
    const manager = new LoadingManager();
    manager.onError = (url) => failedResources.push(url);
    const loader = new GLTFLoader(manager);
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const bytes = new Uint8Array(data.bytes).buffer;
    const gltf = await loader.parseAsync(bytes, '');
    const loaded = gltf.userData.vrm as VRM | undefined;
    if (!loaded) throw new Error('文件中没有 VRM 角色');
    if (generation !== loadGeneration) { VRMUtils.deepDispose(loaded.scene); return; }
    if (failedResources.length) {
      VRMUtils.deepDispose(loaded.scene);
      throw new Error(`模型资源加载失败（${failedResources.length} 项）`);
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(loaded);
    VRMUtils.rotateVRM0(loaded);
    loaded.scene.traverse((object) => { object.frustumCulled = false; });
    // A relaxed arm pose makes a humanoid placeholder stand naturally.
    loaded.humanoid.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.1);
    loaded.humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.1);
    loaded.update(0);
    vrm = loaded;
    scene.add(vrm.scene);
    const center = new Box3().setFromObject(vrm.scene).getCenter(new Vector3());
    vrm.scene.position.x -= center.x;
    vrm.scene.position.z -= center.z;
    vrm.scene.updateMatrixWorld(true);
    baseY = vrm.scene.position.y;
    frameModel();
    elapsed = 0;
    clickAt = -Infinity;
    blinkState = createBlink();
    frames = 0;
    reported = false;
  } catch (error) { if (generation === loadGeneration) showError(error); }
}

const pixel = new Uint8Array(4);
function updateHit(): boolean {
  const rect = renderer.domElement.getBoundingClientRect();
  const location = canvasPixel(pointer, { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    renderer.domElement.width, renderer.domElement.height);
  let hit = false;
  if (location && vrm) {
    const gl = renderer.getContext();
    gl.readPixels(location.x, location.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    hit = alphaHit(pixel[3]!);
  }
  if (hit !== lastHit) { lastHit = hit; window.pet.setHit(hit); }
  return hit;
}

function animate(now: number): void {
  requestAnimationFrame(animate);
  const delta = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (vrm) {
    elapsed += delta;
    breathe(vrm, elapsed);
    blink(vrm, blinkState, elapsed);
    look(vrm, lookTarget, direction, delta);
    click(vrm, elapsed - clickAt, baseY);
    vrm.update(delta);
  }
  renderer.render(scene, camera);
  if (!smoke) updateHit();
  if (vrm && smoke && ++frames >= 60 && !reported) {
    reported = true;
    window.pet.rendered({ ok: true, vrmVersion: vrm.meta.metaVersion,
      expressions: vrm.expressionManager?.expressions.map((expression) => expression.expressionName) ?? [] });
  }
}

try {
  renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.append(renderer.domElement);
  window.addEventListener('resize', () => {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    frameModel();
  });
  window.pet.onCursor((sample) => {
    direction = cursorDirection(sample.point, sample.bounds);
    pointer = { x: sample.point.x - sample.bounds.x, y: sample.point.y - sample.bounds.y };
  });
  window.pet.onClick(() => { clickAt = elapsed; });
  window.pet.onReload(() => { void loadModel(); });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!updateHit()) return;
    pointerDown = true;
    renderer.domElement.setPointerCapture(event.pointerId);
    window.pet.beginDrag();
  });
  const end = (cancelled: boolean) => {
    if (!pointerDown) return;
    pointerDown = false;
    window.pet.endDrag(cancelled);
  };
  renderer.domElement.addEventListener('pointerup', (event) => { if (event.button === 0) end(false); });
  renderer.domElement.addEventListener('pointercancel', () => end(true));
  renderer.domElement.addEventListener('lostpointercapture', () => end(true));
  window.addEventListener('blur', () => end(true));
  renderer.domElement.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  });
  void loadModel();
  requestAnimationFrame(animate);
} catch (error) { showError(error); }
