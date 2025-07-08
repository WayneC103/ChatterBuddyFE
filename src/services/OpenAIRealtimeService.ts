import {
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import axios from 'axios';

export interface RealtimeConfig {
  model?: string;
  voice?: string;
  instructions?: string;
  audioEndDelayStrategy?: 'smart' | 'fixed' | 'stream-monitoring';
  audioEndDelayMs?: number; // for fixed delay strategy
}

export interface RealtimeCallbacks {
  onConnectionStateChange?: (state: string) => void;
  onAudioReceived?: (audioData: ArrayBuffer) => void;
  onTranscriptReceived?: (transcript: string) => void;
  onBotSpeaking?: (isSpeaking: boolean) => void;
  onError?: (error: string) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export class OpenAIRealtimeService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: any = null;
  private config: RealtimeConfig;
  private callbacks: RealtimeCallbacks;
  private audioEndTimeout: NodeJS.Timeout | null = null;
  private lastAudioChunkTime: number = 0;
  private estimatedAudioDuration: number = 0;
  private remoteAudioStream: MediaStream | null = null;
  private isAudioActuallyPlaying: boolean = false;
  private audioPlaybackCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: RealtimeConfig, callbacks: RealtimeCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async startCall(): Promise<void> {
    try {
      // Get ephemeral key from backend
      const ephemeralKey = await this.getEphemeralKey();

      // Create peer connection following official documentation
      this.peerConnection = new RTCPeerConnection();

      // Set up connection state monitoring (cast to any to avoid TypeScript issues)
      (this.peerConnection as any).onconnectionstatechange = () => {
        const state =
          (this.peerConnection as any)?.connectionState || 'unknown';
        console.log('Connection state:', state);
        this.callbacks.onConnectionStateChange?.(state);
      };

      // Set up to receive remote audio from the model (cast to any for TypeScript)
      (this.peerConnection as any).ontrack = (event: any) => {
        console.log('Received remote audio track');
        // Store the remote audio stream for monitoring
        if (event.streams && event.streams[0]) {
          this.remoteAudioStream = event.streams[0];
          this.startAudioPlaybackMonitoring();
        }
      };

      // Get local audio (microphone input)
      const localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      // Add local audio track for microphone input
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.peerConnection.addTrack(audioTracks[0], localStream);
      }

      // Set up data channel for sending and receiving events (following official docs)
      this.dataChannel = this.peerConnection.createDataChannel('oai-events');

      this.dataChannel.onopen = () => {
        console.log('Data channel opened');
        this.callbacks.onSessionStart?.();
      };

      this.dataChannel.onmessage = (event: any) => {
        // Realtime server events appear here!
        console.log('Received message:', event.data);
        try {
          const data = JSON.parse(event.data);

          // Handle different event types
          if (data.type === 'response.audio_transcript.delta') {
            const delta = data.delta;
            if (delta && typeof delta === 'string') {
              this.callbacks.onTranscriptReceived?.(delta);
            }
          } else if (data.type === 'output_audio_buffer.started') {
            // Bot started speaking - immediately set to true
            console.log('Bot started speaking');
            this.callbacks.onBotSpeaking?.(true);
            // Clear any pending audio end timeout
            if (this.audioEndTimeout) {
              clearTimeout(this.audioEndTimeout);
              this.audioEndTimeout = null;
            }
          } else if (data.type === 'response.audio.delta') {
            // Track audio chunks to estimate duration
            this.lastAudioChunkTime = Date.now();
            if (data.delta) {
              // Estimate audio duration based on data size (rough approximation)
              // Assuming 16kHz, 16-bit audio (2 bytes per sample)
              const audioDataSize = data.delta.length || 1024; // fallback size
              const estimatedMs = (audioDataSize / (16000 * 2)) * 1000;
              this.estimatedAudioDuration = Math.max(estimatedMs, 500); // minimum 500ms buffer
            }
            this.callbacks.onAudioReceived?.(data.delta);
          } else if (data.type === 'output_audio_buffer.stopped') {
            // Bot stopped sending audio data, but audio is still playing
            console.log(
              'Bot stopped sending audio, calculating playback delay...',
            );
            this.handleAudioEnd();
          } else if (data.type === 'response.audio.end') {
            // Alternative audio end event
            console.log(
              'Bot audio response ended, calculating playback delay...',
            );
            this.handleAudioEnd();
          }
        } catch (error) {
          console.log('Non-JSON message received:', event.data);
        }
      };

      this.dataChannel.onerror = (error: any) => {
        console.error('Data channel error:', error);
        this.callbacks.onError?.(`Data channel error: ${error}`);
      };

      // Start the session using SDP (Session Description Protocol)
      const offer = await this.peerConnection.createOffer({});
      await this.peerConnection.setLocalDescription(offer);

      // Send offer to OpenAI API following official documentation
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model =
        this.config.model || 'gpt-4o-mini-realtime-preview-2024-12-17';

      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(`SDP request failed: ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      const answer = new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      await this.peerConnection.setRemoteDescription(answer);
    } catch (error) {
      console.error('Failed to start call:', error);
      this.callbacks.onError?.(`Failed to start call: ${error}`);
      throw error;
    }
  }

  private startAudioPlaybackMonitoring(): void {
    if (!this.remoteAudioStream) return;

    // Monitor audio track state changes
    const audioTracks = this.remoteAudioStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const audioTrack = audioTracks[0];

      // Use React Native WebRTC event handling (cast to any for RN-specific API)
      const trackWithEvents = audioTrack as any;
      if (trackWithEvents.onended !== undefined) {
        trackWithEvents.onended = () => {
          console.log('Audio track ended');
          this.isAudioActuallyPlaying = false;
        };
      }

      // Periodically check audio track state
      this.audioPlaybackCheckInterval = setInterval(() => {
        if (audioTrack.readyState === 'ended') {
          this.isAudioActuallyPlaying = false;
          if (this.audioPlaybackCheckInterval) {
            clearInterval(this.audioPlaybackCheckInterval);
            this.audioPlaybackCheckInterval = null;
          }
        }
      }, 100);
    }
  }

  private handleAudioEnd(): void {
    // Clear any existing timeout
    if (this.audioEndTimeout) {
      clearTimeout(this.audioEndTimeout);
    }

    const strategy = this.config.audioEndDelayStrategy || 'smart';

    switch (strategy) {
      case 'fixed':
        this.handleFixedDelay();
        break;
      case 'stream-monitoring':
        this.handleStreamMonitoring();
        break;
      case 'smart':
      default:
        this.handleSmartDelay();
        break;
    }
  }

  private handleFixedDelay(): void {
    const fixedDelay = this.config.audioEndDelayMs || 1000; // Default 1 second
    console.log(`Using fixed delay strategy: ${fixedDelay}ms`);

    this.audioEndTimeout = setTimeout(() => {
      console.log('Fixed delay elapsed, stopping animation');
      this.callbacks.onBotSpeaking?.(false);
      this.audioEndTimeout = null;
    }, fixedDelay);
  }

  private handleStreamMonitoring(): void {
    console.log('Using stream monitoring strategy');
    if (this.remoteAudioStream) {
      this.checkAudioPlaybackState(0);
    } else {
      // Fallback to smart delay if no stream available
      this.handleSmartDelay();
    }
  }

  private handleSmartDelay(): void {
    // Calculate delay based on audio buffer and network latency
    const timeSinceLastChunk = Date.now() - this.lastAudioChunkTime;
    const bufferDelay = Math.max(
      0,
      this.estimatedAudioDuration - timeSinceLastChunk,
    );

    // Add extra buffer for WebRTC playback delay (typically 100-500ms)
    const webRtcDelay = 300; // ms
    const totalDelay = bufferDelay + webRtcDelay;

    console.log(
      `Using smart delay strategy: ${totalDelay}ms (buffer: ${bufferDelay}ms, WebRTC: ${webRtcDelay}ms)`,
    );

    this.audioEndTimeout = setTimeout(() => {
      console.log('Smart delay elapsed, stopping animation');
      this.callbacks.onBotSpeaking?.(false);
      this.audioEndTimeout = null;
    }, totalDelay);
  }

  private checkAudioPlaybackState(attempt: number): void {
    const maxAttempts = 50; // Maximum 5 seconds of checking

    if (attempt >= maxAttempts) {
      console.log('Max audio check attempts reached, forcing animation stop');
      this.callbacks.onBotSpeaking?.(false);
      return;
    }

    if (!this.remoteAudioStream) {
      // Stream no longer available, stop animation
      this.callbacks.onBotSpeaking?.(false);
      return;
    }

    const audioTracks = this.remoteAudioStream.getAudioTracks();
    if (audioTracks.length === 0 || audioTracks[0].readyState === 'ended') {
      console.log(
        `Audio track ended after ${attempt * 100}ms, stopping animation`,
      );
      this.callbacks.onBotSpeaking?.(false);
      return;
    }

    // Continue checking
    this.audioEndTimeout = setTimeout(() => {
      this.checkAudioPlaybackState(attempt + 1);
    }, 100);
  }

  async endCall(): Promise<void> {
    try {
      // Clear any pending timeouts
      if (this.audioEndTimeout) {
        clearTimeout(this.audioEndTimeout);
        this.audioEndTimeout = null;
      }

      if (this.audioPlaybackCheckInterval) {
        clearInterval(this.audioPlaybackCheckInterval);
        this.audioPlaybackCheckInterval = null;
      }

      // Reset audio monitoring state
      this.remoteAudioStream = null;
      this.isAudioActuallyPlaying = false;

      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = null;
      }

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      this.callbacks.onSessionEnd?.();
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }

  private async getEphemeralKey(): Promise<string> {
    try {
      const requestBody = {
        model: this.config.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
        voice: this.config.voice || 'alloy',
      };

      console.log(
        'Making request to:',
        'https://tidy-ray-obviously.ngrok-free.app/api/openai/ephemeral-key',
      );
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      console.log('Request headers:', {
        Authorization: 'Bearer oLpqgPOKSM46Q4oBMNoBCg5akasjd2jhv1',
        'Content-Type': 'application/json',
      });

      const response = await axios.post(
        'https://tidy-ray-obviously.ngrok-free.app/api/openai/ephemeral-key',
        requestBody,
        {
          headers: {
            Authorization: 'Bearer oLpqgPOKSM46Q4oBMNoBCg5akasjd2jhv1',
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));

      if (!response.data.data?.ephemeralKey) {
        throw new Error('No ephemeral key received from server');
      }

      return response.data.data.ephemeralKey;
    } catch (error) {
      console.error('Error in getEphemeralKey:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response status:', error.response?.status);
        console.error('Response data:', error.response?.data);
        console.error('Response headers:', error.response?.headers);
        throw new Error(
          `Failed to get ephemeral key: ${
            error.response?.status
          } ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  isCallActive(): boolean {
    return this.peerConnection?.connectionState === 'connected';
  }

  // Public method to send a trigger to start the bot talking
  triggerResponse(prompt?: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('Data channel not ready for sending trigger');
      return;
    }

    try {
      // Send a conversation.item.create event to add a user message
      const userMessage = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt || 'Hello! Please start our conversation.',
            },
          ],
        },
      };

      this.dataChannel.send(JSON.stringify(userMessage));
      console.log('Trigger message sent:', prompt);

      // Trigger response generation
      const responseEvent = {
        type: 'response.create',
      };

      this.dataChannel.send(JSON.stringify(responseEvent));
      console.log('Response generation triggered');
    } catch (error) {
      console.error('Error sending trigger:', error);
    }
  }
}
