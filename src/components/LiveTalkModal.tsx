import { Mic, MicOff, PhoneOff, Send, Volume2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getBcp47ForLanguage, ROOSTERS_LOGO_SRC } from '../constants';

interface LiveTalkModalProps {
  isOpen: boolean;
  selectedLanguage: string;
  userName: string;
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
  onClose,
}: LiveTalkModalProps) {
  const [status, setStatus] = useState<LiveStatus>('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [userCaption, setUserCaption] = useState('');
  const [aiCaption, setAiCaption] = useState(
    `Hello ${userName}! I am Roosters AI, and I am listening. Please feel free to ask me anything.`
  );
  const [micLevel, setMicLevel] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [turns, setTurns] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const isMountedRef = useRef(false);
  const isMutedRef = useRef(false);
  const statusRef = useRef<LiveStatus>('listening');
  const turnsRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeUtterancesRef = useRef(0);
  const streamFinishedRef = useRef(true);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

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
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Ignore speechSynthesis errors
    }
  }, []);

  const startRecognitionLoop = useCallback(() => {
    if (!isMountedRef.current || isMutedRef.current) return;
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setStatus('unsupported');
      return;
    }

    stopRecognition();

    const recognition = new RecognitionCtor();
    recognition.lang = getBcp47ForLanguage(selectedLanguage);
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
  }, [selectedLanguage, stopRecognition]);

  const enqueueSentenceSpeech = useCallback(
    (sentence: string) => {
      if (!isMountedRef.current) return;
      const spoken = cleanTextForSpeech(sentence);
      if (!spoken || !window.speechSynthesis) return;

      setStatus('speaking');
      activeUtterancesRef.current += 1;

      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = getBcp47ForLanguage(selectedLanguage);
      utterance.rate = 1.03;
      utterance.pitch = 1.0;

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

      utterance.onend = onDone;
      utterance.onerror = onDone;
      window.speechSynthesis.speak(utterance);
    },
    [selectedLanguage, startRecognitionLoop]
  );

  // Stream response from /api/chat-live-stream and speak sentence-by-sentence immediately!
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

      const nextHistory = [...turnsRef.current, { role: 'user' as const, content: queryText }];
      setTurns(nextHistory);

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        const resp = await fetch('/api/chat-live-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextHistory,
            language: selectedLanguage,
            userName,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error('Connection hiccup');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let sentenceBuffer = '';
        let fullReply = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!isMountedRef.current) return;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const line = rawEvent.trim();
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            const parsed = JSON.parse(jsonStr) as { type: string; text?: string; error?: string };
            if (parsed.type === 'chunk' && parsed.text) {
              fullReply += parsed.text;
              sentenceBuffer += parsed.text;
              setAiCaption(fullReply);

              // Speak as soon as the first sentence boundary arrives!
              let boundaryMatch: RegExpExecArray | null;
              while ((boundaryMatch = /^([\s\S]*?[.!?۔؟\n]+)(\s+|$)/.exec(sentenceBuffer)) !== null) {
                const sentence = boundaryMatch[1].trim();
                sentenceBuffer = sentenceBuffer.slice(boundaryMatch[0].length);
                if (sentence) {
                  enqueueSentenceSpeech(sentence);
                }
              }
            } else if (parsed.type === 'error') {
              throw new Error(parsed.error || 'Live reply error');
            }
          }
        }

        streamFinishedRef.current = true;
        const remaining = sentenceBuffer.trim();
        if (remaining) {
          enqueueSentenceSpeech(remaining);
        }

        const finalReply = fullReply.trim() || 'I am right here with you. Could you please say that once more?';
        setAiCaption(finalReply);
        setTurns([...nextHistory, { role: 'assistant', content: finalReply }]);

        // If no speech utterances were queued (e.g. SpeechSynthesis missing), resume listening right away
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
        const fallbackMsg = 'I had a brief connection hiccup. Please feel free to ask me again.';
        setAiCaption(fallbackMsg);
        enqueueSentenceSpeech(fallbackMsg);
      }
    },
    [enqueueSentenceSpeech, selectedLanguage, startRecognitionLoop, stopAllSpeech, stopRecognition, userName]
  );

  // Setup mic visualizer & start listening on open
  useEffect(() => {
    if (!isOpen) return;

    isMountedRef.current = true;
    setIsMuted(false);
    isMutedRef.current = false;
    setUserCaption('');
    setTurns([]);
    turnsRef.current = [];
    setAiCaption(
      `Hello ${userName}! I am Roosters AI, and I am listening. Please feel free to ask me anything.`
    );

    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (!isMountedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          micStreamRef.current = stream;
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
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
          }
        })
        .catch(() => {
          // Visualizer falls back cleanly
        });
    }

    startRecognitionLoop();

    return () => {
      isMountedRef.current = false;
      streamAbortRef.current?.abort();
      stopRecognition();
      stopAllSpeech();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [isOpen, startRecognitionLoop, stopAllSpeech, stopRecognition, userName]);

  if (!isOpen) return null;

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#07090e]/98 backdrop-blur-xl px-6 py-8 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Roosters AI Live Talk"
    >
      {/* Top Bar */}
      <div className="w-full max-w-3xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={ROOSTERS_LOGO_SRC}
            alt="Roosters AI"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover border border-[#1f293d]"
          />
          <div>
            <div className="font-display font-bold text-[16px] bg-gradient-to-r from-[#ffd700] to-[#00d4ff] bg-clip-text text-transparent">
              Roosters AI Live Talk
            </div>
            <div className="text-[12px] text-[#94a3b8]">
              Language: {selectedLanguage} · Instant Streaming Voice
            </div>
          </div>
        </div>

        <span
          className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border ${
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

      {/* Center Animated Visualizer Orb */}
      <div className="flex flex-col items-center justify-center my-auto max-w-2xl w-full text-center">
        <div className="relative flex items-center justify-center w-64 h-64">
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
            onClick={status === 'speaking' ? handleInterruptAndListen : undefined}
            title={status === 'speaking' ? 'Tap to interrupt and speak' : statusLabel}
            className="relative w-40 h-40 rounded-full border border-white/20 shadow-2xl transition-transform duration-150 flex items-center justify-center cursor-pointer"
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
              <Volume2 className="w-10 h-10 text-white drop-shadow" />
            ) : isMuted ? (
              <MicOff className="w-10 h-10 text-slate-300" />
            ) : (
              <Mic className="w-10 h-10 text-white drop-shadow" />
            )}
          </button>
        </div>

        {/* Live Captions */}
        <div className="mt-6 space-y-3 w-full max-w-xl">
          {userCaption && (
            <p dir="auto" className="text-[14px] text-[#94a3b8]">
              <span className="text-[#00d4ff] font-medium">You:</span> {userCaption}
            </p>
          )}
          <div className="rounded-2xl bg-[#121622]/90 border border-[#1f293d] px-5 py-4 min-h-[64px]">
            <p dir="auto" className="text-[15.5px] leading-relaxed text-slate-100">
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

        {status === 'unsupported' && (
          <form onSubmit={handleManualSubmit} className="mt-4 w-full max-w-md flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Live mic recognition unavailable here — type to talk..."
              className="flex-1 rounded-xl bg-[#121622] border border-[#2a344a] px-3.5 py-2.5 text-[13.5px] text-white focus:outline-none focus:border-[#00d4ff]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[#ffd700] text-[#050608] font-bold text-[13px] flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
          </form>
        )}
      </div>

      {/* Bottom Call Controls */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleToggleMute}
          className={`inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full border font-semibold text-[14px] transition-all cursor-pointer ${
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
          className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold text-[14px] shadow-lg shadow-red-500/25 transition-all cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Live Call</span>
        </button>
      </div>
    </div>
  );
}
