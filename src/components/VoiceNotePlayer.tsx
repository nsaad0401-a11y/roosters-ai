import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppTheme } from '../themes';

const WAVEFORM_BARS = [
  28, 52, 74, 42, 88, 66, 36, 92, 58, 44, 80, 95, 50, 68, 34, 86, 62, 46, 78, 90, 48, 70, 38, 64,
  44, 30,
];

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface VoiceNotePlayerProps {
  voiceName: string;
  durationEstSec: number;
  isPlaying: boolean;
  isPaused?: boolean;
  isOnUserBubble?: boolean;
  theme: AppTheme;
  onTogglePlay: () => void;
}

export function VoiceNotePlayer({
  voiceName,
  durationEstSec,
  isPlaying,
  isPaused = false,
  isOnUserBubble = false,
  theme,
  onTogglePlay,
}: VoiceNotePlayerProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pulsePhase, setPulsePhase] = useState(0);

  const safeDuration = Math.max(1, durationEstSec);

  useEffect(() => {
    if (!isPlaying && !isPaused) {
      setElapsedSec(0);
      return;
    }
    if (!isPlaying) return;

    const interval = window.setInterval(() => {
      setPulsePhase((p) => (p + 1) % 100);
      setElapsedSec((prev) => {
        const next = prev + 0.25;
        return next >= safeDuration ? safeDuration : next;
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [isPlaying, isPaused, safeDuration]);

  const progressRatio =
    isPlaying || isPaused ? Math.min(1, Math.max(0.05, elapsedSec / safeDuration)) : 0;
  const activeBarCount = Math.round(progressRatio * WAVEFORM_BARS.length);

  const containerBg = isOnUserBubble ? 'rgba(0, 0, 0, 0.28)' : theme.subSurfaceBg;
  const containerBorder = isOnUserBubble
    ? 'rgba(255, 255, 255, 0.26)'
    : isPlaying
      ? theme.accentSecondary
      : theme.borderColor;
  const activeColor = isOnUserBubble ? '#ffd700' : theme.accentSecondary;
  const idleBarColor = isOnUserBubble ? 'rgba(255, 255, 255, 0.35)' : theme.borderColor;
  const labelColor = isOnUserBubble ? 'rgba(255, 255, 255, 0.92)' : theme.textSecondary;

  return (
    <div
      className="mt-2.5 rounded-xl border px-3 py-2.5 transition-colors"
      style={{
        backgroundColor: containerBg,
        borderColor: containerBorder,
      }}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-sm"
          style={{
            backgroundImage: isOnUserBubble ? undefined : theme.sendButtonGradient,
            backgroundColor: isOnUserBubble ? '#ffd700' : undefined,
            color: isOnUserBubble ? '#050608' : theme.sendButtonText,
          }}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Animated Waveform */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[2px] h-7" aria-hidden="true">
            {WAVEFORM_BARS.map((baseHeight, idx) => {
              const isFilled = idx < activeBarCount;
              const animatedOffset = isPlaying
                ? Math.sin((pulsePhase + idx * 2) * 0.6) * 20
                : 0;
              const heightPct = Math.max(20, Math.min(100, baseHeight + animatedOffset));
              return (
                <span
                  key={idx}
                  className="flex-1 rounded-full transition-all duration-150"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: isFilled || isPlaying ? activeColor : idleBarColor,
                    opacity: isPlaying && !isFilled ? 0.6 : 1,
                  }}
                />
              );
            })}
          </div>
        </div>

        <span
          className="text-[11px] font-medium tabular-nums shrink-0"
          style={{ color: labelColor }}
        >
          {isPlaying || isPaused
            ? `${formatClock(elapsedSec)} / ${formatClock(safeDuration)}`
            : formatClock(safeDuration)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium truncate" style={{ color: activeColor }}>
          🎙️ Spoken in: {voiceName}
        </span>
        <span className="opacity-75 shrink-0" style={{ color: labelColor }}>
          {isPlaying ? 'Playing' : isPaused ? 'Paused' : 'Tap to Play'}
        </span>
      </div>
    </div>
  );
}
