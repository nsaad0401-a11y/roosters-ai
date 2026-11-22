import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ROOSTERS_LOGO_SRC } from '../constants';
import { MissingApiKeyError, OutgoingMessage, streamChatCompletion } from '../utils/aiClient';
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

type LiveStatus = 'listening' | 'thinking' | 'speaking' | 'muted' | 'unsupported';

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
  const [status, setStatus] = useState<LiveStatus>('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [hasCameraTrack, setHasCameraTrack] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [userCaption, setUserCaption] = useState('');
  const [aiCaption, setAiCaption] = useState(
    `Hello ${userName}! I am Roosters AI, and I am listening. Please feel free to ask me anything.`
  );
  const [micLevel, setMicLevel] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [micHint, setMicHint] = useState('');
  const [turns, setTurns] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const isMountedRef = useRef(false);
  const isMutedRef = useRef(false);
  const isCameraOnRef = useRef(true);
  const statusRef = useRef<LiveStatus>('listening');
  const turnsRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
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
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  // Attach active camera stream to preview video element whenever camera toggles or mounts
  useEffect(() => {
    const videoEl = cameraVideoRef.current;
    if (!videoEl) return;
    if (isCameraOn && cameraStreamRef.current) {
      videoEl.srcObject = cameraStreamRef.current;
      void videoEl.play().catch(() => {});
    } else {
      videoEl.srcObject = null;
    }
  }, [isCameraOn, hasCameraTrack]);

  const captureCurrentVideoFrame = useCallback((): {
    base64: string;
    mimeType: string;
  } | null => {
    if (!isCameraOnRef.current) return null;
    const videoEl = cameraVideoRef.current;
    if (!videoEl || !cameraStreamRef.current) return null;
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    if (vw < 16 || vh < 16) return null;

    const maxW = 768;
    const scale = Math.min(1, maxW / vw);
    const width = Math.max(1, Math.round(vw * scale));
    const height = Math.max(1, Math.round(vh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoEl, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl).trim();
    if (!base64) return null;

    return { base64, mimeType: 'image/jpeg' };
  }, []);

  const stopRecognition = useCallback(() => {
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

  const stopAllSpeech = useCallback(() => {
    activeUtterancesRef.current = 0;
    streamFinishedRef.current = true;
    cancelVoicePlayback();
  }, []);

  const activeClonedProfile =
    voiceSettings.activeVoiceId === 'cloned' ? voiceSettings.clonedProfile : null;
  const effectiveLiveLanguage =
    activeClonedProfile?.language && selectedLanguage === 'Auto-Detect'
      ? activeClonedProfile.language
      : selectedLanguage;
  const effectiveTtsLanguage = activeClonedProfile?.language || effectiveLiveLanguage;

  const startRecognitionLoop = useCallback(() => {
    if (!isMountedRef.current || isMutedRef.current) return;
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setStatus('unsupported');
      return;
    }

    stopRecognition();

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
      if (!isMountedRef.current || isMutedRef.current) return;
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setMicHint('Microphone access was blocked. Allow microphone permission in your browser settings or type below.');
        setStatus('unsupported');
        return;
      }
      if (statusRef.current === 'listening') {
        window.setTimeout(() => {
          if (isMountedRef.current && !isMutedRef.current && statusRef.current === 'listening') {
            startRecognitionLoop();
          }
        }, 180);
      }
    };

    recognition.onend = () => {
      if (!isMountedRef.current || isMutedRef.current) return;
      const cleaned = (finalTranscript || latestTranscript).trim();
      if (cleaned) {
        void handleUserQuery(cleaned);
      } else if (statusRef.current === 'listening') {
        window.setTimeout(() => {
          if (isMountedRef.current && !isMutedRef.current && statusRef.current === 'listening') {
            startRecognitionLoop();
          }
        }, 120);
      }
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    try {
      recognition.start();
    } catch {
      // Ignore already-started errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClonedProfile?.accentTone, effectiveLiveLanguage, stopRecognition]);

  const enqueueSentenceSpeech = useCallback(
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
            startRecognitionLoop();
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
    [effectiveTtsLanguage, startRecognitionLoop, userSettings?.speechSpeed, userSettings?.voiceGender, voiceSettings]
  );

  // Stream response via Gemini/Groq and attach live camera frame if camera is ON
  const handleUserQuery = useCallback(
    async (queryText: string) => {
      if (!queryText.trim() || !isMountedRef.current) return;
      stopRecognition();
      stopAllSpeech();
      streamAbortRef.current?.abort();

      setStatus('thinking');
      setUserCaption(queryText);
      setAiCaption('');
      streamFinishedRef.current = false;

      const capturedFrame = captureCurrentVideoFrame();
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
                enqueueSentenceSpeech(sentence);
              }
            }
          },
        });

        if (!isMountedRef.current) return;

        streamFinishedRef.current = true;
        const remaining = sentenceBuffer.trim();
        if (remaining) {
          enqueueSentenceSpeech(remaining);
        }

        const finalReply = fullReply.trim();
        if (!finalReply) {
          throw new Error('AI returned an empty live voice response. Please check your API connection.');
        }
        setAiCaption(finalReply);
        setTurns([...updatedTurns, { role: 'assistant', content: finalReply }]);

        if (activeUtterancesRef.current === 0) {
          if (isMutedRef.current) {
            setStatus('muted');
          } else {
            startRecognitionLoop();
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError' || !isMountedRef.current) return;
        streamFinishedRef.current = true;
        const fallbackMsg =
          err instanceof MissingApiKeyError
            ? 'Voice service is momentarily unavailable. Please try again shortly.'
            : err instanceof Error
              ? err.message
              : 'I had a brief connection hiccup. Please feel free to ask me again.';
        setAiCaption(fallbackMsg);
        enqueueSentenceSpeech(fallbackMsg);
      }
    },
    [
      activeClonedProfile,
      captureCurrentVideoFrame,
      effectiveLiveLanguage,
      enqueueSentenceSpeech,
      hasBackendApi,
      hasServerGeminiKey,
      ownerConfig?.chatModel,
      ownerConfig?.globalSystemPrompt,
      startRecognitionLoop,
      stopAllSpeech,
      stopRecognition,
      userName,
      userSettings?.customInstructions,
      userSettings?.responseStyle,
    ]
  );

  const attachAudioAnalyzer = useCallback((stream: MediaStream) => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx || stream.getAudioTracks().length === 0) return;

    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!isMountedRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length / 255;
      setMicLevel(isMutedRef.current ? 0 : Math.min(1, avg * 1.8));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Setup camera + mic visualizer & start listening on open
  useEffect(() => {
    if (!isOpen) return;

    isMountedRef.current = true;
    setIsMuted(false);
    isMutedRef.current = false;
    setIsCameraOn(true);
    isCameraOnRef.current = true;
    setHasCameraTrack(false);
    setCameraError('');
    setUserCaption('');
    setMicHint('');
    setTurns([]);
    turnsRef.current = [];
    setAiCaption(
      `Hello ${userName}! I am Roosters AI, and I am listening. Camera & mic are ready — ask me anything!`
    );

    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: true })
        .then((stream) => {
          if (!isMountedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          mediaStreamRef.current = stream;
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0) {
            cameraStreamRef.current = new MediaStream(videoTracks);
            setHasCameraTrack(true);
            if (cameraVideoRef.current) {
              cameraVideoRef.current.srcObject = cameraStreamRef.current;
              void cameraVideoRef.current.play().catch(() => {});
            }
          }
          attachAudioAnalyzer(stream);
        })
        .catch(() => {
          // Fallback to audio-only if camera permission is denied or no webcam exists
          setIsCameraOn(false);
          isCameraOnRef.current = false;
          setCameraError('Camera unavailable — running in Voice-only mode.');
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((audioStream) => {
              if (!isMountedRef.current) {
                audioStream.getTracks().forEach((t) => t.stop());
                return;
              }
              mediaStreamRef.current = audioStream;
              attachAudioAnalyzer(audioStream);
            })
            .catch(() => {
              setMicHint('Allow microphone access on your device for hands-free voice, or type below.');
            });
        });
    }

    startRecognitionLoop();

    return () => {
      isMountedRef.current = false;
      streamAbortRef.current?.abort();
      stopRecognition();
      stopAllSpeech();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [attachAudioAnalyzer, isOpen, startRecognitionLoop, stopAllSpeech, stopRecognition, userName]);

  if (!isOpen) return null;

  const handleToggleCamera = async () => {
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
      setHasCameraTrack(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported in this browser.');
      return;
    }

    try {
      setCameraError('');
      const vidStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } },
        audio: false,
      });
      cameraStreamRef.current = vidStream;
      setHasCameraTrack(true);
      setIsCameraOn(true);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = vidStream;
        void cameraVideoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError('Camera permission denied or no camera found.');
      setIsCameraOn(false);
      setHasCameraTrack(false);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    if (nextMuted) {
      stopRecognition();
      if (status === 'listening') {
        setStatus('muted');
      }
    } else {
      if (status !== 'speaking' && status !== 'thinking') {
        startRecognitionLoop();
      }
    }
  };

  const handleInterruptAndListen = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().catch(() => {});
    }
    streamAbortRef.current?.abort();
    stopAllSpeech();
    setIsMuted(false);
    isMutedRef.current = false;
    startRecognitionLoop();
  };

  const handleEndCall = () => {
    isMountedRef.current = false;
    streamAbortRef.current?.abort();
    stopRecognition();
    stopAllSpeech();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    onClose(turnsRef.current);
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const text = manualInput.trim();
    setManualInput('');
    void handleUserQuery(text);
  };

  const statusLabel =
    status === 'listening'
      ? 'Listening...'
      : status === 'thinking'
        ? 'Thinking...'
        : status === 'speaking'
          ? 'Speaking...'
          : status === 'muted'
            ? 'Microphone Muted'
            : 'Voice Fallback Active';

  const orbScale =
    status === 'listening'
      ? 1 + micLevel * 0.28
      : status === 'speaking'
        ? 1.12
        : status === 'thinking'
          ? 0.96
          : 0.92;

  const orbColor =
    status === 'speaking'
      ? 'radial-gradient(circle at 35% 35%, #ffd700, #00d4ff 65%, #07090e 100%)'
      : status === 'thinking'
        ? 'radial-gradient(circle at 35% 35%, #a855f7, #00d4ff 70%, #07090e 100%)'
        : status === 'muted'
          ? 'radial-gradient(circle at 35% 35%, #475569, #1e293b 70%, #07090e 100%)'
          : 'radial-gradient(circle at 35% 35%, #00d4ff, #0284c7 65%, #07090e 100%)';

  return (
    <div
      className="fixed inset-0 min-h-[100dvh] z-50 flex flex-col items-center justify-between bg-[#07090e]/98 backdrop-blur-xl px-3 sm:px-6 py-4 sm:py-6 text-white overflow-y-auto overflow-x-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Roosters AI Live Talk"
    >
      {/* Top Bar */}
      <div className="w-full max-w-3xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={ROOSTERS_LOGO_SRC}
            alt="Roosters AI"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover border border-[#1f293d] shrink-0"
          />
          <div className="min-w-0">
            <div className="font-display font-bold text-[15px] sm:text-[16px] bg-gradient-to-r from-[#ffd700] to-[#00d4ff] bg-clip-text text-transparent truncate">
              Roosters AI Live Talk
            </div>
            <div className="text-[11.5px] sm:text-[12px] text-[#94a3b8] truncate">
              Language: {selectedLanguage} · Voice:{' '}
              {getResolvedVoiceParameters(voiceSettings, userSettings?.voiceGender).label} (
              {(userSettings?.speechSpeed ?? 1.0).toFixed(1)}x)
            </div>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-[11.5px] sm:text-[12.5px] font-semibold border whitespace-nowrap ${
            status === 'speaking'
              ? 'bg-[#ffd700]/15 border-[#ffd700]/50 text-[#ffd700]'
              : status === 'thinking'
                ? 'bg-[#a855f7]/15 border-[#a855f7]/50 text-[#c084fc]'
                : status === 'muted'
                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-[#00d4ff]/15 border-[#00d4ff]/50 text-[#00d4ff]'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Center Stage: Live Camera Preview (when ON) + Animated Visualizer Orb */}
      <div className="flex flex-col items-center justify-center my-auto max-w-3xl w-full text-center py-3">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-5 w-full">
          {isCameraOn && hasCameraTrack && (
            <div className="relative w-56 sm:w-64 aspect-[4/3] rounded-2xl overflow-hidden border-2 border-[#00d4ff]/50 bg-[#0d121d] shadow-2xl shrink-0">
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/65 border border-[#00d4ff]/40 text-[10.5px] font-semibold text-[#00d4ff] flex items-center gap-1">
                <Camera className="w-3 h-3" />
                <span>LIVE CAM AI VISION</span>
              </div>
            </div>
          )}

          <div className="relative flex items-center justify-center w-44 h-44 sm:w-52 sm:h-52 shrink-0">
            <div
              aria-hidden="true"
              className={`absolute inset-4 rounded-full border border-[#00d4ff]/25 transition-transform duration-150 ${
                status === 'listening' || status === 'speaking' ? 'animate-ping' : ''
              }`}
              style={{ animationDuration: '2.4s' }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-8 rounded-full blur-2xl opacity-50 transition-all duration-300"
              style={{
                background:
                  status === 'speaking'
                    ? 'linear-gradient(135deg, #ffd700, #00d4ff)'
                    : 'linear-gradient(135deg, #00d4ff, #3b82f6)',
                transform: `scale(${orbScale})`,
              }}
            />

            <button
              type="button"
              onClick={handleInterruptAndListen}
              title={status === 'speaking' ? 'Tap to interrupt and speak' : 'Tap to listen & unlock mobile audio'}
              className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full border border-white/20 shadow-2xl transition-transform duration-150 flex items-center justify-center cursor-pointer"
              style={{
                background: orbColor,
                transform: `scale(${orbScale})`,
                boxShadow:
                  status === 'speaking'
                    ? '0 0 55px rgba(255, 215, 0, 0.45)'
                    : '0 0 55px rgba(0, 212, 255, 0.4)',
              }}
            >
              {status === 'speaking' ? (
                <Volume2 className="w-9 h-9 text-white drop-shadow" />
              ) : isMuted ? (
                <MicOff className="w-9 h-9 text-slate-300" />
              ) : (
                <Mic className="w-9 h-9 text-white drop-shadow" />
              )}
            </button>
          </div>
        </div>

        {/* Live Captions */}
        <div className="mt-4 space-y-2.5 w-full max-w-xl">
          {userCaption && (
            <p dir="auto" className="text-[14px] text-[#94a3b8]">
              <span className="text-[#00d4ff] font-medium">You:</span> {userCaption}
            </p>
          )}
          <div className="rounded-2xl bg-[#121622]/90 border border-[#1f293d] px-5 py-3.5 min-h-[60px]">
            <p dir="auto" className="text-[15px] leading-relaxed text-slate-100">
              {aiCaption || 'Thinking...'}
            </p>
          </div>
          {status === 'speaking' && (
            <button
              type="button"
              onClick={handleInterruptAndListen}
              className="text-[12px] text-[#00d4ff] hover:underline cursor-pointer"
            >
              Tap orb or click here to interrupt &amp; speak
            </button>
          )}
        </div>

        {(micHint || cameraError) && (
          <p className="mt-2.5 text-[12px] text-[#ffd700]/90 max-w-md">
            {micHint || cameraError}
          </p>
        )}

        {/* Always provide a quick type-to-ask input when camera/fallback is used */}
        <form onSubmit={handleManualSubmit} className="mt-3 w-full max-w-md flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder={
              isCameraOn && hasCameraTrack
                ? 'Ask Roosters AI about what your camera sees...'
                : 'Speak hands-free or type a quick message...'
            }
            className="flex-1 rounded-xl bg-[#121622] border border-[#2a344a] px-3.5 py-2 text-[13px] text-white focus:outline-none focus:border-[#00d4ff]"
          />
          <button
            type="submit"
            disabled={!manualInput.trim()}
            className="px-4 py-2 rounded-xl bg-[#ffd700] text-[#050608] font-bold text-[13px] flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask</span>
          </button>
        </form>
      </div>

      {/* Bottom Call Controls: Camera On/Off, Mute/Unmute Mic, End Live Call */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => void handleToggleCamera()}
          className={`inline-flex items-center gap-2 px-4 sm:px-5 py-3 rounded-full border font-semibold text-[13px] sm:text-[14px] transition-all cursor-pointer ${
            isCameraOn && hasCameraTrack
              ? 'bg-[#121622] border-[#00d4ff]/60 text-[#00d4ff]'
              : 'bg-[#1e273b] border-[#334155] text-slate-300 hover:border-[#00d4ff]'
          }`}
        >
          {isCameraOn && hasCameraTrack ? (
            <Camera className="w-4 h-4" />
          ) : (
            <CameraOff className="w-4 h-4" />
          )}
          <span>{isCameraOn && hasCameraTrack ? 'Camera On' : 'Camera Off'}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleMute}
          className={`inline-flex items-center gap-2 px-4 sm:px-5 py-3 rounded-full border font-semibold text-[13px] sm:text-[14px] transition-all cursor-pointer ${
            isMuted
              ? 'bg-[#1e273b] border-[#ffd700] text-[#ffd700]'
              : 'bg-[#121622] border-[#334155] text-slate-100 hover:border-[#00d4ff]'
          }`}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[#00d4ff]" />}
          <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
        </button>

        <button
          type="button"
          onClick={handleEndCall}
          className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold text-[13px] sm:text-[14px] shadow-lg shadow-red-500/25 transition-all cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Live Call</span>
        </button>
      </div>
    </div>
  );
}
