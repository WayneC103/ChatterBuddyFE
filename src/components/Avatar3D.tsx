import React, {useRef, useEffect} from 'react';
import {useFrame} from '@react-three/fiber/native';
import {useGLTF, useAnimations} from '@react-three/drei/native';
import {Group, Mesh, MeshStandardMaterial} from 'three';

interface Avatar3DProps {
  isListening: boolean;
  isTalking: boolean;
  isMuted: boolean;
}

const Avatar3D: React.FC<Avatar3DProps> = ({
  isListening,
  isTalking,
  isMuted,
}) => {
  const group = useRef<Group>(null);

  // Load the local humanoid robot GLB file using require for React Native
  const gltf = useGLTF(require('../../assets/cute_robot.glb'));
  const {scene, animations} = Array.isArray(gltf) ? gltf[0] : gltf;
  const {actions} = useAnimations(animations, group);

  // Debug logging for model structure
  useEffect(() => {
    console.log('=== GLTF MODEL DEBUG INFO ===');

    // Log scene hierarchy with materials
    console.log('=== SCENE HIERARCHY & MATERIALS ===');
    scene.traverse(child => {
      console.log(
        `Object: ${child.name || 'unnamed'}, Type: ${child.type}, Visible: ${
          child.visible
        }`,
      );
      if (child instanceof Mesh) {
        console.log(`  - Mesh geometry:`, child.geometry);
        console.log(`  - Mesh material:`, child.material);

        // Check material properties
        if (child.material) {
          const material = Array.isArray(child.material)
            ? child.material[0]
            : child.material;
          console.log(`  - Material type: ${material.type}`);
          console.log(`  - Material color:`, material.color);
          console.log(`  - Material map:`, material.map);
          console.log(`  - Material transparent:`, material.transparent);
          console.log(`  - Material opacity:`, material.opacity);
          console.log(`  - Material visible:`, material.visible);
        }
      }
    });

    // Only fix incompatible MeshPhysicalMaterial while preserving textures
    console.log('=== FIXING MATERIAL COMPATIBILITY ===');
    // scene.traverse(child => {
    //   if (child instanceof Mesh && child.material) {
    //     const material = Array.isArray(child.material)
    //       ? child.material[0]
    //       : child.material;

    //     // Only convert MeshPhysicalMaterial (which doesn't work well on mobile)
    //     child.material = new MeshStandardMaterial({
    //       color: material.color,
    //       emissive: material.emissive || 0x333333, // Ensure visibility
    //       transparent: material.transparent,
    //       opacity: material.opacity,
    //       side: material.side,
    //     });
    //   }
    // });

    console.log('=== END DEBUG INFO ===');
  }, [gltf, scene, animations, actions]);

  // Animation effects
  useEffect(() => {
    if (!actions) return;

    // Get available animation names
    const animationNames = Object.keys(actions);
    console.log('Available animations:', animationNames);

    // Play Bot_waving animation specifically
    const wavingAnimation = actions['Take 001'];
    if (wavingAnimation) {
      console.log('Playing Bot_waving animation');
      wavingAnimation.reset().fadeIn(0.5).play();
      return;
    }

    // Fallback to other animations if Bot_waving not found
    if (isTalking && actions) {
      // Try to find talking-related animations
      const talkingAnimation =
        actions['talking'] ||
        actions['speak'] ||
        actions['idle'] ||
        actions['Idle'] ||
        actions[animationNames[0]]; // Fallback to first available animation

      if (talkingAnimation) {
        talkingAnimation.reset().fadeIn(0.5).play();
      }
    } else if (isListening && actions) {
      // Try to find listening-related animations
      const listeningAnimation =
        actions['listening'] ||
        actions['idle'] ||
        actions['Idle'] ||
        actions[animationNames[0]]; // Fallback to first available animation

      if (listeningAnimation) {
        listeningAnimation.reset().fadeIn(0.5).play();
      }
    } else if (actions && animationNames.length > 0) {
      // Default idle animation
      const idleAnimation =
        actions['idle'] || actions['Idle'] || actions[animationNames[0]]; // Fallback to first available animation

      if (idleAnimation) {
        idleAnimation.reset().fadeIn(0.5).play();
      }
    }

    return () => {
      // Cleanup animations
      if (actions) {
        Object.values(actions).forEach(action => {
          if (action) action.fadeOut(0.5);
        });
      }
    };
  }, [isTalking, isListening, actions]);

  // Animate the avatar with subtle movements
  useFrame(state => {
    if (group.current) {
      // Gentle floating animation
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;

      // Subtle rotation when listening
      if (isListening) {
        group.current.rotation.y =
          Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
      } else {
        group.current.rotation.y *= 0.95; // Return to center
      }
    }
  });

  return (
    <group position={[0, -0.25, 0]}>
      {/* Lighting for the avatar */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-5, 5, 5]} intensity={0.4} color="#ff6b6b" />
      <pointLight position={[5, -5, 5]} intensity={0.4} color="#4ecdc4" />

      {/* Humanoid Robot Avatar */}
      <group ref={group} scale={1} position={[0, 0, 0]}>
        <primitive object={scene} />
      </group>

      {/* Status indicators */}
      {/* {isMuted && (
        <mesh position={[1.5, 1, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial
            color="#ff4444"
            transparent
            opacity={0.8}
            emissive="#ff2222"
            emissiveIntensity={0.3}
          />
        </mesh>
      )} */}

      {/* Listening glow */}
      {/* {isListening && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[2.5, 16, 16]} />
          <meshStandardMaterial
            color="#2196F3"
            transparent
            opacity={0.1}
            emissive="#2196F3"
            emissiveIntensity={0.2}
          />
        </mesh>
      )} */}

      {/* Talking glow */}
      {/* {isTalking && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[2.7, 16, 16]} />
          <meshStandardMaterial
            color="#4CAF50"
            transparent
            opacity={0.15}
            emissive="#4CAF50"
            emissiveIntensity={0.3}
          />
        </mesh>
      )} */}
    </group>
  );
};

// Preload the GLB file for better performance
useGLTF.preload(require('../../assets/cute_robot.glb'));

export default Avatar3D;
