const fs = require('fs');
let html = fs.readFileSync('../../Updated_frontend/Government landing page.html', 'utf8');

// Extract body content
let bodyMatch = html.match(/<body>([\s\S]*?)<script>/);
let bodyContent = bodyMatch ? bodyMatch[1] : '';

// Convert HTML to JSX
bodyContent = bodyContent.replace(/class="/g, 'className="');
bodyContent = bodyContent.replace(/for="/g, 'htmlFor="');
bodyContent = bodyContent.replace(/<input([^>]*[^\/])>/g, '<input$1 />');
bodyContent = bodyContent.replace(/<br>/g, '<br />');

// JSX adjustments
bodyContent = bodyContent.replace(/stroke-width="/g, 'strokeWidth="');
bodyContent = bodyContent.replace(/<canvas id="hero-canvas"><\/canvas>/, '<canvas id="hero-canvas" ref={canvasRef}></canvas>');
bodyContent = bodyContent.replace(/<section className="hero">/, '<section className="hero" ref={heroSectionRef}>');
bodyContent = bodyContent.replace(/<div id="coin-info">/, '<div id="coin-info" ref={infoCardRef}>');
bodyContent = bodyContent.replace(/<form className="cta-form" id="brief-form">/, '<form className="cta-form" id="brief-form" onSubmit={handleFormSubmit}>');

// Let's just create the React component
let reactCode = `import React, { useEffect, useRef, FormEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './government-landing.css';

export function GovernmentLandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const infoCardRef = useRef<HTMLDivElement>(null);
  const heroSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll reveal logic
    const els = document.querySelectorAll('.section-head, .pipe-step, .track-card, .sov-card, .strip .cell, .cta-box, .table-shell');
    if (!('IntersectionObserver' in window)) { 
      els.forEach(el => el.classList.add('reveal','in-view')); 
    } else {
      els.forEach(el => el.classList.add('reveal')); 
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting){ entry.target.classList.add('in-view'); io.unobserve(entry.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      els.forEach(el => io.observe(el));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current || !heroSectionRef.current || !infoCardRef.current) return;
    const canvas = canvasRef.current;
    const heroSection = heroSectionRef.current;
    const infoCard = infoCardRef.current;
    
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (err) { return; }
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
    controls.enableZoom = false;
    controls.minDistance = controls.maxDistance = 7.2;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.25;
    controls.maxPolarAngle = Math.PI * 0.75;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);
    let userInteracting = false;
    controls.addEventListener('start', () => { userInteracting = true; controls.autoRotate = false; });
    controls.addEventListener('end', () => {
      userInteracting = false;
      setTimeout(() => { if (!userInteracting) controls.autoRotate = true; }, 2200);
    });
  
    const key = new THREE.PointLight(0xffffff, 3.4, 40); key.position.set(5,5,6); scene.add(key);
    const rim = new THREE.PointLight(0x8c9dfc, 2.6, 40); rim.position.set(-6,-2,-4); scene.add(rim);
    scene.add(new THREE.AmbientLight(0x404060, 0.65));
  
    function makeGlowTexture(color: string){
      const size = 128, c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) return new THREE.CanvasTexture(c);
      const grad = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
      grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0,0,size,size);
      return new THREE.CanvasTexture(c);
    }
    function makeSymbolTexture(symbol: string, bgColor: string, fgColor: string){
      const size = 256, c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) return new THREE.CanvasTexture(c);
      ctx.fillStyle = bgColor; ctx.beginPath(); ctx.arc(size/2,size/2,size/2-6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = fgColor; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(size/2,size/2,size/2-16,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle = fgColor; ctx.font = '700 128px Space Grotesk, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(symbol, size/2, size/2 + 8);
      const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
    }
  
    const coreGeo = new THREE.IcosahedronGeometry(0.85, 3);
    const coreMat = new THREE.MeshStandardMaterial({ color:0x14141f, emissive:0x3a2a10, emissiveIntensity:0.9, metalness:0.5, roughness:0.35, flatShading:true });
    const core = new THREE.Mesh(coreGeo, coreMat); scene.add(core);
    const coreWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.0, 1),
      new THREE.MeshBasicMaterial({ color:0xf7931a, wireframe:true, transparent:true, opacity:0.35 })
    );
    scene.add(coreWire);
    scene.add(new THREE.PointLight(0xf7931a, 1.6, 7));
  
    const coinDefs = [
      { name:'Bitcoin', symbol:'BTC', glyph:'\u20BF', price:'$77,144.60', change:'1.27%', up:false, color:'#f7931a', dark:'#1a1206', edge:'#c9740f', glow:makeGlowTexture('rgba(247,147,26,0.9)'), orbitR:2.7, speed:0.22, phase:0, scale:1.0 },
      { name:'Ethereum', symbol:'ETH', glyph:'\u039E', price:'$2,463.58', change:'0.37%', up:false, color:'#8c9dfc', dark:'#12142b', edge:'#5f6fd6', glow:makeGlowTexture('rgba(140,157,252,0.9)'), orbitR:3.9, speed:0.15, phase:2.1, scale:0.8 },
      { name:'Solana', symbol:'SOL', glyph:'\u25CE', price:'$99.50', change:'1.66%', up:false, color:'#14f1c6', dark:'#062420', edge:'#0fae90', glow:makeGlowTexture('rgba(20,241,198,0.9)'), orbitR:5.0, speed:0.1, phase:4.3, scale:0.62 }
    ];
  
    const coinObjects: any[] = [];
    const clickableMeshes: THREE.Object3D[] = [];
    coinDefs.forEach(def => {
      const orbitGroup = new THREE.Group(); scene.add(orbitGroup);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(def.orbitR, 0.006, 6, 120),
        new THREE.MeshBasicMaterial({ color:def.color, transparent:true, opacity:0.22 })
      );
      ring.rotation.x = Math.PI/2; orbitGroup.add(ring);
  
      const coinGroup = new THREE.Group();
      const faceMat = new THREE.MeshStandardMaterial({ map: makeSymbolTexture(def.glyph, def.color, def.dark), metalness:0.55, roughness:0.3 });
      const edgeMat = new THREE.MeshStandardMaterial({ color:def.edge, metalness:0.7, roughness:0.35 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.16,56), [edgeMat, faceMat, faceMat]);
      mesh.rotation.x = Math.PI/2; mesh.scale.setScalar(def.scale); mesh.userData = def;
      coinGroup.add(mesh); clickableMeshes.push(mesh);
      coinGroup.position.x = def.orbitR;
  
      const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:def.glow, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.9 }));
      glowSprite.scale.setScalar(2.6 * def.scale); coinGroup.add(glowSprite);
  
      orbitGroup.add(coinGroup);
      coinObjects.push({ def:def, orbitGroup:orbitGroup, coinGroup:coinGroup, mesh:mesh, angle:def.phase, trail:[], trailLine:null as any, targetScale:1, curScale:1 });
    });
  
    const TRAIL_LEN = 18;
    coinObjects.forEach(c => {
      const positions = new Float32Array(TRAIL_LEN*3), colors = new Float32Array(TRAIL_LEN*3);
      const base = new THREE.Color(c.def.color);
      for (let i=0;i<TRAIL_LEN;i++){
        const t = i/(TRAIL_LEN-1);
        colors[i*3]=base.r*t; colors[i*3+1]=base.g*t; colors[i*3+2]=base.b*t;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthWrite:false }));
      scene.add(line); c.trailLine = line;
      const wp = new THREE.Vector3(); c.coinGroup.getWorldPosition(wp);
      for (let j=0;j<TRAIL_LEN;j++) c.trail.push(wp.clone());
    });
  
    const LIGHTNING_SEGMENTS = 7;
    const lightningGroup = new THREE.Group(); scene.add(lightningGroup);
    coinObjects.forEach(c => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LIGHTNING_SEGMENTS+1)*3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color:c.def.color, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false }));
      lightningGroup.add(line); c.boltLine = line;
    });
    function reforgeBolts(){
      coinObjects.forEach(c => {
        const start = new THREE.Vector3(0,0,0), end = new THREE.Vector3();
        c.coinGroup.getWorldPosition(end);
        const pos = c.boltLine.geometry.getAttribute('position').array;
        for (let i=0;i<=LIGHTNING_SEGMENTS;i++){
          const p = start.clone().lerp(end, i/LIGHTNING_SEGMENTS);
          if (i>0 && i<LIGHTNING_SEGMENTS){
            p.x += (Math.random()-0.5)*0.35; p.y += (Math.random()-0.5)*0.35; p.z += (Math.random()-0.5)*0.35;
          }
          pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
        }
        c.boltLine.geometry.getAttribute('position').needsUpdate = true;
        c.boltLine.material.opacity = 0.15 + Math.random()*0.45;
      });
    }
  
    const starCount = 200, starPositions = new Float32Array(starCount*3);
    for (let s=0;s<starCount;s++){
      starPositions[s*3] = (Math.random()-0.5)*26;
      starPositions[s*3+1] = (Math.random()-0.5)*14;
      starPositions[s*3+2] = (Math.random()-0.5)*26;
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions,3));
    scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color:0x3a3a5a, size:0.028, transparent:true, opacity:0.55 })));
  
    function resize(){
      if(!heroSection || !renderer) return;
      const w = heroSection.clientWidth, h = heroSection.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize); resize();
  
    const raycaster = new THREE.Raycaster(), pointerNDC = new THREE.Vector2();
    let selected: any = null, hovered: any = null, downPos: any = null;
    function ndcFromEvent(e: PointerEvent){
      const rect = canvas.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left)/rect.width)*2 - 1;
      pointerNDC.y = -((e.clientY - rect.top)/rect.height)*2 + 1;
    }
    
    function onPointerMove(e: PointerEvent) {
      ndcFromEvent(e);
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      const hit = hits.length ? hits[0].object : null;
      if (hit !== hovered){
        hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : (isTouch ? 'default' : 'grab');
        coinObjects.forEach(c => { c.targetScale = (c.mesh === hovered) ? 1.35 : 1; });
      }
    }
    
    function onPointerDown(e: PointerEvent) { downPos = { x:e.clientX, y:e.clientY }; }
    function onPointerUp(e: PointerEvent) {
      if (!downPos) return;
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (dist > 6) return;
      ndcFromEvent(e);
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length){
        selected = hits[0].object;
        const d = selected.userData;
        const nameEl = document.getElementById('ci-name');
        const symEl = document.getElementById('ci-sym');
        const priceEl = document.getElementById('ci-price');
        const changeEl = document.getElementById('ci-change');
        if(nameEl) nameEl.textContent = d.name;
        if(symEl) symEl.textContent = d.symbol;
        if(priceEl) priceEl.textContent = d.price;
        if(changeEl) {
          changeEl.textContent = (d.up ? '▲ +' : '▼ -') + d.change;
          changeEl.className = 'ci-change ' + (d.up ? 'up' : 'down');
        }
        if(infoCard) infoCard.classList.add('visible');
      } else {
        selected = null;
        if(infoCard) infoCard.classList.remove('visible');
      }
    }
    
    canvas.addEventListener('pointermove', onPointerMove as any);
    canvas.addEventListener('pointerdown', onPointerDown as any);
    canvas.addEventListener('pointerup', onPointerUp as any);
  
    const clock = new THREE.Clock();
    let boltTimer = 0;
    const proj = new THREE.Vector3();
    let animationId = 0;
    
    function tick(){
      animationId = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  
      core.rotation.y += dt * 0.18;
      core.rotation.x += dt * 0.07;
      coreWire.rotation.y -= dt * 0.12;
      coreWire.rotation.z += dt * 0.05;
      const pulse = 1 + Math.sin(t * 1.5) * 0.03;
      coreWire.scale.setScalar(pulse);
  
      coinObjects.forEach(c => {
        c.angle += dt * c.def.speed;
        c.orbitGroup.rotation.y = c.angle;
        c.coinGroup.rotation.z += dt * 0.9;
        c.curScale += (c.targetScale - c.curScale) * 0.12;
        c.mesh.scale.setScalar(c.def.scale * c.curScale);
  
        const wp = new THREE.Vector3();
        c.coinGroup.getWorldPosition(wp);
        c.trail.push(wp.clone());
        while (c.trail.length > TRAIL_LEN) c.trail.shift();
        const arr = c.trailLine.geometry.getAttribute('position').array;
        for (let i=0;i<c.trail.length;i++){
          arr[i*3]=c.trail[i].x; arr[i*3+1]=c.trail[i].y; arr[i*3+2]=c.trail[i].z;
        }
        c.trailLine.geometry.getAttribute('position').needsUpdate = true;
      });
  
      boltTimer -= dt;
      if (boltTimer <= 0){ reforgeBolts(); boltTimer = 0.09 + Math.random() * 0.14; }
  
      if (selected && infoCard){
        selected.parent.getWorldPosition(proj);
        proj.project(camera);
        const rect = canvas.getBoundingClientRect();
        const x = (proj.x * 0.5 + 0.5) * rect.width;
        const y = (-proj.y * 0.5 + 0.5) * rect.height;
        infoCard.style.left = x + 'px';
        infoCard.style.top = y + 'px';
      }
  
      controls.update();
      renderer.render(scene, camera);
    }
    tick();
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onPointerMove as any);
      canvas.removeEventListener('pointerdown', onPointerDown as any);
      canvas.removeEventListener('pointerup', onPointerUp as any);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const btn = document.querySelector('#brief-form .btn-primary');
    if(btn) btn.textContent = 'Request sent';
  };

  return (
    <div className="gov-landing-root">
` + bodyContent + `
    </div>
  );
}`;

fs.writeFileSync('src/features/government/landing/GovernmentLandingPage.tsx', reactCode);
console.log('Done!');
