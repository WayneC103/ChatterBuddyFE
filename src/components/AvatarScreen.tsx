import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  TouchableOpacity,
  Text,
  Alert,
  PermissionsAndroid,
  Platform,
  Animated,
} from 'react-native';
import Config from 'react-native-config';
import {Canvas} from '@react-three/fiber/native';
import {Suspense} from 'react';
import {Color} from 'three';
import Avatar3D from './Avatar3D';
import {
  OpenAIRealtimeService,
  RealtimeConfig,
  RealtimeCallbacks,
} from '../services/OpenAIRealtimeService';

const {width, height} = Dimensions.get('window');

const AvatarScreen: React.FC = () => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [transcript, setTranscript] = useState('');
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [realtimeService, setRealtimeService] =
    useState<OpenAIRealtimeService | null>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarError, setAvatarError] = useState<string | undefined>();
  const [isBridgeReady, setIsBridgeReady] = useState(false);

  // Animation values for loading indicator
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;

  // Check if React Native bridge is ready
  useEffect(() => {
    const checkBridgeReady = () => {
      // Wait for the bridge to be fully initialized
      setTimeout(() => {
        console.log('React Native bridge should be ready now');
        setIsBridgeReady(true);
      }, 1000); // Give extra time for bridge initialization
    };

    checkBridgeReady();
  }, []);

  // Start loading animations
  useEffect(() => {
    if (!avatarLoaded && !avatarError) {
      // Spin animation
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ).start();

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseValue, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [avatarLoaded, avatarError]);

  // Filter out unwanted logs
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const shouldFilter = (message: string) => {
      const filters = [
        'EXGL:',
        'gl.pixelStorei',
        'gl.getParameter',
        'WebGL',
        'THREE.WebGLRenderer',
        'THREE.WebGLProgram',
        'THREE.WebGLShader',
      ];
      return filters.some(filter => message.includes(filter));
    };

    console.log = (...args) => {
      const message = args.join(' ');
      if (!shouldFilter(message)) {
        originalLog.apply(console, args);
      }
    };

    console.warn = (...args) => {
      const message = args.join(' ');
      if (!shouldFilter(message)) {
        originalWarn.apply(console, args);
      }
    };

    console.error = (...args) => {
      const message = args.join(' ');
      if (!shouldFilter(message)) {
        originalError.apply(console, args);
      }
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  // Handle avatar load state changes
  const handleAvatarLoadStateChange = useCallback(
    (isLoaded: boolean, error?: string) => {
      console.log('Avatar load state changed:', {isLoaded, error});
      setAvatarLoaded(isLoaded);
      setAvatarError(error);
    },
    [],
  );

  // Request microphone permissions
  const requestMicrophonePermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message:
              'ChatterBuddy needs access to your microphone for voice conversations.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  };

  // Callback handlers for the realtime service
  const realtimeCallbacks: RealtimeCallbacks = {
    onConnectionStateChange: (state: string) => {
      console.log('Connection state changed:', state);
      setConnectionState(state);
      if (state === 'connected') {
        setIsConnecting(false);
        setIsCallActive(true);
      } else if (state === 'disconnected' || state === 'failed') {
        setIsConnecting(false);
        setIsCallActive(false);
      }
    },
    onTranscriptReceived: (text: string) => {
      console.log('Transcript received:', text);
      if (text && typeof text === 'string') {
        setTranscript(prev => prev + text);
      }
    },
    onBotSpeaking: (isSpeaking: boolean) => {
      console.log('Bot speaking state:', isSpeaking);
      setIsBotSpeaking(isSpeaking);
    },
    onError: (error: string) => {
      console.error('Realtime service error:', error);
      setIsConnecting(false);
      setIsCallActive(false);
      Alert.alert('Error', `Voice call error: ${error}`);
    },
    onSessionStart: () => {
      console.log('Session started');
      setIsCallActive(true);
      setIsConnecting(false);
    },
    onSessionEnd: () => {
      console.log('Session ended');
      setIsCallActive(false);
      setIsConnecting(false);
      setTranscript('');
      setIsBotSpeaking(false);
    },
  };

  // Start voice call
  const startCall = useCallback(async () => {
    try {
      setIsConnecting(true);

      // Check microphone permissions
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Microphone access is required for voice calls.',
        );
        setIsConnecting(false);
        return;
      }

      // Configure the realtime service
      const config: RealtimeConfig = {
        model: 'gpt-4o-mini-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions:
          "You are ChatterBuddy, a warm and empathetic AI friend who talks like a real human. Show genuine emotions, use casual language, share personal reactions, and connect on a deep, friendly level. Be supportive, understanding, and make the user feel like they're talking to a close friend who truly cares about them. Use natural speech patterns, express feelings, and create meaningful conversations.",
      };

      // Create and start the service
      const service = new OpenAIRealtimeService(config, realtimeCallbacks);
      setRealtimeService(service);

      await service.startCall();
    } catch (error) {
      console.error('Error starting call:', error);
      setIsConnecting(false);
      Alert.alert('Error', 'Failed to start voice call. Please try again.');
    }
  }, [realtimeCallbacks]);

  useEffect(() => {
    setTimeout(() => {
      startCall();
    }, 2000);

    return () => {
      if (realtimeService) {
        endCall();
      }
    };
  }, []);

  // End voice call
  const endCall = useCallback(async () => {
    if (realtimeService) {
      try {
        await realtimeService.endCall();
        setRealtimeService(null);
      } catch (error) {
        console.error('Error ending call:', error);
        Alert.alert('Error', 'Failed to end voice call properly.');
      }
    }
    setIsCallActive(false);
    setIsConnecting(false);
    setTranscript('');
  }, [realtimeService]);

  // Get button text and style based on state
  const getButtonConfig = () => {
    if (isConnecting) {
      return {
        text: 'Connecting...',
        backgroundColor: '#ff9800',
        disabled: true,
      };
    } else if (isCallActive) {
      return {
        text: 'End Call',
        backgroundColor: '#f44336',
        disabled: false,
      };
    } else {
      return {
        text: 'Start Call',
        backgroundColor: '#4CAF50',
        disabled: false,
      };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Full Screen 3D Avatar Canvas */}
      {isBridgeReady ? (
        <>
          <Canvas
            style={styles.canvas}
            camera={{
              position: [0, 0, 6],
              fov: 50,
            }}
            gl={{
              antialias: true,
              alpha: false,
            }}>
            <Suspense fallback={null}>
              {/* Gradient Background */}
              <mesh position={[0, 0, -10]} scale={[20, 20, 1]}>
                <planeGeometry args={[1, 1]} />
                <shaderMaterial
                  vertexShader={`
                    varying vec2 vUv;
                    void main() {
                      vUv = uv;
                      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                  `}
                  fragmentShader={`
                    varying vec2 vUv;
                    void main() {
                      vec3 color1 = vec3(0.9, 0.9, 0.9); // Light gray
                      vec3 color2 = vec3(0.6, 0.6, 0.6); // Darker gray
                      vec3 color = mix(color1, color2, vUv.y);
                      gl_FragColor = vec4(color, 1.0);
                    }
                  `}
                />
              </mesh>
              <Avatar3D
                isListening={false}
                isTalking={isBotSpeaking}
                isMuted={false}
                onLoadStateChange={handleAvatarLoadStateChange}
              />
            </Suspense>
          </Canvas>

          {/* Loading overlay when avatar is not loaded */}
          {!avatarLoaded && !avatarError && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingContainer}>
                {/* Loading spinner */}
                <Animated.View
                  style={[
                    styles.spinner,
                    {
                      transform: [
                        {
                          rotate: spinValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                    },
                  ]}>
                  <View style={styles.spinnerRing} />
                </Animated.View>

                {/* Pulsing center dot */}
                <Animated.View
                  style={[
                    styles.centerDot,
                    {
                      transform: [{scale: pulseValue}],
                    },
                  ]}
                />

                {/* Loading text */}
                <View style={styles.loadingTextContainer}>
                  <Text style={styles.loadingText}>Loading Avatar...</Text>
                </View>
              </View>
            </View>
          )}

          {/* Error overlay when avatar fails to load */}
          {avatarError && (
            <View style={styles.errorOverlay}>
              <View style={styles.errorContainer}>
                <View style={styles.errorIcon}>
                  <Text style={styles.errorIconText}>⚠️</Text>
                </View>
                <Text style={styles.errorText}>Failed to load avatar</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    setAvatarError(undefined);
                    setAvatarLoaded(false);
                  }}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={styles.canvas}>
          {/* Loading placeholder */}
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Initializing...</Text>
          </View>
        </View>
      )}

      {/* Connection Status Indicator */}
      {isCallActive && (
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  connectionState === 'connected' ? '#4CAF50' : '#ff9800',
              },
            ]}
          />
          <Text style={styles.statusText}>
            {connectionState === 'connected' ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
      )}

      {/* Transcript Display */}
      {/* {transcript.length > 0 && (
        <View style={styles.transcriptContainer}>
          <Text style={styles.transcriptText} numberOfLines={3}>
            {transcript}
          </Text>
        </View>
      )} */}

      {/* Avatar Error Display */}
      {avatarError && (
        <TouchableOpacity
          style={styles.errorContainer}
          onPress={() => {
            setAvatarError(undefined);
            setAvatarLoaded(false);
          }}>
          <Text style={styles.errorText}>
            Avatar failed to load. Tap to retry.
          </Text>
        </TouchableOpacity>
      )}

      {/* Call Control Button */}
      <View style={styles.buttonContainer}>
        <View style={styles.talkIndicator}>
          {/* Pulsing rings */}
          <View
            style={[
              styles.pulseRing,
              styles.pulseRing1,
              {
                borderColor: !isBridgeReady
                  ? '#cccccc'
                  : !avatarLoaded
                  ? '#888888'
                  : isConnecting || !realtimeService
                  ? '#ff9800'
                  : '#4CAF50',
              },
            ]}
          />
          <View
            style={[
              styles.pulseRing,
              styles.pulseRing2,
              {
                borderColor: !isBridgeReady
                  ? '#cccccc'
                  : !avatarLoaded
                  ? '#888888'
                  : isConnecting || !realtimeService
                  ? '#ff9800'
                  : '#4CAF50',
              },
            ]}
          />
          <View
            style={[
              styles.pulseRing,
              styles.pulseRing3,
              {
                borderColor: !isBridgeReady
                  ? '#cccccc'
                  : !avatarLoaded
                  ? '#888888'
                  : isConnecting || !realtimeService
                  ? '#ff9800'
                  : '#4CAF50',
              },
            ]}
          />

          {/* Main microphone circle */}
          <View
            style={[
              styles.microphoneCircle,
              {
                backgroundColor: !isBridgeReady
                  ? '#cccccc'
                  : !avatarLoaded
                  ? '#888888'
                  : isConnecting || !realtimeService
                  ? '#ff9800'
                  : '#4CAF50',
              },
            ]}>
            <Text style={styles.microphoneIcon}>
              {!isBridgeReady
                ? '⏳'
                : !avatarLoaded
                ? '⏳'
                : isConnecting || !realtimeService
                ? '⏳'
                : '🎤'}
            </Text>
          </View>
        </View>

        {/* Instruction text */}
        <Text style={styles.talkInstructionText}>
          {!isBridgeReady
            ? 'Initializing...'
            : !avatarLoaded
            ? 'Loading Avatar...'
            : isConnecting || !realtimeService
            ? 'Connecting...'
            : 'Start talking'}
        </Text>
        <Text style={styles.talkSubText}>
          {!isBridgeReady
            ? 'Please wait'
            : !avatarLoaded
            ? 'Please wait while I prepare'
            : isConnecting || !realtimeService
            ? 'Please wait'
            : "I'm here to help you"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#d4d4d4',
  },
  canvas: {
    width: width,
    height: height,
    backgroundColor: '#d4d4d4',
  },
  statusContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  transcriptContainer: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 16,
    borderRadius: 12,
    maxHeight: 100,
  },
  transcriptText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  talkIndicator: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 40,
    borderWidth: 1,
  },
  pulseRing1: {
    width: 60,
    height: 60,
    opacity: 0.8,
  },
  pulseRing2: {
    width: 70,
    height: 70,
    opacity: 0.5,
  },
  pulseRing3: {
    width: 80,
    height: 80,
    opacity: 0.3,
  },
  microphoneCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  microphoneIcon: {
    fontSize: 24,
    color: '#ffffff',
  },
  talkInstructionText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  talkSubText: {
    color: '#666666',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  errorContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#d4d4d4',
  },
  loadingText: {
    color: '#666666',
    fontSize: 18,
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(212, 212, 212, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#4CAF50',
    borderTopColor: 'transparent',
  },
  centerDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF9800',
    shadowColor: '#FF9800',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  loadingTextContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(212, 212, 212, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorIconText: {
    fontSize: 30,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AvatarScreen;
