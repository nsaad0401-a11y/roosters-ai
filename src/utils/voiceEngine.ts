import { getBcp47ForLanguage } from '../constants';
import { ClonedVoiceProfile, VoicePresetId, VoiceStudioSettings } from '../types';

export interface VoicePresetMeta {
  id: Exclude<VoicePresetId, 'cloned'>;
  label: string;
  tagline: string;
  pitch: number;
  rate: number;
  genderHint: 'male' | 'female' | 'neutral';
  previewLine: string;
}

export const VOICE_PRESETS: VoicePresetMeta[] = [
  {
    id: 'default',
    label: 'Default Roosters AI',
    tagline: 'Balanced, polite & crystal-clear study tutor voice',
    pitch: 1.0,
    rate: 1.0,
    genderHint: 'neutral',
    previewLine: 'Hello! I am Roosters AI, ready to help you learn step by step.',
  },
  {
    id: 'deep-male',
    label: 'Deep Male Mentor',
    tagline: 'Grounded baritone timbre with calm, reassuring delivery',
    pitch: 0.78,
    rate: 0.94,
    genderHint: 'male',
    previewLine: 'Welcome back. Let us break down this concept clearly and calmly.',
  },
  {
    id: 'warm-female',
    label: 'Warm Female Tutor',
    tagline: 'Gentle, encouraging tone ideal for study & explanations',
    pitch: 1.15,
    rate: 0.99,
    genderHint: 'female',
    previewLine: 'You are doing wonderfully! Let us walk through the next example together.',
  },
  {
    id: 'energetic-youth',
    label: 'Energetic Youth',
    tagline: 'Bright, upbeat pace for quick coding & brainstorms',
    pitch: 1.18,
    rate: 1.12,
    genderHint: 'neutral',
    previewLine: 'Awesome idea! Here is the fastest way to build and test this project.',
  },
  {
    id: 'news-anchor',
    label: 'News Anchor',
    tagline: 'Crisp studio articulation and authoritative broadcast cadence',
    pitch: 0.92,
    rate: 1.04,
    genderHint: 'male',
    previewLine: 'Good day. Here is a clear executive summary of your topic.',
  },
];

function clamp(min: number, max: number, val: number): number {
  return Math.max(min, Math.min(max, val));
}

function estimateFundamentalHz(samples: Float32Array, sampleRate: number): number {
  const minHz = 75;
  const maxHz = 330;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.floor(sampleRate / minHz);
  const frameSize = Math.min(2048, Math.floor(sampleRate * 0.045));

  if (samples.length < frameSize + maxLag) return 155;

  const step = Math.max(frameSize, Math.floor(samples.length / 24));
  const f0Estimates: number[] = [];

  for (let start = 0; start + frameSize + maxLag < samples.length; start += step) {
    let rms = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[start + i];
      rms += s * s;
    }
    rms = Math.sqrt(rms / frameSize);
    if (rms < 0.015) continue;

    let bestLag = -1;
    let bestCorr = 0;
    let zeroLagEnergy = 0;

    for (let i = 0; i < frameSize; i++) {
      zeroLagEnergy += samples[start + i] * samples[start + i];
    }
    if (zeroLagEnergy <= 0) continue;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < frameSize; i++) {
        corr += samples[start + i] * samples[start + i + lag];
      }
      const normalized = corr / zeroLagEnergy;
      if (normalized > bestCorr) {
        bestCorr = normalized;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && bestCorr > 0.32) {
      f0Estimates.push(sampleRate / bestLag);
    }
  }

  if (f0Estimates.length === 0) return 155;
  f0Estimates.sort((a, b) => a - b);
  return Math.round(f0Estimates[Math.floor(f0Estimates.length / 2)]);
}

function estimateSpeakingRateAndBrightness(
  samples: Float32Array,
  sampleRate: number
): { rate: number; brightness: number } {
  // Zero-crossing ratio approximates vocal spectral brightness
  let zeroCrossings = 0;
  const sampleLimit = Math.min(samples.length, sampleRate * 8);
  for (let i = 1; i < sampleLimit; i++) {
    if ((samples[i - 1] >= 0 && samples[i] < 0) || (samples[i - 1] < 0 && samples[i] >= 0)) {
      zeroCrossings++;
    }
  }
  const zcrPerSec = sampleLimit > 0 ? zeroCrossings / (sampleLimit / sampleRate) : 1200;
  const brightness = clamp(0, 1, (zcrPerSec - 400) / 2800);

  // Energy envelope syllable bursts every 25ms
  const hop = Math.max(1, Math.floor(sampleRate * 0.025));
  const energies: number[] = [];
  for (let i = 0; i + hop < sampleLimit; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      sum += Math.abs(samples[i + j]);
    }
    energies.push(sum / hop);
  }
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
  const threshold = avgEnergy * 1.15;

  let peaks = 0;
  let above = false;
  for (const e of energies) {
    if (!above && e > threshold) {
      above = true;
      peaks++;
    } else if (above && e < threshold * 0.7) {
      above = false;
    }
  }

  const durSec = Math.max(1, sampleLimit / sampleRate);
  const peaksPerSec = peaks / durSec;
  // Normal speaking ~ 2.5 - 4.5 syllable peaks/sec -> map to [0.90, 1.15]
  const rate = Number(clamp(0.88, 1.16, 0.86 + (peaksPerSec / 6.5) * 0.28).toFixed(2));
  return { rate, brightness: Number(brightness.toFixed(2)) };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

export async function analyzeVoiceAudioBlob(
  blob: Blob,
  measuredDurationSec = 5
): Promise<ClonedVoiceProfile> {
  const sampleDataUrl = blob.size <= 165_000 ? await blobToDataUrl(blob) : undefined;

  let fundamentalHz = 152;
  let rate = 1.0;
  let brightness = 0.45;
  let durationSec = measuredDurationSec;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      try {
        const buffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(buffer);
        durationSec = Math.max(1, Math.round(audioBuffer.duration * 10) / 10);
        const channelData = audioBuffer.getChannelData(0);
        fundamentalHz = estimateFundamentalHz(channelData, audioBuffer.sampleRate);
        const metrics = estimateSpeakingRateAndBrightness(channelData, audioBuffer.sampleRate);
        rate = metrics.rate;
        brightness = metrics.brightness;
      } finally {
        ctx.close().catch(() => {});
      }
    }
  } catch {
    // Graceful acoustic defaults if browser codec cannot decode uploaded file
  }

  // Map F0 (Hz) relative to neutral 155 Hz into SpeechSynthesis pitch [0.72 .. 1.42]
  const pitch = Number(clamp(0.72, 1.42, fundamentalHz / 155).toFixed(2));
  const genderHint: 'male' | 'female' | 'neutral' =
    fundamentalHz < 148 ? 'male' : fundamentalHz > 180 ? 'female' : 'neutral';

  const timbreLabel =
    fundamentalHz < 120
      ? 'Deep Resonant Bass'
      : fundamentalHz < 148
        ? 'Warm Baritone'
        : fundamentalHz < 180
          ? brightness > 0.55
            ? 'Crisp Natural Tenor'
            : 'Balanced Warm Mid'
          : fundamentalHz < 225
            ? 'Clear Smooth Alto'
            : 'Bright Expressive Soprano';

  return {
    name: 'My Cloned Voice',
    createdAt: Date.now(),
    durationSec,
    fundamentalHz,
    pitch,
    rate,
    spectralBrightness: brightness,
    genderHint,
    timbreLabel,
    sampleDataUrl,
  };
}

export function getResolvedVoiceParameters(settings: VoiceStudioSettings): {
  label: string;
  pitch: number;
  rate: number;
  genderHint: 'male' | 'female' | 'neutral';
} {
  if (settings.activeVoiceId === 'cloned' && settings.clonedProfile) {
    return {
      label: `${settings.clonedProfile.name} (${settings.clonedProfile.timbreLabel})`,
      pitch: settings.clonedProfile.pitch,
      rate: settings.clonedProfile.rate,
      genderHint: settings.clonedProfile.genderHint,
    };
  }

  const preset = VOICE_PRESETS.find((p) => p.id === settings.activeVoiceId) ?? VOICE_PRESETS[0];
  return {
    label: preset.label,
    pitch: preset.pitch,
    rate: preset.rate,
    genderHint: preset.genderHint,
  };
}

export function pickSpeechVoice(
  voices: SpeechSynthesisVoice[],
  bcp47Lang: string,
  genderHint: 'male' | 'female' | 'neutral'
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const langPrefix = bcp47Lang.split('-')[0].toLowerCase();
  const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const pool = langMatches.length > 0 ? langMatches : voices;

  const maleKeywords = /(male|david|mark|daniel|george|alex|guy|christopher|ryan|arthur|liam|james|arjun)/i;
  const femaleKeywords = /(female|samantha|victoria|karen|zira|aria|jenny|sonia|libby|sara|emma|olivia|priya|fatima|google uk english female)/i;
  const qualityKeywords = /(natural|neural|online|google|microsoft|enhanced|premium)/i;

  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const voice of pool) {
    let score = 0;
    if (voice.lang.toLowerCase() === bcp47Lang.toLowerCase()) score += 10;
    else if (voice.lang.toLowerCase().startsWith(langPrefix)) score += 6;

    if (qualityKeywords.test(voice.name)) score += 5;

    if (genderHint === 'male') {
      if (maleKeywords.test(voice.name)) score += 14;
      if (femaleKeywords.test(voice.name)) score -= 8;
    } else if (genderHint === 'female') {
      if (femaleKeywords.test(voice.name)) score += 14;
      if (maleKeywords.test(voice.name)) score -= 8;
    }

    if (voice.default && genderHint === 'neutral') score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  }

  return bestVoice;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export function speakWithVoiceProfile(options: {
  text: string;
  language: string;
  voiceSettings: VoiceStudioSettings;
  speedMultiplier?: number;
  cancelPrevious?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}): SpeechSynthesisUtterance | null {
  if (!isSpeechSynthesisSupported()) {
    options.onError?.();
    return null;
  }

  const trimmed = options.text.trim();
  if (!trimmed) {
    options.onEnd?.();
    return null;
  }

  if (options.cancelPrevious !== false) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore cancel errors
    }
  }

  try {
    const bcp47 = getBcp47ForLanguage(options.language);
    const { pitch, rate, genderHint } = getResolvedVoiceParameters(options.voiceSettings);

    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = bcp47;
    utterance.pitch = clamp(0.55, 1.75, pitch);
    utterance.rate = clamp(0.55, 2.2, rate * (options.speedMultiplier ?? 1));

    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const matchedVoice = pickSpeechVoice(voices, bcp47, genderHint);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onstart = () => options.onStart?.();
    utterance.onend = () => options.onEnd?.();
    utterance.onerror = () => options.onError?.();

    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch {
    options.onError?.();
    return null;
  }
}
