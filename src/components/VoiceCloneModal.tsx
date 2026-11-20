import {
  CheckCircle2,
  Dna,
  Loader2,
  Mic,
  Play,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AppTheme } from '../themes';
import { ClonedVoiceProfile, VoicePresetId, VoiceStudioSettings } from '../types';
import {
  analyzeVoiceAudioBlob,
  speakWithVoiceProfile,
  VOICE_PRESETS,
} from '../utils/voiceEngine';

interface VoiceCloneModalProps {
  isOpen: boolean;
  theme: AppTheme;
  language: string;
  settings: VoiceStudioSettings;
  onUpdate: (next: VoiceStudioSettings) => void;
  onClose: () => void;
}

const SAMPLE_DURATION_MS = 5000;

export function VoiceCloneModal({
  isOpen,
  theme,
  language,
  settings,
  onUpdate,
  onClose,
}: VoiceCloneModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5.0);
  const [micLevel, setMicLevel] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanupRecordingResources = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevel(0);
  };

  useEffect(() => {
    if (!isOpen) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupRecordingResources();
      setIsRecording(false);
      window.speechSynthesis?.cancel();
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        sampleAudioRef.current = null;
      }
    }
    return () => {
      cleanupRecordingResources();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const processRecordedOrUploadedAudio = async (blob: Blob, durationSec: number) => {
    setIsAnalyzing(true);
    setErrorMessage('');
    setStatusMessage('Analyzing vocal pitch, cadence, and timbre...');

    try {
      const profile: ClonedVoiceProfile = await analyzeVoiceAudioBlob(blob, durationSec);
      const nextSettings: VoiceStudioSettings = {
        activeVoiceId: 'cloned',
        clonedProfile: profile,
      };
      onUpdate(nextSettings);
      setStatusMessage(
        `Cloned voice saved & activated (${profile.fundamentalHz} Hz · ${profile.timbreLabel}).`
      );
      speakWithVoiceProfile({
        text: `Hello! Your cloned voice profile is active at ${profile.fundamentalHz} hertz with a ${profile.timbreLabel} tone.`,
        language,
        voiceSettings: nextSettings,
      });
    } catch {
      setErrorMessage('Could not analyze audio sample. Please try recording again or uploading a WAV/MP3 clip.');
      setStatusMessage('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStart5SecRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (
      typeof MediaRecorder === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setErrorMessage(
        'Direct microphone recording is unavailable in this browser. You can upload an audio clip below or select a built-in AI voice preset!'
      );
      return;
    }

    setErrorMessage('');
    setStatusMessage('Speak naturally for 5 seconds...');
    setSecondsLeft(5.0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        const data = new Uint8Array(analyser.frequencyBinCount);
        const meterTick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          setMicLevel(Math.min(1, (sum / data.length / 255) * 2));
          rafRef.current = requestAnimationFrame(meterTick);
        };
        rafRef.current = requestAnimationFrame(meterTick);
      }

      const canCheckType = typeof MediaRecorder.isTypeSupported === 'function';
      const preferredMime =
        canCheckType && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : canCheckType && MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      const startedAt = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const actualDur = Math.max(1, (Date.now() - startedAt) / 1000);
        cleanupRecordingResources();
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 200) {
          setErrorMessage('Recording was too quiet or empty. Please speak clearly and try again.');
          setStatusMessage('');
          return;
        }
        void processRecordedOrUploadedAudio(blob, actualDur);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      timerIntervalRef.current = window.setInterval(() => {
        const rem = Math.max(0, (SAMPLE_DURATION_MS - (Date.now() - startedAt)) / 1000);
        setSecondsLeft(Number(rem.toFixed(1)));
      }, 100);

      autoStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }, SAMPLE_DURATION_MS);
    } catch {
      cleanupRecordingResources();
      setErrorMessage('Microphone permission was denied. You can also upload a voice sample file.');
      setStatusMessage('');
    }
  };

  const handleAudioFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6_000_000) {
      setErrorMessage('Please choose a short voice clip under 6 MB.');
      return;
    }
    await processRecordedOrUploadedAudio(file, 5);
  };

  const handleSelectPreset = (id: VoicePresetId) => {
    onUpdate({
      ...settings,
      activeVoiceId: id,
    });
    const preset = VOICE_PRESETS.find((p) => p.id === id);
    const previewText =
      id === 'cloned' && settings.clonedProfile
        ? `Hello! Speaking with your cloned voice profile at ${settings.clonedProfile.fundamentalHz} hertz.`
        : preset?.previewLine || 'Roosters AI voice activated.';
    speakWithVoiceProfile({
      text: previewText,
      language,
      voiceSettings: { ...settings, activeVoiceId: id },
    });
  };

  const handlePlayRawSample = () => {
    const dataUrl = settings.clonedProfile?.sampleDataUrl;
    if (!dataUrl) return;
    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
    }
    const audio = new Audio(dataUrl);
    sampleAudioRef.current = audio;
    void audio.play();
  };

  const handleDeleteClonedVoice = () => {
    onUpdate({
      activeVoiceId: settings.activeVoiceId === 'cloned' ? 'default' : settings.activeVoiceId,
      clonedProfile: null,
    });
    setStatusMessage('Cloned voice profile removed.');
  };

  const cloned = settings.clonedProfile;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-3 sm:px-4 py-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-clone-title"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border p-4 sm:p-6 shadow-2xl max-h-[90vh] max-h-[90dvh] overflow-y-auto"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              <Dna className="w-5 h-5" style={{ color: theme.accentSecondary }} />
            </div>
            <div>
              <h2 id="voice-clone-title" className="font-display text-[18px] font-bold">
                Voice Cloning &amp; Custom Voice Studio
              </h2>
              <p className="text-[12.5px]" style={{ color: theme.textMuted }}>
                Clone your own voice or choose a realistic AI persona for Chat, Text Reader &amp; Live Talk
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Voice Clone Studio"
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: 5-Second Voice Clone Recorder / Uploader */}
        <div
          className="rounded-xl border p-4 mb-5"
          style={{
            backgroundColor: theme.subSurfaceBg,
            borderColor: cloned && settings.activeVoiceId === 'cloned' ? theme.accentPrimary : theme.borderColor,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[14.5px] font-bold" style={{ color: theme.accentPrimary }}>
                Clone Your Own Voice (5-Second Sample)
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: theme.textMuted }}>
                Record a 5-second voice sample or upload an audio clip to extract pitch, pace &amp; timbre.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStart5SecRecord}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[12.5px] cursor-pointer transition-all"
                style={{
                  backgroundImage: isRecording
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : theme.sendButtonGradient,
                  color: isRecording ? '#ffffff' : theme.sendButtonText,
                }}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span className="tabular-nums">Stop ({secondsLeft.toFixed(1)}s)</span>
                  </>
                ) : isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Record 5s Voice</span>
                  </>
                )}
              </button>

              <input
                ref={uploadInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.webm,.m4a,.ogg"
                onChange={handleAudioFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                disabled={isRecording || isAnalyzing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textPrimary,
                }}
              >
                <Upload className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
                <span>Upload Clip</span>
              </button>
            </div>
          </div>

          {/* Live Mic Meter during recording */}
          {isRecording && (
            <div className="mb-3">
              <div className="w-full h-2 rounded-full bg-black/30 overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.max(8, Math.round(micLevel * 100))}%`,
                    backgroundImage: theme.sendButtonGradient,
                  }}
                />
              </div>
            </div>
          )}

          {statusMessage && (
            <p className="text-[12.5px] text-emerald-400 font-medium mb-2">{statusMessage}</p>
          )}
          {errorMessage && (
            <p className="text-[12.5px] text-[#ff4d4d] font-medium mb-2">{errorMessage}</p>
          )}

          {/* Saved Cloned Voice Card */}
          {cloned && (
            <div
              className="mt-2 rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
              style={{
                backgroundColor: theme.cardBg,
                borderColor:
                  settings.activeVoiceId === 'cloned' ? theme.accentPrimary : theme.borderColor,
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold">{cloned.name}</span>
                  {settings.activeVoiceId === 'cloned' && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: theme.accentPrimary }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </span>
                  )}
                </div>
                <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: theme.textMuted }}>
                  {cloned.fundamentalHz} Hz · {cloned.timbreLabel} · Pace {cloned.rate}x · Pitch{' '}
                  {cloned.pitch}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {cloned.sampleDataUrl && (
                  <button
                    type="button"
                    onClick={handlePlayRawSample}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textSecondary,
                    }}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Original Clip</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSelectPreset('cloned')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-[12px] cursor-pointer"
                  style={{
                    backgroundImage:
                      settings.activeVoiceId === 'cloned' ? theme.sendButtonGradient : undefined,
                    backgroundColor:
                      settings.activeVoiceId === 'cloned' ? undefined : theme.subSurfaceBg,
                    color:
                      settings.activeVoiceId === 'cloned' ? theme.sendButtonText : theme.textPrimary,
                    border:
                      settings.activeVoiceId === 'cloned'
                        ? 'none'
                        : `1px solid ${theme.borderColor}`,
                  }}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>
                    {settings.activeVoiceId === 'cloned' ? 'Test Cloned Voice' : 'Use My Cloned Voice'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDeleteClonedVoice}
                  aria-label="Remove Cloned Voice"
                  className="p-1.5 rounded-lg border hover:text-[#ff4d4d] cursor-pointer"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                    color: theme.textMuted,
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Realistic AI Voice Presets */}
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: theme.textMuted }}>
            AI Voice Presets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VOICE_PRESETS.map((preset) => {
              const isSelected = settings.activeVoiceId === preset.id;
              return (
                <div
                  key={preset.id}
                  className="rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-colors"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: isSelected ? theme.accentSecondary : theme.borderColor,
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-bold">{preset.label}</span>
                      {isSelected && (
                        <CheckCircle2
                          className="w-4 h-4 shrink-0"
                          style={{ color: theme.accentSecondary }}
                        />
                      )}
                    </div>
                    <p className="text-[11.5px] mt-1" style={{ color: theme.textMuted }}>
                      {preset.tagline}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] tabular-nums" style={{ color: theme.textMuted }}>
                      Pitch {preset.pitch} · {preset.rate}x
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: isSelected ? theme.accentSecondary : theme.cardBg,
                        borderColor: isSelected ? theme.accentSecondary : theme.borderColor,
                        color: isSelected ? '#050608' : theme.textPrimary,
                      }}
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>{isSelected ? 'Preview Voice' : 'Select & Preview'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t flex justify-end" style={{ borderColor: theme.borderColor }}>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl font-bold text-[13px] cursor-pointer"
            style={{
              backgroundImage: theme.sendButtonGradient,
              color: theme.sendButtonText,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
