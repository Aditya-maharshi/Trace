import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import styles from "./auth.module.css";

export function AuthBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let isDisposed = false;

    // Check WebGL context availability safely before instantiating renderer
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) return;
    const loseCtxExt = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    if (loseCtxExt) loseCtxExt.loseContext();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06060a, 0.035);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(1.2, 1.4, 7.2);

    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const controls = new OrbitControls(camera, canvas);
    controls.enabled = !isTouch;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;

    // Lighting
    scene.add(new THREE.AmbientLight(0x404060, 0.65));
    const key = new THREE.PointLight(0xffffff, 3.2, 40);
    key.position.set(5, 5, 6);
    scene.add(key);

    const rim = new THREE.PointLight(0x8c9dfc, 2.4, 40);
    rim.position.set(-6, -2, -4);
    scene.add(rim);

    // Central Core
    const coreGeo = new THREE.IcosahedronGeometry(0.72, 3);
    const posAttr = coreGeo.getAttribute("position") as THREE.BufferAttribute;
    const coreBasePositions = Float32Array.from(posAttr.array);
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

    const coreWireGeo = new THREE.IcosahedronGeometry(0.85, 1);
    const coreWireMat = new THREE.MeshBasicMaterial({
      color: 0xf7931a,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const coreWire = new THREE.Mesh(coreWireGeo, coreWireMat);
    scene.add(coreWire);

    // Ambient stars
    const starCount = isMobile ? 50 : 160;
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

    // Resize
    const handleResize = () => {
      if (isDisposed) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    // Trace warp flourish on real auth success
    let warpActive = false;
    let warpSpeed = 1;
    const handleWarp = () => {
      warpActive = true;
      controls.autoRotateSpeed = 8;
      key.intensity = 7;
    };
    window.addEventListener("trace-warp", handleWarp);

    // Animation Loop
    let lastTime = performance.now();
    const animate = (now: number) => {
      if (isDisposed) return;
      animId = requestAnimationFrame(animate);

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (warpActive) {
        warpSpeed = Math.min(warpSpeed + dt * 14, 12);
      }

      // Distort core
      const currentPosAttr = coreGeo.getAttribute("position") as THREE.BufferAttribute;
      const posArray = currentPosAttr.array as Float32Array;
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
      currentPosAttr.needsUpdate = true;
      coreGeo.computeVertexNormals();

      core.rotation.y += 0.3 * dt * warpSpeed;
      core.rotation.x += 0.15 * dt * warpSpeed;
      coreWire.rotation.y -= 0.4 * dt * warpSpeed;
      stars.rotation.y += 0.015 * dt * warpSpeed;

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("trace-warp", handleWarp);
      controls.dispose();
      coreGeo.dispose();
      coreWireGeo.dispose();
      starGeom.dispose();
      coreMat.dispose();
      coreWireMat.dispose();
      starMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className={styles.bgCanvas} />
      <div className={styles.bgVignette} />
    </>
  );
}
