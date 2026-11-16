import { AmbientLight, Box3, DirectionalLight, LoadingManager, Object3D, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { PetBridge, Point, WindowInfo, SmokeBehavior } from '../shared/types';
import { alphaHit, canvasPixel } from '../shared/hit';
import { breathe } from './behaviors/breathing';
import { blink, createBlink } from './behaviors/blink';
import { cursorDirection, look } from './behaviors/look';
import { BehaviorMachine, TURN_ANGLE } from './behavior/machine';
import { PetAudio } from './behavior/audio';
import { MotionRig, sampleMotion } from './motion';
import { DragSprings } from './motion/springs';
import { frameSize } from './motion/framing';
import { renderInterval } from './behavior/power';

declare global { interface Window { pet: PetBridge } }

const errorText = document.querySelector<HTMLParagraphElement>('#error')!;
let renderer: WebGLRenderer;
let vrm: VRM | null = null;
let smoke = false;
let frames = 0;
let reported = false;
let loadGeneration = 0;
let rig: MotionRig | null = null;
let springs: DragSprings | null = null;
let machine = new BehaviorMachine();
let windowInfo: WindowInfo | null = null;
let dragging = false;
let velocityX = 0;
let lastActivity = performance.now();
let animationFrame = 0;
let petVisible = true;
let neutralBounds: Box3 | null = null;
let smokePose: SmokeBehavior | undefined;
let smokePoseFrames = 0;
let smokePoseStartedAt = performance.now();
let smokeAge = 0;
let smokeDragImpulse = false;
const smokeAges = { idle: 0.875, walk: 0.7, happy: 0.175, surprised: 0.45, shout: 0.55, drag: 0.5 };
let gaze = { x: 0, y: 0 };
const audio = new PetAudio((use) => window.pet.loadSound(use));
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
  if (!vrm || !neutralBounds) return;
  const box = neutralBounds;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const aspect = window.innerWidth / window.innerHeight;
  const { height } = frameSize(size.x, size.y, aspect);
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
  springs?.restore();
  audio.stop();
  window.pet.cancelMove();
  if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); vrm = null; }
  try {
    const data = await window.pet.loadModel();
    smoke = data.smoke;
    if (smoke && !animationFrame) animationFrame = requestAnimationFrame(animate);
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
    rig = new MotionRig(vrm);
    springs = new DragSprings(vrm);
    machine = new BehaviorMachine();
    if (!smoke && !petVisible) { machine.visibility(false); flushCommands(); }
    neutralBounds = new Box3().setFromObject(vrm.scene);
    dragging = false;
    frameModel();
    elapsed = 0;
    smokePose = undefined;
    smokePoseFrames = 0;
    smokePoseStartedAt = performance.now();
    gaze = { x: 0, y: 0 };
    wake();
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

function flushCommands(): void {
  for (const command of machine.drain()) {
    if (command.type === 'cancel') window.pet.cancelMove();
    else if (command.type === 'move') window.pet.moveTo(command.request);
    else if (!smoke && (!dragging || command.use === 'drag')) void audio.play(command.use);
  }
}
function wake(): void { lastActivity = performance.now(); }
function renderPose(now: number, delta: number): void {
  if (!vrm || !rig) return;
  rig.reset();
  if (smoke) {
    const name = smokePose ?? 'idle';
    smokeAge = Math.min(smokeAges[name], (now - smokePoseStartedAt) / 1000);
    rig.apply(sampleMotion(name, smokeAge, { velocityX: 500 }));
    if (name === 'drag' && springs) {
      if (!smokeDragImpulse && smokeAge >= 0.25) {
        springs.sample({ x: 0, y: 0 }, 0); springs.sample({ x: 500, y: 0 }, 100); smokeDragImpulse = true;
      }
      springs.update(delta, true);
    } else springs?.update(delta, false);
    breathe(vrm, name === 'idle' ? smokeAge : 0);
  } else {
    const state = machine.tick(windowInfo);
    flushCommands();
    if (state.state !== 'idle') lastActivity = now;
    const age = Math.max(0, (now - state.startedAt) / 1000);
    const duration = state.durationMs / 1000;
    breathe(vrm, elapsed);
    blink(vrm, blinkState, elapsed);
    // Keep the gaze tracker out of explicit head motions and reactions.
    if (state.state === 'idle') {
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      if (head) { head.rotation.x = gaze.x; head.rotation.y = gaze.y; }
      look(vrm, lookTarget, direction, delta);
      if (head) gaze = { x: head.rotation.x, y: head.rotation.y };
      rig.apply(sampleMotion(Math.floor(state.startedAt / 3500) % 2 ? 'lookAround' : 'idle', age));
    } else {
      if (vrm.lookAt) { vrm.lookAt.target = null; vrm.lookAt.reset(); }
      if (state.state === 'act') rig.apply(sampleMotion(state.action!, age));
      else if (state.state === 'click') rig.apply(sampleMotion(state.reaction!, age));
      else if (state.state === 'drag') {
        // Fade in once, then hold the suspended pose for the whole gesture.
        rig.apply(sampleMotion('drag', Math.min(0.5, age + 0.001), { velocityX }));
      } else if (state.state === 'move') {
        rig.apply(sampleMotion('walk', age, { duration }));
        vrm.scene.rotation.y += state.direction * TURN_ANGLE;
      } else if (state.state === 'turn') {
        const p = Math.min(1, age / duration);
        const eased = p * p * (3 - 2 * p);
        vrm.scene.rotation.y += state.fromAngle + (state.toAngle - state.fromAngle) * eased;
      }
    }
    springs?.update(delta, dragging);
  }
  vrm.update(delta);
}
function animate(now: number): void {
  animationFrame = 0;
  if (!smoke && !petVisible) return;
  animationFrame = requestAnimationFrame(animate);
  const interval = smoke ? 0 : renderInterval(now, lastActivity, !petVisible);
  if (now - previous + 0.1 < interval) return;
  const delta = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  elapsed += delta;
  renderPose(now, delta);
  renderer.render(scene, camera);
  if (!smoke) updateHit();
  if (vrm && smoke) {
    if (smokePose ? smokeAge >= smokeAges[smokePose] && ++smokePoseFrames >= 2 && !reported : ++frames >= 60 && !reported) {
      reported = true;
      window.pet.rendered({ ok: true, vrmVersion: vrm.meta.metaVersion, behavior: smokePose,
        expressions: vrm.expressionManager?.expressions.map((expression) => expression.expressionName) ?? [] });
    }
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
    windowInfo = { bounds: sample.bounds, workArea: sample.workArea };
    direction = cursorDirection(sample.point, sample.bounds);
    pointer = { x: sample.point.x - sample.bounds.x, y: sample.point.y - sample.bounds.y };
  });
  void window.pet.windowInfo().then((info) => { windowInfo = info; }).catch(showError);
  window.pet.onClick(() => { if (petVisible) { wake(); machine.click(); flushCommands(); } });
  window.pet.onPress((pressed) => { if (petVisible) { wake(); audio.stop(); machine.press(pressed); flushCommands(); } });
  window.pet.onMoveDone((result) => { if (petVisible) { wake(); machine.moveDone(result); } });
  window.pet.onDrag((sample) => {
    if (!petVisible) return;
    wake();
    if (sample.active !== dragging) {
      dragging = sample.active; machine.drag(dragging); audio.stop(); flushCommands();
    }
    velocityX = sample.velocity.x;
    if (dragging) springs?.sample(sample.velocity, sample.timestamp);
    else springs?.restore();
  });
  window.pet.onSmokePose((pose) => {
    if (!smoke) return;
    springs?.restore(); smokePose = pose; smokePoseFrames = 0; reported = false;
    smokePoseStartedAt = performance.now(); smokeDragImpulse = false;
  });
  window.pet.onVisibility(({ visible }) => {
    if (smoke) return;
    petVisible = visible;
    machine.visibility(visible); flushCommands();
    dragging = false; velocityX = 0; pointerDown = false;
    audio.stop(); springs?.restore();
    if (!visible) {
      cancelAnimationFrame(animationFrame); animationFrame = 0;
    } else {
      wake(); previous = performance.now();
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
    }
  });
  window.pet.onReload(() => { void loadModel(); });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!updateHit()) return;
    void audio.unlock().catch(() => {});
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
  animationFrame = requestAnimationFrame(animate);
} catch (error) { showError(error); }
