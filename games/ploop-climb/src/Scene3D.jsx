import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { COLS, TREE, CRACK, SPIKE, EMPTY, getRow } from "./grid.js";

/* ── real 3D climbing tower: replaces the old CSS clip-path isometric illusion.
   A plain box tile viewed through an angled camera naturally shows a lit top face
   + two shaded side faces — exactly the hand-painted three-tone look the CSS
   version had to fake — so real lighting does that work for free. Same restraint
   as Morph's second pass: two lights total, modest bloom, matte materials. The
   sky stays a CSS gradient behind a transparent canvas — cheap, already looks
   right, no reason to rebuild it as a 3D dome. ── */

/* proper cubes, not flat pucks: TILE_THICK == TILE_W so consecutive rows'
   top/bottom faces touch exactly (ROW_SPACING == TILE_THICK) and same-row
   neighbors touch exactly (footprint == column spacing) — a seamless voxel
   wall like the reference, not a set of floating platforms with gaps. */
const TILE_W = 1.3;
const TILE_THICK = TILE_W;
const ROW_SPACING = TILE_THICK;
const GRID_WORLD_W = COLS * TILE_W;

/* portrait phones give a much narrower *horizontal* FOV than the vertical value
   below suggests (horizontalFOV ≈ verticalFOV * aspect) — the camera needs to sit
   well back for the ~6.5-unit-wide grid to actually fit in frame */
const CAMERA_FOV = 52;
const CAMERA_DIST = 13.5;
const CAMERA_HEIGHT_OFFSET = 9;
const CAMERA_LOOK_LEAD = 2;
const FOLLOW_LERP = 0.1;

const VISIBLE_BELOW = 3.5;
const VISIBLE_ABOVE = 13;

const DANGER_WARN_ROWS = 3;

/* now that tiles are full cubes (not thin pucks), anything centered at z=0 sits
   buried inside the block — the climber and its contact shadow both need to
   stand toward the cube's front face instead */
const CLIMBER_Z = TILE_W / 2 - 0.12;

function worldX(row, col) {
  const offset = row % 2 ? TILE_W / 2 : 0;
  return -GRID_WORLD_W / 2 + col * TILE_W + offset + TILE_W / 2;
}
function worldY(row) {
  return row * ROW_SPACING;
}
/** top surface of the tile at this row — where anything "standing" on it belongs */
function tileTopY(row) {
  return worldY(row) + TILE_THICK / 2;
}

function makeFaceTexture(mood) {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 96, 96);
  ctx.fillStyle = "#2A2420";
  ctx.strokeStyle = "#2A2420";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  const lx = 34, rx = 62, ey = 46;
  if (mood === "dead") {
    const drawX = (cx) => {
      ctx.beginPath();
      ctx.moveTo(cx - 7, ey - 7); ctx.lineTo(cx + 7, ey + 7);
      ctx.moveTo(cx + 7, ey - 7); ctx.lineTo(cx - 7, ey + 7);
      ctx.stroke();
    };
    drawX(lx); drawX(rx);
  } else {
    ctx.beginPath(); ctx.arc(lx, ey, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx, ey, 5, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSoftCircleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 2; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#2E86D6");
  g.addColorStop(0.5, "#5CB4E8");
  g.addColorStop(1, "#B9E4F2");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  return new THREE.CanvasTexture(c);
}

function makeCloudTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.6, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ── voxel block face textures: a flat color read as one indistinguishable
   green mass once tiles touched with zero gap — what actually makes a voxel
   block read as a block (Minecraft, the reference image) is a grass-green top
   against dirt-brown sides, plus a bit of dithered noise so faces aren't flat
   color fields. NearestFilter keeps the pixel-art speckle crisp instead of
   blurring it into mush. ── */
function speckle(ctx, w, h, count, y0, y1) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, y = y0 + Math.random() * (y1 - y0);
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
    ctx.fillRect(x, y, 2, 2);
  }
}

/* baked-in "grout line": each face's own texture darkens right at its edge, so
   two touching blocks each contribute half a seam and the boundary between
   them stays readable — without needing separate outline geometry (which read
   as a harsh cartoon stroke) or a physical gap (which broke the "must join
   with zero space" requirement). */
function addSeam(ctx, size, thickness = 2, alpha = 0.3) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(0, 0, size, thickness);
  ctx.fillRect(0, size - thickness, size, thickness);
  ctx.fillRect(0, 0, thickness, size);
  ctx.fillRect(size - thickness, 0, thickness, size);
}

function makeGrassTopTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#7DC943";
  ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, 64, 64, 260, 0, 64);
  addSeam(ctx, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDirtSideTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8B5A2B";
  ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, 64, 64, 200, 12, 64);
  // grass cap along the top edge, with a ragged dirt/grass boundary
  ctx.fillStyle = "#7DC943";
  ctx.fillRect(0, 0, 64, 9);
  for (let x = 0; x < 64; x += 4) {
    ctx.fillRect(x, 9, 4, 3 + Math.random() * 5);
  }
  speckle(ctx, 64, 9, 45, 0, 9);
  addSeam(ctx, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStoneTopTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#9AA0AA";
  ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, 64, 64, 260, 0, 64);
  addSeam(ctx, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStoneSideTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#787E88";
  ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, 64, 64, 220, 0, 64);
  addSeam(ctx, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLavaTopTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#B8341C";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * 64, y = Math.random() * 64, r = 5 + Math.random() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#FFD24A");
    g.addColorStop(0.5, "#FF7A1A");
    g.addColorStop(1, "rgba(184,52,28,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  addSeam(ctx, 64, 2, 0.4);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCharredSideTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#4A1A11";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 64, y = Math.random() * 64;
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,120,60,0.18)" : "rgba(0,0,0,0.2)";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.fillStyle = "#B8341C";
  ctx.fillRect(0, 0, 64, 8);
  addSeam(ctx, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDangerTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 320;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  const teeth = 10;
  ctx.moveTo(0, 60);
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 256;
    const y = 18 + (i % 2 === 0 ? 0 : 34) + (i * 37 % 13);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(256, 320); ctx.lineTo(0, 320);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, "#FF7A5A");
  grad.addColorStop(0.16, "#FF4529");
  grad.addColorStop(1, "#4A1A11");
  ctx.fillStyle = grad;
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/**
 * Owns the whole 3D scene imperatively, reading playerRef/hopRef/rowsRef/
 * dangerRowRef fresh every frame — same pattern as Morph's Scene3D. The
 * (unchanged) game loop in PloopClimb.jsx just advances those refs; this file
 * never influences hop timing, collision, or row generation.
 */
export default function Scene3D({ phase, playerRef, hopRef, rowsRef, dangerRowRef, standTimeRef, standLimit, bump, reducedMotion }) {
  const mountRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const apiRef = useRef({});

  useEffect(() => {
    const mount = mountRef.current;
    /* opaque renderer: EffectComposer/UnrealBloomPass don't reliably carry alpha
       through their composite, so a transparent canvas over a CSS sky ends up
       flattened to black. The sky lives inside the scene instead (below). */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(0xb9e4f2, 20, 32);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 60);

    /* two lights, full stop — matte materials + real geometry do the rest */
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 0.95));
    const key = new THREE.DirectionalLight(0xfff3e0, 1.05);
    key.position.set(3, 6, 4);
    scene.add(key);

    /* signature motif: a living sky the collapse chases upward through — a
       handful of soft drifting cloud sprites, cheap and always in frame since
       they're parented loosely to the camera's followY each frame below */
    const cloudTex = makeCloudTexture();
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false });
    const clouds = [-3.4, 3.1, -1.6].map((x, i) => {
      const s = new THREE.Sprite(cloudMat);
      s.scale.set(2.6 + i * 0.5, 1.1 + i * 0.2, 1);
      s.position.set(x, 0, -6 - i * 2);
      scene.add(s);
      return { sprite: s, baseX: x, yOffset: -1 + i * 3.5, speed: 0.06 + i * 0.02, phase: i * 40 };
    });

    /* ── tiles: shared unit geometry, but each type gets its own 6-material set
       (BoxGeometry's face groups are [+x,-x,+y(top),-y(bottom),+z,-z]) so the
       top face reads as grass/lava/stone and the sides read as dirt/charred
       rock/stone — a flat single color per tile is what actually merged
       same-colored neighbors into one unreadable mass; a Minecraft-style
       grass-top/dirt-side block is what makes each cube read as a block, no
       outline needed. Tiles still fully touch — no spatial gap either way. ── */
    const tileGeo = new THREE.BoxGeometry(TILE_W, TILE_THICK, TILE_W);
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.9 });

    function makeFaceSet(topTex, sideTex) {
      const top = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.8, metalness: 0.02 });
      const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.85, metalness: 0.02 });
      return [side, side, top, bottomMat, side, side];
    }
    const grassMats = makeFaceSet(makeGrassTopTexture(), makeDirtSideTexture());
    const lavaMats = makeFaceSet(makeLavaTopTexture(), makeCharredSideTexture());
    const stoneMats = makeFaceSet(makeStoneTopTexture(), makeStoneSideTexture());
    function tileMatsFor(type) {
      if (type === CRACK) return lavaMats;
      if (type === SPIKE) return stoneMats;
      return grassMats;
    }

    const trunkGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.22, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5A3C22, roughness: 0.8 });
    const foliageGeo = new THREE.ConeGeometry(0.24, 0.36, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2E8B3D, roughness: 0.6 });
    const foliageGeo2 = new THREE.ConeGeometry(0.17, 0.26, 8);
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x17D39B, roughness: 0.6 });

    const spikeGeo = new THREE.ConeGeometry(0.075, 0.3, 6);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x6E7480, roughness: 0.4, metalness: 0.2 });

    function buildProp(type) {
      if (type === TREE) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.11;
        const f1 = new THREE.Mesh(foliageGeo, foliageMat);
        f1.position.y = 0.32;
        const f2 = new THREE.Mesh(foliageGeo2, foliageMat2);
        f2.position.y = 0.5;
        g.add(trunk, f1, f2);
        return g;
      }
      if (type === SPIKE) {
        const g = new THREE.Group();
        [-0.14, 0, 0.14].forEach((x, i) => {
          const s = new THREE.Mesh(spikeGeo, spikeMat);
          s.position.set(x, 0.15 + (i === 1 ? 0.06 : 0), 0);
          s.scale.setScalar(i === 1 ? 1.25 : 1);
          g.add(s);
        });
        return g;
      }
      return null;
    }

    const tilePool = new Map();
    function syncTiles(minRow, maxRow, rows) {
      const seen = new Set();
      for (let rn = maxRow; rn >= minRow; rn--) {
        const row = getRow(rows, rn);
        for (let c = 0; c < COLS; c++) {
          const type = row[c];
          if (type === undefined) continue;
          if (type === EMPTY) continue;
          const key = `${rn}-${c}`;
          seen.add(key);
          if (!tilePool.has(key)) {
            const group = new THREE.Group();
            const tile = new THREE.Mesh(tileGeo, tileMatsFor(type));
            group.add(tile);
            const prop = buildProp(type);
            if (prop) { prop.position.y = TILE_THICK / 2; group.add(prop); }
            group.position.set(worldX(rn, c), worldY(rn), 0);
            scene.add(group);
            tilePool.set(key, group);
          }
        }
      }
      for (const [key, group] of tilePool) {
        if (!seen.has(key)) {
          scene.remove(group);
          tilePool.delete(key);
        }
      }
    }

    /* ── climber: body + head + cap + a canvas-texture face, matching the dot-eyed
       family look used across the other 37apps games ── */
    const climberGroup = new THREE.Group();
    const bodyGeo = new RoundedBoxGeometry(0.6, 0.56, 0.46, 3, 0.15);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3D64FF, roughness: 0.42, metalness: 0.12 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.46;
    climberGroup.add(body);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xE8C6A0, roughness: 0.55 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), headMat);
    head.position.y = 0.98;
    climberGroup.add(head);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xD94F3C, roughness: 0.5 });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.24, 14), capMat);
    cap.position.y = 1.2;
    climberGroup.add(cap);
    const faceMat = new THREE.MeshBasicMaterial({ map: makeFaceTexture("idle"), transparent: true, depthWrite: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), faceMat);
    face.position.set(0, 0.98, 0.26);
    climberGroup.add(face);
    scene.add(climberGroup);

    let currentMood = "idle";
    function setMood(mood) {
      if (mood === currentMood) return;
      currentMood = mood;
      faceMat.map?.dispose();
      faceMat.map = makeFaceTexture(mood);
      faceMat.needsUpdate = true;
    }

    /* soft contact shadow blob under the climber — cheap grounding cue, no real shadow map needed */
    const shadowTex = makeSoftCircleTexture();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.35, depthWrite: false });
    const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    scene.add(shadowMesh);

    /* ── rising danger front: a single unlit plane so it always reads clearly
       as a hazard regardless of scene lighting ── */
    const dangerTex = makeDangerTexture();
    const dangerMat = new THREE.MeshBasicMaterial({ map: dangerTex, transparent: true });
    const dangerH = 7.2;
    const dangerMesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WORLD_W * 1.7, dangerH), dangerMat);
    scene.add(dangerMesh);

    /* ── resize ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    /* bright lime tiles blow past a low bloom threshold and wash the whole scene
       into a soft green haze — keep bloom high-threshold and subtle so it only
       catches genuine highlights, not the base tile color */
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.15, 0.4, 0.92);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      composer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    /* ── bump reaction (bumped into a tree or the grid edge): quick recoil, no
       separate imperative API needed — just watch the prop each render ── */
    let bumpState = null;
    apiRef.current.applyBump = (b) => { bumpState = b ? { ...b, t: 0 } : null; };

    let followY = 0;
    let raf = null;
    let last = performance.now();
    let t = 0;
    const deathTRef = { current: null };
    let shakingTile = null; // { group, baseX, baseY } — the tile under a stationary climber, as it nears collapse
    let fallingTile = null; // { group, baseY } — the tile the climber was standing on when they died
    let prevPhase = null;

    const animate = (now) => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now; t += dt;

      /* a fresh run starting (including the very first one) — clear any tiles
         left over from a previous run instead of reusing stale positions,
         rotations, or types (rowsRef resets on restart, but without this the
         pool would keep showing whatever used to be at each row/col) */
      if (phaseRef.current === "play" && prevPhase !== "play") {
        for (const [, group] of tilePool) scene.remove(group);
        tilePool.clear();
        shakingTile = null;
        fallingTile = null;
        deathTRef.current = null;
      }
      prevPhase = phaseRef.current;

      const player = playerRef.current;
      const hop = hopRef.current;
      const dead = phaseRef.current === "dead";

      const targetFollowY = tileTopY(player.row) + CAMERA_LOOK_LEAD;
      followY += (targetFollowY - followY) * FOLLOW_LERP;

      const minRow = Math.max(0, Math.floor((followY - VISIBLE_BELOW) / ROW_SPACING) - 1);
      const maxRow = Math.ceil((followY + VISIBLE_ABOVE) / ROW_SPACING) + 1;
      syncTiles(minRow, maxRow, rowsRef.current);

      camera.position.set(0, followY + CAMERA_HEIGHT_OFFSET - CAMERA_LOOK_LEAD, CAMERA_DIST);
      camera.lookAt(0, followY, 0);

      for (const c of clouds) {
        c.sprite.position.x = reducedMotionRef.current ? c.baseX : c.baseX + Math.sin(t * c.speed + c.phase) * 1.4;
        c.sprite.position.y = followY + c.yOffset;
      }

      /* climber position: identical hop-interpolation math to the old CSS version,
         just producing world coordinates instead of screen pixels */
      let cx = worldX(player.row, player.col);
      let cy = tileTopY(player.row);
      let squashX = 1, squashY = 1, lean = 0;
      if (hop.active) {
        const fx = worldX(hop.from.row, hop.from.col), fy = tileTopY(hop.from.row);
        const tx = worldX(hop.to.row, hop.to.col), ty = tileTopY(hop.to.row);
        const p = hop.t;
        cx = fx + (tx - fx) * p;
        cy = fy + (ty - fy) * p + Math.sin(p * Math.PI) * 0.55;
        lean = hop.dir * Math.sin(p * Math.PI) * 0.5;
        const arcK = Math.sin(p * Math.PI);
        squashX = 1 + arcK * 0.12;
        squashY = 1 - arcK * 0.12;
      } else if (bumpState) {
        bumpState.t += dt;
        const p = Math.min(1, bumpState.t / 0.22);
        lean = -bumpState.dir * Math.sin(p * Math.PI) * 0.55;
        if (p >= 1) bumpState = null;
      } else if (!dead && !reducedMotionRef.current) {
        const idle = Math.sin(t * 2.6) * 0.04;
        squashY = 1 + idle;
        squashX = 1 - idle * 0.5;
      }

      if (dead) {
        setMood("dead");
      } else {
        setMood("idle");
      }

      /* the tile under a stationary climber shakes harder as it nears collapse
         (see PloopClimb.jsx's standTimeRef/STAND_LIMIT) — a visible warning
         before the ground actually gives way underneath them */
      const standProgress = !dead && standTimeRef ? Math.min(1, standTimeRef.current / (standLimit || 1)) : 0;
      if (!dead && !hop.active && standProgress > 0.5) {
        const g = tilePool.get(`${player.row}-${player.col}`);
        if (g) {
          if (shakingTile && shakingTile.group !== g) {
            shakingTile.group.position.x = shakingTile.baseX;
            shakingTile.group.position.y = shakingTile.baseY;
            shakingTile.group.position.z = 0;
          }
          if (!shakingTile || shakingTile.group !== g) {
            shakingTile = { group: g, baseX: worldX(player.row, player.col), baseY: worldY(player.row) };
          }
          const shakeK = (standProgress - 0.5) / 0.5;
          const amt = reducedMotionRef.current ? 0 : shakeK * shakeK * 0.06;
          g.position.x = shakingTile.baseX + Math.sin(t * 46) * amt;
          g.position.z = Math.cos(t * 39) * amt;
          g.position.y = shakingTile.baseY - shakeK * shakeK * 0.05;
        }
      } else if (shakingTile) {
        shakingTile.group.position.x = shakingTile.baseX;
        shakingTile.group.position.y = shakingTile.baseY;
        shakingTile.group.position.z = 0;
        shakingTile = null;
      }

      /* death: topple over and sink slightly, once, driven by a local timer
         that starts the moment "dead" is first observed — the tile they were
         standing on falls away under them at the same time */
      if (dead) {
        if (deathTRef.current === null) {
          deathTRef.current = 0;
          const g = tilePool.get(`${player.row}-${player.col}`);
          fallingTile = g ? { group: g, baseY: g.position.y } : null;
        }
        deathTRef.current = Math.min(1, deathTRef.current + dt / 0.5);
        const dp = deathTRef.current;
        climberGroup.position.set(cx, cy - dp * 0.3, CLIMBER_Z);
        climberGroup.rotation.z = -Math.PI * 0.42 * dp;
        climberGroup.scale.setScalar(1 - dp * 0.15);
        if (fallingTile) {
          fallingTile.group.position.y = fallingTile.baseY - dp * dp * 3;
          fallingTile.group.rotation.x = dp * 0.35;
        }
      } else {
        deathTRef.current = null;
        fallingTile = null;
        climberGroup.position.set(cx, cy, CLIMBER_Z);
        climberGroup.rotation.z = lean;
        climberGroup.scale.set(squashX, squashY, squashX);
      }

      /* contact shadow: pinned to the landing tile during a hop (telegraphs
         where the climber is about to land), to the current tile otherwise */
      const shadowRow = hop.active ? hop.to.row : player.row;
      const shadowCol = hop.active ? hop.to.col : player.col;
      shadowMesh.position.set(worldX(shadowRow, shadowCol), tileTopY(shadowRow) + 0.01, CLIMBER_Z);
      shadowMesh.visible = !dead;

      /* danger front */
      const dangerRow = dangerRowRef.current;
      const dangerY = worldY(dangerRow);
      dangerMesh.position.set(0, dangerY - dangerH / 2 + 0.35, -0.05);
      const dangerClose = !hop.active && player.row - dangerRow < DANGER_WARN_ROWS;
      const pulse = dangerClose && !reducedMotionRef.current ? 0.85 + Math.sin(t * 9) * 0.15 : 1;
      dangerMat.opacity = pulse;

      composer.render();
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const [, group] of tilePool) scene.remove(group);
      tileGeo.dispose();
      bottomMat.dispose();
      for (const mats of [grassMats, lavaMats, stoneMats]) {
        const [side, , top] = mats;
        top.map?.dispose(); top.dispose();
        side.map?.dispose(); side.dispose();
      }
      trunkGeo.dispose(); trunkMat.dispose();
      foliageGeo.dispose(); foliageMat.dispose(); foliageGeo2.dispose(); foliageMat2.dispose();
      spikeGeo.dispose(); spikeMat.dispose();
      bodyGeo.dispose(); bodyMat.dispose();
      headMat.dispose(); capMat.dispose();
      faceMat.map?.dispose(); faceMat.dispose();
      shadowTex.dispose(); shadowMat.dispose();
      dangerTex.dispose(); dangerMat.dispose();
      cloudTex.dispose(); cloudMat.dispose();
      scene.background?.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerRef, hopRef, rowsRef, dangerRowRef]);

  /* bump is simple prop-driven state (not time-critical enough to need the full
     imperative-handle pattern Morph uses for its beat-perfect particle FX) */
  const bumpKeyRef = useRef(null);
  useEffect(() => {
    if (bump && bump.key !== bumpKeyRef.current) {
      bumpKeyRef.current = bump.key;
      apiRef.current.applyBump?.(bump);
    }
  }, [bump]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
}
