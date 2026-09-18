import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { CryptoPriceData } from "@/hooks/use-crypto-prices";

interface LandingSceneProps {
  onSelectNode?: (info: { name: string; label: string; score: string }) => void;
  prices?: CryptoPriceData | null;
}

export function LandingScene({ onSelectNode, prices }: LandingSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pricesRef = useRef(prices);
  
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    let animId = 0;
    let isDisposed = false;

    // Check WebGL context availability safely before instantiating renderer
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) return;

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      // WebGL unavailable fallback
      return;
    }

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06060a, 0.032);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(1.2, 1.4, 7.2);

    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const controls = new OrbitControls(camera, canvas);
    controls.enabled = !isTouch;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableZoom = true;
    controls.minDistance = 6;
    controls.maxDistance = 16;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.25;
    controls.maxPolarAngle = Math.PI * 0.75;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);

    let userInteracting = false;
    let resumeTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleStart = () => {
      userInteracting = true;
      controls.autoRotate = false;
      if (resumeTimeout) clearTimeout(resumeTimeout);
    };

    const handleEnd = () => {
      userInteracting = false;
      resumeTimeout = setTimeout(() => {
        if (!userInteracting && !isDisposed) controls.autoRotate = true;
      }, 2200);
    };

    controls.addEventListener("start", handleStart);
    controls.addEventListener("end", handleEnd);

    // Lighting
    const key = new THREE.PointLight(0xffffff, 3.4, 40);
    key.position.set(5, 5, 6);
    scene.add(key);

    const rim = new THREE.PointLight(0x8c9dfc, 2.6, 40);
    rim.position.set(-6, -2, -4);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(0x404060, 0.65));

    // Glow textures
    function makeGlowTexture(color: string) {
      const size = 128;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d");
      if (ctx) {
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }
      return new THREE.CanvasTexture(c);
    }

    const glowTexOrange = makeGlowTexture("rgba(247,147,26,0.9)");
    const glowTexBlue = makeGlowTexture("rgba(140,157,252,0.9)");
    const glowTexTeal = makeGlowTexture("rgba(20,241,198,0.9)");

    function makeSymbolTexture(symbol: string, bgColor: string, fgColor: string) {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = fgColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = fgColor;
        ctx.font = "700 120px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(symbol, size / 2, size / 2 + 8);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    }

    // Central Core: VASP Graph Cluster
    const coreGeo = new THREE.IcosahedronGeometry(0.85, 3);
    const posAttribute = coreGeo.getAttribute("position") as THREE.BufferAttribute;
    const coreBasePositions = Float32Array.from(posAttribute.array);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x14141f,
      emissive: 0x3a2a10,
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.35,
      flatShading: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    const coreWireGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const coreWireMat = new THREE.MeshBasicMaterial({
      color: 0xf7931a,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const coreWire = new THREE.Mesh(coreWireGeo, coreWireMat);
    scene.add(coreWire);

    const coreLight = new THREE.PointLight(0xf7931a, 1.6, 7);
    scene.add(coreLight);

    // Orbiting Crypto Nodes
    const nodeDefs = [
      {
        id: "bitcoin",
        name: "Bitcoin",
        symbol: "BTC",
        glyph: "₿",
        color: "#f7931a",
        dark: "#1a1206",
        edge: "#c9740f",
        glow: glowTexOrange,
        orbitR: 2.7,
        speed: 0.22,
        phase: 0,
        scale: 1.0,
      },
      {
        id: "ethereum",
        name: "Ethereum",
        symbol: "ETH",
        glyph: "Ξ",
        color: "#8c9dfc",
        dark: "#12142b",
        edge: "#5f6fd6",
        glow: glowTexBlue,
        orbitR: 3.9,
        speed: 0.15,
        phase: 2.1,
        scale: 0.8,
      },
      {
        id: "solana",
        name: "Solana",
        symbol: "SOL",
        glyph: "◎",
        color: "#14f1c6",
        dark: "#062420",
        edge: "#0fae90",
        glow: glowTexTeal,
        orbitR: 5.0,
        speed: 0.1,
        phase: 4.3,
        scale: 0.62,
      },
    ];

    interface NodeObject {
      def: (typeof nodeDefs)[0];
      orbitGroup: THREE.Group;
      coinGroup: THREE.Group;
      mesh: THREE.Mesh;
      angle: number;
      targetScale: number;
      curScale: number;
      boltLine?: THREE.Line;
    }

    const nodeObjects: NodeObject[] = [];
    const clickableMeshes: THREE.Mesh[] = [];

    nodeDefs.forEach((def) => {
      const orbitGroup = new THREE.Group();
      scene.add(orbitGroup);

      const ringGeo = new THREE.TorusGeometry(def.orbitR, 0.006, 6, 120);
      const ringMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.22,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      orbitGroup.add(ring);

      const coinGroup = new THREE.Group();
      const faceTex = makeSymbolTexture(def.glyph, def.color, def.dark);
      const faceMat = new THREE.MeshStandardMaterial({
        map: faceTex,
        metalness: 0.55,
        roughness: 0.3,
      });
      const edgeMat = new THREE.MeshStandardMaterial({
        color: def.edge,
        metalness: 0.7,
        roughness: 0.35,
      });
      const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 48);
      const mesh = new THREE.Mesh(geo, [edgeMat, faceMat, faceMat]);
      mesh.rotation.x = Math.PI / 2;
      mesh.scale.setScalar(def.scale);
      mesh.userData = def;
      coinGroup.add(mesh);
      clickableMeshes.push(mesh);

      const glowMat = new THREE.SpriteMaterial({
        map: def.glow,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      });
      const glowSprite = new THREE.Sprite(glowMat);
      glowSprite.scale.setScalar(2.6 * def.scale);
      coinGroup.add(glowSprite);

      orbitGroup.add(coinGroup);
      nodeObjects.push({
        def,
        orbitGroup,
        coinGroup,
        mesh,
        angle: def.phase,
        targetScale: 1,
        curScale: 1,
      });
    });

    // Lightning arcs connecting core to nodes
    const lightningGroup = new THREE.Group();
    scene.add(lightningGroup);
    const LIGHTNING_SEGMENTS = 7;

    nodeObjects.forEach((c) => {
      const positions = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: c.def.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      lightningGroup.add(line);
      c.boltLine = line;
    });

    // Ambient stars
    const starCount = isMobile ? 60 : 180;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 26;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x3a3a5a,
      size: 0.028,
      transparent: true,
      opacity: 0.55,
    });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);

    // Resize handler
    const handleResize = () => {
      if (!parent || isDisposed) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight || 580;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    // Raycaster for hover and click
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    let hoveredMesh: THREE.Mesh | null = null;
    let downPos: { x: number; y: number } | null = null;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      const hit = hits.length ? (hits[0]!.object as THREE.Mesh) : null;

      if (hit !== hoveredMesh) {
        hoveredMesh = hit;
        canvas.style.cursor = hit ? "pointer" : isTouch ? "default" : "grab";
        nodeObjects.forEach((c) => {
          c.targetScale = c.mesh === hoveredMesh ? 1.35 : 1;
        });
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (dist > 6) return; // drag, not click

      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length) {
        const selected = hits[0]!.object as THREE.Mesh;
        interface NodePayload {
          id?: string;
          name?: string;
          symbol?: string;
        }
        const d = selected.userData as NodePayload | undefined;
        if (onSelectNode && d) {
          const livePrice = d.id ? pricesRef.current?.[d.id as keyof CryptoPriceData] : null;
          const label = livePrice
            ? `$${livePrice.usd.toLocaleString()}`
            : "Fetching price...";
          const score = livePrice
            ? `${livePrice.usd_24h_change >= 0 ? "+" : ""}${livePrice.usd_24h_change.toFixed(2)}%`
            : "---";

          onSelectNode({
            name: `${d.name} (${d.symbol})`,
            label,
            score,
          });
        }
      }
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);

    // Animation loop
    let lastTime = performance.now();
    let boltTimer = 0;

    const animate = (now: number) => {
      if (isDisposed) return;
      animId = requestAnimationFrame(animate);

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Orbit node updates (static positioning)
      nodeObjects.forEach((c) => {
        // c.angle += c.def.speed * dt; // Removed orbiting
        const x = Math.cos(c.angle) * c.def.orbitR;
        const z = Math.sin(c.angle) * c.def.orbitR;
        const y = 0; // Removed bobbing
        c.coinGroup.position.set(x, y, z);
        // c.mesh.rotation.z += 0.8 * dt; // Removed spinning

        // Smooth scale interpolation
        c.curScale += (c.targetScale - c.curScale) * 0.12;
        c.coinGroup.scale.setScalar(c.curScale);
      });

      // Lightning updates
      boltTimer += dt;
      if (boltTimer > 0.07) {
        boltTimer = 0;
        nodeObjects.forEach((c) => {
          if (!c.boltLine) return;
          const start = new THREE.Vector3(0, 0, 0);
          const end = new THREE.Vector3();
          c.coinGroup.getWorldPosition(end);
          const posAttr = c.boltLine.geometry.getAttribute("position") as THREE.BufferAttribute;
          const posArray = posAttr.array as Float32Array;

          for (let i = 0; i <= LIGHTNING_SEGMENTS; i++) {
            const t = i / LIGHTNING_SEGMENTS;
            const p = start.clone().lerp(end, t);
            if (i > 0 && i < LIGHTNING_SEGMENTS) {
              p.x += (Math.random() - 0.5) * 0.35;
              p.y += (Math.random() - 0.5) * 0.35;
              p.z += (Math.random() - 0.5) * 0.35;
            }
            posArray[i * 3] = p.x;
            posArray[i * 3 + 1] = p.y;
            posArray[i * 3 + 2] = p.z;
          }
          posAttr.needsUpdate = true;
          (c.boltLine.material as THREE.LineBasicMaterial).opacity = 0.15 + Math.random() * 0.45;
        });
      }

      // Distort core crystal
      const posAttr = coreGeo.getAttribute("position") as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      const count = posArray.length / 3;
      for (let i = 0; i < count; i++) {
        const bx = coreBasePositions[i * 3]!;
        const by = coreBasePositions[i * 3 + 1]!;
        const bz = coreBasePositions[i * 3 + 2]!;
        const noise = Math.sin(bx * 3 + now * 0.003) * Math.cos(by * 3 + now * 0.002) * 0.08;
        posArray[i * 3] = bx * (1 + noise);
        posArray[i * 3 + 1] = by * (1 + noise);
        posArray[i * 3 + 2] = bz * (1 + noise);
      }
      posAttr.needsUpdate = true;
      coreGeo.computeVertexNormals();

      core.rotation.y += 0.3 * dt;
      core.rotation.x += 0.15 * dt;
      coreWire.rotation.y -= 0.4 * dt;
      stars.rotation.y += 0.015 * dt;

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // Cleanup on unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      if (resumeTimeout) clearTimeout(resumeTimeout);

      window.removeEventListener("resize", handleResize);
      controls.removeEventListener("start", handleStart);
      controls.removeEventListener("end", handleEnd);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);

      controls.dispose();

      // Dispose geometries, materials, textures
      coreGeo.dispose();
      coreWireGeo.dispose();
      starGeom.dispose();
      glowTexOrange.dispose();
      glowTexBlue.dispose();
      glowTexTeal.dispose();

      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [onSelectNode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "pan-y" }}
    />
  );
}
