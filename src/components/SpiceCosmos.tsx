"use client";

/**
 * Spice Cosmos — fixed full-viewport WebGL backdrop for the landing page.
 *
 * A field of glowing saffron/ember spice motes (additive GL points) with a few
 * drifting "saffron thread" lines and a central ember halo. The camera flies
 * forward through the field as the page scrolls and parallaxes to the pointer.
 *
 * Raw three.js (not R3F) inside a cleanup-safe effect: the scene is custom
 * shaders, so imperative three is simpler and avoids R3F↔React-19 peer-dep
 * friction. All window/WebGL access lives in the effect (SSR-safe), and every
 * GPU resource is disposed on unmount. Honors prefers-reduced-motion.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function SpiceCosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x15110d, 0.02);

    const camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      260,
    );
    camera.position.set(0, 0, 34);

    // --- spice particle field (saffron threads + glowing motes) ---
    const COUNT = window.innerWidth < 760 ? 1100 : 2200;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const palette = [
      new THREE.Color(0xff6a1a), // ember
      new THREE.Color(0xff8a3d), // ember light
      new THREE.Color(0xf4a300), // saffron
      new THREE.Color(0xc9a227), // brass
      new THREE.Color(0xf2da8e), // brass light
    ];
    const SPREAD = 70;
    const DEPTH = 180;
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 2] = Math.random() * DEPTH - DEPTH * 0.55;
      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = Math.random() * 1.6 + 0.45;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    // soft round glowing sprite (canvas texture)
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g2d = cv.getContext("2d")!;
    const grd = g2d.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,235,200,0.9)");
    grd.addColorStop(0.55, "rgba(255,150,60,0.35)");
    grd.addColorStop(1, "rgba(255,120,40,0)");
    g2d.fillStyle = grd;
    g2d.fillRect(0, 0, 64, 64);
    const sprite = new THREE.CanvasTexture(cv);
    sprite.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: sprite }, uTime: { value: 0 } },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize; varying vec3 vColor; uniform float uTime;
        void main(){
          vColor = color;
          vec3 p = position;
          p.x += sin(uTime*0.3 + position.z*0.12 + position.y*0.05)*1.2;
          p.y += cos(uTime*0.25 + position.x*0.08)*1.0;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_PointSize = aSize * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vColor;
        void main(){
          vec4 tex = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor,1.0) * tex;
          if(gl_FragColor.a < 0.02) discard;
        }`,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // --- drifting saffron threads (thin glowing lines) ---
    const threads = new THREE.Group();
    const threadGeos: THREE.BufferGeometry[] = [];
    const threadMats: THREE.LineBasicMaterial[] = [];
    const baseThreadMat = new THREE.LineBasicMaterial({
      color: 0xf4a300,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 14; i++) {
      const pts: THREE.Vector3[] = [];
      const ox = (Math.random() - 0.5) * 60;
      const oy = (Math.random() - 0.5) * 60;
      const oz = Math.random() * DEPTH - DEPTH * 0.5;
      for (let j = 0; j < 6; j++) {
        pts.push(new THREE.Vector3(ox + Math.sin(j * 1.3) * 2.4, oy + j * 1.6 - 4, oz + Math.cos(j) * 2));
      }
      const tg = new THREE.BufferGeometry().setFromPoints(pts);
      const tm = baseThreadMat.clone();
      const l = new THREE.Line(tg, tm);
      l.userData.spin = (Math.random() - 0.5) * 0.3;
      threads.add(l);
      threadGeos.push(tg);
      threadMats.push(tm);
    }
    scene.add(threads);

    // --- central ember glow halo behind the hero ---
    const haloMat = new THREE.SpriteMaterial({
      map: sprite,
      color: 0xff6a1a,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(70, 70, 1);
    halo.position.set(10, 4, -30);
    scene.add(halo);

    // --- scroll + pointer reactivity ---
    let scrollN = 0;
    let targetScroll = 0;
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      targetScroll = max > 0 ? window.scrollY / max : 0;
    };
    onScroll();

    let px = 0, py = 0, tpx = 0, tpy = 0;
    const onPointer = (e: PointerEvent) => {
      tpx = e.clientX / window.innerWidth - 0.5;
      tpy = e.clientY / window.innerHeight - 0.5;
    };

    let visible = true;
    const onVisibility = () => { visible = !document.hidden; };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      scrollN += (targetScroll - scrollN) * 0.06;
      px += (tpx - px) * 0.05;
      py += (tpy - py) * 0.05;

      if (!reduced) {
        mat.uniforms.uTime.value = t;
        camera.position.z = 34 - scrollN * 150;
        camera.position.x = px * 8 + Math.sin(t * 0.1) * 1.5;
        camera.position.y = -py * 6 + Math.cos(t * 0.12) * 1.0;
        camera.lookAt(0, 0, camera.position.z - 30);
        points.rotation.z = scrollN * 0.4 + t * 0.01;
        threads.children.forEach((l) => { l.rotation.z += (l.userData.spin as number) * dt; });
        halo.material.opacity = 0.5 * (1 - Math.min(scrollN * 1.8, 1)) + 0.08;
        halo.position.z = -30 - scrollN * 120;
      } else {
        camera.position.set(0, 0, 34);
        camera.lookAt(0, 0, 0);
      }
      renderer.render(scene, camera);
    };
    // Reduced motion: render one static frame and stop.
    if (reduced) {
      renderer.render(scene, camera);
    } else {
      tick();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      geo.dispose();
      mat.dispose();
      sprite.dispose();
      haloMat.dispose();
      threadGeos.forEach((tg) => tg.dispose());
      threadMats.forEach((tm) => tm.dispose());
      baseThreadMat.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="cosmos-canvas" aria-hidden="true" />;
}
