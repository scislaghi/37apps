import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/* ── real 3D tunnel: replaces the old DOM/clip-path pseudo-3D road. A real camera +
   perspective projection does the "shrink toward the horizon" work for free, so unlike
   the old code there's no proj()/chamfer math here — geometry is placed at its true
   world depth and the camera does the rest. Glossy PBR materials + UnrealBloomPass on
   emissive surfaces is what gets this near the "glossy candy" look of Twisty Road-style
   hypercasual games; flat CSS gradients/box-shadows can't produce real specular falloff. ── */

const ROAD_WIDTH = 4.8;
const ROAD_LENGTH = 60;
const WALL_H = 2.3;
const CAMERA_HEIGHT = 2.15;
const CAMERA_BACK = 5.4;
const Z_SCALE = 24; /* world units per Morph.jsx normalized z unit */

/* visual-only shape/hole dimensions — deliberately separate from Morph.jsx's px-based
   SHAPES/HOLES (which drive the actual pass/fail collision check). Keeping these apart
   means this file can never accidentally influence gameplay. Sized down ~30% from the
   first pass so the player reads as a character on the road, not the whole scene. */
const PLAYER3D = {
  cube: { w: 1.22, h: 1.22 },
  tall: { w: 0.68, h: 1.94 },
  wide: { w: 1.94, h: 0.68 },
};
const HOLE3D = {
  cube: { w: 1.44, h: 1.44 },
  tall: { w: 0.9, h: 2.16 },
  wide: { w: 2.16, h: 0.9 },
};

const ROAD_FAR = 0xf7f5f2;
const ROAD_NEAR = 0xdad4c6;
const RAIL_COLOR = 0xffffff;
const FACE_COLOR = "#18171d";

function makeGradientTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, "#1DC0ED");
  g.addColorStop(1, "#7B42FF");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowSpriteTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeFaceTexture(mood) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = FACE_COLOR;
  ctx.strokeStyle = FACE_COLOR;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  const lx = 46, rx = 82, ey = 50;
  if (mood === "dead") {
    const drawX = (cx) => {
      ctx.beginPath();
      ctx.moveTo(cx - 9, ey - 9); ctx.lineTo(cx + 9, ey + 9);
      ctx.moveTo(cx + 9, ey - 9); ctx.lineTo(cx - 9, ey + 9);
      ctx.stroke();
    };
    drawX(lx); drawX(rx);
  } else if (mood === "happy") {
    const drawSquint = (cx) => {
      ctx.beginPath(); ctx.arc(cx, ey + 6, 10, Math.PI, 0); ctx.stroke();
    };
    drawSquint(lx); drawSquint(rx);
  } else {
    ctx.beginPath(); ctx.arc(lx, ey, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx, ey, 7, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDashTexture() {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(24,23,29,0.28)";
  ctx.fillRect(0, 0, 8, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, ROAD_LENGTH / 1.4);
  return tex;
}

/**
 * Owns the whole 3D scene imperatively — its own render loop reads gatesRef /
 * shapeRef / scoreRef fresh every frame, decoupled from React's render cycle, so
 * Morph.jsx no longer needs a per-frame setState just to keep visuals in sync with
 * the (unchanged) game loop. FX are triggered via the exposed imperative handle
 * instead of prop/state round-trips, so they fire the instant Morph.jsx calls them.
 */
const Scene3D = forwardRef(function Scene3D(
  { phase, gatesRef, shapeRef, scoreRef, reducedMotion },
  ref
) {
  const mountRef = useRef(null);
  const apiRef = useRef({});
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useImperativeHandle(ref, () => ({
    triggerEntrance: (...a) => apiRef.current.triggerEntrance?.(...a),
    triggerPass: (...a) => apiRef.current.triggerPass?.(...a),
    triggerDeath: (...a) => apiRef.current.triggerDeath?.(...a),
    triggerGhost: (...a) => apiRef.current.triggerGhost?.(...a),
    setMood: (...a) => apiRef.current.setMood?.(...a),
  }));

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ROAD_FAR);
    scene.fog = new THREE.Fog(ROAD_FAR, ROAD_LENGTH * 0.32, ROAD_LENGTH * 1.02);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    camera.position.set(0, CAMERA_HEIGHT, CAMERA_BACK);
    camera.lookAt(0, WALL_H * 0.32, -ROAD_LENGTH * 0.5);

    /* only two lights in the whole scene — ambient fill + one key light. Gates and the
       player carry their own emissive materials for "glow," so no per-object point
       lights are needed; keeps the tunnel calm/legible instead of a mess of colored
       light spilling over everything (37apps brand kit: disciplined, not candy-neon). */
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a0, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2.5, 6, 4);
    scene.add(key);

    /* ── road surface ── */
    const roadMat = new THREE.MeshStandardMaterial({ color: ROAD_NEAR, roughness: 0.65, metalness: 0.12 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH + 6), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -(ROAD_LENGTH - 4) / 2);
    scene.add(road);

    const dashTex = makeDashTexture();
    const dashMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false });
    const dashLine = new THREE.Mesh(new THREE.PlaneGeometry(0.1, ROAD_LENGTH), dashMat);
    dashLine.rotation.x = -Math.PI / 2;
    dashLine.position.set(0, 0.01, -ROAD_LENGTH / 2 + 4);
    scene.add(dashLine);

    const railGeo = new THREE.BoxGeometry(0.06, 0.06, ROAD_LENGTH);
    const railMat = new THREE.MeshStandardMaterial({ color: RAIL_COLOR, emissive: RAIL_COLOR, emissiveIntensity: 0.12, roughness: 0.4 });
    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(-ROAD_WIDTH / 2, 0.03, -ROAD_LENGTH / 2 + 4);
    const railR = railL.clone();
    railR.position.x = ROAD_WIDTH / 2;
    scene.add(railL, railR);

    /* portal glow at the horizon — tints to whichever gate the player is about to
       face, giving a free anticipation cue with zero extra game state. This is the
       game's one "signature motif" per the brand kit (a soft accent-colored glow,
       used sparingly) rather than a light source. */
    const glowTex = makeGlowSpriteTexture();
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x1dc0ed, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glowSprite.scale.set(7, 7, 1);
    glowSprite.position.set(0, WALL_H * 0.45, -ROAD_LENGTH + 3);
    scene.add(glowSprite);

    /* ── gates: shared unit geometry, scaled/positioned per instance; materials cached
       per accent color (only 8 ever exist) so spawning/despawning never allocates GPU
       buffers — important since gates cycle constantly during play ── */
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMatCache = new Map();
    /* frosted, semi-transparent panels — lets the next gate show through instead of
       fully blocking the view, and reads as glass rather than a solid neon slab */
    const getWallMat = (color) => {
      let m = wallMatCache.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color, metalness: 0.2, roughness: 0.45, emissive: color, emissiveIntensity: 0.16,
          transparent: true, opacity: 0.55,
        });
        wallMatCache.set(color, m);
      }
      return m;
    };
    const borderMat = new THREE.MeshStandardMaterial({ color: RAIL_COLOR, emissive: RAIL_COLOR, emissiveIntensity: 0.15, roughness: 0.35 });

    function buildGateGroup(type, color) {
      const group = new THREE.Group();
      const hole = HOLE3D[type];
      const wallMat = getWallMat(color);
      const sideW = Math.max(0.02, (ROAD_WIDTH - hole.w) / 2);

      const left = new THREE.Mesh(wallGeo, wallMat);
      left.scale.set(sideW, WALL_H, 0.4);
      left.position.set(-(hole.w / 2 + sideW / 2), WALL_H / 2, 0);
      const right = new THREE.Mesh(wallGeo, wallMat);
      right.scale.set(sideW, WALL_H, 0.4);
      right.position.set(hole.w / 2 + sideW / 2, WALL_H / 2, 0);
      group.add(left, right);

      const topH = Math.max(0, WALL_H - hole.h);
      if (topH > 0.05) {
        const top = new THREE.Mesh(wallGeo, wallMat);
        top.scale.set(hole.w, topH, 0.4);
        top.position.set(0, hole.h + topH / 2, 0);
        group.add(top);
      }

      const bt = 0.06;
      const bTop = new THREE.Mesh(wallGeo, borderMat);
      bTop.scale.set(hole.w, bt, 0.42);
      bTop.position.set(0, hole.h - bt / 2, 0);
      const bLeft = new THREE.Mesh(wallGeo, borderMat);
      bLeft.scale.set(bt, hole.h, 0.42);
      bLeft.position.set(-hole.w / 2 + bt / 2, hole.h / 2, 0);
      const bRight = new THREE.Mesh(wallGeo, borderMat);
      bRight.scale.set(bt, hole.h, 0.42);
      bRight.position.set(hole.w / 2 - bt / 2, hole.h / 2, 0);
      group.add(bTop, bLeft, bRight);

      return group;
    }

    const gateMeshes = new Map();
    function syncGates(list) {
      const seen = new Set();
      for (const g of list) {
        seen.add(g.id);
        let rec = gateMeshes.get(g.id);
        if (!rec) {
          const group = buildGateGroup(g.type, g.color);
          scene.add(group);
          rec = { group };
          gateMeshes.set(g.id, rec);
        }
        rec.group.position.z = -g.z * Z_SCALE;
      }
      for (const [id, rec] of gateMeshes) {
        if (!seen.has(id)) {
          scene.remove(rec.group);
          gateMeshes.delete(id);
        }
      }
    }

    /* ── player: one shared jelly body + a canvas-texture "face" plate that gets
       redrawn only when mood actually changes (idle / happy / dead) ── */
    const playerGroup = new THREE.Group();
    const bodyGeo = new RoundedBoxGeometry(1, 1, 1, 4, 0.22);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: makeGradientTexture(), metalness: 0.18, roughness: 0.35,
      emissive: 0x2c6a99, emissiveIntensity: 0.15,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    playerGroup.add(body);
    const faceMat = new THREE.MeshBasicMaterial({ map: makeFaceTexture("idle"), transparent: true, depthWrite: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), faceMat);
    face.position.z = 0.52;
    playerGroup.add(face);
    scene.add(playerGroup);

    let currentMood = "idle";
    function setMood(mood) {
      if (mood === currentMood) return;
      currentMood = mood;
      faceMat.map?.dispose();
      faceMat.map = makeFaceTexture(mood);
      faceMat.needsUpdate = true;
    }

    /* shape-echo ghost: a fading translucent afterimage of the shape just left,
       so morphing itself reads as an action instead of an instant snap */
    const ghostMat = new THREE.MeshBasicMaterial({ map: bodyMat.map, transparent: true, opacity: 0, depthWrite: false });
    const ghostMesh = new THREE.Mesh(bodyGeo, ghostMat);
    scene.add(ghostMesh);
    let ghost = null;

    /* pooled burst particles for pass/death feedback */
    const sphereGeo = new THREE.SphereGeometry(1, 8, 8);
    let bursts = [];
    function spawnBurst(worldPos, color, count, speed) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const parts = [];
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.scale.setScalar(0.09);
        mesh.position.copy(worldPos);
        scene.add(mesh);
        const angle = (Math.PI * 2 * i) / count + (i % 2 ? 0.2 : -0.2);
        const upBias = 0.6 + Math.random() * 0.5;
        parts.push({
          mesh,
          vel: new THREE.Vector3(Math.cos(angle) * speed, upBias * speed, Math.sin(angle) * speed * 0.6),
        });
      }
      bursts.push({ mat, parts, life: 0, maxLife: 0.55 });
    }

    let shakeUntil = 0;
    const SHAKE_DUR = 0.28;

    let flashUntil = 0;
    const flashLight = new THREE.PointLight(0xffffff, 0, 8, 2);
    flashLight.position.set(0, 1.2, 1.5);
    scene.add(flashLight);

    /* ── imperative FX API, called directly from Morph.jsx's existing callbacks ── */
    apiRef.current.setMood = setMood;
    apiRef.current.triggerEntrance = () => {
      flashLight.color.set(0xffffff);
      flashUntil = performance.now() + 220;
    };
    apiRef.current.triggerPass = (color) => {
      const wp = playerGroup.position.clone(); wp.y += 0.3; wp.z += 0.2;
      spawnBurst(wp, color, 10, 2.2);
      setMood("happy");
      setTimeout(() => setMood(phaseRef.current === "dead" ? "dead" : "idle"), 320);
    };
    apiRef.current.triggerDeath = (color) => {
      const wp = playerGroup.position.clone(); wp.y += 0.3;
      spawnBurst(wp, color, 18, 3.2);
      shakeUntil = performance.now() + SHAKE_DUR * 1000;
      flashLight.color.set(color);
      flashUntil = performance.now() + 260;
      setMood("dead");
    };
    apiRef.current.triggerGhost = (shapeKey) => {
      const dims = PLAYER3D[shapeKey] || PLAYER3D.cube;
      ghost = { t: 0, w: dims.w, h: dims.h };
      ghostMesh.scale.set(dims.w, dims.h, 1);
      ghostMesh.position.copy(playerGroup.position);
      ghostMat.opacity = 0.45;
    };

    /* ── resize ── */
    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      composer.setSize(w, h);
    };
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 0.5);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    /* ── render loop: reads game refs fresh every frame, fully decoupled from React ── */
    let raf = null;
    let last = performance.now();
    let t = 0;
    const springState = { x: PLAYER3D.cube.w, y: PLAYER3D.cube.h, vx: 0, vy: 0 };
    const STIFF = 210, DAMP = 15;

    const animate = (now) => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now; t += dt;

      /* menu/game-over/settings are opaque full-screen panels (brand kit v2) — this
         canvas is only ever visible during "play" and the brief "impact" beat right
         after death (see Morph.jsx endGame), so skip the render work the rest of the
         time rather than paying for it behind a covered screen. Loop keeps ticking
         (cheap) so it resumes instantly, with no WebGL re-init cost, once visible again. */
      if (phaseRef.current !== "play" && phaseRef.current !== "impact") return;

      const list = gatesRef.current;
      syncGates(list);
      const focus = list.length ? list[list.length - 1] : null;
      if (focus) glowSprite.material.color.set(focus.color);

      const target = PLAYER3D[shapeRef.current] || PLAYER3D.cube;
      springState.vx += (STIFF * (target.w - springState.x) - DAMP * springState.vx) * dt;
      springState.x += springState.vx * dt;
      springState.vy += (STIFF * (target.h - springState.y) - DAMP * springState.vy) * dt;
      springState.y += springState.vy * dt;

      const idlePulse = reducedMotionRef.current || phaseRef.current === "dead" ? 0 : Math.sin(t * 3.4) * 0.045;
      const sx = springState.x * (1 - idlePulse * 0.5);
      const sy = springState.y * (1 + idlePulse);
      playerGroup.scale.set(sx, sy, 1);
      playerGroup.position.set(0, sy / 2, 0);

      const glowT = Math.min(1, (scoreRef.current || 0) / 25);
      bloomPass.strength = 0.4 + glowT * 0.18;

      if (!reducedMotionRef.current) dashTex.offset.y -= dt * (0.32 + glowT * 0.2);

      if (ghost) {
        ghost.t += dt;
        const p = Math.min(1, ghost.t / 0.34);
        ghostMat.opacity = 0.45 * (1 - p);
        ghostMesh.scale.set(ghost.w * (1 + p * 0.16), ghost.h * (1 + p * 0.16), 1);
        if (p >= 1) ghost = null;
      }

      bursts = bursts.filter((b) => {
        b.life += dt;
        const k = Math.max(0, 1 - b.life / b.maxLife);
        b.mat.opacity = k;
        for (const part of b.parts) {
          part.vel.y -= 3.2 * dt;
          part.mesh.position.addScaledVector(part.vel, dt);
          part.mesh.scale.setScalar(0.09 * k);
        }
        if (b.life >= b.maxLife) {
          for (const part of b.parts) scene.remove(part.mesh);
          b.mat.dispose();
          return false;
        }
        return true;
      });

      const now2 = performance.now();
      if (shakeUntil > now2 && !reducedMotionRef.current) {
        const k = (shakeUntil - now2) / (SHAKE_DUR * 1000);
        camera.position.x = (Math.random() - 0.5) * 0.22 * k;
        camera.position.y = CAMERA_HEIGHT + (Math.random() - 0.5) * 0.14 * k;
      } else {
        camera.position.x = 0;
        camera.position.y = CAMERA_HEIGHT;
      }

      flashLight.intensity = flashUntil > now2 ? ((flashUntil - now2) / 260) * 4 : 0;

      composer.render();
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const [, rec] of gateMeshes) scene.remove(rec.group);
      for (const b of bursts) { for (const part of b.parts) scene.remove(part.mesh); b.mat.dispose(); }
      wallGeo.dispose();
      sphereGeo.dispose();
      bodyGeo.dispose();
      dashTex.dispose();
      glowTex.dispose();
      bodyMat.map?.dispose();
      bodyMat.dispose();
      faceMat.map?.dispose();
      faceMat.dispose();
      ghostMat.dispose();
      roadMat.dispose();
      railMat.dispose();
      borderMat.dispose();
      for (const m of wallMatCache.values()) m.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    /* gatesRef/shapeRef/scoreRef are ref objects with stable identity (created once
       via useRef in Morph.jsx) — listed for the linter, but their inclusion never
       re-runs this mount effect; the animate loop reads .current fresh every frame
       instead of capturing a value. */
  }, [gatesRef, shapeRef, scoreRef]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
});

export default Scene3D;
