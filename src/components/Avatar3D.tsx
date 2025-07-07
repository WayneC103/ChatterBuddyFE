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
  let gltf: any;
  let scene: any = null;
  let animations: any[] = [];
  let actions: any = {};

  // Wrap the entire GLTF loading in a try-catch
  try {
    console.log('Starting GLTF load...');
    gltf = useGLTF(require('../../assets/rob-fi.glb'));
    console.log('GLTF loaded successfully:', gltf);

    // Safely extract scene and animations with fallbacks
    const gltfData = Array.isArray(gltf) ? gltf[0] : gltf;
    console.log('GLTF data extracted:', gltfData);

    // Add more defensive checks
    if (!gltfData) {
      console.warn('No GLTF data found');
      scene = null;
      animations = [];
    } else {
      scene = gltfData.scene || null;
      console.log('Scene extracted:', scene);

      // Safely handle animations array
      if (gltfData.animations && Array.isArray(gltfData.animations)) {
        console.log('Processing animations array...');
        animations = gltfData.animations.filter((anim: any) => {
          try {
            return anim && typeof anim === 'object';
          } catch (error) {
            console.warn('Invalid animation object:', anim);
            return false;
          }
        });
        console.log('Animations processed:', animations.length);
      } else {
        animations = [];
      }
    }

    // Initialize animations with useAnimations hook
    if (animations.length > 0) {
      console.log('Initializing useAnimations...');
      actions = useAnimations(animations, group);
      console.log('useAnimations initialized:', actions);
    } else {
      actions = {};
    }

    if (!isLoaded && scene) {
      setIsLoaded(true);
    }
  } catch (error) {
    console.error('Error loading GLTF:', error);
    setLoadError(error instanceof Error ? error.message : 'Unknown error');
  }

  // Animation effects
  useEffect(() => {
    if (!actions || !actions.actions) return;

    try {
      console.log('Talkingggggggggggggggg:', isTalking);

      const actualActions = actions.actions;
      if (!actualActions || typeof actualActions !== 'object') return;

      const actualAnimationNames = Object.keys(actualActions);
      console.log('Available animation names:', actualAnimationNames);

      // Play animations when GPT is speaking
      if (isTalking && actualAnimationNames.length > 0) {
        console.log('GPT is speaking - playing animations');

        // Play all available animations
        actualAnimationNames.forEach((animationName, index) => {
          const animation = actualActions[animationName];
          if (animation && typeof animation.play === 'function') {
            setTimeout(() => {
              try {
                animation.reset().fadeIn(0.5).play();
                console.log(`Playing: ${animationName}`);
              } catch (error) {
                console.error(`Error playing ${animationName}:`, error);
              }
            }, index * 100); // 100ms delay between each animation
          }
        });
      } else if (!isTalking && actualAnimationNames.length > 0) {
        // Stop all animations when GPT stops speaking
        console.log('GPT stopped speaking - stopping animations');
        actualAnimationNames.forEach(animationName => {
          const animation = actualActions[animationName];
          if (animation && typeof animation.fadeOut === 'function') {
            try {
              animation.fadeOut(0.5);
            } catch (error) {
              console.error(`Error stopping ${animationName}:`, error);
            }
          }
        });
      }
    } catch (error) {
      console.error('Error in animation effect:', error);
    }

    return () => {
      // Cleanup animations on unmount
      if (actions && actions.actions) {
        const actualActions = actions.actions;
        Object.values(actualActions).forEach((action: any) => {
          if (action && typeof action.fadeOut === 'function') {
            try {
              action.fadeOut(0.5);
            } catch (error) {
              console.error('Error in cleanup:', error);
            }
          }
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
