import {
  Camera,
  CameraOff,
  Captions,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  SwitchCamera,
  Volume2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ROOSTERS_LOGO_SRC } from '../constants';
import { MissingApiKeyError, OutgoingMessage, streamChatCompletion } from '../utils/aiClient';
import { loadCustomApiKey } from '../utils/storage';
import { OwnerConfig, UserAppSettings, VoiceStudioSettings } from '../types';
import {
  cancelVoicePlayback,
  getClonedVoiceLiveTalkInstruction,
  getResolvedVoiceParameters,
  isSpeechSynthesisSupported,
  resolveBcp47ForVoice,
  speakWithVoiceProfile,
} from '../utils/voiceEngine';

interface LiveTalkModalProps {
  isOpen: boolean;
  selectedLanguage: string;
  userName: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  voiceSettings: VoiceStudioSettings;
  userSettings?: UserAppSettings;
  ownerConfig?: OwnerConfig;
  onOpenApiKeyModal?: () => void;
  onClose: (transcriptTurns?: Array<{ role: 'user' | 'assistant'; content: string }>) => void;
}

type LiveStatus = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'unsupported';
type LiveTransportMode = 'duplex' | 'fallback';

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' Code snippet provided. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function downsampleTo16kPcmBase64(input: Float32Array, inputSampleRate: number): string {
  const targetRate = 16000;
  let samples: Float32Array;

  if (inputSampleRate === targetRate) {
    samples = input;
  } else {
    const ratio = inputSampleRate / targetRate;
    const outputLength = Math.max(1, Math.floor(input.length / ratio));
    samples = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        sum += input[j];
        count++;
      }
      samples[i] = count > 0 ? sum / count : input[Math.min(start, input.length - 1)] || 0;
    }
  }

  const pcm16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunkSize = 0x4000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64Pcm24kToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.length / 2);
  const float32 = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}

export function LiveTalkModal({
  isOpen,
  selectedLanguage,
  userName,
  hasBackendApi,
  hasServerGeminiKey,
  voiceSettings,
  userSettings,
  ownerConfig,
  onClose,
}: LiveTalkModalProps) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [transportMode, setTransportMode] = useState<LiveTransportMode>('duplex');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasCameraTrack, setHasCameraTrack] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [userCaption, setUserCaption] = useState('');
  const [aiCaption, setAiCaption] = useState(
    `Connecting Roosters AI Live for ${userName}...`
  );
  const [orbIntensity, setOrbIntensity] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [micHint, setMicHint] = useState('');
  const [turns, setTurns] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // Refs to prevent stale closures inside Web Audio / WebSocket / setInterval callbacks
  const isMountedRef = useRef(false);
  const transportModeRef = useRef<LiveTransportMode>('duplex');
  const isMutedRef = useRef(false);
  const isCameraOnRef = useRef(true);
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const statusRef = useRef<LiveStatus>('connecting');
  const turnsRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // WebSocket & Gemini Live Refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef(false);
  const liveAudioCtxInRef = useRef<AudioContext | null>(null);
  const liveAudioCtxOutRef = useRef<AudioContext | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputFreqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isAiPlayingRef = useRef(false);
  const vadFramesRef = useRef(0);
  const micLevelRef = useRef(0);
  const aiLevelRef = useRef(0);

  // Transcript accumulators for Duplex mode
  const currentUserTurnRef = useRef('');
  const currentAiTurnRef = useRef('');

  // Streams & Camera Refs
  const audioStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const visualRafRef = useRef<number | null>(null);

  // Fallback Recognition + SSE Refs
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeUtterancesRef = useRef(0);
  const streamFinishedRef = useRef(true);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    transportModeRef.current = transportMode;
  }, [transportMode]);

  const activeClonedProfile =
    voiceSettings.activeVoiceId === 'cloned' ? voiceSettings.clonedProfile : null;
  const effectiveLiveLanguage =
    activeClonedProfile?.language && selectedLanguage === 'Auto-Detect'
      ? activeClonedProfile.language
      : selectedLanguage;
  const effectiveTtsLanguage = activeClonedProfile?.language || effectiveLiveLanguage;

  // Bind active camera stream to preview <video>
  useEffect(() => {
    const videoEl = cameraVideoRef.current;
    if (!videoEl) return;
    if (isCameraOn && cameraStreamRef.current) {
      videoEl.srcObject = cameraStreamRef.current;
      void videoEl.play().catch(() => {});
    } else {
      videoEl.srcObject = null;
    }
  }, [isCameraOn, hasCameraTrack, facingMode]);

  const captureCurrentVideoFrame = useCallback(
    (maxW = 640, quality = 0.68): { base64: string; mimeType: string } | null => {
      if (!isCameraOnRef.current) return null;
      const videoEl = cameraVideoRef.current;
      if (!videoEl || !cameraStreamRef.current) return null;
      const vw = videoEl.videoWidth || 640;
      const vh = videoEl.videoHeight || 480;
      if (vw < 16 || vh < 16) return null;

      const scale = Math.min(1, maxW / vw);
      const width = Math.max(1, Math.round(vw * scale));
      const height = Math.max(1, Math.round(vh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoEl, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl).trim();
      if (!base64) return null;

      return { base64, mimeType: 'image/jpeg' };
    },
    []
  );

  // Clear scheduled 24kHz PCM playback queue immediately (for Barge-In / interruption)
  const clearDuplexAudioQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already-stopped AudioBufferSourceNode
      }
    }
    activeSourcesRef.current.clear();
    isAiPlayingRef.current = false;
    aiLevelRef.current = 0;
    if (liveAudioCtxOutRef.current) {
      nextStartTimeRef.current = liveAudioCtxOutRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const scheduleDuplexAudioChunk = useCallback((base64Pcm: string) => {
    const ctx = liveAudioCtxOutRef.current;
    const analyser = outputAnalyserRef.current;
    if (!ctx || !isMountedRef.current) return;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    try {
      const floatSamples = base64Pcm24kToFloat32(base64Pcm);
      if (floatSamples.length === 0) return;

      const audioBuffer = ctx.createBuffer(1, floatSamples.length, 24000);
      audioBuffer.copyToChannel(floatSamples, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      if (analyser) {
        source.connect(analyser);
      } else {
        source.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.018, nextStartTimeRef.current);
      nextStartTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      isAiPlayingRef.current = true;
      setStatus('speaking');

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0 && isMountedRef.current) {
          isAiPlayingRef.current = false;
          aiLevelRef.current = 0;
          if (statusRef.current === 'speaking') {
            setStatus(isMutedRef.current ? 'muted' : 'listening');
          }
        }
      };

      source.start(startAt);
    } catch {
      // Ignore malformed chunk cleanly
    }
  }, []);

  // --- Turn-by-Turn Fallback Recognition & SSE Speech (for static deploys without WS backend) ---
  const stopFallbackRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      recognitionRef.current = null;
    }
  }, []);

  const stopAllFallbackSpeech = useCallback(() => {
    activeUtterancesRef.current = 0;
    streamFinishedRef.current = true;
    cancelVoicePlayback();
  }, []);

  const startFallbackRecognitionLoop = useCallback(() => {
    if (!isMountedRef.current || isMutedRef.current || transportModeRef.current !== 'fallback') return;
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setStatus('unsupported');
      return;
    }

    stopFallbackRecognition();

    const recognition = new RecognitionCtor();
    recognition.lang = resolveBcp47ForVoice(
      effectiveLiveLanguage,
      activeClonedProfile?.accentTone
    );
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let latestTranscript = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          finalTranscript += `${chunk} `;
        } else {
          interim += chunk;
        }
      }
      const preview = (finalTranscript + interim).trim();
      if (preview) {
        latestTranscript = preview;
        setUserCaption(preview);
      }
    };

    recognition.onerror = (ev) => {
      if (!isMountedRef.current || isMutedRef.current || transportModeRef.current !== 'fallback') return;
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setMicHint('Microphone permission blocked. Allow mic access or type below.');
        setStatus('unsupported');
        return;
      }
      if (statusRef.current === 'listening') {
        window.setTimeout(() => {
          if (
            isMountedRef.current &&
            !isMutedRef.current &&
            statusRef.current === 'listening' &&
            transportModeRef.current === 'fallback'
          ) {
            startFallbackRecognitionLoop();
          }
        }, 180);
      }
    };

    recognition.onend = () => {
      if (!isMountedRef.current || isMutedRef.current || transportModeRef.current !== 'fallback') return;
      const cleaned = (finalTranscript || latestTranscript).trim();
      if (cleaned) {
        void handleFallbackUserQuery(cleaned);
      } else if (statusRef.current === 'listening') {
        window.setTimeout(() => {
          if (
            isMountedRef.current &&
            !isMutedRef.current &&
            statusRef.current === 'listening' &&
            transportModeRef.current === 'fallback'
          ) {
            startFallbackRecognitionLoop();
          }
        }, 120);
      }
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    try {
      recognition.start();
    } catch {
      // Ignore already-started error
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClonedProfile?.accentTone, effectiveLiveLanguage, stopFallbackRecognition]);

  const enqueueFallbackSentenceSpeech = useCallback(
    (sentence: string) => {
      if (!isMountedRef.current) return;
      const spoken = cleanTextForSpeech(sentence);
      if (!spoken || !isSpeechSynthesisSupported()) return;

      setStatus('speaking');
      activeUtterancesRef.current += 1;

      const onDone = () => {
        if (!isMountedRef.current) return;
        activeUtterancesRef.current = Math.max(0, activeUtterancesRef.current - 1);
        if (activeUtterancesRef.current === 0 && streamFinishedRef.current) {
          if (isMutedRef.current) {
            setStatus('muted');
          } else {
            startFallbackRecognitionLoop();
          }
        }
      };

      speakWithVoiceProfile({
        text: spoken,
        language: effectiveTtsLanguage,
        voiceSettings,
        voiceGender: userSettings?.voiceGender,
        speedMultiplier: userSettings?.speechSpeed ?? 1.0,
        cancelPrevious: false,
        onEnd: onDone,
        onError: onDone,
      });
    },
    [
      effectiveTtsLanguage,
      startFallbackRecognitionLoop,
      userSettings?.speechSpeed,
      userSettings?.voiceGender,
      voiceSettings,
    ]
  );

  const handleFallbackUserQuery = useCallback(
    async (queryText: string) => {
      if (!queryText.trim() || !isMountedRef.current) return;
      stopFallbackRecognition();
      stopAllFallbackSpeech();
      streamAbortRef.current?.abort();

      setStatus('thinking');
      setUserCaption(queryText);
      setAiCaption('');
      streamFinishedRef.current = false;

      const capturedFrame = captureCurrentVideoFrame(768, 0.8);
      const updatedTurns = [...turnsRef.current, { role: 'user' as const, content: queryText }];
      setTurns(updatedTurns);

      const outgoingHistory: OutgoingMessage[] = updatedTurns.map((turn, idx) => {
        if (idx === updatedTurns.length - 1 && capturedFrame) {
          return {
            role: 'user',
            content: queryText,
            attachment: {
              kind: 'image',
              name: 'live-camera-frame.jpg',
              base64: capturedFrame.base64,
              mimeType: capturedFrame.mimeType,
            },
          };
        }
        return turn;
      });

      const controller = new AbortController();
      streamAbortRef.current = controller;

      let sentenceBuffer = '';
      let fullReply = '';

      try {
        const personaNote = activeClonedProfile
          ? getClonedVoiceLiveTalkInstruction(activeClonedProfile)
          : '';
        const combinedLiveInstructions = [userSettings?.customInstructions, personaNote]
          .filter(Boolean)
          .join('\n');

        await streamChatCompletion({
          messages: outgoingHistory,
          language: effectiveLiveLanguage,
          userName,
          isLiveVoice: true,
          responseStyle: userSettings?.responseStyle,
          customInstructions: combinedLiveInstructions || undefined,
          globalSystemPrompt: ownerConfig?.globalSystemPrompt,
          chatModel: ownerConfig?.chatModel,
          hasBackendApi,
          hasServerGeminiKey,
          signal: controller.signal,
          onChunk: (chunkText) => {
            if (!isMountedRef.current) return;
            fullReply += chunkText;
            sentenceBuffer += chunkText;
            setAiCaption(fullReply);

            let boundaryMatch: RegExpExecArray | null;
            while ((boundaryMatch = /^([\s\S]*?[.!?۔؟\n]+)(\s+|$)/.exec(sentenceBuffer)) !== null) {
              const sentence = boundaryMatch[1].trim();
              sentenceBuffer = sentenceBuffer.slice(boundaryMatch[0].length);
              if (sentence) {
                enqueueFallbackSentenceSpeech(sentence);
              }
            }
          },
        });

        if (!isMountedRef.current) return;
        streamFinishedRef.current = true;
        const remaining = sentenceBuffer.trim();
        if (remaining) enqueueFallbackSentenceSpeech(remaining);

        const finalReply = fullReply.trim();
        if (!finalReply) {
          throw new Error('AI returned an empty live voice response.');
        }
        setAiCaption(finalReply);
        setTurns([...updatedTurns, { role: 'assistant', content: finalReply }]);

        if (activeUtterancesRef.current === 0) {
          setStatus(isMutedRef.current ? 'muted' : 'listening');
          if (!isMutedRef.current) startFallbackRecognitionLoop();
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError' || !isMountedRef.current) return;
        streamFinishedRef.current = true;
        const fallbackMsg =
          err instanceof MissingApiKeyError
            ? 'Voice service is momentarily unavailable.'
            : err instanceof Error
              ? err.message
              : 'Brief connection hiccup. Please ask again.';
        setAiCaption(fallbackMsg);
        enqueueFallbackSentenceSpeech(fallbackMsg);
      }
    },
    [
      activeClonedProfile,
      captureCurrentVideoFrame,
      effectiveLiveLanguage,
      enqueueFallbackSentenceSpeech,
      hasBackendApi,
      hasServerGeminiKey,
      ownerConfig?.chatModel,
      ownerConfig?.globalSystemPrompt,
      startFallbackRecognitionLoop,
      stopAllFallbackSpeech,
      stopFallbackRecognition,
      userName,
      userSettings?.customInstructions,
      userSettings?.responseStyle,
    ]
  );

  const activateFallbackMode = useCallback(
    (reason?: string) => {
      if (!isMountedRef.current || transportModeRef.current === 'fallback') return;
      wsReadyRef.current = false;
      clearDuplexAudioQueue();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore close
        }
        wsRef.current = null;
      }
      transportModeRef.current = 'fallback';
      setTransportMode('fallback');
      if (reason) {
        setMicHint(`${reason} Switched to Smart Voice Mode cleanly.`);
      }
      setAiCaption(`Hi ${userName}! I'm listening cleanly — ask me anything!`);
      startFallbackRecognitionLoop();
    },
    [clearDuplexAudioQueue, startFallbackRecognitionLoop, userName]
  );

  // Camera helper (starts or flips Front/Back camera cleanly without restarting mic or Live WS)
  const startOrFlipCameraStream = useCallback(async (targetFacing: 'user' | 'environment') => {
    cameraStreamRef.current?.getTracks().forEach((t) => {
      t.enabled = false;
      t.stop();
    });
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported in this browser.');
      setIsCameraOn(false);
      isCameraOnRef.current = false;
      setHasCameraTrack(false);
      return;
    }

    try {
      setCameraError('');
      let vidStream: MediaStream;
      try {
        vidStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetFacing, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch {
        vidStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!isMountedRef.current) {
        vidStream.getTracks().forEach((t) => t.stop());
        return;
      }

      cameraStreamRef.current = vidStream;
      setFacingMode(targetFacing);
      facingModeRef.current = targetFacing;
      setIsCameraOn(true);
      isCameraOnRef.current = true;
      setHasCameraTrack(true);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = vidStream;
        void cameraVideoRef.current.play().catch(() => {});
      }
    } catch {
      setIsCameraOn(false);
      isCameraOnRef.current = false;
      setHasCameraTrack(false);
      setCameraError('Camera unavailable — running in Voice-only mode.');
    }
  }, []);

  // Main session lifecycle: Mic PCM AudioContext + Output 24kHz AudioContext + WebSocket Gemini Live + 1 FPS Camera
  useEffect(() => {
    if (!isOpen) return;

    isMountedRef.current = true;
    transportModeRef.current = 'duplex';
    setTransportMode('duplex');
    setStatus('connecting');
    statusRef.current = 'connecting';
    setIsMuted(false);
    isMutedRef.current = false;
    setIsCameraOn(true);
    isCameraOnRef.current = true;
    setFacingMode('user');
    facingModeRef.current = 'user';
    setHasCameraTrack(false);
    setCameraError('');
    setUserCaption('');
    setMicHint('');
    setTurns([]);
    turnsRef.current = [];
    currentUserTurnRef.current = '';
    currentAiTurnRef.current = '';
    vadFramesRef.current = 0;
    micLevelRef.current = 0;
    aiLevelRef.current = 0;
    setAiCaption(`Connecting Roosters AI Live for ${userName}...`);

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (AudioCtx) {
      try {
        const outCtx = new AudioCtx({ sampleRate: 24000 });
        liveAudioCtxOutRef.current = outCtx;
        const analyser = outCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.connect(outCtx.destination);
        outputAnalyserRef.current = analyser;
        outputFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        nextStartTimeRef.current = outCtx.currentTime;
      } catch {
        // Ignore if AudioContext cannot open pre-gesture
      }
    }

    // Visual orb animation loop reacting dynamically to User voice + AI voice
    const renderOrbTick = () => {
      if (!isMountedRef.current) return;
      let aiLevel = 0;
      if (isAiPlayingRef.current && outputAnalyserRef.current && outputFreqDataRef.current) {
        outputAnalyserRef.current.getByteFrequencyData(outputFreqDataRef.current);
        let sum = 0;
        const arr = outputFreqDataRef.current;
        for (let i = 0; i < arr.length; i++) sum += arr[i];
        aiLevel = Math.min(1, (sum / arr.length / 255) * 2.1);
      } else if (statusRef.current === 'speaking') {
        aiLevel = 0.45 + Math.sin(Date.now() * 0.012) * 0.18;
      }
      aiLevelRef.current = aiLevel;
      const combined = Math.max(micLevelRef.current, aiLevel);
      setOrbIntensity((prev) => prev * 0.55 + combined * 0.45);
      visualRafRef.current = requestAnimationFrame(renderOrbTick);
    };
    visualRafRef.current = requestAnimationFrame(renderOrbTick);

    // 1. Start Microphone Stream (16kHz PCM + Real-Time VAD Barge-In)
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        })
        .then((audioStream) => {
          if (!isMountedRef.current) {
            audioStream.getTracks().forEach((t) => t.stop());
            return;
          }
          audioStreamRef.current = audioStream;

          if (AudioCtx) {
            const inCtx = new AudioCtx({ sampleRate: 16000 });
            liveAudioCtxInRef.current = inCtx;
            if (inCtx.state === 'suspended') {
              void inCtx.resume().catch(() => {});
            }

            const source = inCtx.createMediaStreamSource(audioStream);
            micSourceNodeRef.current = source;
            const processor = inCtx.createScriptProcessor(2048, 1, 1);
            micProcessorRef.current = processor;

            processor.onaudioprocess = (ev) => {
              if (!isMountedRef.current) return;
              const channelData = ev.inputBuffer.getChannelData(0);

              if (isMutedRef.current) {
                micLevelRef.current = 0;
                vadFramesRef.current = 0;
                return;
              }

              // Compute RMS voice energy for visualizer + Real-Time VAD Barge-In
              let sumSq = 0;
              for (let i = 0; i < channelData.length; i++) {
                const s = channelData[i];
                sumSq += s * s;
              }
              const rms = Math.sqrt(sumSq / channelData.length);
              micLevelRef.current = Math.min(1, rms * 6.5);

              // Instant Barge-In: interrupt AI speech immediately when user speaks (~3 frames / ~120ms)
              if (rms > 0.036) {
                vadFramesRef.current += 1;
                if (
                  vadFramesRef.current >= 3 &&
                  (isAiPlayingRef.current || statusRef.current === 'speaking')
                ) {
                  clearDuplexAudioQueue();
                  stopAllFallbackSpeech();
                  if (statusRef.current === 'speaking') {
                    setStatus('listening');
                  }
                }
              } else {
                vadFramesRef.current = Math.max(0, vadFramesRef.current - 1);
              }

              // Stream 16kHz PCM audio to Gemini Live WebSocket
              if (
                transportModeRef.current === 'duplex' &&
                wsReadyRef.current &&
                wsRef.current?.readyState === WebSocket.OPEN
              ) {
                const base64Pcm = downsampleTo16kPcmBase64(channelData, inCtx.sampleRate);
                wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
              }
            };

            source.connect(processor);
            // Connect through zero-gain sink so ScriptProcessor fires without mic self-echo
            const muteGain = inCtx.createGain();
            muteGain.gain.value = 0;
            processor.connect(muteGain);
            muteGain.connect(inCtx.destination);
          }
        })
        .catch(() => {
          setMicHint('Allow microphone access for hands-free voice, or use the text box below.');
        });
    }

    // 2. Start Camera Preview & 1 FPS Live Vision Frame Stream
    void startOrFlipCameraStream('user');

    videoIntervalRef.current = window.setInterval(() => {
      if (
        !isMountedRef.current ||
        !isCameraOnRef.current ||
        transportModeRef.current !== 'duplex' ||
        !wsReadyRef.current ||
        wsRef.current?.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const frame = captureCurrentVideoFrame(640, 0.65);
      if (frame) {
        wsRef.current.send(
          JSON.stringify({
            type: 'video',
            data: frame.base64,
            mimeType: frame.mimeType,
          })
        );
      }
    }, 950);

    // 3. Connect Gemini Multimodal Live WebSocket Bridge
    if (!hasBackendApi && !hasServerGeminiKey) {
      activateFallbackMode();
    } else {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-ws`);
        wsRef.current = ws;

        const connectTimeoutId = window.setTimeout(() => {
          if (isMountedRef.current && !wsReadyRef.current && transportModeRef.current === 'duplex') {
            activateFallbackMode('Live WebSocket handshake timed out.');
          }
        }, 7000);

        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }
          const customKey = loadCustomApiKey().trim();
          const clientGeminiKey = customKey.startsWith('AIza') ? customKey : '';
          const personaNote = activeClonedProfile
            ? getClonedVoiceLiveTalkInstruction(activeClonedProfile)
            : '';
          const combinedLiveInstructions = [userSettings?.customInstructions, personaNote]
            .filter(Boolean)
            .join('\n');

          ws.send(
            JSON.stringify({
              type: 'start',
              language: effectiveLiveLanguage,
              userName,
              voiceGender: userSettings?.voiceGender || 'default',
              responseStyle: userSettings?.responseStyle || 'simple',
              customInstructions: combinedLiveInstructions || undefined,
              globalSystemPrompt: ownerConfig?.globalSystemPrompt,
              apiKey: clientGeminiKey || undefined,
            })
          );
        };

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return;
          let msg: {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
            model?: string;
          };
          try {
            msg = JSON.parse(String(event.data)) as typeof msg;
          } catch {
            return;
          }

          if (msg.type === 'ready') {
            window.clearTimeout(connectTimeoutId);
            wsReadyRef.current = true;
            setStatus(isMutedRef.current ? 'muted' : 'listening');
            setAiCaption(
              `Hello ${userName}! I'm Roosters AI Live. Speak freely in Urdu, Roman Urdu, or English — or show me anything on camera!`
            );
          } else if (msg.type === 'audio' && msg.data) {
            scheduleDuplexAudioChunk(msg.data);
          } else if (msg.type === 'input_transcript' && msg.text) {
            currentUserTurnRef.current += msg.text;
            setUserCaption(currentUserTurnRef.current.trim());
          } else if (msg.type === 'output_transcript' && msg.text) {
            currentAiTurnRef.current += msg.text;
            setAiCaption(currentAiTurnRef.current.trim());
          } else if (msg.type === 'interrupted') {
            clearDuplexAudioQueue();
            currentAiTurnRef.current = '';
            setStatus(isMutedRef.current ? 'muted' : 'listening');
          } else if (msg.type === 'turn_complete') {
            const finishedUser = currentUserTurnRef.current.trim();
            const finishedAi = currentAiTurnRef.current.trim();
            if (finishedUser || finishedAi) {
              const nextTurns = [...turnsRef.current];
              if (finishedUser) nextTurns.push({ role: 'user', content: finishedUser });
              if (finishedAi) nextTurns.push({ role: 'assistant', content: finishedAi });
              turnsRef.current = nextTurns;
              setTurns(nextTurns);
            }
            currentUserTurnRef.current = '';
            currentAiTurnRef.current = '';
            if (activeSourcesRef.current.size === 0) {
              setStatus(isMutedRef.current ? 'muted' : 'listening');
            }
          } else if (msg.type === 'error') {
            window.clearTimeout(connectTimeoutId);
            if (!wsReadyRef.current) {
              activateFallbackMode(msg.message);
            } else if (msg.message) {
              setMicHint(msg.message);
            }
          } else if (msg.type === 'session_closed') {
            window.clearTimeout(connectTimeoutId);
            if (wsReadyRef.current && isMountedRef.current) {
              setMicHint('Live audio stream reconnecting or finished.');
            }
          }
        };

        ws.onerror = () => {
          window.clearTimeout(connectTimeoutId);
          if (isMountedRef.current && !wsReadyRef.current) {
            activateFallbackMode('Live WebSocket unavailable.');
          }
        };

        ws.onclose = () => {
          window.clearTimeout(connectTimeoutId);
          if (isMountedRef.current && !wsReadyRef.current && transportModeRef.current === 'duplex') {
            activateFallbackMode();
          }
        };
      } catch {
        activateFallbackMode();
      }
    }

    return () => {
      isMountedRef.current = false;
      wsReadyRef.current = false;
      if (videoIntervalRef.current) {
        window.clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
      }
      if (visualRafRef.current) {
        cancelAnimationFrame(visualRafRef.current);
        visualRafRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore close
        }
        wsRef.current = null;
      }
      streamAbortRef.current?.abort();
      stopFallbackRecognition();
      stopAllFallbackSpeech();
      clearDuplexAudioQueue();
      try {
        micProcessorRef.current?.disconnect();
        micSourceNodeRef.current?.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      micProcessorRef.current = null;
      micSourceNodeRef.current = null;
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      liveAudioCtxInRef.current?.close().catch(() => {});
      liveAudioCtxInRef.current = null;
      liveAudioCtxOutRef.current?.close().catch(() => {});
      liveAudioCtxOutRef.current = null;
    };
  }, [
    activeClonedProfile,
    activateFallbackMode,
    captureCurrentVideoFrame,
    clearDuplexAudioQueue,
    effectiveLiveLanguage,
    hasBackendApi,
    hasServerGeminiKey,
    isOpen,
    ownerConfig?.globalSystemPrompt,
    scheduleDuplexAudioChunk,
    startOrFlipCameraStream,
    stopAllFallbackSpeech,
    stopFallbackRecognition,
    userName,
    userSettings?.customInstructions,
    userSettings?.responseStyle,
    userSettings?.voiceGender,
  ]);

  if (!isOpen) return null;

  const unlockAudioContexts = () => {
    if (liveAudioCtxInRef.current?.state === 'suspended') {
      void liveAudioCtxInRef.current.resume().catch(() => {});
    }
    if (liveAudioCtxOutRef.current?.state === 'suspended') {
      void liveAudioCtxOutRef.current.resume().catch(() => {});
    }
  };

  const handleToggleCamera = async () => {
    unlockAudioContexts();
    if (isCameraOn) {
      cameraStreamRef.current?.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      cameraStreamRef.current = null;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }
      setIsCameraOn(false);
      isCameraOnRef.current = false;
      setHasCameraTrack(false);
      return;
    }
    await startOrFlipCameraStream(facingModeRef.current);
  };

  const handleFlipCamera = async () => {
    unlockAudioContexts();
    const nextFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
    await startOrFlipCameraStream(nextFacing);
  };

  const handleToggleMute = () => {
    unlockAudioContexts();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    audioStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    if (nextMuted) {
      if (transportModeRef.current === 'fallback') {
        stopFallbackRecognition();
      }
      if (status === 'listening' || status === 'connecting') {
        setStatus('muted');
      }
    } else {
      if (transportModeRef.current === 'fallback') {
        if (status !== 'speaking' && status !== 'thinking') {
          startFallbackRecognitionLoop();
        }
      } else if (status === 'muted') {
        setStatus('listening');
      }
    }
  };

  const handleInterruptAndListen = () => {
    unlockAudioContexts();
    clearDuplexAudioQueue();
    streamAbortRef.current?.abort();
    stopAllFallbackSpeech();
    setIsMuted(false);
    isMutedRef.current = false;
    audioStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });
    if (transportModeRef.current === 'fallback') {
      startFallbackRecognitionLoop();
    } else {
      setStatus('listening');
    }
  };

  const handleEndCall = () => {
    isMountedRef.current = false;
    wsReadyRef.current = false;
    try {
      wsRef.current?.close();
    } catch {
      // Ignore close
    }
    wsRef.current = null;
    streamAbortRef.current?.abort();
    stopFallbackRecognition();
    stopAllFallbackSpeech();
    clearDuplexAudioQueue();
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    onClose(turnsRef.current);
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    unlockAudioContexts();
    const text = manualInput.trim();
    if (!text) return;
    setManualInput('');

    if (
      transportModeRef.current === 'duplex' &&
      wsReadyRef.current &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      clearDuplexAudioQueue();
      setUserCaption(text);
      currentUserTurnRef.current = text;
      setStatus('thinking');
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
    } else {
      void handleFallbackUserQuery(text);
    }
  };

  const statusLabel =
    status === 'connecting'
      ? 'Connecting Live...'
      : status === 'listening'
        ? 'Listening...'
        : status === 'thinking'
          ? 'Thinking...'
          : status === 'speaking'
            ? 'Speaking...'
            : status === 'muted'
              ? 'Mic Muted'
              : 'Voice Mode';

  const dynamicScale =
    status === 'speaking'
      ? 1.06 + orbIntensity * 0.34
      : status === 'listening'
        ? 1.0 + orbIntensity * 0.32
        : status === 'connecting' || status === 'thinking'
          ? 0.98
          : 0.9;

  const orbGradient =
    status === 'speaking'
      ? 'radial-gradient(circle at 32% 30%, #fffbeb 0%, #ffd700 32%, #00d4ff 76%, #061224 100%)'
      : status === 'connecting' || status === 'thinking'
        ? 'radial-gradient(circle at 32% 30%, #e9d5ff 0%, #a855f7 45%, #00d4ff 82%, #07090e 100%)'
        : status === 'muted'
          ? 'radial-gradient(circle at 35% 35%, #64748b 0%, #334155 55%, #0f172a 100%)'
          : 'radial-gradient(circle at 32% 30%, #e0f7ff 0%, #00d4ff 42%, #2563eb 78%, #07090e 100%)';

  return (
    <div
      className="fixed inset-0 min-h-[100dvh] z-50 flex flex-col items-center justify-between bg-[#05070c] text-white overflow-y-auto overflow-x-hidden px-3 sm:px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="Roosters AI Live"
    >
      {/* Ambient Gemini-Live Backdrop Aura */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-40 transition-all duration-300"
        style={{
          background:
            status === 'speaking'
              ? 'radial-gradient(circle at 50% 42%, rgba(255, 215, 0, 0.22), rgba(0, 212, 255, 0.12) 45%, transparent 72%)'
              : status === 'listening'
                ? 'radial-gradient(circle at 50% 42%, rgba(0, 212, 255, 0.22), rgba(37, 99, 235, 0.12) 45%, transparent 72%)'
                : 'radial-gradient(circle at 50% 42%, rgba(100, 116, 139, 0.14), transparent 65%)',
        }}
      />

      {/* Top Header */}
      <div className="relative z-10 w-full max-w-4xl flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={ROOSTERS_LOGO_SRC}
            alt="Roosters AI"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-xl object-cover border border-[#1f293d] shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-[15px] sm:text-[17px] bg-gradient-to-r from-[#ffd700] to-[#00d4ff] bg-clip-text text-transparent truncate">
                Roosters AI Live
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#00d4ff]/15 border border-[#00d4ff]/40 text-[#00d4ff]">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span>{transportMode === 'duplex' ? 'Duplex Live' : 'Voice Stream'}</span>
              </span>
            </div>
            <div className="text-[11px] sm:text-[12px] text-[#94a3b8] truncate">
              {selectedLanguage} · {getResolvedVoiceParameters(voiceSettings, userSettings?.voiceGender).label} · Instant Barge-In Active
            </div>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-[11.5px] sm:text-[12.5px] font-semibold border whitespace-nowrap ${
            status === 'speaking'
              ? 'bg-[#ffd700]/15 border-[#ffd700]/50 text-[#ffd700]'
              : status === 'connecting' || status === 'thinking'
                ? 'bg-[#a855f7]/15 border-[#a855f7]/50 text-[#c084fc]'
                : status === 'muted'
                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-[#00d4ff]/15 border-[#00d4ff]/50 text-[#00d4ff]'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Center Stage: Live Camera Vision Feed + Reactive Gemini-Style Orb */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto w-full max-w-4xl py-3">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 w-full">
          {isCameraOn && hasCameraTrack && (
            <div className="relative w-64 sm:w-80 aspect-[4/3] rounded-3xl overflow-hidden border-2 border-[#00d4ff]/50 bg-[#0d121d] shadow-[0_0_40px_rgba(0,212,255,0.2)] shrink-0">
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-[#00d4ff]/40 text-[10.5px] font-semibold text-[#00d4ff] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {facingMode === 'user' ? 'FRONT CAM' : 'BACK CAM'} · LIVE VISION
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleFlipCamera()}
                title="Flip Front/Back Camera"
                aria-label="Flip Camera"
                className="absolute bottom-2.5 right-2.5 p-2 rounded-full bg-black/70 backdrop-blur-md border border-white/25 text-white hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors cursor-pointer"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Reactive Glowing Audio Visualizer Orb */}
          <div className="relative flex items-center justify-center w-52 h-52 sm:w-60 sm:h-60 shrink-0">
            {/* Outer sound-reactive ripple ring */}
            <div
              aria-hidden="true"
              className="absolute inset-2 rounded-full border transition-transform duration-75"
              style={{
                borderColor:
                  status === 'speaking' ? 'rgba(255, 215, 0, 0.35)' : 'rgba(0, 212, 255, 0.3)',
                transform: `scale(${1 + orbIntensity * 0.45})`,
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-6 rounded-full border transition-transform duration-100"
              style={{
                borderColor:
                  status === 'speaking' ? 'rgba(0, 212, 255, 0.4)' : 'rgba(59, 130, 246, 0.35)',
                transform: `scale(${1 + orbIntensity * 0.25})`,
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-8 rounded-full blur-2xl opacity-65 transition-transform duration-75"
              style={{
                background:
                  status === 'speaking'
                    ? 'linear-gradient(135deg, #ffd700, #00d4ff)'
                    : status === 'muted'
                      ? 'linear-gradient(135deg, #475569, #1e293b)'
                      : 'linear-gradient(135deg, #00d4ff, #3b82f6)',
                transform: `scale(${dynamicScale})`,
              }}
            />

            <button
              type="button"
              onClick={handleInterruptAndListen}
              title={
                status === 'speaking'
                  ? 'Speak anytime or tap orb to interrupt immediately'
                  : 'Tap orb to activate & unlock audio'
              }
              className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full border border-white/25 shadow-2xl transition-transform duration-75 flex items-center justify-center cursor-pointer"
              style={{
                background: orbGradient,
                transform: `scale(${dynamicScale})`,
                boxShadow:
                  status === 'speaking'
                    ? '0 0 65px rgba(255, 215, 0, 0.5)'
                    : status === 'muted'
                      ? '0 0 25px rgba(100, 116, 139, 0.25)'
                      : '0 0 65px rgba(0, 212, 255, 0.48)',
              }}
            >
              {status === 'speaking' ? (
                <Volume2 className="w-10 h-10 text-white drop-shadow-md" />
              ) : isMuted ? (
                <MicOff className="w-10 h-10 text-slate-300" />
              ) : (
                <Mic className="w-10 h-10 text-white drop-shadow-md" />
              )}
            </button>
          </div>
        </div>

        {/* Toggleable Live Subtitles */}
        {showSubtitles && (
          <div className="mt-5 space-y-2.5 w-full max-w-xl text-center">
            {userCaption && (
              <p dir="auto" className="text-[13.5px] sm:text-[14px] text-[#94a3b8]">
                <span className="text-[#00d4ff] font-semibold">You:</span> {userCaption}
              </p>
            )}
            <div className="rounded-2xl bg-[#0e1320]/85 backdrop-blur-md border border-[#1f293d] px-5 py-3.5 min-h-[58px]">
              <p dir="auto" className="text-[14.5px] sm:text-[15.5px] leading-relaxed text-slate-100">
                {aiCaption || 'Listening...'}
              </p>
            </div>
          </div>
        )}

        {(micHint || cameraError) && (
          <p className="mt-2.5 text-[12px] text-[#ffd700]/90 max-w-md text-center">
            {micHint || cameraError}
          </p>
        )}

        {/* Quick Text Box (also streams directly into active Live session) */}
        <form onSubmit={handleManualSubmit} className="mt-3.5 w-full max-w-md flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder={
              isCameraOn && hasCameraTrack
                ? 'Or type about what the camera sees...'
                : 'Speak hands-free or send a quick text...'
            }
            className="flex-1 rounded-full bg-[#101624]/90 border border-[#263147] px-4 py-2 text-[13px] text-white focus:outline-none focus:border-[#00d4ff]"
          />
          <button
            type="submit"
            disabled={!manualInput.trim()}
            aria-label="Send message to Live session"
            className="px-4 py-2 rounded-full bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-[#050608] font-bold text-[13px] flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Gemini-Style Bottom Call Control Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2">
        {/* 1. Mic Mute / Unmute */}
        <button
          type="button"
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full border transition-all cursor-pointer ${
            isMuted
              ? 'bg-[#ffd700]/15 border-[#ffd700] text-[#ffd700]'
              : 'bg-[#121826] border-[#293548] text-white hover:border-[#00d4ff]'
          }`}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-[#00d4ff]" />}
          <span className="text-[9.5px] font-semibold mt-1">{isMuted ? 'Muted' : 'Mic'}</span>
        </button>

        {/* 2. Camera On / Off */}
        <button
          type="button"
          onClick={() => void handleToggleCamera()}
          title={isCameraOn && hasCameraTrack ? 'Turn Camera Off' : 'Turn Camera On'}
          aria-label={isCameraOn && hasCameraTrack ? 'Turn Camera Off' : 'Turn Camera On'}
          className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full border transition-all cursor-pointer ${
            isCameraOn && hasCameraTrack
              ? 'bg-[#00d4ff]/15 border-[#00d4ff] text-[#00d4ff]'
              : 'bg-[#121826] border-[#293548] text-slate-300 hover:border-[#00d4ff]'
          }`}
        >
          {isCameraOn && hasCameraTrack ? (
            <Camera className="w-5 h-5" />
          ) : (
            <CameraOff className="w-5 h-5" />
          )}
          <span className="text-[9.5px] font-semibold mt-1">
            {isCameraOn && hasCameraTrack ? 'Cam On' : 'Cam Off'}
          </span>
        </button>

        {/* 3. Camera Front / Back Flip */}
        <button
          type="button"
          onClick={() => void handleFlipCamera()}
          title="Flip Front / Back Camera"
          aria-label="Flip Front / Back Camera"
          className="flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full border bg-[#121826] border-[#293548] text-slate-200 hover:border-[#00d4ff] hover:text-[#00d4ff] transition-all cursor-pointer"
        >
          <SwitchCamera className="w-5 h-5" />
          <span className="text-[9.5px] font-semibold mt-1">Flip</span>
        </button>

        {/* 4. Live Subtitles Toggle */}
        <button
          type="button"
          onClick={() => setShowSubtitles((prev) => !prev)}
          title={showSubtitles ? 'Hide Live Subtitles' : 'Show Live Subtitles'}
          aria-label={showSubtitles ? 'Hide Live Subtitles' : 'Show Live Subtitles'}
          aria-pressed={showSubtitles}
          className={`flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full border transition-all cursor-pointer ${
            showSubtitles
              ? 'bg-[#ffd700]/15 border-[#ffd700]/60 text-[#ffd700]'
              : 'bg-[#121826] border-[#293548] text-slate-400 hover:border-[#ffd700]'
          }`}
        >
          <Captions className="w-5 h-5" />
          <span className="text-[9.5px] font-semibold mt-1">Captions</span>
        </button>

        {/* 5. End Call (Red Button) */}
        <button
          type="button"
          onClick={handleEndCall}
          title="End Live Call"
          aria-label="End Live Call"
          className="flex flex-col items-center justify-center w-16 h-14 sm:w-20 sm:h-16 rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-lg shadow-red-500/30 transition-all cursor-pointer"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="text-[9.5px] font-bold mt-1">End</span>
        </button>
      </div>
    </div>
  );
}
