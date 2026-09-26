import React, { useEffect, useRef, FormEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Link } from '@tanstack/react-router';
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
      { name:'Bitcoin', symbol:'BTC', glyph:'₿', price:'$77,144.60', change:'1.27%', up:false, color:'#f7931a', dark:'#1a1206', edge:'#c9740f', glow:makeGlowTexture('rgba(247,147,26,0.9)'), orbitR:2.7, speed:0.22, phase:0, scale:1.0 },
      { name:'Ethereum', symbol:'ETH', glyph:'Ξ', price:'$2,463.58', change:'0.37%', up:false, color:'#8c9dfc', dark:'#12142b', edge:'#5f6fd6', glow:makeGlowTexture('rgba(140,157,252,0.9)'), orbitR:3.9, speed:0.15, phase:2.1, scale:0.8 },
      { name:'Solana', symbol:'SOL', glyph:'◎', price:'$99.50', change:'1.66%', up:false, color:'#14f1c6', dark:'#062420', edge:'#0fae90', glow:makeGlowTexture('rgba(20,241,198,0.9)'), orbitR:5.0, speed:0.1, phase:4.3, scale:0.62 }
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
      const hit = hits.length ? hits[0]?.object : null;
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
        selected = hits[0]?.object;
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


<header>
  <div className="advisory">
    Prototype built for <b>Smart India Hackathon 2026</b> · Problem Statement 26182 · Not an operational Government of India system
  </div>
  <nav>
    <div className="logo">Trace<span className="sub">Automated VASP Attribution &amp; Blockchain Intelligence</span></div>
    <div className="nav-links">
      <a href="#how">How it works</a>
      <a href="#statutory">Statutory output</a>
      <a href="#sovereignty">Data sovereignty</a>
      <Link to="/government/dashboard">Console</Link>
    </div>
    <a href="#brief" className="nav-cta">Request a briefing</a>
  </nav>
</header>

<section className="hero" ref={heroSectionRef}>
  <canvas id="hero-canvas" ref={canvasRef}></canvas>
  <div className="hero-vignette"></div>
  <div className="hero-hint"><span className="ring"></span>drag to orbit · click node</div>
  <div id="coin-info" ref={infoCardRef}>
    <div className="ci-header">
      <span className="ci-name" id="ci-name">Bitcoin</span>
      <span className="ci-sym" id="ci-sym">BTC</span>
    </div>
    <div className="ci-price" id="ci-price">$77,144.60</div>
    <div className="ci-change down" id="ci-change">▼ 1.27%</div>
  </div>

  <div className="wrap hero-grid">
    <div className="hero-content">
      <span className="eyebrow-tag"><span className="dot"></span>SIH26182 · Blockchain Intelligence APIs</span>
      <h1>From an unknown wallet to a served freeze notice.</h1>
      <p className="lede">An investigating officer enters one suspect address. Trace maps the multi-hop flow, identifies the nearest regulated VASP, and returns a dossier that is ready to file.</p>
      <p className="sub">Attribution alone stalls an investigation. Trace produces the artefacts that move it forward — a Section 63 certificate for the court record, a Section 94 summons for KYC production, and a SAHYOG payload for the freeze request.</p>
      <div className="hero-actions">
        <a href="#brief" className="btn-primary">Request a briefing</a>
        <a href="#how" className="btn-ghost">See the pipeline</a>
      </div>
      <p className="hero-note">For agency use. Access is provisioned per unit — there is no public sign-up.</p>
    </div>

    <aside className="docket" role="img" aria-label="Sample attribution docket tracing a wallet through three hops to a registered exchange">
      <div className="docket-hd">
        <span className="no">DOCKET TRC-2026-004871</span>
        <span className="st">● Attribution complete — 3 hops</span>
      </div>
      <div className="chain">
        <div className="hop">
          <div className="dot start">!</div>
          <div>
            <div className="addr">0x7a2f…c41d</div>
            <div className="meta">Suspect wallet from NCRP complaint #33291<span className="tag tag-red">Reported</span></div>
          </div>
        </div>
        <div className="hop">
          <div className="dot">1</div>
          <div>
            <div className="addr">0x1c88…9ba2</div>
            <div className="meta">Pass-through · ₹41.2L equivalent · 6 min later</div>
          </div>
        </div>
        <div className="hop">
          <div className="dot mix">2</div>
          <div>
            <div className="addr">0xd90f…77e5</div>
            <div className="meta">Structuring detected — split across 4 outputs<span className="tag tag-amb">Layering</span></div>
          </div>
        </div>
        <div className="hop">
          <div className="dot end">✓</div>
          <div>
            <div className="addr">0x3f5c…f0be</div>
            <div className="meta">Exchange deposit address<span className="tag tag-grn">FIU-IND registered</span></div>
          </div>
        </div>
      </div>
      <div className="docket-ft">
        <span>Taint retained <b>68.4%</b></span>
        <span>Confidence <b>High</b></span>
        <span>Dossier SHA-256 <b>a3f9…20c7</b></span>
      </div>
    </aside>
  </div>

  <div className="hero-ticker">
    <div className="ticker-pill">
      <span className="pulse-dot"></span>
      <span className="ticker-label">Live run</span>
    </div>
    <div className="t-item"><span className="sym">TRAVERSAL</span><span className="val">3 hops</span></div>
    <div className="t-divider"></div>
    <div className="t-item"><span className="sym">TAINT</span><span className="val">68.4%</span></div>
    <div className="t-divider"></div>
    <div className="t-item"><span className="sym">ELAPSED</span><span className="val">41s</span></div>
  </div>
</section>

<div className="strip">
  <div className="wrap">
    <div className="strip-grid">
      <div className="cell">
        <div className="n">₹22,845 cr</div>
        <div className="l">Lost to financial cyber fraud in 2024</div>
        <div className="src">NCRP, 36.4 lakh cases</div>
      </div>
      <div className="cell">
        <div className="n">35</div>
        <div className="l">VASPs already integrated with the SAHYOG portal</div>
        <div className="src">Alongside 8 central and 28 state agencies</div>
      </div>
      <div className="cell">
        <div className="n">Hours</div>
        <div className="l">Typical manual traversal time per suspect wallet</div>
        <div className="src">Block-explorer tracing, hop by hop</div>
      </div>
      <div className="cell">
        <div className="n">Under 60s</div>
        <div className="l">Trace attribution run on the same wallet</div>
        <div className="src">Measured on our prototype, 5-hop bound</div>
      </div>
    </div>
  </div>
</div>

<section className="pipeline" id="how">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">how it works</p>
      <h2>The pipeline an investigating officer never has to run by hand</h2>
      <p>Each stage is deterministic and logged. The reasoning is reproducible on demand, because a result that cannot be explained in court is not usable.</p>
    </div>
    <div className="pipe-steps">
      <div className="pipe-step">
        <span className="num mono">STAGE 01</span>
        <h3>Ingest</h3>
        <p>Bitcoin UTXO and account-based chains normalised into one directed multigraph.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 02</span>
        <h3>Cluster</h3>
        <p>Union-Find entity resolution, with CoinJoin and collaborative spends severed first to prevent false merges.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 03</span>
        <h3>Trace</h3>
        <p>Bounded breadth-first traversal with proportional taint carried along every path.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 04</span>
        <h3>Attribute</h3>
        <p>Terminal cluster matched against the VASP registry and classified by FIU-IND status.</p>
      </div>
      <div className="pipe-step">
        <span className="num mono">STAGE 05</span>
        <h3>File</h3>
        <p>Statutory dossier generated, hashed, and pushed to SAHYOG for service.</p>
      </div>
    </div>
  </div>
</section>

<section className="statutory" id="statutory">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">statutory output</p>
      <h2>Output that is admissible, not just informative</h2>
      <p>A graph on a screen cannot be entered into evidence. Every Trace result compiles into the instruments Indian criminal procedure actually recognises.</p>
    </div>
    <div className="track-grid">
      <div className="track-card">
        <span className="tag-act">Bharatiya Sakshya Adhiniyam, 2023</span>
        <h3>Section 63 certificate</h3>
        <p>Two-part statutory certificate generated with the dossier — Part A device and output particulars for the investigating officer, Part B extraction audit trail for expert sign-off, with the SHA-256 hash of the record embedded.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,24 30,24 40,10 55,26 70,8 90,8 100,18 130,18 145,4 165,20 190,20 205,6 225,14 260,14 275,22 300,10" fill="none" stroke="#f7931a" strokeWidth="1.5" opacity="0.85"/></svg>
      </div>
      <div className="track-card">
        <span className="tag-act">Bharatiya Nagarik Suraksha Sanhita, 2023</span>
        <h3>Section 94 summons</h3>
        <p>Production order pre-filled with the attributed VASP's corporate particulars and the target address, ready for signature.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,26 25,26 35,14 55,22 75,10 100,10 115,18 135,4 155,12 300,4" fill="none" stroke="#8c9dfc" strokeWidth="1.5" opacity="0.85"/></svg>
      </div>
      <div className="track-card">
        <span className="tag-act">Information Technology Act, 2000</span>
        <h3>SAHYOG freeze request</h3>
        <p>Section 79(3)(b) payload pushed to the portal over its API, routed to the correct VASP with the attribution evidence attached.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,20 40,20 50,30 60,20 80,20 90,4 100,20 130,20 145,28 165,20 300,12" fill="none" stroke="#2fe3a3" strokeWidth="1.5" opacity="0.85"/></svg>
      </div>
      <div className="track-card">
        <span className="tag-act">FATF Recommendation 16</span>
        <h3>IVMS101 Travel Rule payload</h3>
        <p>Originator, beneficiary, and VASP fields mapped to the international schema so offshore requests arrive in a format the receiving compliance system already parses.</p>
        <svg className="trace-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,10 30,10 42,28 58,4 72,20 95,20 105,14 300,20" fill="none" stroke="#ff5c7a" strokeWidth="1.5" opacity="0.85"/></svg>
      </div>
    </div>
  </div>
</section>

<section className="registry">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">registry status</p>
      <h2>Where the FIU-IND registry check changes the next step</h2>
      <p>Attribution answers <em>which</em> entity holds the funds. Registry status answers <em>what instrument you can serve</em> — and the two are useless apart.</p>
    </div>
    <div className="table-shell">
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Terminal VASP status</th><th>What Trace flags</th><th>Instrument available</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Onshore, FIU-IND registered</td>
              <td className="route-open">Direct SAHYOG route open</td>
              <td>Section 79(3)(b) notice served through the portal; expect expeditious compliance</td>
            </tr>
            <tr>
              <td>Offshore, FIU-IND registered</td>
              <td className="route-open">Registered reporting entity</td>
              <td>Domestic obligations apply under PMLA; SAHYOG route open</td>
            </tr>
            <tr>
              <td>Offshore, non-compliant</td>
              <td className="route-block">Flagged as outside the reporting perimeter</td>
              <td>MLAT request; IVMS101 payload prepared for the foreign counterpart</td>
            </tr>
            <tr>
              <td>Bridge or mixer exit</td>
              <td className="route-block">Marked inconclusive, never scored as clean</td>
              <td>Cross-chain continuation queued; no notice issued on an unresolved trail</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<section className="sovereignty" id="sovereignty">
  <div className="wrap">
    <div className="section-head">
      <p className="section-kicker">data sovereignty</p>
      <h2>Built in India, for Indian process</h2>
      <p>Foreign analytics vendors solve the graph problem well. They do not solve the jurisdiction problem, and investigation data leaving the country is its own risk.</p>
    </div>
    <div className="sov-grid">
      <div className="sov-card">
        <h3>Data stays in India</h3>
        <p>Investigation records, case dockets, and audit logs remain on Indian infrastructure. Deployment inside an agency's own environment is on our roadmap.</p>
      </div>
      <div className="sov-card">
        <h3>Indian statutory formats</h3>
        <p>Section 63, Section 94, and SAHYOG payloads are first-class outputs, not exports an officer reformats by hand into a local template.</p>
      </div>
      <div className="sov-card">
        <h3>Reachable by smaller units</h3>
        <p>State cyber cells and district units get the same tooling as central agencies, without an enterprise procurement cycle.</p>
      </div>
    </div>
  </div>
</section>

<section className="cta-section" id="brief">
  <div className="wrap">
    <div className="cta-box">
      <div>
        <h2>Request a briefing for your unit</h2>
        <p>We walk through a live attribution on a wallet of your choosing, show the statutory dossier it produces, and answer what the system does not yet do.</p>
        <p>Access is provisioned per agency with its own isolated case records. Nothing is shared across units.</p>
        <div className="cta-platforms">
          <span className="platform-pill">Multi-hop BFS</span>
          <span className="platform-pill">VASP Registry</span>
          <span className="platform-pill">SAHYOG Push</span>
          <span className="platform-pill">Section 63 Dossier</span>
        </div>
      </div>
      <form className="cta-form" id="brief-form" onSubmit={handleFormSubmit}>
        <label htmlFor="f1">Officer name</label>
        <input id="f1" type="text" placeholder="Full name and rank" />
        <label htmlFor="f2">Agency or unit</label>
        <input id="f2" type="text" placeholder="e.g. Cyber Crime Cell, Ahmedabad" />
        <label htmlFor="f3">Official email</label>
        <input id="f3" type="email" placeholder="name@agency.gov.in" />
        <label htmlFor="f4">Primary interest</label>
        <select id="f4">
          <option>Wallet attribution and tracing</option>
          <option>SAHYOG integration</option>
          <option>Evidentiary dossier generation</option>
          <option>Multi-unit deployment</option>
        </select>
        <button className="btn-primary" type="submit">Request a briefing</button>
        <p className="fine">Submissions reach the project team only. This prototype holds no operational case data and is not connected to a live government system.</p>
      </form>
    </div>
  </div>
</section>

<footer>
  <div className="wrap footer-row">
    <div className="logo">Trace</div>
    <div className="foot-links">
      <a href="#how">How it works</a>
      <a href="#statutory">Statutory output</a>
      <a href="#sovereignty">Data sovereignty</a>
      <Link to="/government/dashboard">Console</Link>
    </div>
    <div className="copyright">© 2026 Trace · Automated VASP Attribution · SIH 2026 Problem Statement 26182</div>
  </div>
</footer>


    </div>
  );
}