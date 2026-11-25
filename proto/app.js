// proto/app.js — a Three.js driving view for the drivetrain race, proving the
// reference UI's matte studio look works in motion, not just in a showroom.
//
// This file does not touch index.html, its contract, or its tests. It reuses
// the exact physics from proto/sim.js (a copy of index.html's simulation) and
// only owns the 3D presentation: camera, track, trains, steam, HUD, and
// adaptive quality.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSim } from "./sim.js";

const sim = createSim();
const { K, S } = sim;

// ---------------------------------------------------------------- quality
// A phone in portrait must never be assumed powerful. Detect coarse pointer
// or a narrow viewport as "mobile" and pick a lighter tier. The button lets
// the player override the guess either way.
const isCoarsePointer = matchMedia("(pointer: coarse)").matches;
const isNarrow = Math.min(window.innerWidth, window.innerHeight) < 500;
let quality = (isCoarsePointer || isNarrow) ? "mobile" : "desktop";
let qualityAuto = true;

function tier() {
  return quality === "mobile"
    ? { dpr: Math.min(devicePixelRatio || 1, 1.5), shadows: false, steam: 14, aa: false }
    : { dpr: Math.min(devicePixelRatio || 1, 2), shadows: true, steam: 40, aa: true };
}

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("scene");
let t = tier();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: t.aa, alpha: false });
renderer.setPixelRatio(t.dpr);
renderer.shadowMap.enabled = t.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe7e9ea);
scene.fog = new THREE.Fog(0xe7e9ea, 60, 220);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ---------------------------------------------------------------- lights
// The reference's matte "clay" look: a soft key light, a fill light with no
// shadow, and a neutral ambient so nothing goes fully black.
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-30, 40, 20);
key.castShadow = t.shadows;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 120;
key.shadow.camera.left = -30;
key.shadow.camera.right = 30;
key.shadow.camera.top = 30;
key.shadow.camera.bottom = -30;
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(20, 15, -25);
scene.add(fill);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));

// ---------------------------------------------------------------- ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 60),
  new THREE.MeshLambertMaterial({ color: 0xd8dbdb })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(K.TRACK_LENGTH_M / 2, 0, 0);
ground.receiveShadow = t.shadows;
scene.add(ground);

// A cheap baked contact shadow under each train, used instead of a real
// shadow map on the mobile tier.
function makeBlobShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const cx = c.getContext("2d");
  const grd = cx.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.35)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = grd;
  cx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

// ---------------------------------------------------------------- track
// One long InstancedMesh per repeated part. At 2000 m with a 2 m sleeper
// spacing that is ~1000 instances, drawn in a single call each — chunking
// and culling only start to matter well beyond this track's length.
const GAUGE = 1.6;
const trackGroup = new THREE.Group();
scene.add(trackGroup);

{
  const sleeperGeo = new THREE.BoxGeometry(2.4, 0.18, 0.28);
  const sleeperMat = new THREE.MeshLambertMaterial({ color: 0x5b4d3e });
  const spacing = 2;
  const count = Math.floor(K.TRACK_LENGTH_M / spacing);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, count);
  sleepers.receiveShadow = t.shadows;
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) {
    m.setPosition(i * spacing + spacing / 2, 0.09, 0);
    sleepers.setMatrixAt(i, m);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  trackGroup.add(sleepers);

  const railGeo = new THREE.BoxGeometry(K.TRACK_LENGTH_M, 0.14, 0.12);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8b8f92 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(K.TRACK_LENGTH_M / 2, 0.2, side * GAUGE / 2);
    rail.castShadow = t.shadows;
    rail.receiveShadow = t.shadows;
    trackGroup.add(rail);
  }
}

// ---------------------------------------------------------------- platform
const platform = new THREE.Mesh(
  new THREE.BoxGeometry(1, 0.6, 6),
  new THREE.MeshLambertMaterial({ color: 0xbfd8c8 })
);
platform.position.y = 0.3;
platform.receiveShadow = t.shadows;
scene.add(platform);

function layoutPlatform() {
  platform.scale.x = Math.max(1, S.platformEnd - S.platformStart);
  platform.position.x = (S.platformStart + S.platformEnd) / 2;
}

// A signal at the platform start. Its lamp states the rule: green while the
// platform is ahead, amber inside the zone, red once the player is past it —
// the same rule index.html's drawSignal draws in 2D.
const signalGroup = new THREE.Group();
{
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3f42 })
  );
  pole.position.y = 1.5;
  pole.castShadow = t.shadows;
  signalGroup.add(pole);

  const lampGeo = new THREE.SphereGeometry(0.16, 12, 12);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2f6f4f, emissive: 0x2f6f4f, emissiveIntensity: 0.6 });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.y = 3.05;
  signalGroup.add(lamp);
  signalGroup.userData.lamp = lamp;
}
signalGroup.position.z = -1.4;
scene.add(signalGroup);

function updateSignal() {
  const lamp = signalGroup.userData.lamp;
  signalGroup.position.x = S.platformStart;
  let color;
  if (S.playerPos < S.platformStart) color = 0x2f6f4f;       // green: platform ahead
  else if (S.playerPos <= S.platformEnd) color = 0xb8862c;   // amber: inside the zone
  else color = 0xa5372f;                                     // red: past it
  lamp.material.color.setHex(color);
  lamp.material.emissive.setHex(color);
}

// ---------------------------------------------------------------- trains
// A placeholder low-poly loco: a body, a cab, a chimney, and wheels. This
// stands in for a free glTF sample — the network in this environment only
// reaches raw.githubusercontent.com by path, and no free train model could be
// found there. See proto/README.md for how to drop in a real model.
function buildPlaceholderTrain(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.7, 1.9), mat);
  body.position.set(-2.5, 1.1, 0);
  g.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.9), mat);
  cab.position.set(-5.1, 1.95, 0);
  g.add(cab);

  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 10), dark);
  chimney.position.set(-4.3, 3, 0);
  g.add(chimney);
  g.userData.chimneyTip = new THREE.Vector3(-4.3, 3.6, 0);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 2.1, 14);
  for (const wx of [-1.0, -2.5, -4.0]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, 0);
    g.add(wheel);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = t.shadows; o.receiveShadow = t.shadows; } });
  g.add(makeBlobShadow());
  return g;
}

const player = buildPlaceholderTrain(0x3c5a6e);
const rival = buildPlaceholderTrain(0x7a3c3c);
scene.add(player, rival);

// If a real glTF sample ever lands in proto/models/, this swaps it in and
// keeps the same userData.chimneyTip contract the steam system reads.
function tryLoadModel(group, url) {
  const loader = new GLTFLoader();
  loader.load(url, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = t.shadows; o.receiveShadow = t.shadows; } });
    group.clear();
    group.add(model);
    group.add(makeBlobShadow());
  }, undefined, () => {
    // Fetch failed or the file is absent — keep the placeholder, silently.
  });
}
tryLoadModel(player, "models/loco.glb");

// ---------------------------------------------------------------- steam
// A fixed-size point pool. No allocation happens per frame; the count is
// capped by quality tier so mobile never spends more than a few dozen points.
function makeSteam(maxCount) {
  const positions = new Float32Array(maxCount * 3);
  const ages = new Float32Array(maxCount).fill(Infinity);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf2f2f0, size: 0.5, transparent: true, opacity: 0.55,
    depthWrite: false, sizeAttenuation: true
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  let cursor = 0;
  const LIFE = 1.4;

  function emit(origin) {
    ages[cursor] = 0;
    positions[cursor * 3] = origin.x + (Math.random() - 0.5) * 0.15;
    positions[cursor * 3 + 1] = origin.y;
    positions[cursor * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.15;
    cursor = (cursor + 1) % maxCount;
  }

  function update(dt, active) {
    for (let i = 0; i < maxCount; i += 1) {
      if (ages[i] > LIFE) continue;
      ages[i] += dt;
      positions[i * 3 + 1] += dt * 1.4;
      positions[i * 3] += dt * 0.25;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = active ? 0.55 : 0.55;
  }

  return { emit, update, points };
}

let steam = makeSteam(t.steam);
let steamAcc = 0;

// ---------------------------------------------------------------- controls
// The same "which sources hold this lever" pattern as index.html: a set per
// control, so a second touch or a key release cannot cancel someone else's
// hold, and a held key still applies to the next race.
const held = { throttle: new Set(), brake: new Set() };
function applyHeld() { sim.setInput({ throttle: held.throttle.size > 0, brake: held.brake.size > 0 }); }
function press(name, token) { held[name].add(token); applyHeld(); }
function release(name, token) { held[name].delete(token); applyHeld(); }
function releaseAllPointers(name) {
  for (const tok of Array.from(held[name])) if (tok.startsWith("ptr:")) held[name].delete(tok);
  applyHeld();
}

function bindLever(node, name) {
  node.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    node.classList.add("held");
    press(name, "ptr:" + e.pointerId);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
    node.addEventListener(type, (e) => {
      node.classList.remove("held");
      release(name, "ptr:" + e.pointerId);
    });
  }
  node.addEventListener("touchend", () => { node.classList.remove("held"); releaseAllPointers(name); });
  node.addEventListener("touchcancel", () => { node.classList.remove("held"); releaseAllPointers(name); });
}
bindLever(document.getElementById("throttleLever"), "throttle");
bindLever(document.getElementById("brakeLever"), "brake");

const KEY_MAP = { ArrowUp: "throttle", w: "throttle", W: "throttle", ArrowDown: "brake", s: "brake", S: "brake" };
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); uiStart(); return; }
  const name = KEY_MAP[e.key];
  if (name) { e.preventDefault(); press(name, "key"); }
});
window.addEventListener("keyup", (e) => {
  const name = KEY_MAP[e.key];
  if (name) release(name, "key");
});
window.addEventListener("blur", () => { held.throttle.clear(); held.brake.clear(); applyHeld(); });

function uiStart() { sim.startRace(); }
document.getElementById("startBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); uiStart(); });

// ---------------------------------------------------------------- quality UI
const qualityBtn = document.getElementById("qualityBtn");
function applyQuality() {
  t = tier();
  renderer.setPixelRatio(t.dpr);
  renderer.shadowMap.enabled = t.shadows;
  key.castShadow = t.shadows;
  steam.points.removeFromParent();
  steam = makeSteam(t.steam);
  qualityBtn.textContent = `quality: ${qualityAuto ? "auto" : "manual"} (${quality})`;
}
qualityBtn.addEventListener("click", () => {
  qualityAuto = false;
  quality = quality === "mobile" ? "desktop" : "mobile";
  applyQuality();
});
applyQuality();

// ---------------------------------------------------------------- HUD
const el = {
  speed: document.getElementById("speed"),
  result: document.getElementById("resultText"),
  time: document.getElementById("timeText"),
  grip: document.getElementById("gripText"),
  center: document.getElementById("centerMsg"),
  fps: document.getElementById("fps")
};

function secs(ms) { return (ms / 1000).toFixed(2) + "s"; }

function updateHud() {
  el.speed.textContent = S.playerSpeed.toFixed(1);
  el.time.textContent = secs(S.elapsedMs);
  el.grip.textContent = "rail: " + S.gripName;

  if (S.state === "RESULT") {
    el.result.textContent = S.result;
    el.result.className = S.result === "WIN" ? "win" : "lose";
  } else {
    el.result.textContent = S.state === "RACING" ? "RACING" : "READY";
    el.result.className = "";
  }

  if (S.state === "IDLE") {
    el.center.innerHTML = '<div class="big">DRIVETRAIN</div><div class="sub">hold THROTTLE, brake inside the platform</div>';
  } else if (S.state === "RESULT") {
    el.center.innerHTML = `<div class="big">${S.result}</div><div class="sub">press START to race again</div>`;
  } else {
    el.center.innerHTML = "";
  }
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(-15, 7, 0);
const camTarget = new THREE.Vector3();
function updateCamera() {
  const desired = new THREE.Vector3(S.playerPos - 15, 7, 6.5);
  camPos.lerp(desired, 0.12);
  camera.position.copy(camPos);
  camTarget.set(S.playerPos + 6, 1.4, 0);
  camera.lookAt(camTarget);
}

// ---------------------------------------------------------------- loop
let lastFrameMs = 0;
let accMs = 0;
let fpsFrames = 0, fpsAcc = 0, fpsLast = 0;

function positionTrain(group, posM) {
  group.position.x = posM;
}

function frame(nowMs) {
  let delta = lastFrameMs === 0 ? 0 : nowMs - lastFrameMs;
  lastFrameMs = nowMs;
  if (delta > K.MAX_FRAME_DELTA_MS) delta = K.MAX_FRAME_DELTA_MS; // C12-style clamp
  if (delta < 0) delta = 0;
  accMs += delta;
  while (accMs >= K.STEP_MS) { sim.step(); accMs -= K.STEP_MS; }

  layoutPlatform();
  updateSignal();
  positionTrain(player, S.playerPos);
  positionTrain(rival, S.rivalPos);

  const dtSec = delta / 1000;
  steamAcc += dtSec;
  const emitEvery = S.state === "RACING" ? 0.05 : 0.16;
  if (steamAcc >= emitEvery) {
    steamAcc = 0;
    const tip = player.userData.chimneyTip || new THREE.Vector3(-4.3, 3.6, 0);
    steam.emit(new THREE.Vector3(player.position.x + tip.x, tip.y, tip.z));
  }
  steam.update(dtSec, S.state === "RACING");

  updateCamera();
  updateHud();

  fpsFrames += 1; fpsAcc += delta;
  if (fpsAcc >= 500) {
    el.fps.textContent = Math.round((fpsFrames * 1000) / fpsAcc) + " fps";
    fpsFrames = 0; fpsAcc = 0;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);

// Exposed for manual poking from the console; not part of any contract.
window.__drive3d = { sim, K, S, scene, renderer, camera, trackGroup, ground, platform, signalGroup, player, rival };
