import React, {useRef, useEffect, useState, useCallback} from 'react';
import {useFrame} from '@react-three/fiber/native';
import {useGLTF, useAnimations} from '@react-three/drei/native';
import {Group, Mesh, MeshStandardMaterial} from 'three';

interface Avatar3DProps {
  isListening: boolean;
  isTalking: boolean;
  isMuted: boolean;
  onLoadStateChange?: (isLoaded: boolean, error?: string) => void;
}

const Avatar3D: React.FC<Avatar3DProps> = ({
  isListening,
  isTalking,
  isMuted,
  onLoadStateChange,
}) => {
  const group = useRef<Group>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(false);
  const maxRetries = 3;

  // Wait for bridge to be ready before loading
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('Bridge should be ready, starting GLTF load...');
      setShouldLoad(true);
    }, 1500); // Give extra time for bridge initialization

    return () => clearTimeout(timer);
  }, []);

  // Load the GLB file using useGLTF with proper error handling
  const gltf = shouldLoad ? useGLTF(require('../../assets/rob-fi.glb')) : null;

  // Extract animations safely
  const gltfData = gltf ? (Array.isArray(gltf) ? gltf[0] : gltf) : null;
  const animations = gltfData?.animations || [];
  const actions = useAnimations(animations, group);
  const scene = gltfData?.scene || null;

  // Notify parent component of load state changes
  useEffect(() => {
    onLoadStateChange?.(isLoaded, loadError || undefined);
  }, [isLoaded, loadError, onLoadStateChange]);

  // Retry loading function
  const retryLoading = useCallback(() => {
    if (retryCount < maxRetries) {
      console.log(
        `Retrying model load (attempt ${retryCount + 1}/${maxRetries})`,
      );
      setRetryCount(prev => prev + 1);
      setLoadError(null);
      setIsLoading(true);
      setIsLoaded(false);
      setShouldLoad(false);

      // Force a re-render by updating state
      setTimeout(() => {
        setShouldLoad(true);
      }, 100);
    }
  }, [retryCount]);

  // Enhanced loading effect with better error handling
  useEffect(() => {
    if (!shouldLoad) return;

    console.log('Starting GLTF processing...', {
      retryCount,
      isLoading,
      hasGltf: !!gltfData,
    });

    // Reset states on retry
    if (retryCount > 0) {
      setLoadError(null);
      setIsLoading(true);
    }

    const processModel = async () => {
      try {
        // Wait for GLTF to be available
        if (!gltfData) {
          console.log('Waiting for GLTF data...');
          return;
        }

        console.log('GLTF data extracted:', gltfData);

        if (!gltfData) {
          throw new Error('No GLTF data found');
        }

        console.log('Scene extracted:', scene);

        if (!scene) {
          throw new Error('No scene found in GLTF');
        }

        // Validate scene structure
        if (!scene.children || scene.children.length === 0) {
          throw new Error('Scene has no children');
        }

        // Safely handle animations array
        const validAnimations = animations.filter((anim: any) => {
          try {
            return anim && typeof anim === 'object' && anim.name;
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
        setLoadError(null);
        setIsLoading(false);
        console.log('GLTF processed successfully');
      } catch (error) {
        console.error('Error processing GLTF:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setLoadError(errorMessage);
        setIsLoading(false);

        // Auto-retry on error if we haven't exceeded max retries
        if (retryCount < maxRetries) {
          console.log(
            `Auto-retrying in 2 seconds... (${retryCount + 1}/${maxRetries})`,
          );
          setTimeout(() => {
            retryLoading();
          }, 2000);
        }
      }
    };

    processModel();
  }, [gltfData, scene, animations, actions, retryCount, shouldLoad]); // Include shouldLoad in dependencies

  // Start all animations once when loaded
  useEffect(() => {
    if (!actions || !actions.actions || !isLoaded) return;

    try {
      const actualActions = actions.actions;
      if (!actualActions || typeof actualActions !== 'object') return;

      const actualAnimationNames = Object.keys(actualActions);
      console.log('Starting all animations:', actualAnimationNames);

      // Start all animations initially with staggered timing
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
          }, index * 200); // Increased delay for better stability
        }
      });
    } catch (error) {
      console.error('Error starting animations:', error);
    }
  }, [isLoaded, actions]);

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
            // Pause animation when not talking and reset to initial state
            if (!animation.paused) {
              // Reset animation to initial state before pausing
              animation.reset();
              animation.paused = true;
              console.log(`Paused and reset: ${animationName}`);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error in pause/resume effect:', error);
    }
  }, [isTalking, isLoaded, actions]);

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

  // Show loading state or error - return null to let parent handle UI
  if (isLoading || !shouldLoad || loadError) {
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
