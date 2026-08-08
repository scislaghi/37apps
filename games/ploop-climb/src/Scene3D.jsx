import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { COLS, TREE, CRACK, SPIKE, EMPTY, SAFE, getRow, gemAt } from "./grid.js";

/* ── The climbing tower is a *floor*, not a wall.
   The previous pass mapped a row to world Y, which stacked the grid into a
   vertical face — from an angled camera that reads as a cliff of dirt, and the
   whole isometric-block language (visible top + two shaded sides per cube,
   depth falling away toward the horizon) was lost. Rows map to world Z here
   instead: the field lies flat, the climber advances *away* from the camera,
   and "up the screen" is depth rather than height. Same grid math, same hop
   rules — only the projection changed.

   The collapse then becomes literal: the rows nearest the camera (the bottom of
   the screen) crumble and drop out of the world behind the climber. ── */

const TILE_W = 1.3;
const TILE_D = 1.3;
/* blocks are deep enough that their front faces are a real part of the
   silhouette — that dirt band under each grass top is most of what makes a
   voxel field read as *blocks* rather than as a tiled texture */
const TILE_H = 1.15;
/* a hair more than TILE_D: touching rows would weld into one continuous green
   sheet, and the sliver of front face this opens up is exactly what separates
   one row of blocks from the next */
const ROW_SPACING = TILE_D;
/* the mesh is inset inside its cell so every block carries a gap on all four
   sides. Insetting only between rows welded each row's columns into a single
   unbroken green ribbon — the grid read as stripes, not as blocks. */
const TILE_INSET = 0.955;
/* hazard blocks stand proud of the grass. Flush and dark-topped, a lava tile
   reads as a *hole* — exactly the wrong signal for a block you must not land
   on — while raising it puts its glowing sides on screen. */
const HAZARD_LIFT = 0.2;
const GRID_WORLD_W = COLS * TILE_W + TILE_W / 2;

/* look-down angle. 40° keeps both the top faces (which carry the tile's
   identity: grass / lava / stone) and the front faces (which carry the depth)
   clearly visible — steeper flattens to a map, shallower hides the tops */
const CAMERA_TILT = (40 * Math.PI) / 180;
const CAMERA_FOV = 50;
const CAMERA_LOOK_LEAD = 2.8;
const FOLLOW_LERP = 0.11;

/* must stay comfortably greater than PloopClimb's MAX_DANGER_LAG: tiles have to
   exist by the time the collapse reaches them, or they'd be silently culled
   instead of visibly falling away */
const VISIBLE_BEHIND = 9;
const VISIBLE_AHEAD = 20;

const DANGER_WARN_ROWS = 3.2;

/* ── palette: brand kit v2 accents, pushed into a natural-material register.
   The sky is the coral→magenta end of the accent ramp (the reference art's
   warm sky, but in brand hues), which also gives the green field a genuine
   complementary contrast instead of the blue-on-green mush of the last pass. ── */
const SKY_TOP = "#B01643";
const SKY_MID = "#E6304E";
const SKY_LOW = "#FF6A4B";
const FOG_COLOR = 0xff7a58;

function worldX(row, col) {
  const offset = row % 2 ? TILE_W / 2 : 0;
  return -GRID_WORLD_W / 2 + col * TILE_W + offset + TILE_W / 2;
}
function worldZ(row) {
  return -row * ROW_SPACING;
}
/** Top surface of every tile is the y=0 plane — the field is flat. */
const TILE_TOP_Y = 0;

/* ── canvas texture helpers ── */
function makeTex(size, draw, { pixel = true } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  if (pixel) tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, count, y0, y1, light = 0.1, dark = 0.12) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = y0 + Math.random() * (y1 - y0);
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${dark})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

/** Softens a face's outer edge so neighbouring blocks read as separate solids
    without needing outline geometry (which looked like a harsh cartoon stroke). */
function vignette(ctx, size, alpha = 0.16) {
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.14, "rgba(0,0,0,0)");
  g.addColorStop(0.86, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function makeGrassTop(base, hi) {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    // scattered brighter blades, clustered rather than uniform noise
    ctx.fillStyle = hi;
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.fillRect(x, y, 3, 3);
      if (Math.random() < 0.5) ctx.fillRect(x + 3, y + 2, 2, 2);
    }
    speckle(ctx, s, 90, 0, s, 0.08, 0.07);
    vignette(ctx, s, 0.13);
  });
}

/** Grass cap + earth body: the ragged boundary between them is the single most
    recognisable cue that these are grass-topped ground blocks. */
function makeEarthSide(soil, soilDark, grass, grassDark) {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = soil;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = soilDark;
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(Math.random() * s, 14 + Math.random() * (s - 16), 3 + Math.random() * 4, 3);
    }
    speckle(ctx, s, 120, 14, s, 0.09, 0.11);
    ctx.fillStyle = grass;
    ctx.fillRect(0, 0, s, 10);
    for (let x = 0; x < s; x += 4) {
      ctx.fillRect(x, 10, 4, 1 + Math.random() * 6);
    }
    ctx.fillStyle = grassDark;
    for (let x = 0; x < s; x += 4) {
      if (Math.random() < 0.45) ctx.fillRect(x, 8, 4, 3);
    }
    vignette(ctx, s, 0.15);
  });
}

function makeStoneTop() {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = "#B6BAC4";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#9AA0AA";
    for (let i = 0; i < 14; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 5, 4);
    speckle(ctx, s, 110, 0, s, 0.12, 0.12);
    vignette(ctx, s, 0.18);
  });
}

function makeStoneSide() {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = "#8D939D";
    ctx.fillRect(0, 0, s, s);
    // coarse blocky masonry, so a stone column doesn't read as flat grey
    ctx.fillStyle = "#7B818B";
    for (let y = 4; y < s; y += 14) {
      for (let x = (y / 14) % 2 ? 0 : 8; x < s; x += 20) ctx.fillRect(x, y, 16, 10);
    }
    speckle(ctx, s, 110, 0, s, 0.1, 0.12);
    vignette(ctx, s, 0.18);
  });
}

/** Molten top: dark crust broken by bright veins. Paired with an emissive map
    below so it genuinely glows rather than just being an orange picture. */
function makeLavaTop() {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = "#5E1A0F";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 11;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "#FFD24A");
      g.addColorStop(0.45, "#FF7A1A");
      g.addColorStop(1, "rgba(94,26,15,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, s, 60, 0, s, 0.06, 0.18);
    vignette(ctx, s, 0.22);
  }, { pixel: false });
}

/** Charred rock with lava spilling over the lip — the drip is what sells a
    hazard block as *dangerous* from across the screen. */
function makeLavaSide() {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = "#3A130C";
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 130, 0, s, 0.07, 0.16);
    ctx.fillStyle = "#B8341C";
    ctx.fillRect(0, 0, s, 7);
    ctx.fillStyle = "#FF6A2A";
    ctx.fillRect(0, 0, s, 3);
    for (let x = 2; x < s; x += 9) {
      const h = 5 + Math.random() * 17;
      ctx.fillStyle = "#B8341C";
      ctx.fillRect(x, 5, 5, h);
      ctx.fillStyle = "#FF6A2A";
      ctx.fillRect(x + 1, 5, 3, h * 0.55);
    }
    vignette(ctx, s, 0.2);
  }, { pixel: false });
}

function makeEmissiveFromLava() {
  return makeTex(64, (ctx, s) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 11;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "#FFD24A");
      g.addColorStop(0.5, "#883000");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { pixel: false });
}

function makeFaceTexture(mood) {
  return makeTex(96, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = "#2A2420";
    ctx.strokeStyle = "#2A2420";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    const lx = 33, rx = 63, ey = 42;
    if (mood === "dead") {
      const drawX = (cx) => {
        ctx.beginPath();
        ctx.moveTo(cx - 8, ey - 8); ctx.lineTo(cx + 8, ey + 8);
        ctx.moveTo(cx + 8, ey - 8); ctx.lineTo(cx - 8, ey + 8);
        ctx.stroke();
      };
      drawX(lx); drawX(rx);
    } else if (mood === "hop") {
      // eyes squeezed shut mid-leap — one texture swap reads as real effort
      ctx.beginPath();
      ctx.moveTo(lx - 8, ey); ctx.quadraticCurveTo(lx, ey - 9, lx + 8, ey);
      ctx.moveTo(rx - 8, ey); ctx.quadraticCurveTo(rx, ey - 9, rx + 8, ey);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(lx, ey, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx, ey, 6, 0, Math.PI * 2); ctx.fill();
    }
    // mouth: a small open smile, the difference between "a cube" and "a guy"
    if (mood !== "dead") {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(38, 64);
      ctx.quadraticCurveTo(48, 74, 58, 64);
      ctx.stroke();
    }
  }, { pixel: false });
}

function makeSoftCircleTexture(inner = "rgba(0,0,0,0.5)") {
  return makeTex(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, { pixel: false });
}

function makePuffTexture(color = "255,255,255") {
  return makeTex(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${color},0.95)`);
    g.addColorStop(0.45, `rgba(${color},0.5)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, { pixel: false });
}

function makeSkyTexture() {
  return makeTex(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.52, SKY_MID);
    g.addColorStop(1, SKY_LOW);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, { pixel: false });
}

/** Multi-lobe cloud rather than one radial blob: a single soft circle reads as
    a lens smudge, three overlapping ones read as a cloud. */
function makeCloudTexture() {
  return makeTex(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const blob = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,235,238,${a})`);
      g.addColorStop(0.55, `rgba(255,225,232,${a * 0.55})`);
      g.addColorStop(1, "rgba(255,225,232,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(96, 150, 74, 0.85);
    blob(160, 132, 88, 0.85);
    blob(206, 158, 60, 0.8);
    blob(126, 118, 56, 0.75);
  }, { pixel: false });
}

/**
 * Owns the whole 3D scene imperatively, reading playerRef/hopRef/rowsRef/
 * dangerRowRef fresh every frame. The game loop in PloopClimb.jsx advances
 * those refs; this file never influences hop timing, collision, or row
 * generation — it only ever decides what pixels that state produces.
 */
export default function Scene3D({
  phase, playerRef, hopRef, rowsRef, dangerRowRef, standTimeRef, standLimit,
  gemsRef, bump, reducedMotion, fxRef,
}) {
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
       flattened to black. The sky lives inside the scene instead. */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* setSize(w, h, false) below deliberately skips three's own style update (it
       would fight the layout), which leaves the canvas sized by its width/height
       *attributes* — i.e. w x devicePixelRatio CSS pixels. On a 2x screen that's
       a canvas twice the size of its container, clipped by the parent's
       overflow:hidden, so only the top-left quadrant of the render was ever on
       screen. Pinning the CSS size here is what actually centres the scene. */
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    /* fog is doing real compositional work: the field has no far edge, so
       without it the grid just stops mid-air. Fogging into the sky's low tone
       makes the tower dissolve into the horizon instead. */
    scene.fog = new THREE.Fog(FOG_COLOR, 26, 50);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 70);

    /* three lights: warm key from the sky's direction, cool sky/ground bounce,
       and a dim coral rim from below so blocks pick up the sky colour on their
       front faces rather than going muddy where the key doesn't reach */
    scene.add(new THREE.HemisphereLight(0xffe9d6, 0x5c7a3c, 0.9));
    const key = new THREE.DirectionalLight(0xfff3e0, 1.15);
    key.position.set(4, 9, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7a58, 0.32);
    rim.position.set(-3, -2, 6);
    scene.add(rim);

    /* signature motif: a living sky the collapse chases the climber up through */
    const cloudTex = makeCloudTexture();
    const clouds = [
      { x: -9.5, y: 3.0, z: 5, s: 8.5, sp: 0.055, o: 0.6 },
      { x: 10.5, y: 6.0, z: 0, s: 10.5, sp: 0.04, o: 0.52 },
      { x: -9.0, y: 9.5, z: -10, s: 12, sp: 0.03, o: 0.45 },
      { x: 9.5, y: 2.5, z: -17, s: 9, sp: 0.05, o: 0.5 },
      { x: -3.0, y: 13.0, z: -26, s: 14, sp: 0.025, o: 0.34 },
    ].map((c, i) => {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: c.o, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      s.scale.set(c.s, c.s * 0.5, 1);
      scene.add(s);
      return { sprite: s, mat, ...c, phase: i * 37 };
    });

    /* ── tiles ─────────────────────────────────────────────────────────────
       BoxGeometry face groups are [+x,-x,+y(top),-y(bottom),+z,-z], so each
       tile type gets a 6-material set with its own top and side maps. A single
       flat colour per tile is what merged same-coloured neighbours into one
       unreadable mass; a distinct grass-top / earth-side pairing is what makes
       each cube read as an individual block. ── */
    const tileGeo = new THREE.BoxGeometry(TILE_W * TILE_INSET, TILE_H, TILE_D * TILE_INSET);
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 0.95 });

    function faceSet(topTex, sideTex, extra = {}) {
      const top = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.85, metalness: 0.02, ...extra });
      const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9, metalness: 0.02, ...extra });
      return { mats: [side, side, top, bottomMat, side, side], top, side };
    }

    /* two grass variants: a perfectly uniform field of identical blocks looks
       machine-stamped, and the reference art's ground is visibly patchy */
    const grassA = faceSet(
      makeGrassTop("#7FCB3C", "#9BDD5A"),
      makeEarthSide("#C79A63", "#A97F4C", "#7FCB3C", "#5FA82C"),
    );
    const grassB = faceSet(
      makeGrassTop("#5FAE33", "#7BC948"),
      makeEarthSide("#AC8452", "#8E6B3E", "#5FAE33", "#4A8C26"),
    );
    const stone = faceSet(makeStoneTop(), makeStoneSide());
    const lavaEmissive = makeEmissiveFromLava();
    const lava = faceSet(makeLavaTop(), makeLavaSide(), {
      emissive: 0xffffff,
      emissiveMap: lavaEmissive,
      emissiveIntensity: 0.85,
      roughness: 0.6,
    });

    function tileMatsFor(type, row, col) {
      if (type === CRACK) return lava.mats;
      if (type === SPIKE) return stone.mats;
      return (row * 3 + col * 5) % 7 < 3 ? grassB.mats : grassA.mats;
    }

    /* ── props ── */
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.095, 0.3, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.85 });
    const foliageGeo = new THREE.ConeGeometry(0.4, 0.55, 7);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2b7d55, roughness: 0.65 });
    const foliageGeo2 = new THREE.ConeGeometry(0.3, 0.44, 7);
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x17d39b, roughness: 0.6 });
    const foliageGeo3 = new THREE.ConeGeometry(0.19, 0.32, 7);

    const spikeGeo = new THREE.ConeGeometry(0.1, 0.42, 6);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde5, roughness: 0.3, metalness: 0.45 });

    const gemGeo = new THREE.OctahedronGeometry(0.24, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xffc93c, emissive: 0xffa31a, emissiveIntensity: 0.85,
      roughness: 0.25, metalness: 0.35, flatShading: true,
    });
    const gemGlowTex = makePuffTexture("255,190,70");
    const gemGlowMat = new THREE.SpriteMaterial({ map: gemGlowTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

    function buildProp(type, row, col) {
      if (type === TREE) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.15;
        const f1 = new THREE.Mesh(foliageGeo, foliageMat);
        f1.position.y = 0.5;
        const f2 = new THREE.Mesh(foliageGeo2, foliageMat2);
        f2.position.y = 0.78;
        const f3 = new THREE.Mesh(foliageGeo3, foliageMat2);
        f3.position.y = 1.0;
        g.add(trunk, f1, f2, f3);
        g.rotation.y = ((row * 7 + col * 11) % 6) * 0.5;
        return g;
      }
      if (type === SPIKE) {
        const g = new THREE.Group();
        [-0.24, 0.02, 0.24].forEach((x, i) => {
          const s = new THREE.Mesh(spikeGeo, spikeMat);
          s.position.set(x, 0.21 + (i === 1 ? 0.09 : 0), (i - 1) * 0.16);
          s.scale.setScalar(i === 1 ? 1.3 : 1);
          g.add(s);
        });
        return g;
      }
      return null;
    }

    /* ── tile pool + collapse ──────────────────────────────────────────────
       A tile leaves the pool in one of two ways. Scrolling out of range far
       ahead/behind is a silent recycle. Being overtaken by the collapse is the
       opposite: it moves to `crumbling`, where it shudders, then tips and
       falls out of the world. That fall *is* the mechanic — "the bottom
       disappears, and if you're slow you're standing on it". ── */
    const tilePool = new Map();
    const crumbling = [];

    function makeTile(rn, c, type) {
      const group = new THREE.Group();
      const lift = type === CRACK || type === SPIKE ? HAZARD_LIFT : 0;
      const tile = new THREE.Mesh(tileGeo, tileMatsFor(type, rn, c));
      tile.position.y = lift - TILE_H / 2;
      group.add(tile);
      const prop = buildProp(type, rn, c);
      if (prop) { prop.position.y = lift; group.add(prop); }
      if (type === SAFE && gemAt(rn, c)) {
        const gem = new THREE.Mesh(gemGeo, gemMat);
        gem.position.y = 0.52;
        const glow = new THREE.Sprite(gemGlowMat);
        glow.scale.set(0.8, 0.8, 1);
        glow.position.y = 0.52;
        const holder = new THREE.Group();
        holder.add(glow, gem);
        holder.userData.isGem = true;
        group.add(holder);
        group.userData.gem = holder;
      }
      group.position.set(worldX(rn, c), TILE_TOP_Y, worldZ(rn));
      group.userData.row = rn;
      group.userData.col = c;
      return group;
    }

    function syncTiles(minRow, maxRow, rows, dangerRow) {
      const seen = new Set();
      for (let rn = maxRow; rn >= minRow; rn--) {
        const row = getRow(rows, rn);
        for (let c = 0; c < COLS; c++) {
          const type = row[c];
          if (type === undefined || type === EMPTY) continue;
          const key = `${rn}-${c}`;
          seen.add(key);
          if (!tilePool.has(key)) {
            /* never spawn a tile that the collapse has already passed —
               otherwise scrolling backwards pops solid ground into a hole */
            if (rn < dangerRow) continue;
            const g = makeTile(rn, c, type);
            scene.add(g);
            tilePool.set(key, g);
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

    function startCrumble(key, group, delay) {
      tilePool.delete(key);
      crumbling.push({
        group,
        t: -delay,
        baseY: group.position.y,
        baseX: group.position.x,
        baseZ: group.position.z,
        vy: 1.1,
        rx: 1.1 + Math.random() * 1.6,
        rz: (Math.random() - 0.5) * 2.4,
        tipX: (Math.random() - 0.5) * 1.2,
        tipZ: 0.9 + Math.random() * 0.8,
      });
    }

    /* ── climber ───────────────────────────────────────────────────────────
       Chunky voxel build with separate limbs, because the limbs are what
       carry the hop: a single rounded box can only squash, while arms that
       swing up and legs that tuck make the leap legible at a glance. ── */
    const climberGroup = new THREE.Group();
    const climberTilt = new THREE.Group(); // lean/topple pivot, kept off the hop transform
    climberGroup.add(climberTilt);

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c9a3, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3d64ff, roughness: 0.5, metalness: 0.05 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.7 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xff4529, roughness: 0.5 });

    const torsoGeo = new RoundedBoxGeometry(0.5, 0.44, 0.36, 3, 0.07);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 0.52;
    climberTilt.add(torso);

    const headGeo = new RoundedBoxGeometry(0.46, 0.42, 0.42, 3, 0.09);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.95;
    climberTilt.add(head);

    const capGeo = new RoundedBoxGeometry(0.5, 0.2, 0.46, 3, 0.07);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.y = 1.24;
    climberTilt.add(capMesh);
    const brimGeo = new THREE.BoxGeometry(0.44, 0.06, 0.16);
    const brim = new THREE.Mesh(brimGeo, capMat);
    brim.position.set(0, 1.16, 0.28);
    climberTilt.add(brim);

    const armGeo = new RoundedBoxGeometry(0.15, 0.36, 0.15, 2, 0.05);
    /* pivoted at the shoulder: the mesh hangs below its own group so rotating
       the group swings the arm instead of spinning it about its middle */
    function makeLimb(geo, mat, x, y, len) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = -len / 2;
      pivot.add(m);
      climberTilt.add(pivot);
      return pivot;
    }
    const armL = makeLimb(armGeo, skinMat, -0.32, 0.68, 0.36);
    const armR = makeLimb(armGeo, skinMat, 0.32, 0.68, 0.36);
    const legGeo = new RoundedBoxGeometry(0.17, 0.32, 0.18, 2, 0.05);
    const legL = makeLimb(legGeo, pantsMat, -0.13, 0.31, 0.32);
    const legR = makeLimb(legGeo, pantsMat, 0.13, 0.31, 0.32);

    const faceMat = new THREE.MeshBasicMaterial({ map: makeFaceTexture("idle"), transparent: true, depthWrite: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), faceMat);
    face.position.set(0, 0.95, 0.215);
    climberTilt.add(face);
    scene.add(climberGroup);

    let currentMood = "idle";
    function setMood(mood) {
      if (mood === currentMood) return;
      currentMood = mood;
      faceMat.map?.dispose();
      faceMat.map = makeFaceTexture(mood);
      faceMat.needsUpdate = true;
    }

    /* soft contact shadow — cheap grounding cue, no shadow map needed */
    const shadowTex = makeSoftCircleTexture();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.4, depthWrite: false });
    const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    scene.add(shadowMesh);

    /* landing target reticle: during a hop, a ring marks exactly where the
       climber comes down — the whole game is a commitment to one of two
       diagonals, so showing the outcome of that commitment is worth a mesh */
    const ringGeo = new THREE.RingGeometry(0.4, 0.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    scene.add(ringMesh);

    /* ── particles: one shared pool for dust, gem sparks and debris ── */
    const dustTex = makePuffTexture("255,238,220");
    const sparkTex = makePuffTexture("255,205,90");
    const PARTICLE_MAX = 64;
    const particles = [];
    for (let i = 0; i < PARTICLE_MAX; i++) {
      const mat = new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      particles.push({ sprite: s, mat, life: 0, ttl: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, o0: 0 });
    }
    let particleCursor = 0;
    function emit(x, y, z, opts = {}) {
      const {
        count = 6, spread = 0.35, speed = 1.1, up = 1.4, ttl = 0.5,
        size0 = 0.3, size1 = 0.85, opacity = 0.75, tex = dustTex, gravity = true,
      } = opts;
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_MAX;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * speed;
        p.sprite.position.set(x + (Math.random() - 0.5) * spread, y + Math.random() * 0.15, z + (Math.random() - 0.5) * spread);
        p.vx = Math.cos(a) * r;
        p.vz = Math.sin(a) * r;
        p.vy = up * (0.5 + Math.random() * 0.7);
        p.life = 0;
        p.ttl = ttl * (0.75 + Math.random() * 0.5);
        p.s0 = size0; p.s1 = size1; p.o0 = opacity;
        p.gravity = gravity;
        p.mat.map = tex;
        p.mat.opacity = opacity;
        p.mat.needsUpdate = true;
        p.sprite.scale.set(size0, size0, 1);
        p.sprite.visible = true;
      }
    }

    /* ── the collapse front ────────────────────────────────────────────────
       Three cheap layers rather than one plane: a glowing magma seam right at
       the line, a rolling dust bank just in front of it, and a dark void
       beneath the field so falling blocks drop into something. ── */
    const seamTex = makePuffTexture("255,90,40");
    const seamMat = new THREE.MeshBasicMaterial({ map: seamTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const seamMesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WORLD_W * 1.5, 3.2), seamMat);
    seamMesh.rotation.x = -Math.PI / 2;
    scene.add(seamMesh);

    /* ── post ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    /* high threshold on purpose: the bright grass tops sail past a low one and
       wash the whole field into a green haze — bloom here is for the lava,
       the gems and the collapse seam only */
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.45, 0.9);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    /* camera distance is solved from the *horizontal* FOV, not hardcoded: a
       portrait phone's horizontal FOV is roughly vertical × aspect, so a fixed
       distance that frames the 5-wide grid on one device crops it on another */
    let camDist = 17;
    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      composer.setSize(w, h);
      const vHalf = (CAMERA_FOV * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      camDist = THREE.MathUtils.clamp((GRID_WORLD_W * 0.62) / Math.tan(hHalf), 12, 30);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let bumpState = null;
    apiRef.current.applyBump = (b) => { bumpState = b ? { ...b, t: 0 } : null; };

    let shake = 0;
    apiRef.current.shake = (amount) => { shake = Math.max(shake, amount); };
    apiRef.current.gemBurst = (row, col) => {
      emit(worldX(row, col), TILE_TOP_Y + 0.5, worldZ(row), {
        count: 12, speed: 1.9, up: 2.4, ttl: 0.6, size0: 0.18, size1: 0.5,
        opacity: 0.95, tex: sparkTex, spread: 0.3,
      });
      shake = Math.max(shake, 0.05);
    };
    if (fxRef) fxRef.current = apiRef.current;

    let followZ = 0;
    let camY = 0;
    let raf = null;
    let last = performance.now();
    let t = 0;
    let deathT = null;
    let prevHopActive = false;
    let shakingTile = null;
    let prevPhase = null;
    const collectedPop = new Map(); // gem holder -> pop progress

    const camTarget = new THREE.Vector3();

    const animate = (now) => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const paused = phaseRef.current === "paused";
      if (!paused) t += dt;
      const stepDt = paused ? 0 : dt;

      /* a fresh run starting (including the very first) — clear tiles left over
         from the previous run rather than reusing stale positions or types */
      if (phaseRef.current === "play" && prevPhase !== "play" && prevPhase !== "paused") {
        for (const [, g] of tilePool) scene.remove(g);
        tilePool.clear();
        for (const c of crumbling) scene.remove(c.group);
        crumbling.length = 0;
        collectedPop.clear();
        shakingTile = null;
        deathT = null;
        shake = 0;
        followZ = worldZ(playerRef.current.row);
      }
      prevPhase = phaseRef.current;

      const player = playerRef.current;
      const hop = hopRef.current;
      const dead = phaseRef.current === "dead";
      const dangerRow = dangerRowRef.current;

      /* ── camera: follows the climber's depth, angled down at a fixed tilt ── */
      const targetZ = worldZ(player.row) - CAMERA_LOOK_LEAD;
      followZ += (targetZ - followZ) * FOLLOW_LERP;
      camTarget.set(0, TILE_TOP_Y, followZ);
      camY = Math.sin(CAMERA_TILT) * camDist;
      camera.position.set(0, camTarget.y + camY, camTarget.z + Math.cos(CAMERA_TILT) * camDist);

      if (shake > 0.0005 && !reducedMotionRef.current) {
        camera.position.x += (Math.random() - 0.5) * shake * 2;
        camera.position.y += (Math.random() - 0.5) * shake * 2;
        shake *= Math.pow(0.0016, stepDt);
      } else {
        shake = 0;
      }
      camera.lookAt(camTarget);

      const playerRow = player.row;
      const minRow = Math.max(0, Math.floor(playerRow - VISIBLE_BEHIND));
      const maxRow = Math.ceil(playerRow + VISIBLE_AHEAD);
      syncTiles(minRow, maxRow, rowsRef.current, dangerRow);

      /* ── hand tiles the collapse has reached over to the crumble list.
         Staggering the delay by column makes the front tear across the field
         rather than snapping a whole row out at once. ── */
      if (!paused) {
        for (const [key, group] of [...tilePool]) {
          if (group.userData.row < dangerRow) {
            startCrumble(key, group, group.userData.col * 0.045 + Math.random() * 0.06);
          }
        }
      }
      for (let i = crumbling.length - 1; i >= 0; i--) {
        const c = crumbling[i];
        c.t += stepDt;
        if (c.t < 0) continue;
        if (c.t < 0.34) {
          // shudder in place first — a block that simply vanishes reads as a bug
          const a = reducedMotionRef.current ? 0 : 0.055 * (c.t / 0.34);
          c.group.position.x = c.baseX + Math.sin(c.t * 70) * a;
          c.group.position.y = c.baseY + Math.cos(c.t * 61) * a * 0.6;
          if (c.t >= 0.34 - stepDt) {
            emit(c.baseX, TILE_TOP_Y - 0.35, c.group.position.z, {
              count: 5, speed: 1.0, up: 0.55, ttl: 0.85, size0: 0.4, size1: 1.9, opacity: 0.5,
            });
          }
        } else {
          const ft = c.t - 0.34;
          c.vy -= 13 * stepDt;
          c.group.position.y += c.vy * stepDt;
          c.group.position.x = c.baseX + c.tipX * ft * ft;
          c.group.position.z = c.baseZ + c.tipZ * ft;
          c.group.rotation.x = c.rx * ft * ft * 0.8;
          c.group.rotation.z = c.rz * ft * ft * 0.8;
          if (c.group.position.y < -16) {
            scene.remove(c.group);
            crumbling.splice(i, 1);
          }
        }
      }

      /* ── climber transform ── */
      let cx = worldX(player.row, player.col);
      let cy = TILE_TOP_Y;
      let cz = worldZ(player.row);
      let squashX = 1, squashY = 1, lean = 0;
      let armSwing = 0, legTuck = 0;

      if (hop.active) {
        const fx = worldX(hop.from.row, hop.from.col), fz = worldZ(hop.from.row);
        const tx = worldX(hop.to.r, hop.to.c), tz = worldZ(hop.to.r);
        const p = hop.t;
        cx = fx + (tx - fx) * p;
        cz = fz + (tz - fz) * p;
        cy = TILE_TOP_Y + Math.sin(p * Math.PI) * 0.72;
        lean = hop.dir * Math.sin(p * Math.PI) * 0.42;
        const arc = Math.sin(p * Math.PI);
        squashX = 1 + arc * 0.1;
        squashY = 1 - arc * 0.1;
        armSwing = -arc * 2.1;
        legTuck = arc * 1.1;
        setMood("hop");
      } else if (bumpState) {
        bumpState.t += stepDt;
        const p = Math.min(1, bumpState.t / 0.22);
        lean = -bumpState.dir * Math.sin(p * Math.PI) * 0.5;
        cx += bumpState.dir * Math.sin(p * Math.PI) * 0.14;
        if (p >= 1) bumpState = null;
      } else if (!dead && !reducedMotionRef.current) {
        const idle = Math.sin(t * 3.1) * 0.045;
        squashY = 1 + idle;
        squashX = 1 - idle * 0.5;
        armSwing = Math.sin(t * 3.1) * 0.12;
      }

      /* landing beat: the frame the hop ends is the one moment the game gives
         back physical feedback, so it gets dust, a squash and a nudge of shake */
      if (prevHopActive && !hop.active && !dead) {
        emit(cx, TILE_TOP_Y + 0.02, cz, { count: 7, speed: 1.3, up: 0.7, ttl: 0.42, size0: 0.22, size1: 0.9, opacity: 0.6 });
        shake = Math.max(shake, 0.035);
      }
      prevHopActive = hop.active;

      if (!dead && !hop.active) setMood("idle");

      /* the tile under a stationary climber shakes harder as it nears its own
         collapse (see STAND_LIMIT in PloopClimb.jsx) — a visible warning that
         standing still is never safe, delivered before the ground actually goes */
      const standProgress = !dead && standTimeRef ? Math.min(1, standTimeRef.current / (standLimit || 1)) : 0;
      if (!dead && !hop.active && standProgress > 0.45) {
        const g = tilePool.get(`${player.row}-${player.col}`);
        if (g) {
          if (shakingTile && shakingTile.group !== g) {
            shakingTile.group.position.x = shakingTile.baseX;
            shakingTile.group.position.y = TILE_TOP_Y;
          }
          if (!shakingTile || shakingTile.group !== g) {
            shakingTile = { group: g, baseX: worldX(player.row, player.col) };
          }
          const k = (standProgress - 0.45) / 0.55;
          const amt = reducedMotionRef.current ? 0 : k * k * 0.075;
          g.position.x = shakingTile.baseX + Math.sin(t * 48) * amt;
          g.position.y = TILE_TOP_Y - k * k * 0.09 + Math.cos(t * 41) * amt * 0.5;
          cy += g.position.y - TILE_TOP_Y;
        }
      } else if (shakingTile) {
        shakingTile.group.position.x = shakingTile.baseX;
        shakingTile.group.position.y = TILE_TOP_Y;
        shakingTile = null;
      }

      if (dead) {
        setMood("dead");
        if (deathT === null) {
          deathT = 0;
          shake = Math.max(shake, 0.14);
          emit(cx, TILE_TOP_Y + 0.2, cz, { count: 10, speed: 1.6, up: 1.2, ttl: 0.8, size0: 0.3, size1: 1.5, opacity: 0.6 });
        }
        deathT = Math.min(1, deathT + dt / 0.55);
        const dp = deathT;
        climberGroup.position.set(cx, cy - dp * 0.35, cz);
        climberTilt.rotation.z = -Math.PI * 0.45 * dp;
        climberTilt.rotation.x = 0;
        climberGroup.scale.setScalar(1 - dp * 0.12);
        armL.rotation.x = -2.2 * dp;
        armR.rotation.x = -2.2 * dp;
        legL.rotation.x = 0.8 * dp;
        legR.rotation.x = 0.8 * dp;
      } else {
        deathT = null;
        climberGroup.position.set(cx, cy, cz);
        climberGroup.scale.set(squashX, squashY, squashX);
        climberTilt.rotation.z = lean;
        climberTilt.rotation.x = hop.active ? -Math.sin(hop.t * Math.PI) * 0.22 : 0;
        armL.rotation.x = armSwing;
        armR.rotation.x = armSwing;
        armL.rotation.z = -armSwing * 0.35;
        armR.rotation.z = armSwing * 0.35;
        legL.rotation.x = legTuck;
        legR.rotation.x = legTuck * 0.7;
      }

      /* contact shadow + landing reticle: both pinned to the destination tile
         mid-hop, so the player can read where they're committed to land */
      const tgtRow = hop.active ? hop.to.r : player.row;
      const tgtCol = hop.active ? hop.to.c : player.col;
      const tgtX = worldX(tgtRow, tgtCol), tgtZ = worldZ(tgtRow);
      shadowMesh.position.set(cx, TILE_TOP_Y + 0.015, cz);
      const hopLift = hop.active ? Math.sin(hop.t * Math.PI) : 0;
      shadowMesh.scale.setScalar(1 - hopLift * 0.35);
      shadowMat.opacity = 0.4 - hopLift * 0.2;
      shadowMesh.visible = !dead;

      ringMesh.position.set(tgtX, TILE_TOP_Y + 0.02, tgtZ);
      ringMesh.visible = hop.active && !dead;
      ringMat.opacity = 0.15 + hopLift * 0.4;

      /* ── collapse front visuals ── */
      const dz = worldZ(dangerRow);
      seamMesh.position.set(0, TILE_TOP_Y + 0.04, dz + 0.7);
      const dangerClose = !dead && player.row - dangerRow < DANGER_WARN_ROWS;
      const pulse = dangerClose && !reducedMotionRef.current ? 0.75 + Math.sin(t * 10) * 0.25 : 0.55;
      seamMat.opacity = 0.3 * pulse;
      /* no standing smoke bank here: as camera-facing sprites they painted
         pale smears across the intact grass in front of the front. The dust
         thrown off by each block as it goes is both honest and cleaner. */

      /* ── gems: spin, bob, and pop when banked ── */
      const collected = gemsRef?.current?.collected;
      for (const [key, group] of tilePool) {
        const holder = group.userData.gem;
        if (!holder) continue;
        if (collected && collected.has(key) && !collectedPop.has(holder)) {
          collectedPop.set(holder, 0);
        }
        const pop = collectedPop.get(holder);
        if (pop === undefined) {
          holder.rotation.y = t * 1.9;
          holder.position.y = reducedMotionRef.current ? 0 : Math.sin(t * 2.4 + group.userData.row) * 0.08;
          holder.visible = true;
        } else {
          const np = Math.min(1, pop + stepDt / 0.28);
          collectedPop.set(holder, np);
          holder.position.y = np * 1.1;
          holder.scale.setScalar(Math.max(0.001, 1 + np * 0.6 - np * np * 1.6));
          holder.visible = np < 1;
        }
      }

      /* ── particles ── */
      for (const p of particles) {
        if (!p.sprite.visible) continue;
        p.life += stepDt;
        const k = p.life / p.ttl;
        if (k >= 1) { p.sprite.visible = false; continue; }
        if (p.gravity) p.vy -= 3.4 * stepDt;
        p.sprite.position.x += p.vx * stepDt;
        p.sprite.position.y += p.vy * stepDt;
        p.sprite.position.z += p.vz * stepDt;
        p.vx *= 0.94; p.vz *= 0.94;
        const sc = p.s0 + (p.s1 - p.s0) * k;
        p.sprite.scale.set(sc, sc, 1);
        p.mat.opacity = p.o0 * (1 - k * k);
      }

      /* clouds ride with the camera's depth so the sky never runs out */
      for (const c of clouds) {
        c.sprite.position.set(
          c.x + (reducedMotionRef.current ? 0 : Math.sin(t * c.sp + c.phase) * 2.2),
          c.y,
          followZ + c.z,
        );
      }

      composer.render();
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (fxRef) fxRef.current = null;
      for (const [, g] of tilePool) scene.remove(g);
      for (const c of crumbling) scene.remove(c.group);
      tileGeo.dispose();
      bottomMat.dispose();
      for (const set of [grassA, grassB, stone, lava]) {
        set.top.map?.dispose();
        set.top.emissiveMap?.dispose();
        set.top.dispose();
        set.side.map?.dispose();
        set.side.dispose();
      }
      trunkGeo.dispose(); trunkMat.dispose();
      foliageGeo.dispose(); foliageGeo2.dispose(); foliageGeo3.dispose();
      foliageMat.dispose(); foliageMat2.dispose();
      spikeGeo.dispose(); spikeMat.dispose();
      gemGeo.dispose(); gemMat.dispose(); gemGlowTex.dispose(); gemGlowMat.dispose();
      torsoGeo.dispose(); headGeo.dispose(); capGeo.dispose(); brimGeo.dispose();
      armGeo.dispose(); legGeo.dispose();
      skinMat.dispose(); shirtMat.dispose(); pantsMat.dispose(); capMat.dispose();
      faceMat.map?.dispose(); faceMat.dispose();
      shadowTex.dispose(); shadowMat.dispose();
      ringGeo.dispose(); ringMat.dispose();
      dustTex.dispose(); sparkTex.dispose();
      for (const p of particles) p.mat.dispose();
      seamTex.dispose(); seamMat.dispose();
      cloudTex.dispose();
      for (const c of clouds) c.mat.dispose();
      scene.background?.dispose?.();
      composer.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerRef, hopRef, rowsRef, dangerRowRef, gemsRef, fxRef]);

  /* bump is simple prop-driven state (not time-critical enough to need the
     full imperative-handle pattern) */
  const bumpKeyRef = useRef(null);
  useEffect(() => {
    if (bump && bump.key !== bumpKeyRef.current) {
      bumpKeyRef.current = bump.key;
      apiRef.current.applyBump?.(bump);
    }
  }, [bump]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
}
