import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFire, useWindowData, type ZoomBucket } from "@/lib/fire/store";
import { aggregateCells } from "@/lib/fire/analytics";
import { angularDistance, borderLines, countryAt, countryFeature, DEG, latLonToXYZ, xyzToLatLon } from "@/lib/fire/geo";
import type { Cell, Detection } from "@/lib/fire/types";
import type { Geometry } from "geojson";

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (lat: number, lon: number, r: number) => new THREE.Vector3(...latLonToXYZ(lat, lon, r));

function Earth() {
  const tex = useTexture("/textures/earth.jpg");
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (
    <mesh onClick={onGlobeClick}>
      <sphereGeometry args={[1, 96, 96]} />
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0} color="#9fb0c8" />
    </mesh>
  );
}

// picking: find the nearest rendered item to the clicked surface point
type Pickable = { lat: number; lon: number; cell?: Cell; det?: Detection };
const pickRef: { items: Pickable[]; radius: number } = { items: [], radius: 0.02 };

function onGlobeClick(e: ThreeEvent<MouseEvent>) {
  if (e.delta > 5) return;
  e.stopPropagation();
  const { lat, lon } = xyzToLatLon(e.point.x, e.point.y, e.point.z);
  let best: Pickable | null = null;
  let bd = pickRef.radius;
  for (const it of pickRef.items) {
    const d = angularDistance(lat, lon, it.lat, it.lon);
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  const s = useFire.getState();
  if (best) {
    if (best.det) s.set({ selection: { type: "detection", detection: best.det } });
    else if (best.cell) s.set({ selection: best.cell.count === 1 ? { type: "detection", detection: best.cell.first } : { type: "cell", cell: best.cell } });
    return;
  }
  const c = countryAt(lat, lon);
  s.set({ country: c === s.country ? null : c, selection: null });
}

function Atmosphere() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vV)), 4.0); gl_FragColor = vec4(0.3,0.5,1.0,1.0)*i*2.2; }`,
      }),
    [],
  );
  return (
    <mesh scale={1.12} raycast={() => null}>
      <sphereGeometry args={[1, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function linesFromGeometry(geom: { type: string; coordinates: unknown }, r: number) {
  const pts: number[] = [];
  const addLine = (line: [number, number][]) => {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!, b = line[i + 1]!;
      pts.push(...latLonToXYZ(a[1], a[0], r), ...latLonToXYZ(b[1], b[0], r));
    }
  };
  const c = geom.coordinates as never;
  if (geom.type === "MultiLineString") (c as [number, number][][]).forEach(addLine);
  if (geom.type === "Polygon") (c as [number, number][][]).forEach(addLine);
  if (geom.type === "MultiPolygon") (c as [number, number][][][]).forEach((p) => p.forEach(addLine));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function Borders() {
  const geo = useMemo(() => linesFromGeometry(borderLines(), 1.0012), []);
  return (
    <lineSegments geometry={geo} raycast={() => null}>
      <lineBasicMaterial color="#c9d6ff" transparent opacity={0.28} />
    </lineSegments>
  );
}

function SelectedCountry() {
  const country = useFire((s) => s.country);
  const geo = useMemo(() => {
    const f = country ? countryFeature(country) : null;
    return f ? linesFromGeometry(f.geometry as Geometry & { coordinates: unknown }, 1.002) : null;
  }, [country]);
  if (!geo) return null;
  return (
    <lineSegments geometry={geo} raycast={() => null}>
      <lineBasicMaterial color="#ffb547" />
    </lineSegments>
  );
}

const FLAME_VS = `
attribute float aPhase; attribute float aSize;
uniform float uTime; uniform float uScale; uniform float uCore;
varying float vH;
void main(){
  vec3 p = position;
  float h = clamp(p.y, 0.0, 1.0);
  float flick = 1.0 + 0.2*sin(uTime*9.0 + aPhase*6.28) + 0.1*sin(uTime*17.0 + aPhase*12.0);
  p.y *= flick;
  p.x += 0.14*h*h*sin(uTime*6.0 + aPhase*10.0);
  p.z += 0.14*h*h*cos(uTime*5.0 + aPhase*7.0);
  p *= aSize * uScale * uCore;
  vH = h;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const FLAME_FS = `
uniform vec3 uBase; uniform vec3 uTip; uniform float uAlpha;
varying float vH;
void main(){
  vec3 c = mix(uBase, uTip, smoothstep(0.0, 1.0, vH));
  float a = uAlpha * (1.0 - smoothstep(0.55, 1.0, vH)) + 0.05;
  gl_FragColor = vec4(c, a);
}`;

function flameMaterial(base: string, tip: string, core: number, alpha: number) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAME_VS,
    fragmentShader: FLAME_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 0.03 },
      uCore: { value: core },
      uBase: { value: new THREE.Color(base) },
      uTip: { value: new THREE.Color(tip) },
      uAlpha: { value: alpha },
    },
  });
}

type Item = { lat: number; lon: number; size: number };

function setSurfaceMatrices(mesh: THREE.InstancedMesh, items: Item[], r: number, scale?: (it: Item) => THREE.Vector3) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  items.forEach((it, i) => {
    const p = v3(it.lat, it.lon, r);
    q.setFromUnitVectors(UP, p.clone().normalize());
    m.compose(p, q, scale ? scale(it) : new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function Flames({ items }: { items: Item[] }) {
  const geom = useMemo(() => {
    const prof = [[0, 0], [0.26, 0.07], [0.36, 0.22], [0.32, 0.42], [0.2, 0.66], [0.08, 0.86], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(prof, 10);
    const n = Math.max(1, items.length);
    const phase = new Float32Array(n), size = new Float32Array(n);
    items.forEach((it, i) => {
      phase[i] = Math.random();
      size[i] = it.size;
    });
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 1));
    return g;
  }, [items]);
  const outer = useMemo(() => flameMaterial("#ff5a1f", "#b3120a", 1, 0.85), []);
  const core = useMemo(() => flameMaterial("#fff2b0", "#ffa31a", 0.55, 0.95), []);
  const glow = useMemo(() => flameMaterial("#ff7a1a", "#ff3300", 1.9, 0.12), []);
  const refs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  useLayoutEffect(() => {
    refs.forEach((r) => r.current && setSurfaceMatrices(r.current, items, 1.0008));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  useFrame(({ clock, camera }) => {
    const dist = camera.position.length();
    const s = 0.02 * Math.max(0.12, dist - 0.97);
    for (const m of [outer, core, glow]) {
      m.uniforms["uTime"]!.value = clock.elapsedTime;
      m.uniforms["uScale"]!.value = s;
    }
  });
  if (!items.length) return null;
  return (
    <>
      {[glow, outer, core].map((mat, i) => (
        <instancedMesh key={`${i}-${items.length}`} ref={refs[i]!} args={[geom, mat, items.length]} raycast={() => null} frustumCulled={false} />
      ))}
    </>
  );
}

const ramp = (t: number) => new THREE.Color().setHSL(0.13 - 0.13 * t, 1, 0.55 - 0.1 * t);

function Columns({ cells }: { cells: Cell[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geom = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const max = Math.max(1, ...cells.map((c) => c.count));
    const items = cells.map((c) => ({ lat: c.lat0 + c.size / 2, lon: c.lon0 + c.size / 2, size: c.count }));
    setSurfaceMatrices(mesh, items, 1, (it) => {
      const w = cells[0]!.size * DEG * 0.75;
      return new THREE.Vector3(w, 0.01 + 0.3 * (Math.log1p(it.size) / Math.log1p(max)), w);
    });
    cells.forEach((c, i) => mesh.setColorAt(i, ramp(Math.log1p(c.count) / Math.log1p(max))));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells]);
  if (!cells.length) return null;
  return (
    <instancedMesh key={cells.length} ref={ref} args={[geom, undefined, cells.length]} raycast={() => null}>
      <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
    </instancedMesh>
  );
}

function Clusters({ cells }: { cells: Cell[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const max = Math.max(1, ...cells.map((c) => c.count));
    setSurfaceMatrices(mesh, cells.map((c) => ({ lat: c.lat, lon: c.lon, size: c.count })), 1.003, (it) => {
      const r = cells[0]!.size * DEG * (0.15 + 0.4 * Math.sqrt(it.size / max));
      return new THREE.Vector3(r, r * 0.35, r);
    });
    cells.forEach((c, i) => mesh.setColorAt(i, ramp(Math.sqrt(c.count / max))));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells]);
  if (!cells.length) return null;
  return (
    <instancedMesh key={cells.length} ref={ref} args={[undefined, undefined, cells.length]} raycast={() => null}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.75} />
    </instancedMesh>
  );
}

function Heat({ cells }: { cells: Cell[] }) {
  const { geom, mat } = useMemo(() => {
    const max = Math.max(1, ...cells.map((c) => c.count));
    const pos = new Float32Array(cells.length * 3), sz = new Float32Array(cells.length), it = new Float32Array(cells.length);
    cells.forEach((c, i) => {
      pos.set(latLonToXYZ(c.lat, c.lon, 1.004), i * 3);
      const t = Math.log1p(c.count) / Math.log1p(max);
      sz[i] = 0.5 + 1.5 * t;
      it[i] = t;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    g.setAttribute("aI", new THREE.BufferAttribute(it, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: 60 } },
      vertexShader: `attribute float aSize; attribute float aI; uniform float uPx; varying float vI; void main(){ vI=aI; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize*uPx/ -mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vI; void main(){ float d=length(gl_PointCoord-0.5); float a=exp(-d*d*14.0)*(0.25+0.6*vI); vec3 c=mix(vec3(1.0,0.25,0.05), vec3(1.0,0.85,0.35), vI); gl_FragColor=vec4(c,a); }`,
    });
    return { geom: g, mat: m };
  }, [cells]);
  const size = cells[0]?.size ?? 1;
  useFrame(() => {
    mat.uniforms["uPx"]!.value = 140 * size;
  });
  return <points geometry={geom} material={mat} raycast={() => null} />;
}

const CELL_SIZE: Record<string, Record<ZoomBucket, number>> = {
  flames: { far: 2, mid: 0.5, near: 0 },
  columns: { far: 2, mid: 1, near: 0.25 },
  clusters: { far: 4, mid: 1.5, near: 0.5 },
  heat: { far: 1, mid: 0.5, near: 0.25 },
};

function FireLayer() {
  const win = useWindowData();
  const viz = useFire((s) => s.viz);
  const bucket = useFire((s) => s.zoomBucket);
  const { camera } = useThree();
  useFrame(() => {
    const d = camera.position.length();
    const b: ZoomBucket = d > 2.5 ? "far" : d > 1.7 ? "mid" : "near";
    if (b !== useFire.getState().zoomBucket) useFire.getState().set({ zoomBucket: b });
    pickRef.radius = 0.035 * (d - 0.95);
  });
  const records = win?.records ?? [];
  const requestedSize = CELL_SIZE[viz]?.[bucket] ?? 2;
  const size = !requestedSize && records.length > 20000 ? 0.1 : requestedSize;
  const cells = useMemo(() => (size ? aggregateCells(records, size) : []), [records, size]);
  const flameItems = useMemo<Item[]>(() => {
    if (viz !== "flames") return [];
    if (!size) return records.map((r) => ({ lat: r.lat, lon: r.lon, size: 0.7 }));
    return cells.map((c) => ({ lat: c.lat, lon: c.lon, size: 0.65 + 0.35 * Math.log2(c.count) }));
  }, [viz, size, records, cells]);
  useLayoutEffect(() => {
    pickRef.items = !size
      ? records.map((r) => ({ lat: r.lat, lon: r.lon, det: r }))
      : viz === "columns"
        ? cells.map((c) => ({ lat: c.lat0 + c.size / 2, lon: c.lon0 + c.size / 2, cell: c }))
        : cells.map((c) => ({ lat: c.lat, lon: c.lon, cell: c }));
  }, [cells, records, size, viz]);
  const nearCells = useMemo(() => (!size && viz !== "flames" ? aggregateCells(records, 0.1) : null), [size, viz, records]);
  const use = nearCells ?? cells;
  if (viz === "flames") return <Flames items={flameItems} />;
  if (viz === "columns") return <Columns cells={use} />;
  if (viz === "clusters") return <Clusters cells={use} />;
  return <Heat cells={use} />;
}

function SelectionMarker() {
  const sel = useFire((s) => s.selection);
  const ref = useRef<THREE.Mesh>(null);
  const pos = sel ? (sel.type === "detection" ? sel.detection : sel.cell) : null;
  const q = useMemo(() => {
    if (!pos) return null;
    const p = v3(pos.lat, pos.lon, 1.002);
    return { p, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize()) };
  }, [pos]);
  useFrame(({ clock, camera }) => {
    if (!ref.current) return;
    const s = 0.012 * Math.max(0.15, camera.position.length() - 0.95) * (1 + 0.25 * Math.sin(clock.elapsedTime * 4));
    ref.current.scale.setScalar(s);
  });
  if (!q) return null;
  return (
    <mesh ref={ref} position={q.p} quaternion={q.q} raycast={() => null}>
      <ringGeometry args={[0.8, 1, 40]} />
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function CameraRig() {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useFrame((_, raw) => {
    const f = useFire.getState().focus;
    if (!f) return;
    const dt = Math.min(raw, 0.05);
    const k = 1 - Math.exp(-4 * dt);
    const targetDir = v3(f.lat, f.lon, 1);
    const dir = camera.position.clone().normalize().lerp(targetDir, k).normalize();
    const len = THREE.MathUtils.lerp(camera.position.length(), f.dist, k);
    camera.position.copy(dir.multiplyScalar(len));
    if (controls) {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), k);
      controls.update();
    }
    if (camera.position.distanceTo(v3(f.lat, f.lon, f.dist)) < 0.005) useFire.getState().set({ focus: null });
  });
  return null;
}

export default function Globe() {
  const autoRotate = useFire((s) => s.autoRotate);
  return (
    <Canvas camera={{ position: latLonToXYZ(15, 10, 3), fov: 45, near: 0.01, far: 200 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#04060d"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 3, 5]} intensity={1.8} />
      <Stars radius={80} depth={40} count={2500} factor={3} fade />
      <Suspense fallback={null}>
        <Earth />
      </Suspense>
      <Atmosphere />
      <Borders />
      <SelectedCountry />
      <FireLayer />
      <SelectionMarker />
      <OrbitControls makeDefault enableDamping minDistance={1.15} maxDistance={6} autoRotate={autoRotate} autoRotateSpeed={0.35} rotateSpeed={0.5} zoomSpeed={0.7} />
      <CameraRig />
    </Canvas>
  );
}
