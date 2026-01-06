
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GalaxyGesture } from './types';

interface GalaxyCanvasProps {
  gesture: GalaxyGesture;
}

const GalaxyCanvas: React.FC<GalaxyCanvasProps> = ({ gesture }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const stateRef = useRef({
    zoom: 45,
    rotX: 0.3,
    rotY: 0,
    targetZoom: 45,
    targetRotX: 0.3,
    targetRotY: 0
  });

  useEffect(() => {
    if (!mountRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010206');
    
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: false,
      powerPreference: "high-performance" 
    });
    
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    const particleCount = 85000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const params = {
      radius: 35,
      branches: 5,
      spin: 1.8,
      randomness: 0.4,
      randomnessPower: 3,
      innerColor: '#ffbb33',
      outerColor: '#3399ff'
    };

    const colorInner = new THREE.Color(params.innerColor);
    const colorOuter = new THREE.Color(params.outerColor);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = Math.random() * params.radius;
      const spinAngle = radius * params.spin;
      const branchAngle = ((i % params.branches) / params.branches) * Math.PI * 2;

      const randomX = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
      const randomY = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
      const randomZ = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
      positions[i3 + 1] = randomY * 0.35;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

      const mixedColor = colorInner.clone();
      mixedColor.lerp(colorOuter, radius / params.radius);
      
      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.045,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      transparent: true,
      opacity: 0.75
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    camera.position.set(0, 30, 60);
    camera.lookAt(0, 0, 0);

    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      const s = stateRef.current;
      
      points.rotation.y += 0.0006; // Steady drift

      s.zoom += (s.targetZoom - s.zoom) * 0.04;
      s.rotX += (s.targetRotX - s.rotX) * 0.04;
      s.rotY += (s.targetRotY - s.rotY) * 0.04;

      camera.position.z = s.zoom;
      points.rotation.x = s.rotX;
      points.rotation.y += s.rotY;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    switch (gesture) {
      case GalaxyGesture.ZOOM_IN:
        s.targetZoom = Math.max(8, s.targetZoom - 10);
        break;
      case GalaxyGesture.ZOOM_OUT:
        s.targetZoom = Math.min(180, s.targetZoom + 10);
        break;
      case GalaxyGesture.MOVE_LEFT:
        s.targetRotY -= 0.12;
        break;
      case GalaxyGesture.MOVE_RIGHT:
        s.targetRotY += 0.12;
        break;
      case GalaxyGesture.MOVE_UP:
        s.targetRotX -= 0.12;
        break;
      case GalaxyGesture.MOVE_DOWN:
        s.targetRotX += 0.12;
        break;
      case GalaxyGesture.STOP:
        s.targetRotY *= 0.4;
        s.targetRotX = 0.3;
        break;
      default:
        break;
    }
  }, [gesture]);

  return <div ref={mountRef} className="fixed inset-0 z-0 bg-black" />;
};

export default GalaxyCanvas;
