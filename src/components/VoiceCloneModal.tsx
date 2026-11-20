import {
  CheckCircle2,
  Dna,
  Loader2,
  Mic,
  Pause,
  Play,
  Send,
  Sliders,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { AppTheme } from '../themes';
import { ClonedVoiceProfile, VoicePresetId, VoiceStudioSettings } from '../types';
import {
  analyzeVoiceAudioBlob,
  estimateFramePitchHz,
  estimateSpeechDurationSec,
  getAvailableSpeechVoices,
  speakWithVoiceProfile,
  unlockSpeechSynthesis,
  VOICE_PRESETS,
} from '../utils/voiceEngine';
import { VoiceNotePlayer } from './VoiceNotePlayer';

interface VoiceCloneModalProps {
  isOpen: boolean;
  theme: AppTheme;
  language: string;
  settings: VoiceStudioSettings;
  onUpdate: (next: VoiceStudioSettings) => void;
  onSendVoiceMessageToChat?: (text: string, profile: ClonedVoiceProfile) => void;
  onClose: () => void;
}

const MAX_SAMPLE_DURATION_MS = 10000;

export function VoiceCloneModal({
  isOpen,
  theme,
  language,
  settings,
  onUpdate,
  onSendVoiceMessageToChat,
  onClose,
}: VoiceCloneModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [liveHz, setLiveHz] = useState<number | null>(null);
  const [liveBrightnessPct, setLiveBrightnessPct] = useState<number>(45);
  const [liveSpeed, setLiveSpeed] = useState<number>(1.0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPlayingRawSample, setIsPlayingRawSample] = useState(false);

  // "Speak in Cloned Voice" Studio Composer
  const [speakText, setSpeakText] = useState('');
  const [isStudioPlaying, setIsStudioPlaying] = useState(false);
  const [isStudioPaused, setIsStudioPaused] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveHzSamplesRef = useRef<number[]>([]);
  const liveBrightnessSamplesRef = useRef<number[]>([]);
  const liveSpeedPeaksRef = useRef<number>(0);
  const liveSpeedAboveRef = useRef<boolean>(false);
  const liveEnergyAvgRef = useRef<number>(0.02);
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
      setIsStudioPlaying(false);
      setIsStudioPaused(false);
      window.speechSynthesis?.cancel();
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        sampleAudioRef.current = null;
      }
      setIsPlayingRawSample(false);
      return;
    }

    const refreshVoices = () => {
      setAvailableVoices(getAvailableSpeechVoices(language));
    };
    refreshVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }

    return () => {
      cleanupRecordingResources();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isOpen, language]);

  if (!isOpen) return null;

  const savedProfiles = settings.savedProfiles ?? (settings.clonedProfile ? [settings.clonedProfile] : []);
  const cloned = settings.clonedProfile;
  const isSampleVoiceActive = settings.activeVoiceId === 'cloned' && Boolean(cloned);

  const updateClonedProfileFields = (patch: Partial<ClonedVoiceProfile>) => {
    if (!cloned) return;
    const updated: ClonedVoiceProfile = { ...cloned, ...patch };
    const nextSaved = savedProfiles.map((p) =>
      (p.id && updated.id ? p.id === updated.id : p.createdAt === updated.createdAt) ? updated : p
    );
    onUpdate({
      ...settings,
      clonedProfile: updated,
      savedProfiles: nextSaved.length > 0 ? nextSaved : [updated],
    });
  };

  const processRecordedOrUploadedAudio = async (
    blob: Blob,
    durationSec: number,
    liveMetrics?: { medianHz: number | null; brightness: number | null; rate: number | null }
  ) => {
    setIsAnalyzing(true);
    setErrorMessage('');
    setStatusMessage('Analyzing vocal pitch (Hz), tone brightness, and speaking speed...');

    const nextIndex = savedProfiles.length + 1;
    const defaultName = `Sample Voice ${nextIndex}`;

    try {
      const profile: ClonedVoiceProfile = await analyzeVoiceAudioBlob(blob, {
        measuredDurationSec: durationSec,
        liveMedianHz: liveMetrics?.medianHz ?? null,
        liveBrightness: liveMetrics?.brightness ?? null,
        liveRate: liveMetrics?.rate ?? null,
        profileName: defaultName,
        language,
      });

      const nextSaved = [profile, ...savedProfiles].slice(0, 6);
      const nextSettings: VoiceStudioSettings = {
        ...settings,
        activeVoiceId: 'cloned',
        clonedProfile: profile,
        savedProfiles: nextSaved,
        autoSpeakReplies: settings.autoSpeakReplies ?? true,
      };
      onUpdate(nextSettings);
      setStatusMessage(
        `${profile.name} calibrated & activated (${profile.fundamentalHz} Hz · Pitch ${profile.pitch} · Speed ${profile.rate}x).`
      );

      unlockSpeechSynthesis();
      speakWithVoiceProfile({
        text: `Hello! ${profile.name} is now calibrated and active at ${profile.fundamentalHz} hertz.`,
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

  const handleToggle5to10SecRecord = async () => {
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
        'Direct microphone recording is unavailable in this browser. Upload an audio clip below instead!'
      );
      return;
    }

    setErrorMessage('');
    setStatusMessage('Speak naturally for 5–10 seconds (measuring real vocal Hz, brightness & speed)...');
    setElapsedSec(0);
    setLiveHz(null);
    setLiveSpeed(1.0);
    liveHzSamplesRef.current = [];
    liveBrightnessSamplesRef.current = [];
    liveSpeedPeaksRef.current = 0;
    liveSpeedAboveRef.current = false;
    liveEnergyAvgRef.current = 0.02;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const meterStartedAt = Date.now();

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Float32Array(analyser.fftSize);

        const meterTick = () => {
          analyser.getByteFrequencyData(freqData);
          analyser.getFloatTimeDomainData(timeData);

          let lowEnergy = 0;
          let highEnergy = 0;
          const midBin = Math.floor(freqData.length * 0.25);
          let total = 0;
          for (let i = 0; i < freqData.length; i++) {
            total += freqData[i];
            if (i < midBin) lowEnergy += freqData[i];
            else highEnergy += freqData[i];
          }
          const avgMag = total / freqData.length / 255;
          setMicLevel(Math.min(1, avgMag * 2.4));

          // Syllable energy burst cadence estimation for live speaking speed
          liveEnergyAvgRef.current = liveEnergyAvgRef.current * 0.94 + avgMag * 0.06;
          const burstThreshold = Math.max(0.028, liveEnergyAvgRef.current * 1.25);
          if (!liveSpeedAboveRef.current && avgMag > burstThreshold) {
            liveSpeedAboveRef.current = true;
            liveSpeedPeaksRef.current += 1;
          } else if (liveSpeedAboveRef.current && avgMag < burstThreshold * 0.72) {
            liveSpeedAboveRef.current = false;
          }
          const elapsedSecNow = Math.max(0.8, (Date.now() - meterStartedAt) / 1000);
          const peaksPerSec = liveSpeedPeaksRef.current / elapsedSecNow;
          const estimatedSpeed = Math.max(
            0.78,
            Math.min(1.28, Number((0.86 + (peaksPerSec / 6.5) * 0.3).toFixed(2)))
          );
          setLiveSpeed(estimatedSpeed);

          if (lowEnergy + highEnergy > 40) {
            const brightRatio = Math.min(0.95, Math.max(0.1, highEnergy / (lowEnergy + highEnergy + 1)));
            liveBrightnessSamplesRef.current.push(brightRatio);
            setLiveBrightnessPct(Math.round(brightRatio * 100));
          }

          const pitchSample = estimateFramePitchHz(timeData, ctx.sampleRate);
          if (pitchSample) {
            liveHzSamplesRef.current.push(pitchSample);
            setLiveHz(pitchSample);
          }

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
        const hzList = [...liveHzSamplesRef.current].sort((a, b) => a - b);
        const medianHz = hzList.length > 0 ? hzList[Math.floor(hzList.length / 2)] : null;
        const brightList = liveBrightnessSamplesRef.current;
        const avgBright =
          brightList.length > 0
            ? brightList.reduce((a, b) => a + b, 0) / brightList.length
            : null;
        const measuredPeaksPerSec = liveSpeedPeaksRef.current / Math.max(1, actualDur);
        const measuredLiveRate =
          liveSpeedPeaksRef.current > 0
            ? Math.max(
                0.78,
                Math.min(1.28, Number((0.86 + (measuredPeaksPerSec / 6.5) * 0.3).toFixed(2)))
              )
            : null;

        cleanupRecordingResources();
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 200) {
          setErrorMessage('Recording was too quiet or empty. Please speak clearly for 5–10s and try again.');
          setStatusMessage('');
          return;
        }
        void processRecordedOrUploadedAudio(blob, actualDur, {
          medianHz,
          brightness: avgBright,
          rate: measuredLiveRate,
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.min(10, (Date.now() - startedAt) / 1000);
        setElapsedSec(Number(elapsed.toFixed(1)));
      }, 100);

      autoStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }, MAX_SAMPLE_DURATION_MS);
    } catch {
      cleanupRecordingResources();
      setErrorMessage('Microphone permission was denied. You can also upload an audio sample file.');
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

  const handleToggleActiveSampleVoice = () => {
    if (!cloned) {
      setErrorMessage('Please record or upload a voice sample first to activate your Sample Voice.');
      return;
    }
    const nextId: VoicePresetId = isSampleVoiceActive ? 'default' : 'cloned';
    onUpdate({
      ...settings,
      activeVoiceId: nextId,
    });
    setStatusMessage(
      nextId === 'cloned'
        ? `Active Voice ON: ${cloned.name}`
        : 'Active Voice switched back to Default Roosters AI.'
    );
  };

  const handleSelectSavedProfile = (profile: ClonedVoiceProfile) => {
    onUpdate({
      ...settings,
      activeVoiceId: 'cloned',
      clonedProfile: profile,
    });
    unlockSpeechSynthesis();
    speakWithVoiceProfile({
      text: `Switched to ${profile.name}.`,
      language,
      voiceSettings: { ...settings, activeVoiceId: 'cloned', clonedProfile: profile },
    });
  };

  const handleSelectPreset = (id: VoicePresetId) => {
    onUpdate({
      ...settings,
      activeVoiceId: id,
    });
    const preset = VOICE_PRESETS.find((p) => p.id === id);
    const previewText =
      id === 'cloned' && cloned
        ? `Hello! Testing ${cloned.name} at pitch ${cloned.pitch} and speed ${cloned.rate}.`
        : preset?.previewLine || 'Roosters AI voice activated.';
    unlockSpeechSynthesis();
    speakWithVoiceProfile({
      text: previewText,
      language,
      voiceSettings: { ...settings, activeVoiceId: id },
    });
  };

  const handleToggleRawSamplePlayback = () => {
    if (isPlayingRawSample && sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current.currentTime = 0;
      setIsPlayingRawSample(false);
      return;
    }
    const dataUrl = cloned?.sampleDataUrl;
    if (!dataUrl) return;
    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
    }
    const audio = new Audio(dataUrl);
    sampleAudioRef.current = audio;
    audio.onended = () => setIsPlayingRawSample(false);
    audio.onerror = () => setIsPlayingRawSample(false);
    setIsPlayingRawSample(true);
    void audio.play().catch(() => setIsPlayingRawSample(false));
  };

  const handleDeleteClonedVoice = (target: ClonedVoiceProfile) => {
    const remaining = savedProfiles.filter((p) =>
      target.id && p.id ? p.id !== target.id : p.createdAt !== target.createdAt
    );
    const nextCloned = remaining[0] ?? null;
    onUpdate({
      ...settings,
      activeVoiceId:
        settings.activeVoiceId === 'cloned' && !nextCloned ? 'default' : settings.activeVoiceId,
      clonedProfile: nextCloned,
      savedProfiles: remaining,
    });
    setStatusMessage(`${target.name} removed.`);
  };

  const handleSpeakTextInClonedVoice = (e?: FormEvent) => {
    e?.preventDefault();
    const text = speakText.trim();
    if (!text) return;

    unlockSpeechSynthesis();
    setLastSpokenText(text);
    setIsStudioPaused(false);
    setIsStudioPlaying(true);

    const activeOrSampleSettings: VoiceStudioSettings = cloned
      ? { ...settings, activeVoiceId: 'cloned', clonedProfile: cloned }
      : settings;

    speakWithVoiceProfile({
      text,
      language,
      voiceSettings: activeOrSampleSettings,
      onEnd: () => {
        setIsStudioPlaying(false);
        setIsStudioPaused(false);
      },
      onError: () => {
        setIsStudioPlaying(false);
        setIsStudioPaused(false);
      },
    });
  };

  const handleToggleStudioPlayer = () => {
    if (!lastSpokenText) return;
    if (isStudioPlaying) {
      try {
        window.speechSynthesis?.pause();
      } catch {
        window.speechSynthesis?.cancel();
      }
      setIsStudioPlaying(false);
      setIsStudioPaused(true);
      return;
    }
    if (isStudioPaused && window.speechSynthesis?.paused) {
      try {
        window.speechSynthesis.resume();
        setIsStudioPlaying(true);
        setIsStudioPaused(false);
        return;
      } catch {
        // Fall through to clean replay
      }
    }
    setIsStudioPaused(false);
    setIsStudioPlaying(true);
    const activeOrSampleSettings: VoiceStudioSettings = cloned
      ? { ...settings, activeVoiceId: 'cloned', clonedProfile: cloned }
      : settings;
    speakWithVoiceProfile({
      text: lastSpokenText,
      language,
      voiceSettings: activeOrSampleSettings,
      onEnd: () => {
        setIsStudioPlaying(false);
        setIsStudioPaused(false);
      },
      onError: () => {
        setIsStudioPlaying(false);
        setIsStudioPaused(false);
      },
    });
  };

  const activeVoiceName = cloned ? cloned.name : 'Default Roosters AI';

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
        {/* Header + Active Voice Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              <Dna className="w-5 h-5" style={{ color: theme.accentSecondary }} />
            </div>
            <div className="min-w-0">
              <h2 id="voice-clone-title" className="font-display text-[17px] sm:text-[18px] font-bold">
                Voice Clone Studio
              </h2>
              <p className="text-[12px]" style={{ color: theme.textMuted }}>
                Record your 5–10s sample voice, calibrate pitch &amp; speed, and speak any text in it
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Active Voice Toggle Switch inside Voice Clone Studio */}
            <button
              type="button"
              role="switch"
              aria-checked={isSampleVoiceActive}
              onClick={handleToggleActiveSampleVoice}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-bold transition-all cursor-pointer"
              style={{
                backgroundColor: isSampleVoiceActive ? `${theme.accentPrimary}20` : theme.subSurfaceBg,
                borderColor: isSampleVoiceActive ? theme.accentPrimary : theme.borderColor,
                color: isSampleVoiceActive ? theme.accentPrimary : theme.textSecondary,
              }}
            >
              <span>Active Voice: {isSampleVoiceActive ? 'ON' : 'OFF'}</span>
              <span
                className="w-8 h-4 rounded-full p-0.5 transition-colors flex items-center"
                style={{
                  backgroundColor: isSampleVoiceActive ? theme.accentPrimary : '#334155',
                  justifyContent: isSampleVoiceActive ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="w-3 h-3 rounded-full bg-white shadow" />
              </span>
            </button>

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
        </div>

        {/* Section 1: 5-to-10 Second Sample Voice Recorder & Uploader */}
        <div
          className="rounded-xl border p-4 mb-4"
          style={{
            backgroundColor: theme.subSurfaceBg,
            borderColor: isSampleVoiceActive ? theme.accentPrimary : theme.borderColor,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[14.5px] font-bold" style={{ color: theme.accentPrimary }}>
                1. Sample Voice Recording (5–10 Seconds)
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: theme.textMuted }}>
                Record 5–10s of natural speech or upload an audio clip to calibrate Hz, brightness &amp; pace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggle5to10SecRecord}
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
                    <span className="tabular-nums">
                      Stop &amp; Save ({elapsedSec.toFixed(1)}s / 10s)
                    </span>
                  </>
                ) : isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Calibrating...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Record Sample (5–10s)</span>
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
                <span>Upload Audio</span>
              </button>
            </div>
          </div>

          {/* Real-time Web Audio API Pitch & Brightness Meter during Recording */}
          {isRecording && (
            <div
              className="mb-3 rounded-xl border p-3 space-y-2"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.accentSecondary }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold" style={{ color: theme.accentSecondary }}>
                  Analyzing Vocal Telemetry...
                </span>
                <div className="flex flex-wrap items-center gap-3 tabular-nums" style={{ color: theme.textSecondary }}>
                  <span>Pitch: <strong>{liveHz ? `${liveHz} Hz` : 'listening...'}</strong></span>
                  <span>Brightness: <strong>{liveBrightnessPct}%</strong></span>
                  <span>Speed: <strong>{liveSpeed.toFixed(2)}x</strong></span>
                </div>
              </div>
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

          {/* Saved Profiles Switcher if multiple */}
          {savedProfiles.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] mr-1" style={{ color: theme.textMuted }}>
                Saved Samples:
              </span>
              {savedProfiles.map((p) => {
                const isSelected = cloned && (p.id ? p.id === cloned.id : p.createdAt === cloned.createdAt);
                return (
                  <button
                    key={p.id || p.createdAt}
                    type="button"
                    onClick={() => handleSelectSavedProfile(p)}
                    className="px-2.5 py-1 rounded-lg border text-[11.5px] font-semibold cursor-pointer"
                    style={{
                      backgroundColor: isSelected ? `${theme.accentPrimary}20` : theme.cardBg,
                      borderColor: isSelected ? theme.accentPrimary : theme.borderColor,
                      color: isSelected ? theme.accentPrimary : theme.textSecondary,
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Calibration & Fine-Tuning Card */}
          {cloned && (
            <div
              className="mt-2 rounded-xl border p-3.5 space-y-3"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: isSampleVoiceActive ? theme.accentPrimary : theme.borderColor,
              }}
            >
              {/* Name + Delete + Specs */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  <input
                    type="text"
                    value={cloned.name}
                    onChange={(e) => updateClonedProfileFields({ name: e.target.value })}
                    aria-label="Sample Voice Profile Name"
                    placeholder="Sample Voice 1"
                    className="px-2.5 py-1 rounded-lg border text-[13.5px] font-bold bg-transparent focus:outline-none w-44 sm:w-52"
                    style={{ borderColor: theme.borderColor, color: theme.textPrimary }}
                  />
                  <span className="text-[11.5px] tabular-nums" style={{ color: theme.textMuted }}>
                    {cloned.fundamentalHz} Hz · {Math.round(cloned.spectralBrightness * 100)}% bright ·{' '}
                    {cloned.timbreLabel}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteClonedVoice(cloned)}
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

              {/* Pitch (0.5 - 1.8) & Speed (0.7 - 1.4) Calibration Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="flex items-center gap-1 font-medium" style={{ color: theme.textSecondary }}>
                      <Sliders className="w-3 h-3" style={{ color: theme.accentPrimary }} />
                      Pitch Calibration
                    </span>
                    <span className="tabular-nums font-bold" style={{ color: theme.accentPrimary }}>
                      {cloned.pitch.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.8}
                    step={0.02}
                    value={cloned.pitch}
                    onChange={(e) => updateClonedProfileFields({ pitch: Number(e.target.value) })}
                    className="w-full accent-[#ffd700] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px]" style={{ color: theme.textMuted }}>
                    <span>0.5 (Deep)</span>
                    <span>1.8 (Bright)</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="flex items-center gap-1 font-medium" style={{ color: theme.textSecondary }}>
                      <Sliders className="w-3 h-3" style={{ color: theme.accentSecondary }} />
                      Speed Calibration
                    </span>
                    <span className="tabular-nums font-bold" style={{ color: theme.accentSecondary }}>
                      {cloned.rate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.02}
                    value={cloned.rate}
                    onChange={(e) => updateClonedProfileFields({ rate: Number(e.target.value) })}
                    className="w-full accent-[#00d4ff] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px]" style={{ color: theme.textMuted }}>
                    <span>0.7x (Calm)</span>
                    <span>1.4x (Fast)</span>
                  </div>
                </div>
              </div>

              {/* Closest Neural Voice Match */}
              {availableVoices.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span style={{ color: theme.textMuted }}>Closest Neural Voice:</span>
                  <select
                    value={cloned.preferredVoiceURI || ''}
                    onChange={(e) =>
                      updateClonedProfileFields({ preferredVoiceURI: e.target.value || undefined })
                    }
                    className="flex-1 min-w-[180px] rounded-lg border px-2.5 py-1.5 text-[12px] focus:outline-none cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  >
                    <option value="">Auto-Match ({cloned.genderHint} timbre)</option>
                    {availableVoices.slice(0, 25).map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Side-by-Side Comparison: Recorded Sample vs Calibrated Voice */}
              <div className="pt-1 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cloned.sampleDataUrl ? (
                    <button
                      type="button"
                      onClick={handleToggleRawSamplePlayback}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: isPlayingRawSample ? theme.accentPrimary : theme.borderColor,
                        color: isPlayingRawSample ? theme.accentPrimary : theme.textPrimary,
                      }}
                    >
                      {isPlayingRawSample ? (
                        <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                      )}
                      <span>{isPlayingRawSample ? 'Stop Sample' : '1. Play Recorded Sample'}</span>
                    </button>
                  ) : (
                    <div
                      className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl border text-[11.5px]"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textMuted,
                      }}
                    >
                      1. Sample Calibrated ({cloned.durationSec}s)
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('cloned')}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-[12px] cursor-pointer transition-all hover:brightness-110"
                    style={{
                      backgroundImage: theme.sendButtonGradient,
                      color: theme.sendButtonText,
                    }}
                  >
                    <Volume2 className="w-3.5 h-3.5 shrink-0" />
                    <span>2. Preview Calibrated Voice</span>
                  </button>
                </div>

                {/* Auto-Speak AI Replies Switch */}
                <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.autoSpeakReplies ?? true}
                    onChange={(e) =>
                      onUpdate({ ...settings, autoSpeakReplies: e.target.checked })
                    }
                    className="accent-[#00d4ff] w-4 h-4 rounded cursor-pointer"
                  />
                  <span style={{ color: theme.textSecondary }}>Auto-speak new Roosters AI replies in this Sample Voice</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: "Speak in Cloned Voice" Direct Studio Box */}
        <div
          className="rounded-xl border p-4 mb-5"
          style={{
            backgroundColor: theme.subSurfaceBg,
            borderColor: theme.borderColor,
          }}
        >
          <h3 className="text-[14px] font-bold mb-1" style={{ color: theme.accentSecondary }}>
            2. Speak Any New Text in {cloned ? cloned.name : 'Your Sample Voice'}
          </h3>
          <p className="text-[12px] mb-2.5" style={{ color: theme.textMuted }}>
            Type anything in any language to hear it spoken immediately in your calibrated voice profile.
          </p>

          <form onSubmit={handleSpeakTextInClonedVoice} className="space-y-2.5">
            <textarea
              rows={2}
              dir="auto"
              value={speakText}
              onChange={(e) => setSpeakText(e.target.value)}
              placeholder="Type a sentence to speak in your saved sample voice..."
              className="w-full rounded-xl border p-3 text-[13.5px] focus:outline-none resize-none"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!speakText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[12.5px] disabled:opacity-50 cursor-pointer"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                <Volume2 className="w-4 h-4" />
                <span>Speak in Cloned Voice</span>
              </button>

              {onSendVoiceMessageToChat && cloned && (
                <button
                  type="button"
                  disabled={!speakText.trim()}
                  onClick={() => {
                    const text = speakText.trim();
                    if (!text) return;
                    unlockSpeechSynthesis();
                    onSendVoiceMessageToChat(text, cloned);
                    setSpeakText('');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12.5px] font-semibold disabled:opacity-50 cursor-pointer"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.accentSecondary,
                    color: theme.accentSecondary,
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send as Chat Voice Note</span>
                </button>
              )}
            </div>
          </form>

          {lastSpokenText && (
            <VoiceNotePlayer
              voiceName={activeVoiceName}
              durationEstSec={estimateSpeechDurationSec(
                lastSpokenText,
                cloned ? cloned.rate : 1.0
              )}
              isPlaying={isStudioPlaying}
              isPaused={isStudioPaused}
              theme={theme}
              onTogglePlay={handleToggleStudioPlayer}
            />
          )}
        </div>

        {/* Section 3: Built-In AI Voice Presets */}
        <div>
          <h3 className="text-[12.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: theme.textMuted }}>
            Built-In AI Voice Presets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VOICE_PRESETS.map((preset) => {
              const isSelected = settings.activeVoiceId === preset.id;
              return (
                <div
                  key={preset.id}
                  className="rounded-xl border p-3 flex flex-col justify-between gap-2 transition-colors"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: isSelected ? theme.accentSecondary : theme.borderColor,
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold">{preset.label}</span>
                      {isSelected && (
                        <CheckCircle2
                          className="w-4 h-4 shrink-0"
                          style={{ color: theme.accentSecondary }}
                        />
                      )}
                    </div>
                    <p className="text-[11.5px] mt-0.5" style={{ color: theme.textMuted }}>
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
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11.5px] font-semibold cursor-pointer transition-colors"
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
