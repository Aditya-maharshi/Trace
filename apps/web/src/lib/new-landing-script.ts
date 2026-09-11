import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// @ts-nocheck
export function initLandingScript(root: HTMLElement) {
  if (!root) return;
  let reqId: number;

const canvas = root.querySelector('#hero-canvas') as HTMLCanvasElement;
if (!canvas) return;
const heroSection = canvas.parentElement as HTMLElement;
const infoCard = root.querySelector('#coin-info') as HTMLElement;

// Safe Pointer Capture
const origSetPointerCapture = canvas.setPointerCapture;
canvas.setPointerCapture = function(pointerId: number) {
  try {
    if (origSetPointerCapture) origSetPointerCapture.call(this, pointerId);
  } catch (e) {}
};
const origReleasePointerCapture = canvas.releasePointerCapture;
canvas.releasePointerCapture = function(pointerId: number) {
  try {
    if (origReleasePointerCapture) origReleasePointerCapture.call(this, pointerId);
  } catch (e) {}
};

// WebGL Context auto-recovery
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
canvas.addEventListener('webglcontextrestored', () => { }, false);
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
if (gl && (gl as WebGLRenderingContext).isContextLost()) {
  console.warn('WebGL context lost initially.');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06060a, 0.032);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
camera.position.set(1.2, 1.4, 7.2);

const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
const controls = new OrbitControls(camera, canvas);
controls.enabled = !isTouch;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enableZoom = true;
controls.minDistance = 7;
controls.maxDistance = 16;
controls.enablePan = false;
controls.minPolarAngle = Math.PI * 0.25;
controls.maxPolarAngle = Math.PI * 0.75;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.target.set(0, 0, 0);

let userInteracting = false;
controls.addEventListener('start', () => { userInteracting = true; controls.autoRotate = false; });
controls.addEventListener('end', () => {
  userInteracting = false;
  setTimeout(() => { if (!userInteracting) controls.autoRotate = true; }, 2200);
});

// ---- lighting ----
const key = new THREE.PointLight(0xffffff, 3.4, 40);
key.position.set(5, 5, 6);
scene.add(key);
const rim = new THREE.PointLight(0x8c9dfc, 2.6, 40);
rim.position.set(-6, -2, -4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0x404060, 0.65));

// ---- glow sprite helper (soft radial additive glow, no postprocessing needed) ----
function makeGlowTexture(color: string) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(c);
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const glowTexOrange = makeGlowTexture('rgba(247,147,26,0.9)');
const glowTexBlue = makeGlowTexture('rgba(140,157,252,0.9)');
const glowTexTeal = makeGlowTexture('rgba(20,241,198,0.9)');

function makeSymbolTexture(symbol: string, bgColor: string, fgColor: string) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(c);
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = fgColor;
  ctx.font = '700 128px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, size/2, size/2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ---- central "portfolio value" core: a living, distorting crystal ----
const coreGeo = new THREE.IcosahedronGeometry(0.85, 3);
const coreBasePositions = (coreGeo.getAttribute('position') as THREE.BufferAttribute).array.slice();
const coreMat = new THREE.MeshStandardMaterial({ color: 0x14141f, emissive: 0x3a2a10, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.35, flatShading:true });
const core = new THREE.Mesh(coreGeo, coreMat);
scene.add(core);
const coreWireGeo = new THREE.IcosahedronGeometry(1.0, 1);
const coreWireMat = new THREE.MeshBasicMaterial({ color: 0xf7931a, wireframe: true, transparent: true, opacity: 0.35 });
const coreWire = new THREE.Mesh(coreWireGeo, coreWireMat);
scene.add(coreWire);
const coreLight = new THREE.PointLight(0xf7931a, 1.6, 7);
scene.add(coreLight);

// ---- coins ----
const coinDefs = [
  { name:'Bitcoin', symbol:'BTC', glyph:'\u20BF', price:'$---', change:'---', up:true, color:'#f7931a', dark:'#1a1206', edge:'#c9740f', glow: glowTexOrange, orbitR: 2.7, speed: 0.22, phase: 0, scale: 1.0 },
  { name:'Ethereum', symbol:'ETH', glyph:'\u039E', price:'$---', change:'---', up:true, color:'#8c9dfc', dark:'#12142b', edge:'#5f6fd6', glow: glowTexBlue, orbitR: 3.9, speed: 0.15, phase: 2.1, scale: 0.8 },
  { name:'Solana', symbol:'SOL', glyph:'\u25CE', price:'$---', change:'---', up:false, color:'#14f1c6', dark:'#062420', edge:'#0fae90', glow: glowTexTeal, orbitR: 5.0, speed: 0.1, phase: 4.3, scale: 0.62 },
];

const coinObjects: any[] = [];
const clickableMeshes: THREE.Mesh[] = [];

coinDefs.forEach(def => {
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);

  // orbit ring
  const ringGeo = new THREE.TorusGeometry(def.orbitR, 0.006, 6, 120);
  const ringMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.22 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  orbitGroup.add(ring);

  const coinGroup = new THREE.Group();
  const faceTex = makeSymbolTexture(def.glyph, def.color, def.dark);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.55, roughness: 0.3 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: def.edge, metalness: 0.7, roughness: 0.35 });
  const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 56);
  const mesh = new THREE.Mesh(geo, [edgeMat, faceMat, faceMat]);
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.setScalar(def.scale);
  mesh.userData = def;
  coinGroup.add(mesh);
  clickableMeshes.push(mesh);

  coinGroup.position.x = def.orbitR;

  const glowMat = new THREE.SpriteMaterial({ map: def.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.setScalar(2.6 * def.scale);
  coinGroup.add(glowSprite);

  orbitGroup.add(coinGroup);
  coinObjects.push({ def, orbitGroup, coinGroup, mesh, angle: def.phase, trail: [], trailLine: null });
});

// ---- comet trails behind each coin ----
const TRAIL_LEN = 18;
coinObjects.forEach(c => {
  const positions = new Float32Array(TRAIL_LEN * 3);
  const colors = new Float32Array(TRAIL_LEN * 3);
  const baseColor = new THREE.Color(c.def.color);
  for (let i = 0; i < TRAIL_LEN; i++) {
    const t = i / (TRAIL_LEN - 1);
    colors[i*3] = baseColor.r * t; colors[i*3+1] = baseColor.g * t; colors[i*3+2] = baseColor.b * t;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthWrite:false });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  c.trailLine = line;
  const wp = new THREE.Vector3();
  c.coinGroup.getWorldPosition(wp);
  for (let i = 0; i < TRAIL_LEN; i++) c.trail.push(wp.clone());
});

// ---- crackling lightning arcs from the core to each coin ----
const lightningGroup = new THREE.Group();
scene.add(lightningGroup);
const LIGHTNING_SEGMENTS = 7;
coinObjects.forEach(c => {
  const positions = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: c.def.color, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
  const line = new THREE.Line(geo, mat);
  lightningGroup.add(line);
  c.boltLine = line;
});
let boltTimer = 0;
function reforgeBolts(){
  coinObjects.forEach(c => {
    const start = new THREE.Vector3(0,0,0);
    const end = new THREE.Vector3();
    c.coinGroup.getWorldPosition(end);
    const positions = ((c.boltLine.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i <= LIGHTNING_SEGMENTS; i++) {
      const t = i / LIGHTNING_SEGMENTS;
      const p = start.clone().lerp(end, t);
      if (i > 0 && i < LIGHTNING_SEGMENTS) {
        p.x += (Math.random()-0.5) * 0.35;
        p.y += (Math.random()-0.5) * 0.35;
        p.z += (Math.random()-0.5) * 0.35;
      }
      positions[i*3]=p.x; positions[i*3+1]=p.y; positions[i*3+2]=p.z;
    }
    ((c.boltLine.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (c.boltLine.material as THREE.Material).opacity = 0.15 + Math.random() * 0.45;
  });
}

// faint particle field
const starCount = 200;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  starPositions[i*3] = (Math.random() - 0.5) * 26;
  starPositions[i*3+1] = (Math.random() - 0.5) * 14;
  starPositions[i*3+2] = (Math.random() - 0.5) * 26;
}
const starGeom = new THREE.BufferGeometry();
starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({ color: 0x3a3a5a, size: 0.028, transparent: true, opacity: 0.55 });
const stars = new THREE.Points(starGeom, starMat);
scene.add(stars);

function resize() {
  if (!heroSection) return;
  const w = heroSection.clientWidth;
  const h = heroSection.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- hover + click to select a coin, plus a particle burst on click ----
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let selected: any = null;
let hovered: any = null;
let downPos: {x: number, y: number} | null = null;

coinObjects.forEach(c => { c.targetScale = 1; c.curScale = 1; });

function ndcFromEvent(e: MouseEvent){
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

canvas.addEventListener('pointermove', (e: Event) => {
  const pe = e as MouseEvent;
  ndcFromEvent(pe);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(clickableMeshes, false);
  const hit = hits.length > 0 ? hits[0]?.object || null : null;
  if (hit !== hovered) {
    hovered = hit;
    canvas.style.cursor = hit ? 'pointer' : (isTouch ? 'default' : 'grab');
    coinObjects.forEach(c => { c.targetScale = (c.mesh === hovered) ? 1.35 : 1; });
  }
});

const bursts: any[] = [];
function spawnBurst(position: THREE.Vector3, colorHex: string | number){
  const count = 40;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count*3);
  const velocities: THREE.Vector3[] = [];
  for (let i=0;i<count;i++){
    positions[i*3]=position.x; positions[i*3+1]=position.y; positions[i*3+2]=position.z;
    const dir = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize();
    velocities.push(dir.multiplyScalar(1.2 + Math.random()*1.6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const mat = new THREE.PointsMaterial({ color: colorHex, size:0.07, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  bursts.push({ points, velocities, age:0, life:0.9 });
}

canvas.addEventListener('pointerdown', (e: Event) => { const pe = e as MouseEvent; downPos = { x: pe.clientX, y: pe.clientY }; });
canvas.addEventListener('pointerup', (e: Event) => {
  const pe = e as MouseEvent;
  if (!downPos) return;
  const dist = Math.hypot(pe.clientX - downPos.x, pe.clientY - downPos.y);
  downPos = null;
  if (dist > 6) return; // it was a drag, not a click
  ndcFromEvent(pe);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(clickableMeshes, false);
  if (hits.length) {
    selected = hits[0]?.object || null;
    if (!selected) return;
    const d = selected.userData;
    (root.querySelector('#ci-name') as HTMLElement).textContent = d.name;
    (root.querySelector('#ci-price') as HTMLElement).textContent = d.price;
    const chEl = root.querySelector('#ci-change') as HTMLElement;
    chEl.textContent = (d.up ? '\u25B2 ' : '\u25BC ') + d.change.replace(/[+-]/, '');
    chEl.className = 'ci-change ' + (d.up ? 'up' : 'down');
    if (infoCard) infoCard.classList.add('visible');
    const wp = new THREE.Vector3();
    selected.getWorldPosition(wp);
    spawnBurst(wp, d.color);
    coreLight.intensity = 3.2;
    shakeCamera(0.12);
  } else {
    selected = null;
    if (infoCard) infoCard.classList.remove('visible');
  }
});

const tmpVec = new THREE.Vector3();
function updateInfoCardPosition() {
  if (!selected || !canvas || !infoCard) return;
  selected.getWorldPosition(tmpVec);
  tmpVec.project(camera);
  const rect = canvas.getBoundingClientRect();
  const x = (tmpVec.x * 0.5 + 0.5) * rect.width;
  const y = (-tmpVec.y * 0.5 + 0.5) * rect.height;
  infoCard.style.left = x + 'px';
  infoCard.style.top = y + 'px';
  if (tmpVec.z > 1) infoCard.classList.remove('visible');
}

let coreSpin = 1.9;
let coreLightBase = 2.2;
let shakeMag = 0;
let hueTime = 0;
const tmpTrailVec = new THREE.Vector3();
function shakeCamera(amount: number){ shakeMag = Math.max(shakeMag, amount); }

let lastTime = performance.now();
function animate() {
  reqId = requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const t = now / 1000;

  const posAttr = core.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const ix = i*3, iy = i*3+1, iz = i*3+2;
    const bx = coreBasePositions[ix]!, by = coreBasePositions[iy]!, bz = coreBasePositions[iz]!;
    const len = Math.sqrt(bx*bx+by*by+bz*bz) || 1;
    const nx = bx/len, ny = by/len, nz = bz/len;
    const n = Math.sin(nx*4 + t*2.2*coreSpin) + Math.sin(ny*5 - t*1.7*coreSpin) + Math.sin(nz*4.5 + t*2.6*coreSpin);
    const disp = 1 + n * 0.09 * Math.min(2, coreSpin);
    (posAttr.array as Float32Array)[ix] = bx * disp; (posAttr.array as Float32Array)[iy] = by * disp; (posAttr.array as Float32Array)[iz] = bz * disp;
  }
  posAttr.needsUpdate = true;
  core.geometry.computeVertexNormals();

  hueTime += dt * 0.12 * coreSpin;
  const hue = hueTime % 1;
  (coreWire.material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.85, 0.6);
  coreLight.color.setHSL(hue, 0.85, 0.6);

  core.rotation.y += 0.15 * dt * coreSpin;
  coreWire.rotation.y -= 0.1 * dt * coreSpin;
  coreWire.rotation.x += 0.05 * dt * coreSpin;
  coreLight.intensity += (coreLightBase*Math.min(3.2,coreSpin) - coreLight.intensity) * Math.min(1, dt*3);

  coinObjects.forEach(c => {
    c.angle += c.def.speed * dt * (0.6 + coreSpin*0.6);
    c.orbitGroup.rotation.y = c.angle;
    c.coinGroup.position.y = Math.sin(c.angle * 2.4 + c.def.phase) * 0.25;
    c.mesh.rotation.z += 0.6 * dt * coreSpin;
    c.curScale += (c.targetScale - c.curScale) * Math.min(1, dt*8);
    c.mesh.scale.setScalar(c.def.scale * c.curScale);

    c.coinGroup.getWorldPosition(tmpTrailVec);
    c.trail.push(tmpTrailVec.clone());
    if (c.trail.length > TRAIL_LEN) c.trail.shift();
    const tp = ((c.trailLine.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < c.trail.length; i++) {
      const p = c.trail[i];
      tp[i*3]=p.x; tp[i*3+1]=p.y; tp[i*3+2]=p.z;
    }
    ((c.trailLine.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  });

  boltTimer += dt;
  if (boltTimer > 0.09) { boltTimer = 0; reforgeBolts(); }

  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.age += dt;
    const bt = b.age / b.life;
    const pos = ((b.points.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let j = 0; j < b.velocities.length; j++) {
      const v = b.velocities[j] as THREE.Vector3;
      pos[j*3]   = pos[j*3]! + v.x * dt;
      pos[j*3+1] = pos[j*3+1]! + v.y * dt;
      pos[j*3+2] = pos[j*3+2]! + v.z * dt;
    }
    ((b.points.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (b.points.material as THREE.Material).opacity = Math.max(0, 1 - bt);
    if (bt >= 1) { scene.remove(b.points); b.points.geometry.dispose(); (b.points.material as THREE.Material).dispose(); bursts.splice(i,1); }
  }

  stars.rotation.y += 0.015 * dt * coreSpin;

  controls.update();

  if (shakeMag > 0.001) {
    camera.position.x += (Math.random()-0.5) * shakeMag;
    camera.position.y += (Math.random()-0.5) * shakeMag;
    shakeMag *= 0.88;
  }

  updateInfoCardPosition();
  renderer.render(scene, camera);
}
reqId = requestAnimationFrame(animate);
const interval1 = setInterval(() => { coreSpin += (1.9 - coreSpin) * 0.15; }, 120);

// ---- CTAs give the core a jolt of energy on hover, since there's no form on this page ----
root.querySelectorAll('.btn-primary, .nav-cta').forEach((el: Element) => {
  el.addEventListener('mouseenter', () => { coreLightBase = 3; coreSpin = 2.4; shakeCamera(0.06); });
  el.addEventListener('mouseleave', () => { coreLightBase = 1.6; });
});

// ---- live prices fetch & ui update ----
let livePrices: any = null;

function updateUIWithPrices() {
  if (!livePrices) return;

  const btcDef = coinDefs[0];
  const ethDef = coinDefs[1];
  const solDef = coinDefs[2];

  // Update coinDefs safely
  if (btcDef && livePrices.bitcoin) {
    btcDef.price = '$' + livePrices.bitcoin.usd.toLocaleString();
    btcDef.change = (livePrices.bitcoin.usd_24h_change >= 0 ? '+' : '') + livePrices.bitcoin.usd_24h_change.toFixed(2) + '%';
    btcDef.up = livePrices.bitcoin.usd_24h_change >= 0;
  }

  if (ethDef && livePrices.ethereum) {
    ethDef.price = '$' + livePrices.ethereum.usd.toLocaleString();
    ethDef.change = (livePrices.ethereum.usd_24h_change >= 0 ? '+' : '') + livePrices.ethereum.usd_24h_change.toFixed(2) + '%';
    ethDef.up = livePrices.ethereum.usd_24h_change >= 0;
  }

  if (solDef && livePrices.solana) {
    solDef.price = '$' + livePrices.solana.usd.toLocaleString();
    solDef.change = (livePrices.solana.usd_24h_change >= 0 ? '+' : '') + livePrices.solana.usd_24h_change.toFixed(2) + '%';
    solDef.up = livePrices.solana.usd_24h_change >= 0;
  }

  // Update Ticker
  const updateTick = (id: string, def: any, val: number, chg: number) => {
    const el = root.querySelector('#tick-' + id);
    if (el) {
      el.textContent = '$' + val.toLocaleString() + ' ' + (def?.up ? '\u25B2' : '\u25BC') + Math.abs(chg).toFixed(2) + '%';
      el.className = def?.up ? 'up' : 'down';
    }
  };
  if (btcDef && livePrices.bitcoin) updateTick('btc', btcDef, livePrices.bitcoin.usd, livePrices.bitcoin.usd_24h_change);
  if (ethDef && livePrices.ethereum) updateTick('eth', ethDef, livePrices.ethereum.usd, livePrices.ethereum.usd_24h_change);
  if (solDef && livePrices.solana) updateTick('sol', solDef, livePrices.solana.usd, livePrices.solana.usd_24h_change);
}

async function fetchPrices() {
  try {
    // We get the VITE_ variables if they exist in window, otherwise fallback
    const env = (import.meta.env || {}) as Record<string, string | undefined>;
    const API_BASE = env['VITE_API_URL'] || "http://localhost:3000";
    const API_KEY = env['VITE_API_KEY'] || "changeme-key-1";

    const res = await fetch(API_BASE + '/api/prices', {
      headers: { "x-api-key": API_KEY }
    });
    if (!res.ok) return;
    livePrices = await res.json();
    updateUIWithPrices();
  } catch (e) {
    console.error("Error fetching live prices", e);
  }
}

fetchPrices();
const interval2 = setInterval(fetchPrices, 60000);

// 3D tilt on the "what it tracks" cards
  const cards = root.querySelectorAll('.track-card');
  cards.forEach(c => {
    const card = c as HTMLElement;
    card.addEventListener('mousemove', (e: Event) => {
      const pe = e as MouseEvent;
      const r = card.getBoundingClientRect();
      const px = (pe.clientX - r.left) / r.width - 0.5;
      const py = (pe.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateZ(4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(900px) rotateX(0) rotateY(0)'; });
  });

  // count-up + bar fill when the portfolio section scrolls into view
  const inspector = root.querySelector('#inspector');
  const totalEl = root.querySelector('#total-value');
  let animated = false;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !animated) {
        animated = true;
        const targetStr = totalEl ? totalEl.getAttribute('data-target') : "18420";
        const target = parseInt(targetStr || "18420", 10);
        const duration = 1100;
        const start = performance.now();
        function tick(now: number) {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          if (totalEl) totalEl.textContent = Math.round(eased * target).toLocaleString();
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        root.querySelectorAll('.wf-bar').forEach((bar: Element) => {
          (bar as HTMLElement).style.width = bar.getAttribute('data-width') + '%';
        });
      }
    });
  }, { threshold: 0.3 });
  if (inspector) io.observe(inspector);


  return () => { 
    cancelAnimationFrame(reqId); 
    clearInterval(interval1); 
    clearInterval(interval2); 
    window.removeEventListener('resize', resize); 

    // Thorough unmount cleanup
    controls.dispose();
    scene.traverse((o: THREE.Object3D) => {
      const object = o as any;
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((m: any) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (object.material.map) object.material.map.dispose();
          object.material.dispose();
        }
      }
    });
    renderer.dispose();
  }
}
