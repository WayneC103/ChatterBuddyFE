import React, { useState, useCallback, useEffect, useRef } from "react";
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
} from "react-native";
import {
  request,
  PERMISSIONS,
  RESULTS,
  Permission,
} from "react-native-permissions";
import Config from "react-native-config";
import { Canvas } from "@react-three/fiber/native";
import { Suspense } from "react";
import { Color } from "three";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Avatar3D from "./Avatar3D";
import {
  OpenAIRealtimeService,
  RealtimeConfig,
  RealtimeCallbacks,
} from "../services/OpenAIRealtimeService";
import { AIConfigService, AIConfig } from "../services/AIConfigService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import InCallManager from "react-native-incall-manager";
import { responsive } from "../utils/responsive";

// ✅ Hermes-compatible patch for WebGL getProgramInfoLog
if (
  (global as any).WebGLRenderingContext &&
  typeof (global as any).WebGLRenderingContext.prototype.getProgramInfoLog ===
    "function"
) {
  const original = (global as any).WebGLRenderingContext.prototype
    .getProgramInfoLog;
  (global as any).WebGLRenderingContext.prototype.getProgramInfoLog = function (
    ...args: any[]
  ) {
    const result = original.apply(this, args);
    return typeof result === "string" ? result : "";
  };
}

const { width, height } = Dimensions.get("window");
const STORAGE_KEY = "startTalkingOnOpen";

type RootStackParamList = { Avatar: undefined; Settings: undefined };

// Simple Loader component as shown in the R3F documentation
const Loader: React.FC = () => {
  return (
    <View style={styles.loaderContainer}>
      <Text style={styles.loaderText}>Loading 3D Model...</Text>
    </View>
  );
};

const AvatarScreen: React.FC = () => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [transcript, setTranscript] = useState("");
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [realtimeService, setRealtimeService] =
    useState<OpenAIRealtimeService | null>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarError, setAvatarError] = useState<string | undefined>();
  const [isBridgeReady, setIsBridgeReady] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true); // Default to speaker for both platforms
  const [hasEndedCall, setHasEndedCall] = useState(false);

  // Animation values for loading indicator
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;

  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [startTalkingOnOpen, setStartTalkingOnOpen] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(
    AIConfigService.DEFAULT_CONFIG
  );

  // Check if React Native bridge is ready
  useEffect(() => {
    const checkBridgeReady = () => {
      // Wait for the bridge to be fully initialized
      setTimeout(() => {
        console.log("React Native bridge should be ready now");
        setIsBridgeReady(true);
      }, 1000); // Give extra time for bridge initialization
    };

    checkBridgeReady();
  }, []);

  // Hide status bar
  useEffect(() => {
    StatusBar.setHidden(true);
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
        })
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
        ])
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
        "EXGL:",
        "gl.pixelStorei",
        "gl.getParameter",
        "WebGL",
        "THREE.WebGLRenderer",
        "THREE.WebGLProgram",
        "THREE.WebGLShader",
      ];
      return filters.some((filter) => message.includes(filter));
    };

    console.log = (...args) => {
      const message = args.join(" ");
      if (!shouldFilter(message)) {
        originalLog.apply(console, args);
      }
    };

    console.warn = (...args) => {
      const message = args.join(" ");
      if (!shouldFilter(message)) {
        originalWarn.apply(console, args);
      }
    };

    console.error = (...args) => {
      const message = args.join(" ");
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
      console.log("Avatar load state changed:", { isLoaded, error });
      setAvatarLoaded(isLoaded);
      setAvatarError(error);
    },
    []
  );

  // Request microphone permissions for both iOS and Android
  const requestMicrophonePermission = async (): Promise<boolean> => {
    try {
      let permission: Permission;

      if (Platform.OS === "ios") {
        permission = PERMISSIONS.IOS.MICROPHONE;
      } else {
        permission = PERMISSIONS.ANDROID.RECORD_AUDIO;
      }

      const result = await request(permission);

      switch (result) {
        case RESULTS.GRANTED:
          console.log("Microphone permission granted");
          return true;
        case RESULTS.DENIED:
          console.log("Microphone permission denied");
          return false;
        case RESULTS.BLOCKED:
          console.log("Microphone permission blocked");
          Alert.alert(
            "Permission Required",
            "Microphone permission is required for voice conversations. Please enable it in Settings.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  // On iOS, this would ideally open the Settings app
                  // but React Native doesn't have a built-in way to do this
                  console.log(
                    "User should manually enable microphone in Settings"
                  );
                },
              },
            ]
          );
          return false;
        case RESULTS.UNAVAILABLE:
          console.log("Microphone not available on this device");
          Alert.alert(
            "Microphone Unavailable",
            "Microphone is not available on this device."
          );
          return false;
        default:
          return false;
      }
    } catch (error) {
      console.error("Error requesting microphone permission:", error);
      return false;
    }
  };

  // Callback handlers for the realtime service
  const realtimeCallbacks: RealtimeCallbacks = {
    onConnectionStateChange: (state: string) => {
      console.log("Connection state changed:", state);
      setConnectionState(state);
      if (state === "connected") {
        setIsConnecting(false);
        setIsCallActive(true);
      } else if (state === "disconnected" || state === "failed") {
        setIsConnecting(false);
        setIsCallActive(false);
      }
    },
    onTranscriptReceived: (text: string) => {
      console.log("Transcript received:", text);
      if (text && typeof text === "string") {
        setTranscript((prev) => prev + text);
      }
    },
    onBotSpeaking: (isSpeaking: boolean) => {
      console.log("Bot speaking state:", isSpeaking);
      setIsBotSpeaking(isSpeaking);
    },
    onError: (error: string) => {
      console.error("Realtime service error:", error);
      setIsConnecting(false);
      setIsCallActive(false);
      Alert.alert("Error", `Voice call error: ${error}`);
    },
    onSessionStart: () => {
      console.log("Session started");
      setIsCallActive(true);
      setIsConnecting(false);
    },
    onSessionEnd: () => {
      console.log("Session ended");
      setIsCallActive(false);
      setIsConnecting(false);
      setTranscript("");
      setIsBotSpeaking(false);
    },
  };

  // Start voice call
  const startCall = useCallback(async () => {
    setHasEndedCall(false);
    try {
      setIsConnecting(true);

      // Check microphone permissions
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert(
          "Permission Required",
          "Microphone access is required for voice calls."
        );
        setIsConnecting(false);
        return;
      }

      // Configure the realtime service using AI config
      const config: RealtimeConfig = {
        model: "gpt-4o-mini-realtime-preview-2024-12-17",
        voice: aiConfig.personality.voice,
        instructions: AIConfigService.generateSystemPrompt(aiConfig),
        // Use stream monitoring for most accurate animation timing with WebRTC
        audioEndDelayStrategy: "stream-monitoring", // Most accurate for WebRTC audio streams
        audioEndDelayMs: 800, // Only used with 'fixed' strategy (not needed for stream-monitoring)
      };

      // Create and start the service
      const service = new OpenAIRealtimeService(config, realtimeCallbacks);
      setRealtimeService(service);

      await service.startCall();

      // After successful connection, trigger automatic greeting
      console.log(
        "🤖 Connection established, triggering automatic greeting..."
      );
      setTimeout(() => {
        console.log("👋 Auto-starting greeting");
        service.triggerResponse(AIConfigService.getGreeting(aiConfig));
      }, 1500); // Give time for the session to be fully ready
    } catch (error) {
      console.error("Error starting call:", error);
      setIsConnecting(false);
      Alert.alert("Error", "Failed to start voice call. Please try again.");
    }
  }, [realtimeCallbacks, aiConfig]);

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const [value, config] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AIConfigService.getConfig(),
        ]);
        if (value !== null) setStartTalkingOnOpen(value === "true");
        setAiConfig(config);
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  // Only auto-start if setting is enabled
  useEffect(() => {
    if (!settingsLoaded) return;
    if (startTalkingOnOpen) {
      setTimeout(() => {
        startCall();
      }, 2000);
    }
    return () => {
      if (realtimeService) {
        endCall();
      }
    };
  }, [settingsLoaded, startTalkingOnOpen]);

  // End voice call
  const endCall = useCallback(async () => {
    setHasEndedCall(true);
    if (realtimeService) {
      try {
        await realtimeService.endCall();
        setRealtimeService(null);
      } catch (error) {
        console.error("Error ending call:", error);
        Alert.alert("Error", "Failed to end voice call properly.");
      }
    }
    setIsCallActive(false);
    setIsConnecting(false);
    setTranscript("");
  }, [realtimeService]);

  // Get button text and style based on state
  const getButtonConfig = () => {
    if (isConnecting) {
      return {
        text: "Connecting...",
        backgroundColor: "#ff9800",
        disabled: true,
      };
    } else if (isCallActive) {
      return {
        text: "End Call",
        backgroundColor: "#f44336",
        disabled: false,
      };
    } else {
      return {
        text: "Start Call",
        backgroundColor: "#4CAF50",
        disabled: false,
      };
    }
  };

  const buttonConfig = getButtonConfig();

  // Handle audio route change for both iOS and Android
  useEffect(() => {
    try {
      if (isSpeaker) {
        InCallManager.setSpeakerphoneOn(true);
        console.log("Audio route set to speaker");
      } else {
        InCallManager.setSpeakerphoneOn(false);
        console.log("Audio route set to earpiece/headphones");
      }
    } catch (error) {
      console.warn("Error setting audio route:", error);
    }
  }, [isSpeaker]);

  return (
    <View style={styles.container}>
      {/* Settings and Connection Status Row (flexbox) */}
      <View style={styles.topRow}>
        <View style={styles.audioToggle}>
          <TouchableOpacity onPress={() => setIsSpeaker((s) => !s)}>
            <Icon
              name={isSpeaker ? "volume-high" : "headphones"}
              size={responsive.iconSizes.large}
              color="#ffffff"
            />
          </TouchableOpacity>
        </View>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: avatarError
                  ? "#f44336"
                  : !isBridgeReady
                  ? "#888888"
                  : !avatarLoaded
                  ? "#ff9800"
                  : isConnecting
                  ? "#ff9800"
                  : connectionState === "connected"
                  ? "#4CAF50"
                  : hasEndedCall
                  ? "#f44336"
                  : "#888888",
              },
            ]}
          />
          <Icon
            name={
              avatarError
                ? "alert-circle"
                : !isBridgeReady
                ? "clock-outline"
                : !avatarLoaded
                ? "clock-outline"
                : isConnecting
                ? "clock-outline"
                : connectionState === "connected"
                ? "phone"
                : hasEndedCall
                ? "phone-off"
                : "phone-outline"
            }
            size={responsive.iconSizes.small}
            color="#fff"
            style={{
              marginRight: responsive.scale(6),
              marginLeft: responsive.scale(2),
            }}
          />
          <Text style={styles.statusText}>
            {avatarError
              ? "Failed to load model"
              : !isBridgeReady
              ? "Initializing..."
              : !avatarLoaded
              ? "Loading Model..."
              : isConnecting
              ? "Connecting..."
              : connectionState === "connected"
              ? "Connected"
              : hasEndedCall
              ? "Call Ended"
              : "Idle"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.settingsIcon}
          onPress={() => navigation.navigate("Settings")}
        >
          <Icon name="cog" size={responsive.iconSizes.large} color="#ffffff" />
        </TouchableOpacity>
      </View>

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
              powerPreference: "default",
              antialias: false,
              alpha: false,
            }}
            onCreated={({ gl, scene, camera, size, raycaster }) => {
              (gl as any).debug = { checkShaderErrors: false };
            }}
          >
            <Suspense fallback={<Loader />}>
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
                      // Vertical gradient: black (top) to deep blue/gray (bottom)
                      vec3 topColor = vec3(0.02, 0.02, 0.05); // almost black
                      vec3 bottomColor = vec3(0.13, 0.18, 0.28); // deep blue/gray
                      vec3 base = mix(topColor, bottomColor, vUv.y);

                      // Radial spotlight effect (center bottom)
                      float dist = distance(vUv, vec2(0.5, 0.15));
                      float spotlight = 1.0 - smoothstep(0.18, 0.45, dist);
                      vec3 spotColor = vec3(0.25, 0.32, 0.45); // bluish spotlight
                      vec3 color = mix(base, spotColor, spotlight * 0.7);

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
                            outputRange: ["0deg", "360deg"],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.spinnerRing} />
                </Animated.View>

                {/* Pulsing center dot */}
                <Animated.View
                  style={[
                    styles.centerDot,
                    {
                      transform: [{ scale: pulseValue }],
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
                  <Icon
                    name="alert-circle"
                    size={responsive.iconSizes.xlarge}
                    color="#ffffff"
                  />
                </View>
                <Text style={styles.errorText}>Failed to load avatar</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    setAvatarError(undefined);
                    setAvatarLoaded(false);
                  }}
                >
                  <View style={styles.retryButtonContent}>
                    <Icon
                      name="refresh"
                      size={responsive.iconSizes.medium}
                      color="#ffffff"
                    />
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </View>
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

      {/* If startTalkingOnOpen is false, show button to start talking or end call */}
      {settingsLoaded && (
        <View style={styles.bottomLeftButtonContainer}>
          {!isCallActive &&
            !isConnecting &&
            (!startTalkingOnOpen || hasEndedCall) && (
              <View style={styles.bottomLeftButtonRow}>
                <TouchableOpacity
                  style={styles.bottomLeftIconButton}
                  onPress={startCall}
                >
                  <Icon
                    name="phone"
                    size={responsive.iconSizes.medium}
                    color="#fff"
                  />
                </TouchableOpacity>
                <Text style={styles.bottomLeftButtonText}>Start Talking</Text>
              </View>
            )}
          {isCallActive && (
            <View style={styles.bottomLeftButtonRow}>
              <TouchableOpacity
                style={[styles.bottomLeftIconButton, styles.endButton]}
                onPress={endCall}
              >
                <Icon
                  name="phone-off"
                  size={responsive.iconSizes.medium}
                  color="#fff"
                />
              </TouchableOpacity>
              <Text style={[styles.bottomLeftButtonText, styles.endButtonText]}>
                End Call
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Avatar Error Display */}
      {avatarError && (
        <TouchableOpacity
          style={styles.errorContainer}
          onPress={() => {
            setAvatarError(undefined);
            setAvatarLoaded(false);
          }}
        >
          <Text style={styles.errorText}>
            Avatar failed to load. Tap to retry.
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  canvas: {
    width: width,
    height: height,
    backgroundColor: "#0a0a1a",
  },
  topRow: {
    position: "absolute",
    top: responsive.isTablet ? responsive.scale(80) : responsive.scale(60),
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
    paddingHorizontal: responsive.padding.horizontal,
    width: "100%",
  },
  topBarFlex: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  statusContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: responsive.scale(18),
    paddingVertical: responsive.scale(8),
    borderRadius: responsive.scale(24),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    minWidth: responsive.scale(140),
    justifyContent: "center",
    marginHorizontal: responsive.scale(16),
  },
  statusIndicator: {
    width: responsive.scale(10),
    height: responsive.scale(10),
    borderRadius: responsive.scale(5),
    marginRight: responsive.scale(10),
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statusText: {
    color: "#ffffff",
    fontSize: responsive.scaleFontSize(14),
    fontWeight: "500",
  },
  transcriptContainer: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 16,
    borderRadius: 12,
    maxHeight: 100,
  },
  transcriptText: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    position: "absolute",
    bottom: responsive.isTablet ? responsive.scale(60) : responsive.scale(40),
    left: 0,
    right: 0,
    alignItems: "center",
  },
  talkIndicator: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 88,
    height: 88,
  },
  pulseRing: {
    position: "absolute",
    borderRadius: 44,
    borderWidth: 1,
  },
  pulseRing1: {
    width: 64,
    height: 64,
    opacity: 0.8,
    borderWidth: 2,
  },
  pulseRing2: {
    width: 76,
    height: 76,
    opacity: 0.5,
    borderWidth: 2,
  },
  pulseRing3: {
    width: 88,
    height: 88,
    opacity: 0.3,
    borderWidth: 2,
  },
  microphoneCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  microphoneIcon: {
    fontSize: 24,
    color: "#ffffff",
  },
  talkInstructionText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  talkSubText: {
    color: "#cccccc",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
    fontStyle: "italic",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  errorContainer: {
    position: "absolute",
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: "rgba(244, 67, 54, 0.9)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  errorText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a1a",
  },
  loadingText: {
    color: "#ffffff",
    fontSize: responsive.scaleFontSize(18),
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 26, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  spinner: {
    width: responsive.scale(80),
    height: responsive.scale(80),
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerRing: {
    width: responsive.scale(80),
    height: responsive.scale(80),
    borderRadius: responsive.scale(40),
    borderWidth: responsive.scale(4),
    borderColor: "#4CAF50",
    borderTopColor: "transparent",
  },
  centerDot: {
    position: "absolute",
    width: responsive.scale(20),
    height: responsive.scale(20),
    borderRadius: responsive.scale(10),
    backgroundColor: "#FF9800",
    shadowColor: "#FF9800",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: responsive.scale(10),
    elevation: 5,
  },
  loadingTextContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 26, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  errorIcon: {
    width: responsive.scale(64),
    height: responsive.scale(64),
    borderRadius: responsive.scale(32),
    backgroundColor: "#ff4444",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: responsive.scale(16),
    elevation: 4,
    shadowColor: "#ff4444",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  errorIconText: {
    fontSize: 30,
  },
  retryButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#4CAF50",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  retryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 6,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#d4d4d4",
  },
  loaderText: {
    color: "#666666",
    fontSize: 18,
    fontWeight: "500",
  },
  settingsIcon: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: responsive.scale(12),
    borderRadius: responsive.scale(20),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  audioToggle: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: responsive.scale(12),
    borderRadius: responsive.scale(20),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bottomLeftButtonContainer: {
    position: "absolute",
    left: responsive.scale(30),
    right: 0,
    bottom: responsive.isTablet ? responsive.scale(50) : responsive.scale(32),
    zIndex: 20,
    flexDirection: "row",
    // justifyContent: 'center',
    // alignItems: 'center',
  },
  bottomLeftIconButton: {
    width: responsive.buttonSizes.medium.width,
    height: responsive.buttonSizes.medium.height,
    borderRadius: responsive.buttonSizes.medium.borderRadius,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    marginRight: responsive.scale(10),
  },
  bottomLeftButtonTextContainer: {
    backgroundColor: "#4CAF50",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  bottomLeftButtonText: {
    color: "#4CAF50",
    fontSize: responsive.scaleFontSize(18),
    fontWeight: "700",
    marginLeft: responsive.scale(10),
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    elevation: 0,
    shadowColor: "transparent",
  },
  endButton: {
    backgroundColor: "#f44336",
    shadowColor: "#f44336",
  },
  endButtonText: {
    color: "#f44336",
  },
  bottomLeftButtonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export default AvatarScreen;
