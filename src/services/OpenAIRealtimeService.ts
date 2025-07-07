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
  private dataChannel: any = null; // Using any for data channel as it's not properly typed
  private localStream: MediaStream | null = null;
  private config: RealtimeConfig;
  private callbacks: RealtimeCallbacks;

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
        // The audio will be played automatically through the device's audio system
        if (event.streams && event.streams[0]) {
          // In React Native, audio playback is handled automatically
          // You can add custom audio processing here if needed
        }
      };

      // Get local audio (microphone input)
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      // Add local audio track for microphone input
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.peerConnection.addTrack(audioTracks[0], this.localStream);
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
            // Bot started speaking
            console.log('Bot started speaking');
            this.callbacks.onBotSpeaking?.(true);
          } else if (data.type === 'output_audio_buffer.stopped') {
            // Bot stopped speaking
            console.log('Bot stopped speaking');
            this.callbacks.onBotSpeaking?.(false);
          } else if (data.type === 'response.audio.delta') {
            // Handle audio data if needed
            this.callbacks.onAudioReceived?.(data.delta);
          } else if (data.type === 'response.audio.end') {
            // Bot stopped speaking (alternative event)
            this.callbacks.onBotSpeaking?.(false);
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

  async endCall(): Promise<void> {
    try {
      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      this.callbacks.onSessionEnd?.();
    } catch (error) {
      console.error('Error ending call:', error);
      this.callbacks.onError?.(`Error ending call: ${error}`);
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
    return (this.peerConnection as any)?.connectionState === 'connected';
  }
}
