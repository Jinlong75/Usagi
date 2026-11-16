import { BackSide, Box3, BufferGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshBasicMaterial,
  Object3D, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';

export const PROP_COLORS = { outline: '#2b1a14', handles: '#e8584f', rope: '#f2c94c', wand: '#7ec8e3', bubbles: '#bfe8ff', pillow: '#f6e7c8' } as const;
// Rest hand centers measured on the deployed VRM: ±0.3284H, y=0.2626H.
// Handles sit just outside the hand surface (±0.3466H), rather than inside the torso.
export const ROPE_SPAN = 0.355;
export const ROPE_PIVOT_Y = 0.263;
export const ROPE_RADIUS = 0.285;
export type PropName = 'handles' | 'rope' | 'wand' | 'bubble' | 'pillow';
type Triple = [number, number, number];
export interface PropState { name: PropName; position: Triple; rotation?: Triple; scale?: Triple; visible?: boolean; opacity?: number }
export interface PropHandle { group: Group; apply(state: PropState): void; dispose(): void }

/** Unit geometry and translations are fractions of neutral height H.
 * Usagi is VRM 1; FaceMouth is on +Z, viewed by our +Z camera. rotateVRM0
 * normalizes older imports to this same front direction before props are attached. */
export function createProp(name: PropName): PropHandle {
  const group = new Group(); group.name = `prop:${name}`;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshBasicMaterial>();
  const add = (geometry: BufferGeometry, color: string, position: Triple = [0, 0, 0], opacity = 1) => {
    geometries.add(geometry);
    const part = new Group(); part.position.set(...position); group.add(part);
    // Even translucent fills write depth: the enlarged back shell then contributes
    // only its rim, rather than tinting the entire blue bubble brown a second time.
    const material = new MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: true });
    const outline = new MeshBasicMaterial({ color: PROP_COLORS.outline, side: BackSide, toneMapped: false,
      transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    materials.add(material); materials.add(outline);
    part.add(new Mesh(geometry, material));
    const shell = new Mesh(geometry, outline); shell.scale.setScalar(1.035); part.add(shell);
    return part;
  };
  if (name === 'handles') {
    for (const x of [-ROPE_SPAN, ROPE_SPAN]) add(new CylinderGeometry(0.009, 0.009, 0.06, 12), PROP_COLORS.handles, [x, 0, 0]);
  } else if (name === 'rope') {
    // Open U: its ends stay at the handles while the arc rotates around the X axis.
    const points = Array.from({ length: 33 }, (_, i) => {
      const a = i / 32 * Math.PI;
      return new Vector3(-ROPE_SPAN * Math.cos(a), -ROPE_RADIUS * Math.sin(a), 0);
    });
    add(new TubeGeometry(new CatmullRomCurve3(points), 64, 0.004, 8, false), PROP_COLORS.rope);
  } else if (name === 'wand') {
    add(new TorusGeometry(0.035, 0.005, 8, 24), PROP_COLORS.wand);
    add(new CylinderGeometry(0.005, 0.005, 0.075, 12), PROP_COLORS.wand, [0, -0.07, 0]);
  } else if (name === 'bubble') {
    add(new SphereGeometry(1, 20, 12), PROP_COLORS.bubbles, [0, 0, 0], 0.45);
  } else {
    // Scaled sphere gives a soft rounded pillow with exact 0.42 × 0.18 × 0.12H dimensions.
    add(new SphereGeometry(1, 24, 16).scale(0.21, 0.09, 0.06), PROP_COLORS.pillow);
  }
  let disposed = false;
  return { group, apply(state) {
    group.visible = !disposed && state.visible !== false;
    group.position.set(...state.position); group.rotation.set(...(state.rotation ?? [0, 0, 0]));
    group.scale.set(...(state.scale ?? [1, 1, 1]));
    for (const material of materials) {
      material.opacity = state.opacity ?? (name === 'bubble' ? 0.45 : 1);
      material.transparent = material.opacity < 1; material.depthWrite = !material.transparent || material.side !== BackSide;
    }
  }, dispose() {
    if (disposed) return;
    disposed = true; group.visible = false; group.removeFromParent();
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  } };
}

/** Missing/hidden props are disposed immediately; no geometry accumulates across clips. */
export class PropRig {
  private handles = new Map<string, PropHandle>();
  private anchor = new Group();
  constructor(root: Object3D, height: number, neutral: Box3) {
    this.anchor.name = 'props';
    const center = neutral.getCenter(new Vector3()); center.y = neutral.min.y;
    this.anchor.position.copy(root.worldToLocal(center)); this.anchor.scale.setScalar(height);
    root.add(this.anchor);
  }
  apply(states: Record<string, PropState> = {}): void {
    for (const [key, handle] of this.handles) {
      if (!states[key] || states[key]!.visible === false || handle.group.userData.propName !== states[key]!.name) {
        handle.dispose(); this.handles.delete(key);
      }
    }
    for (const [key, state] of Object.entries(states)) {
      if (state.visible === false) continue;
      let handle = this.handles.get(key);
      if (!handle) {
        handle = createProp(state.name); handle.group.userData.propName = state.name;
        this.handles.set(key, handle); this.anchor.add(handle.group);
      }
      handle.apply(state);
    }
  }
  inFrame(project: (point: Vector3) => Vector3): boolean {
    this.anchor.updateWorldMatrix(true, true);
    for (const handle of this.handles.values()) {
      const box = new Box3().setFromObject(handle.group, true);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = project(new Vector3(x, y, z));
        if (Math.abs(p.x) >= 1 || Math.abs(p.y) >= 1) return false;
      }
    }
    return true;
  }
  /** Compare the actual composited frame with one prop family hidden. This proves
   * visible pixels after model occlusion, including translucent bubbles, without
   * relying on palette matching or counting geometry hidden behind the body. */
  visiblePixelRatios(renderAndRead: () => Uint8Array): Record<string, number> {
    const baseline = renderAndRead();
    const families = new Set([...this.handles.values()].map(handle => handle.group.userData.propName as string));
    const ratios: Record<string, number> = {};
    try {
      for (const name of families) {
        const groups = [...this.handles.values()].filter(handle => handle.group.userData.propName === name).map(handle => handle.group);
        groups.forEach(group => { group.visible = false; });
        let other: Uint8Array;
        try { other = renderAndRead(); } finally { groups.forEach(group => { group.visible = true; }); }
        let count = 0;
        for (let i = 0; i < baseline.length; i += 4) {
          if (baseline[i + 3]! > 0 && [0, 1, 2, 3].some(channel => baseline[i + channel] !== other[i + channel])) count++;
        }
        ratios[name] = count / (baseline.length / 4);
      }
    } finally { renderAndRead(); }
    return ratios;
  }
  dispose(): void { this.apply(); this.anchor.removeFromParent(); }
}
