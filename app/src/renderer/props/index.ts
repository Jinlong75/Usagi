import { BackSide, Box3, BufferGeometry, Curve, QuadraticBezierCurve3, CylinderGeometry, ExtrudeGeometry, Shape, Group, Mesh, MeshBasicMaterial,
  Object3D, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PROP_COLORS = { outline: '#2b1a14', handles: '#e8584f', rope: '#f2c94c', wand: '#7ec8e3', bubbles: '#bfe8ff', pillow: '#f6c9d3', rice: '#fbfbf5', seaweed: '#2e3b2c',
  melon: '#ef5a5a', rindWhite: '#f3f1e4', rind: '#3f9b4b', cone: '#e3b26b', ice: '#f7a8c4', cookie: '#d9a05b' } as const;
// Rest hand centers measured on the deployed VRM: ±0.3284H, y=0.2626H.
// Handles sit just outside the hand surface (±0.3466H), rather than inside the torso.
export const ROPE_SPAN = 0.355;
export const ROPE_PIVOT_Y = 0.263;
export const ROPE_RADIUS = 0.42;
const ROPE_UPPER_RADIUS = 0.85;
export const WAND_RING: [number, number, number] = [-0.108, 0.355, 0.32];
export const WAND_GRIP: [number, number, number] = [-0.328, 0.263, 0.015];
export const PILLOW_SIZE = [0.46, 0.184, 0.10] as const;
export const PILLOW_CENTER: [number, number, number] = [0, 0.06, 0.295];
export type PropName = 'handles' | 'rope' | 'wand' | 'bubble' | 'pillow' | 'riceball' | 'rice' | 'watermelon' | 'iceCream' | 'iceDrop' | 'cookie';
type Triple = [number, number, number];
export interface PropState { name: PropName; position: Triple; rotation?: Triple; scale?: Triple; visible?: boolean; opacity?: number; ropeOpen?: number; foodRemaining?: number }
export interface PropHandle { group: Group; apply(state: PropState): void; dispose(): void }

/** Unit geometry and translations are fractions of neutral height H.
 * Usagi is VRM 1; FaceMouth is on +Z, viewed by our +Z camera. rotateVRM0
 * normalizes older imports to this same front direction before props are attached. */
export function createProp(name: PropName): PropHandle {
  const group = new Group(); group.name = `prop:${name}`;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshBasicMaterial>();
  const melonFlesh: Group[] = [];
  let openRope: ((amount: number) => void) | undefined;
  const add = (geometry: BufferGeometry, color: string, position: Triple = [0, 0, 0], opacity = 1) => {
    geometries.add(geometry);
    const part = new Group(); part.position.set(...position); group.add(part);
    // Even translucent fills write depth: the enlarged back shell then contributes
    // only its rim, rather than tinting the entire blue bubble brown a second time.
    const material = new MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: true });
    const outline = new MeshBasicMaterial({ color: PROP_COLORS.outline, side: BackSide, toneMapped: false,
      transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    materials.add(material); materials.add(outline);
    material.userData.baseOpacity = opacity; outline.userData.baseOpacity = opacity;
    part.add(new Mesh(geometry, material));
    const shell = new Mesh(geometry, outline); shell.scale.setScalar(1.035); part.add(shell);
    return part;
  };
  if (name === 'handles') {
    for (const x of [-ROPE_SPAN, ROPE_SPAN]) add(new CylinderGeometry(0.009, 0.009, 0.06, 12), PROP_COLORS.handles, [x, 0, 0]);
  } else if (name === 'rope') {
    // Open U: its ends stay at the handles while the arc rotates around the X axis.
    const arc = new QuadraticBezierCurve3(new Vector3(-ROPE_SPAN, 0, 0),
      new Vector3(0, -2 * ROPE_RADIUS, 0), new Vector3(ROPE_SPAN, 0, 0));
    // An elliptical upper arch stays wide near the sides of the head. Merely
    // stretching the narrow quadratic U still sends its sides through the skin.
    class UpperArch extends Curve<Vector3> {
      constructor() { super(); }
      getPoint(t: number, target = new Vector3()): Vector3 {
        return target.set(-ROPE_SPAN * Math.cos(Math.PI * t), -ROPE_UPPER_RADIUS * Math.sin(Math.PI * t), 0);
      }
    }
    const upper = new UpperArch();
    let openness = 0;
    class RopePath extends Curve<Vector3> {
      constructor() { super(); }
      getPoint(t: number, target = new Vector3()): Vector3 {
        return arc.getPoint(t, target).lerp(upper.getPoint(t), openness);
      }
      getPointAt(t: number, target = new Vector3()): Vector3 {
        return arc.getPointAt(t, target).lerp(upper.getPointAt(t), openness);
      }
      getTangentAt(t: number, target = new Vector3()): Vector3 {
        // Preserve the original tube's exact Frenet frames at the foot pose.
        if (openness === 0) return arc.getTangentAt(t, target);
        return this.getPointAt(Math.min(1, t + 0.0001), target)
          .sub(this.getPointAt(Math.max(0, t - 0.0001))).normalize();
      }
    }
    const geometry = new TubeGeometry(new RopePath(), 64, 0.004, 8, false);
    const upperGeometry = new TubeGeometry(upper, 64, 0.004, 8, false);
    const positions = geometry.attributes.position!;
    const closedVertices = positions.array.slice();
    const openVertices = upperGeometry.attributes.position!.array.slice();
    upperGeometry.dispose();
    // Reuse the same buffers/materials throughout playback; no per-frame geometry
    // allocation. Basic shading needs no interpolated lighting normals.
    openRope = amount => {
      const next = Math.max(0, Math.min(1, amount));
      if (openness === next) return;
      openness = next;
      for (let i = 0; i < positions.array.length; i++) positions.array[i] = closedVertices[i]! + (openVertices[i]! - closedVertices[i]!) * openness;
      positions.needsUpdate = true;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    };
    add(geometry, PROP_COLORS.rope);
  } else if (name === 'wand') {
    add(new TorusGeometry(0.035, 0.005, 8, 24), PROP_COLORS.wand);
    // The ring is the origin; a diagonal shaft ends at the actual right hand.
    const grip = new Vector3(...WAND_GRIP).sub(new Vector3(...WAND_RING));
    const neck = new Vector3(0, -0.035, 0);
    const shaft = add(new CylinderGeometry(0.005, 0.005, grip.distanceTo(neck), 12), PROP_COLORS.wand,
      grip.clone().add(neck).multiplyScalar(0.5).toArray() as Triple);
    shaft.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), neck.sub(grip).normalize());
  } else if (name === 'bubble') {
    add(new SphereGeometry(1, 20, 12), PROP_COLORS.bubbles, [0, 0, 0], 0.45);
    // Same palette, stronger opacity: a small pale highlight on the front cap.
    add(new SphereGeometry(1, 12, 8).scale(0.16, 0.24, 0.07), PROP_COLORS.bubbles, [-0.28, 0.35, 0.9], 0.95);
  } else if (name === 'riceball') {
    // Rounded triangular prism, front face at +Z like the character's mouth.
    const triangle = new Shape();
    triangle.moveTo(-0.065, -0.06); triangle.quadraticCurveTo(-0.085, -0.06, -0.073, -0.035);
    triangle.lineTo(-0.018, 0.055); triangle.quadraticCurveTo(0, 0.08, 0.018, 0.055);
    triangle.lineTo(0.073, -0.035); triangle.quadraticCurveTo(0.085, -0.06, 0.065, -0.06);
    triangle.closePath();
    add(new ExtrudeGeometry(triangle, { depth: 0.04, bevelEnabled: true, bevelSegments: 3, steps: 1,
      bevelSize: 0.005, bevelThickness: 0.005, curveSegments: 12 }).translate(0, 0, -0.02), PROP_COLORS.rice);
    add(new RoundedBoxGeometry(0.06, 0.045, 0.008, 2, 0.003), PROP_COLORS.seaweed, [0, -0.04, 0.03]);
  } else if (name === 'rice' || name === 'iceDrop') {
    add(new SphereGeometry(1, 12, 8).scale(1, name === 'rice' ? 1.7 : 1, 1), name === 'rice' ? PROP_COLORS.rice : PROP_COLORS.ice);
  } else if (name === 'watermelon') {
    const halfDisc = (radius: number, depth: number) => {
      const shape = new Shape(); shape.moveTo(-radius, 0);
      shape.absarc(0, 0, radius, Math.PI, 0, true); shape.closePath();
      return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 }).translate(0, -0.045, -depth / 2);
    };
    add(halfDisc(0.1, 0.045), PROP_COLORS.rind);
    add(halfDisc(0.093, 0.008), PROP_COLORS.rindWhite, [0, 0, 0.025]);
    melonFlesh.push(add(halfDisc(0.085, 0.008), PROP_COLORS.melon, [0, 0, 0.032]));
    for (const [x, y] of [[-0.055, -0.015], [-0.03, 0.012], [0, 0.025], [0.03, 0.012], [0.055, -0.015]]) {
      melonFlesh.push(add(new SphereGeometry(1, 12, 8).scale(0.003, 0.007, 0.002), PROP_COLORS.outline, [x!, y!, 0.039]));
    }
  } else if (name === 'iceCream') {
    add(new CylinderGeometry(0.035, 0, 0.12, 24), PROP_COLORS.cone);
    add(new SphereGeometry(0.05, 24, 16), PROP_COLORS.ice, [0, 0.095, 0]);
  } else if (name === 'cookie') {
    const biscuit = new CylinderGeometry(0.04, 0.04, 0.015, 24).rotateX(Math.PI / 2);
    add(biscuit, PROP_COLORS.cookie);
  } else {
    add(new RoundedBoxGeometry(...PILLOW_SIZE, 2, 0.035), PROP_COLORS.pillow);
  }
  let disposed = false;
  return { group, apply(state) {
    openRope?.(state.ropeOpen ?? 0);
    const remaining = Math.max(0, Math.min(1, state.foodRemaining ?? 1));
    for (const part of melonFlesh) {
      part.scale.y = remaining;
      // Keep the straight bottom edge fixed while the red arc and seeds shrink.
      if (part === melonFlesh[0]) part.position.y = -0.045 * (1 - remaining);
      else {
        part.userData.restY ??= part.position.y;
        part.position.y = -0.045 + (part.userData.restY + 0.045) * remaining;
      }
    }
    group.visible = !disposed && state.visible !== false;
    group.position.set(...state.position); group.rotation.set(...(state.rotation ?? [0, 0, 0]));
    group.scale.set(...(state.scale ?? [1, 1, 1]));
    for (const material of materials) {
      material.opacity = state.opacity ?? material.userData.baseOpacity;
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
