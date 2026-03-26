import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { GeometryType, VisualParams } from '../types';
import { AudioAnalyzer } from '../services/audioAnalyzer';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';

interface SceneProps {
  params: VisualParams;
  analyzer: AudioAnalyzer | null;
  handResult?: HandLandmarkerResult | null;
}

const ReactiveMesh: React.FC<{ params: VisualParams; analyzer: AudioAnalyzer | null; handResult?: HandLandmarkerResult | null }> = ({ params, analyzer, handResult }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  
  // Create geometry based on params (increased detail for more intricate lines)
  const geometry = useMemo(() => {
    switch (params.geometry) {
      case GeometryType.CUBE:
        return new THREE.BoxGeometry(2, 2, 2, params.detail + 4, params.detail + 4, params.detail + 4);
      case GeometryType.ICOSPHERE:
        return new THREE.IcosahedronGeometry(1.5, params.detail + 3);
      case GeometryType.TORUS:
        return new THREE.TorusGeometry(1.2, 0.4, 16 + params.detail * 4, 60 + params.detail * 10);
      case GeometryType.TETRAHEDRON:
        return new THREE.TetrahedronGeometry(1.8, params.detail + 4);
      default:
        return new THREE.IcosahedronGeometry(1.5, 3);
    }
  }, [params.geometry, params.detail]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();

    // 1. Rotation & Hand Interaction
    if (handResult && handResult.landmarks && handResult.landmarks.length > 0) {
      const palm = handResult.landmarks[0][9];
      const targetRotY = (palm.x - 0.5) * Math.PI * 2;
      const targetRotX = (palm.y - 0.5) * Math.PI * 2;
      
      meshRef.current.rotation.y += (targetRotY - meshRef.current.rotation.y) * 0.1;
      meshRef.current.rotation.x += (targetRotX - meshRef.current.rotation.x) * 0.1;
    } else {
      const speed = params.rotationSpeed * 0.1;
      meshRef.current.rotation.x += delta * speed;
      meshRef.current.rotation.y += delta * speed * 0.5;
    }

    // Dynamic Neon Color Cycling
    if (materialRef.current) {
      const hueShift = (time * 0.05) % 1;
      const baseColor = new THREE.Color(params.colorHex);
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);
      
      // Cycle hue slightly around the base color, keep saturation and lightness high for neon
      const newHue = (hsl.h + hueShift) % 1;
      materialRef.current.color.setHSL(newHue, 1.0, 0.6);
      materialRef.current.emissive.setHSL(newHue, 1.0, 0.5);
    }

    // 2. Audio Reactivity (Scale & Distortion pulse)
    if (analyzer) {
      const freq = analyzer.getFrequencyData(); // 0-255
      const bass = analyzer.getBassEnergy();
      
      const scaleBase = 1;
      const scaleFactor = (bass / 255) * params.distortionFactor; // Normalize 0-1 then multiply by factor
      
      const targetScale = scaleBase + scaleFactor * 0.5;
      
      // Smooth lerp for scale
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
      
      // Jitter rotation slightly on high frequencies
      if (freq > 200) {
        meshRef.current.rotation.z += (Math.random() - 0.5) * 0.1 * params.distortionFactor;
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshPhysicalMaterial
        ref={materialRef}
        color={params.colorHex}
        emissive={params.colorHex}
        emissiveIntensity={2.5}
        wireframe={params.wireframe}
        metalness={params.metalness}
        roughness={params.roughness}
        clearcoat={1.0}
        clearcoatRoughness={0.1}
        flatShading={params.geometry === GeometryType.TETRAHEDRON || params.detail < 1}
      />
    </mesh>
  );
};

const Scene3D: React.FC<SceneProps> = ({ params, analyzer, handResult }) => {
  return (
    <Canvas>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} />
      <OrbitControls enableZoom={false} enablePan={false} />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={2} color="#00ffff" />
      <pointLight position={[-10, -10, -10]} intensity={2} color="#ff00ff" />
      <pointLight position={[0, -10, 10]} intensity={2} color="#00ff00" />
      <spotLight position={[0, 10, 0]} angle={0.5} penumbra={1} intensity={2} color="#ff0088" />

      <ReactiveMesh params={params} analyzer={analyzer} handResult={handResult} />
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={2.0} />
      </EffectComposer>
      
      {/* Synthetic Environment for reflections without external HDR files */}
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <Lightformer intensity={4} form="ring" color="cyan" position={[0, 5, -9]} scale={[10, 10, 1]} />
          <Lightformer intensity={4} form="ring" color="magenta" position={[0, 5, 9]} scale={[10, 10, 1]} />
        </group>
        <Lightformer intensity={2} form="rect" color="white" position={[-5, 1, -1]} scale={[20, 2, 1]} />
        <Lightformer intensity={2} form="rect" color="white" position={[5, 1, -1]} scale={[20, 2, 1]} />
        <Lightformer intensity={2} form="rect" color="white" position={[0, 10, 0]} scale={[20, 20, 1]} />
        <Lightformer intensity={2} form="rect" color="white" position={[0, -10, 0]} scale={[20, 20, 1]} />
      </Environment>

      {/* Post-processing feel via simple overlay/fog */}
      <fog attach="fog" args={['#050505', 5, 15]} />
    </Canvas>
  );
};

export default Scene3D;
