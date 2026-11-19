import { BookOpen, Pause, Play, Square, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getBcp47ForLanguage, WORLD_LANGUAGES } from '../constants';
import { AppTheme } from '../themes';
import { VoiceStudioSettings } from '../types';
import { getResolvedVoiceParameters, speakWithVoiceProfile } from '../utils/voiceEngine';

interface TextReaderModalProps {
  isOpen: boolean;
  initialLanguage: string;
  theme: AppTheme;
  voiceSettings: VoiceStudioSettings;
  onClose: () => void;
}

const SAMPLE_STUDY_TEXT = `Welcome to the Roosters AI Study Text Reader. Paste any lecture notes, textbook chapter, or essay here to listen aloud while you revise.

Photosynthesis is the biological process by which green plants, algae, and certain bacteria convert light energy into chemical energy. In the first stage, called the light-dependent reactions, chlorophyll absorbs sunlight to split water molecules and release oxygen. In the second stage, known as the Calvin cycle, carbon dioxide is transformed into glucose, fueling growth across the entire ecosystem.`;

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function splitIntoChunks(text: string): string[] {
  const sentences = text
    .replace(/\n+/g, '. ')
    .split(/(?<=[.!?۔؟])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length > 0) return sentences;
  return text.trim() ? [text.trim()] : [];
}

export function TextReaderModal({
  isOpen,
  initialLanguage,
  theme,
  voiceSettings,
  onClose,
}: TextReaderModalProps) {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState(initialLanguage === 'Auto-Detect' ? 'English' : initialLanguage);
  const [speed, setSpeed] = useState<number>(1);
  const [readerState, setReaderState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [statusError, setStatusError] = useState('');

  const chunksRef = useRef<string[]>([]);
  const activeRunRef = useRef(0);
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    if (isOpen) {
      setLanguage(initialLanguage === 'Auto-Detect' ? 'English' : initialLanguage);
    } else {
      activeRunRef.current += 1;
      window.speechSynthesis?.cancel();
      setReaderState('idle');
      setCurrentChunkIndex(0);
    }
  }, [isOpen, initialLanguage]);

  useEffect(() => {
    return () => {
      activeRunRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (!isOpen) return null;

  const speakChunkAt = (index: number, runId: number) => {
    if (activeRunRef.current !== runId) return;
    const chunks = chunksRef.current;
    if (index >= chunks.length) {
      setReaderState('idle');
      setCurrentChunkIndex(0);
      return;
    }

    setCurrentChunkIndex(index);
    speakWithVoiceProfile({
      text: chunks[index],
      language,
      voiceSettings,
      speedMultiplier: speedRef.current,
      cancelPrevious: false,
      onEnd: () => {
        if (activeRunRef.current !== runId) return;
        speakChunkAt(index + 1, runId);
      },
      onError: () => {
        if (activeRunRef.current !== runId) return;
        setReaderState('idle');
      },
    });
  };

  const handlePlay = () => {
    if (!window.speechSynthesis) {
      setStatusError('Text-to-Speech is not supported in this browser.');
      return;
    }
    setStatusError('');

    if (readerState === 'paused') {
      window.speechSynthesis.resume();
      setReaderState('playing');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      setStatusError('Please paste or type some study notes or text first.');
      return;
    }

    window.speechSynthesis.cancel();
    const chunks = splitIntoChunks(trimmed);
    chunksRef.current = chunks;
    setTotalChunks(chunks.length);
    const runId = ++activeRunRef.current;
    setReaderState('playing');
    speakChunkAt(0, runId);
  };

  const handlePause = () => {
    if (readerState !== 'playing') return;
    window.speechSynthesis?.pause();
    setReaderState('paused');
  };

  const handleStop = () => {
    activeRunRef.current += 1;
    window.speechSynthesis?.cancel();
    setReaderState('idle');
    setCurrentChunkIndex(0);
  };

  const handleSpeedChange = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    speedRef.current = nextSpeed;
    // If actively playing, restart current sentence smoothly at the new speed
    if (readerState === 'playing') {
      const resumeIdx = currentChunkIndex;
      window.speechSynthesis.cancel();
      const runId = ++activeRunRef.current;
      speakChunkAt(resumeIdx, runId);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-reader-title"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border p-6 shadow-2xl flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              <BookOpen className="w-5 h-5" style={{ color: theme.accentPrimary }} />
            </div>
            <div>
              <h2 id="text-reader-title" className="font-display text-[18px] font-bold">
                Study Text Reader
              </h2>
              <p className="text-[12.5px]" style={{ color: theme.textMuted }}>
                Voice: <span style={{ color: theme.accentSecondary }}>{getResolvedVoiceParameters(voiceSettings).label}</span> · Paste notes or chapters to listen aloud
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              handleStop();
              onClose();
            }}
            aria-label="Close Text Reader"
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Text Area */}
        <div className="flex items-center justify-between gap-2 mb-2 text-[12px]">
          <span className="tabular-nums" style={{ color: theme.textMuted }}>
            {wordCount} words · {text.length} characters
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleStop();
                setText(SAMPLE_STUDY_TEXT);
                setStatusError('');
              }}
              className="font-medium hover:underline cursor-pointer"
              style={{ color: theme.accentSecondary }}
            >
              Load Sample Study Notes
            </button>
            {text && (
              <button
                type="button"
                onClick={() => {
                  handleStop();
                  setText('');
                }}
                className="font-medium hover:underline cursor-pointer"
                style={{ color: theme.textMuted }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <textarea
          rows={8}
          dir="auto"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (statusError) setStatusError('');
          }}
          placeholder="Paste your study notes, textbook excerpt, essay, or revision summary here..."
          className="w-full rounded-xl border p-4 text-[14.5px] leading-relaxed focus:outline-none resize-y min-h-[180px]"
          style={{
            backgroundColor: theme.subSurfaceBg,
            borderColor: theme.borderColor,
            color: theme.textPrimary,
          }}
        />

        {/* Active sentence readout */}
        {readerState !== 'idle' && totalChunks > 0 && (
          <div
            className="mt-3 px-3.5 py-2.5 rounded-xl border text-[12.5px] flex items-center justify-between gap-3"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.accentSecondary,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="w-4 h-4 shrink-0" style={{ color: theme.accentSecondary }} />
              <span dir="auto" className="truncate">
                {chunksRef.current[currentChunkIndex]}
              </span>
            </div>
            <span className="tabular-nums shrink-0 font-medium" style={{ color: theme.textMuted }}>
              {currentChunkIndex + 1} / {totalChunks}
            </span>
          </div>
        )}

        {statusError && <p className="mt-2.5 text-[12.5px] text-[#ff4d4d]">{statusError}</p>}

        {/* Controls Bar: Play, Pause, Stop, Speed, Language */}
        <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: theme.borderColor }}>
          <div className="flex items-center gap-2">
            {readerState === 'playing' ? (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[13px] cursor-pointer"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePlay}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[13px] cursor-pointer"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{readerState === 'paused' ? 'Resume' : 'Play'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleStop}
              disabled={readerState === 'idle'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[13px] font-medium disabled:opacity-45 cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Language Selector */}
            <select
              aria-label="Reader Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border text-[12px] font-medium cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            >
              {WORLD_LANGUAGES.filter((l) => l.code !== 'Auto-Detect').map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>

            {/* Speed Selector */}
            <div
              className="inline-flex items-center rounded-lg border p-0.5"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSpeedChange(s)}
                  className="px-2 py-1 rounded-md text-[11.5px] font-semibold tabular-nums cursor-pointer transition-colors"
                  style={{
                    backgroundColor: speed === s ? theme.accentSecondary : 'transparent',
                    color: speed === s ? '#050608' : theme.textMuted,
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
