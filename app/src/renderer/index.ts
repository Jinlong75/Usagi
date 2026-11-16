import { AmbientLight, Box3, DirectionalLight, LoadingManager, Object3D, OrthographicCamera, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { Config, PetBridge, Point, WindowInfo, SmokeBehavior, PetExpression, Rect } from '../shared/types';
import { alphaHit, canvasPixel } from '../shared/hit';
import { FrameStats, formatFps, FPS_LOG_INTERVAL_MS, renderPixelRatio } from '../shared/performance';
import { breathe } from './behaviors/breathing';
import { blink, createBlink } from './behaviors/blink';
import { cursorDirection, look, smoothDirection } from './behaviors/look';
import { BehaviorMachine, TURN_ANGLE } from './behavior/machine';
import { PetAudio } from './behavior/audio';
import { isFoodMotion } from './motion/food';
import { ARM_REST, caughtSnackPose, MotionRig, sampleMotion } from './motion';
import { PropRig } from './props';
import type { Pose } from './motion';
import { DragSprings } from './motion/springs';
import { frameBounds, measureMotionBounds, motionAspect, springEnvelope } from './motion/framing';
import { setEmotion } from './behaviors/expressions';
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
let propRig: PropRig | null = null;
let activeProps: Pose['props'];
let routineState: import('../shared/types').RoutineState = 'awake';
let routineEnabled = true;
function applyPose(pose: Pose): void { activeProps = pose.props; rig?.apply(pose); }
let springs: DragSprings | null = null;
let machine = new BehaviorMachine();
let windowInfo: WindowInfo | null = null;
let dragging = false;
let velocityX = 0;
let lastActivity = performance.now();
let animationFrame = 0;
let petVisible = true;
let neutralBounds: Box3 | null = null;
let motionBounds: Box3 | null = null;
let modelHeight = 1;
let restEars: Vector3[] = [];
let smokePose: SmokeBehavior | undefined;
let smokePoseFrames = 0;
let smokeAge = 0;
let smokeDragImpulse = false;
// TODO(lead): 冒烟段落统一写 aa，但冰淇淋动作明确要求 ih；截图保留第三次舔的 ih。
const smokeAges = { idle: 0.875, walk: 0.7, happy: 0.175, surprised: 0.45, shout: 0.55, stretch: 1.1, drag: 0.32, 'ear-shake': 0.3, jumpRope: 2.575, blowBubbles: 1.65, napPillow: 2, eatRiceball: 0.72, eatWatermelon: 0.72, iceCream: 2.3, sneakSnack: 1.6 };
let chatExpression: { name: PetExpression; until: number } | undefined;
let volume = 0.7;
let gaze = { x: 0, y: 0 };
let neckGaze = { x: 0, y: 0 };
const audio = new PetAudio((use) => window.pet.loadSound(use), () => volume);
let elapsed = 0;
let previous = performance.now();
let direction: Point = { x: 0, y: 0 };
let targetDirection: Point = { x: 0, y: 0 };
let pointer: Point = { x: -1, y: -1 };
let lastHit = false;
let pointerDown = false;
let blinkState = createBlink();
let showFps = false;
let lastFpsLoggedAt = 0;
const frameStats = new FrameStats();
const fpsOverlay = document.createElement('div');
fpsOverlay.hidden = true;
// Pure diagnostic overlay: never changes the canvas layout or alpha hit testing.
fpsOverlay.style.cssText = 'position:fixed;left:4px;top:4px;z-index:10;pointer-events:none;padding:3px 5px;background:#000b;color:white;font:12px monospace;border-radius:3px';
document.body.append(fpsOverlay);
function resetFps(): void { frameStats.reset(); lastFpsLoggedAt = performance.now(); }
function receiveConfig(config: Config): void {
  volume = config.volume;
  const routineWasEnabled = routineEnabled;
  routineEnabled = config.routine.enabled;
  if (routineWasEnabled && !routineEnabled) {
    routineState = 'awake'; machine.disableRoutine();
    propRig?.apply(); activeProps = undefined;
    wake(); flushCommands();
  }
  if (showFps !== config.showFps) {
    showFps = config.showFps; resetFps();
    fpsOverlay.hidden = !showFps;
    fpsOverlay.textContent = 'FPS 测量中…';
  }
}
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
  if (!vrm || !neutralBounds || !motionBounds) return;
  const aspect = window.innerWidth / window.innerHeight;
  const { height, bottom, centerX, centerZ, front } = frameBounds(neutralBounds, [motionBounds], aspect);
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.position.set(centerX, bottom + height / 2, front + 5);
  camera.lookAt(centerX, bottom + height / 2, centerZ);
  camera.updateProjectionMatrix();
  window.pet.framed(motionAspect(motionBounds), Math.max(0, Math.min(1, (bottom + height - neutralBounds.max.y) / height)));
}

async function loadModel(): Promise<void> {
  const generation = ++loadGeneration;
  errorText.hidden = true;
  springs?.restore();
  audio.stop();
  window.pet.cancelMove();
  propRig?.dispose(); propRig = null;
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
    // Rest the short arms at the head–body notch, angled slightly down like the reference
    // front view; 1.1 rad pulled the arm root out into a bump above each hand (用户 Windows 实测).
    loaded.humanoid.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -ARM_REST);
    loaded.humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, ARM_REST);
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
    machine.routine(routineState);
    if (!smoke && !petVisible) { machine.visibility(false); flushCommands(); }
    // Synchronous sampling finishes and restores neutral before any frame is drawn.
    const measured = measureMotionBounds(vrm, rig);
    neutralBounds = measured.neutral;
    modelHeight = measured.neutral.getSize(new Vector3()).y;
    propRig = new PropRig(vrm.scene, modelHeight, measured.neutral);
    motionBounds = springEnvelope(measured.neutral, measured.motion);
    restEars = earDirections();
    if (vrm.lookAt) { vrm.lookAt.autoUpdate = false; vrm.lookAt.target = null; }
    dragging = false;
    frameModel();
    elapsed = 0;
    smokePose = undefined;
    smokePoseFrames = 0;
    smokeAge = 0;
    gaze = { x: 0, y: 0 }; neckGaze = { x: 0, y: 0 };
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
    else if (command.type === 'activityDone') window.pet.activityDone(command.activity);
    else if (!smoke && (!dragging || command.use === 'drag')) void audio.play(command.use);
  }
}
function wake(): void { lastActivity = performance.now(); }
function renderPose(now: number, delta: number): void {
  if (!vrm || !rig) return;
  rig.reset(); activeProps = undefined;
  if (smoke) {
    const name = smokePose ?? 'idle';
    const step = Math.min(1 / 60, Math.max(0, smokeAges[name] - smokeAge));
    smokeAge += step;
    delta = step;
    applyPose(sampleMotion(name === 'ear-shake' ? 'shake' : name, smokeAge, { velocityX: 500, modelHeight }));
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
    if (state.state !== 'nap' && state.state !== 'caught' && !(state.state === 'act' && isFoodMotion(state.action))) { breathe(vrm, elapsed); blink(vrm, blinkState, elapsed); }
    else vrm.expressionManager?.setValue('blink', 0);
    // Keep the gaze tracker out of explicit head motions and reactions.
    if (state.state === 'idle') {
      const neck = vrm.humanoid.getNormalizedBoneNode('neck');
      if (neck) { neck.rotation.x = neckGaze.x; neck.rotation.y = neckGaze.y; }
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      if (head) { head.rotation.x = gaze.x; head.rotation.y = gaze.y; }
      look(vrm, lookTarget, direction, delta);
      if (head) gaze = { x: head.rotation.x, y: head.rotation.y };
      if (neck) neckGaze = { x: neck.rotation.x, y: neck.rotation.y };
      applyPose(sampleMotion(Math.floor(state.startedAt / 3500) % 2 ? 'lookAround' : 'idle', age));
    } else {
      if (vrm.lookAt) { vrm.lookAt.target = null; vrm.lookAt.reset(); }
      if (state.state === 'nap') applyPose(sampleMotion('napPillow', age, { loop: true, modelHeight }));
      else if (state.state === 'caught') {
        applyPose(caughtSnackPose(state.snackAge!, modelHeight));
      }
      else if (state.state === 'act') applyPose(sampleMotion(state.action!, age, { modelHeight }));
      else if (state.state === 'click') applyPose(sampleMotion(state.reaction!, age, { modelHeight }));
      else if (state.state === 'drag') {
        // Fade in once, then hold the suspended pose for the whole gesture.
        applyPose(sampleMotion('drag', Math.min(0.5, age + 0.001), { velocityX, modelHeight }));
      } else if (state.state === 'move') {
        applyPose(sampleMotion('walk', age, { duration, modelHeight }));
        vrm.scene.rotation.y += state.direction * TURN_ANGLE;
      } else if (state.state === 'turn') {
        const p = Math.min(1, age / duration);
        const eased = p * p * (3 - 2 * p);
        vrm.scene.rotation.y += state.fromAngle + (state.toAngle - state.fromAngle) * eased;
      }
    }
    springs?.update(delta, dragging);
    springs?.caught(state.state === 'caught');
  }
  propRig?.apply(activeProps);
  if (chatExpression && machine.snapshot.state !== 'nap' && machine.snapshot.state !== 'caught' && !isFoodMotion(machine.snapshot.action) && now < chatExpression.until) {
    if (!dragging) setEmotion(vrm, chatExpression.name);
  } else chatExpression = undefined;
  vrm.update(delta);
}
function earDirections(): Vector3[] {
  if (!vrm) return [];
  vrm.scene.updateMatrixWorld(true);
  return ['L', 'R'].flatMap(side => {
    const root = vrm!.scene.getObjectByName(`Ear${side}_1`);
    const tip = vrm!.scene.getObjectByName(`Ear${side}_Tip`);
    return root && tip ? [tip.getWorldPosition(new Vector3()).sub(root.getWorldPosition(new Vector3())).normalize()] : [];
  });
}
function earDeflection(): number {
  return Math.max(0, ...earDirections().map((direction, i) => restEars[i] ? direction.angleTo(restEars[i]!) * 180 / Math.PI : 0));
}
/** Bound the actual face patches, so expression comparison follows the jumping head. */
function faceRegion(): Rect | undefined {
  if (!vrm) return;
  const bounds = new Box3();
  for (const name of ['FaceEyes', 'FaceMouth']) {
    const mesh = vrm.scene.getObjectByName(name);
    if (mesh) bounds.union(new Box3().setFromObject(mesh, true));
  }
  if (bounds.isEmpty()) return;
  const a = bounds.min.clone().project(camera), b = bounds.max.clone().project(camera);
  return { x: (a.x + 1) / 2, y: (1 - b.y) / 2, width: (b.x - a.x) / 2, height: (b.y - a.y) / 2 };
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
  if (!smoke && window.pet.platform === 'win32') direction = smoothDirection(direction, targetDirection, delta);
  renderPose(now, delta);
  renderer.render(scene, camera);
  if (!smoke) updateHit();
  if (!smoke && showFps) {
    const sample = frameStats.frame(now);
    if (sample) {
      fpsOverlay.textContent = formatFps(sample);
      if (now - lastFpsLoggedAt >= FPS_LOG_INTERVAL_MS) {
        window.pet.reportFps(sample); lastFpsLoggedAt = now;
      }
    }
  }
  if (vrm && smoke) {
    if (smokePose ? smokeAge >= smokeAges[smokePose] && ++smokePoseFrames >= 2 && !reported : ++frames >= 60 && !reported) {
      reported = true;
      const propOpaqueRatios = propRig?.visiblePixelRatios(() => {
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const size = renderer.getDrawingBufferSize(new Vector2());
        const pixels = new Uint8Array(size.x * size.y * 4);
        gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
      });
      window.pet.rendered({ ok: true, propOpaqueRatios, propsInFrame: propRig?.inFrame(point => point.project(camera)), vrmVersion: vrm.meta.metaVersion, behavior: smokePose, face: faceRegion(), earDegrees: earDeflection(),
        expressions: vrm.expressionManager?.expressions.map((expression) => expression.expressionName) ?? [] });
    }
  }
}

try {
  // Keep MSAA for the silhouette; the Windows DPR cap bounds its fill/compositing cost.
  // The retained buffer is required by alpha readPixels outside the render callback.
  renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(renderPixelRatio(window.devicePixelRatio, window.pet.platform));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.append(renderer.domElement);
  window.addEventListener('resize', () => {
    renderer.setPixelRatio(renderPixelRatio(window.devicePixelRatio, window.pet.platform));
    renderer.setSize(window.innerWidth, window.innerHeight);
    frameModel();
  });
  window.pet.onCursor((sample) => {
    windowInfo = { bounds: sample.bounds, workArea: sample.workArea };
    const nextDirection = cursorDirection(sample.point, sample.bounds);
    if (window.pet.platform === 'win32' && (nextDirection.x !== targetDirection.x || nextDirection.y !== targetDirection.y)) wake();
    targetDirection = nextDirection;
    if (window.pet.platform !== 'win32') direction = nextDirection;
    pointer = { x: sample.point.x - sample.bounds.x, y: sample.point.y - sample.bounds.y };
    // The native cursor keeps arriving even if Windows stops forwarding DOM moves.
    // Refresh immediately from the retained frame, including while idle at 30 FPS.
    if (!smoke && petVisible && window.pet.platform === 'win32') updateHit();
  });
  void window.pet.windowInfo().then((info) => { windowInfo = info; }).catch(showError);
  window.pet.onActivity(activity => {
    if (petVisible && !dragging) { wake(); audio.stop(); machine.activity(activity); flushCommands(); }
  });
  window.pet.onRoutine(state => {
    if (!routineEnabled) return;
    routineState = state; wake(); audio.stop(); machine.routine(state); flushCommands();
  });
  window.pet.onClick(() => { if (petVisible) { wake(); machine.click(); flushCommands(); } });
  window.pet.onPress((pressed) => {
    if (!pressed) pointerDown = false;
    if (petVisible) { wake(); audio.stop(); machine.press(pressed); flushCommands(); }
  });
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
    smokeAge = 0; smokeDragImpulse = false;
    rig?.reset(); vrm?.update(0); vrm?.springBoneManager?.reset();
  });
  window.pet.onVisibility(({ visible }) => {
    if (smoke) return;
    petVisible = visible;
    machine.visibility(visible); flushCommands();
    dragging = false; velocityX = 0; pointerDown = false;
    audio.stop(); springs?.restore(); propRig?.apply();
    resetFps();
    if (!visible) {
      cancelAnimationFrame(animationFrame); animationFrame = 0;
    } else {
      wake(); previous = performance.now();
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
    }
  });
  void window.pet.getConfig().then(receiveConfig);
  window.pet.onConfig(receiveConfig);
  window.pet.onExpression(name => { chatExpression = { name, until: performance.now() + 2000 }; wake(); });
  window.pet.onSound(use => { if (!smoke && petVisible && !dragging) void audio.play(use); });
  renderer.domElement.addEventListener('contextmenu', event => {
    event.preventDefault(); pointer = { x: event.clientX, y: event.clientY };
    if (updateHit()) window.pet.contextMenu();
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
