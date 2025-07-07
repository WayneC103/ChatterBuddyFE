import React, {useRef, useEffect, useState} from 'react';
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
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the local humanoid robot GLB file using require for React Native
  const gltf = useGLTF(require('../../assets/rob-fi.glb'));

  // Extract animations safely
  const gltfData = Array.isArray(gltf) ? gltf[0] : gltf;
  const animations = gltfData?.animations || [];
  const actions = useAnimations(animations, group);
  const scene = gltfData?.scene || null;

  // One-time loading effect
  useEffect(() => {
    console.log('Starting GLTF load...');

    try {
      console.log('GLTF data extracted:', gltfData);

      if (!gltfData) {
        console.warn('No GLTF data found');
        setLoadError('No GLTF data found');
        return;
      }

      console.log('Scene extracted:', scene);

      if (!scene) {
        setLoadError('No scene found in GLTF');
        return;
      }

      // Safely handle animations array
      const validAnimations = animations.filter((anim: any) => {
        try {
          return anim && typeof anim === 'object';
        } catch (error) {
          console.warn('Invalid animation object:', anim);
          return false;
        }
      });

      console.log('Animations processed:', validAnimations.length);

      // Set up animations once - they stay loaded
      if (actions && actions.actions) {
        const actualActions = actions.actions;
        Object.keys(actualActions).forEach(animationName => {
          const animation = actualActions[animationName];
          if (animation) {
            // Set up animation properties once
            animation.clampWhenFinished = false;
            console.log(`Setup animation: ${animationName}`);
          }
        });
      }

      setIsLoaded(true);
      console.log('GLTF loaded successfully');
    } catch (error) {
      console.error('Error loading GLTF:', error);
      setLoadError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, []); // Empty dependency array - runs only once

  // Start all animations once when loaded
  useEffect(() => {
    if (!actions || !actions.actions || !isLoaded) return;

    try {
      const actualActions = actions.actions;
      if (!actualActions || typeof actualActions !== 'object') return;

      const actualAnimationNames = Object.keys(actualActions);
      console.log('Starting all animations:', actualAnimationNames);

      // Start all animations initially
      actualAnimationNames.forEach((animationName, index) => {
        const animation = actualActions[animationName];
        if (animation && typeof animation.play === 'function') {
          setTimeout(() => {
            try {
              animation.play();
              console.log(`Started: ${animationName}`);
            } catch (error) {
              console.error(`Error starting ${animationName}:`, error);
            }
          }, index * 100);
        }
      });
    } catch (error) {
      console.error('Error starting animations:', error);
    }
  }, [isLoaded, actions]); // Only run when loaded

  // Pause/Resume animations based on talking state
  useEffect(() => {
    if (!actions || !actions.actions || !isLoaded) return;

    try {
      console.log('Talking state changed:', isTalking);

      const actualActions = actions.actions;
      if (!actualActions || typeof actualActions !== 'object') return;

      const actualAnimationNames = Object.keys(actualActions);
      console.log('Available animation names:', actualAnimationNames);

      // Pause/Resume based on talking state
      actualAnimationNames.forEach(animationName => {
        const animation = actualActions[animationName];
        if (animation) {
          if (isTalking) {
            // Resume animation when talking
            if (animation.paused) {
              animation.paused = false;
              console.log(`Resumed: ${animationName}`);
            }
          } else {
            // Pause animation when not talking
            if (!animation.paused) {
              animation.paused = true;
              console.log(`Paused: ${animationName}`);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error in pause/resume effect:', error);
    }
  }, [isTalking, isLoaded, actions]); // Only run when talking state changes

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

  // Don't render if there's an error or not loaded
  if (loadError) {
    console.error('Avatar3D load error:', loadError);
    return null;
  }

  if (!isLoaded || !scene) {
    console.log('Not loaded or no scene, returning null');
    return null;
  }

  // Final safety check
  try {
    if (!scene || typeof scene !== 'object') {
      console.warn('Invalid scene object');
      return null;
    }
  } catch (error) {
    console.error('Error in final scene check:', error);
    return null;
  }

  return (
    <group position={[0, -1, 0]}>
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
      <group ref={group} scale={0.15} position={[0, 0, 0]}>
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
useGLTF.preload(require('../../assets/rob-fi.glb'));

export default Avatar3D;
