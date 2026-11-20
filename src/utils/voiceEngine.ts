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

export function estimateFramePitchHz(
  samples: Float32Array<ArrayBufferLike>,
  sampleRate: number
): number | null {
  const minHz = 75;
  const maxHz = 340;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(samples.length - 1, Math.floor(sampleRate / minHz));
  if (samples.length < maxLag + 64) return null;

  let rms = 0;
  for (let i = 0; i < samples.length; i++) {
    rms += samples[i] * samples[i];
  }
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.015) return null;

  let bestLag = -1;
  let bestCorr = 0;
  const checkLen = Math.min(samples.length - maxLag, 1024);
  let energy = 0;
  for (let i = 0; i < checkLen; i++) {
    energy += samples[i] * samples[i];
  }
  if (energy <= 0) return null;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < checkLen; i++) {
      corr += samples[i] * samples[i + lag];
    }
    const normalized = corr / energy;
    if (normalized > bestCorr) {
      bestCorr = normalized;
      bestLag = lag;
    }
  }

  if (bestLag > 0 && bestCorr > 0.35) {
    return Math.round(sampleRate / bestLag);
  }
  return null;
}

export interface AnalyzeVoiceOptions {
  measuredDurationSec?: number;
  liveMedianHz?: number | null;
  liveBrightness?: number | null;
  liveRate?: number | null;
  profileName?: string;
  language?: string;
}

export async function analyzeVoiceAudioBlob(
  blob: Blob,
  options: number | AnalyzeVoiceOptions = 5
): Promise<ClonedVoiceProfile> {
  const opts: AnalyzeVoiceOptions =
    typeof options === 'number' ? { measuredDurationSec: options } : options;

  const sampleDataUrl = blob.size <= 1_500_000 ? await blobToDataUrl(blob) : undefined;

  let fundamentalHz = opts.liveMedianHz && opts.liveMedianHz >= 75 ? opts.liveMedianHz : 152;
  let rate =
    typeof opts.liveRate === 'number' ? Number(clamp(0.7, 1.4, opts.liveRate).toFixed(2)) : 1.0;
  let brightness =
    typeof opts.liveBrightness === 'number' ? clamp(0.1, 0.95, opts.liveBrightness) : 0.45;
  let durationSec = opts.measuredDurationSec ?? 5;
  let decodedPitchSuccess = false;

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
        const decodedF0 = estimateFundamentalHz(channelData, audioBuffer.sampleRate);
        if (decodedF0 > 0) {
          decodedPitchSuccess = true;
          fundamentalHz =
            opts.liveMedianHz && opts.liveMedianHz >= 75
              ? Math.round((decodedF0 * 0.65) + (opts.liveMedianHz * 0.35))
              : decodedF0;
        }
        const metrics = estimateSpeakingRateAndBrightness(channelData, audioBuffer.sampleRate);
        rate =
          typeof opts.liveRate === 'number'
            ? Number(clamp(0.7, 1.4, (metrics.rate + opts.liveRate) / 2).toFixed(2))
            : Number(clamp(0.7, 1.4, metrics.rate).toFixed(2));
        brightness =
          typeof opts.liveBrightness === 'number'
            ? Number(((metrics.brightness + opts.liveBrightness) / 2).toFixed(2))
            : metrics.brightness;
      } finally {
        ctx.close().catch(() => {});
      }
    }
  } catch {
    // Graceful fallback using live AnalyserNode metrics when codec cannot decode
  }

  if (!decodedPitchSuccess && opts.liveMedianHz && opts.liveMedianHz >= 75) {
    fundamentalHz = Math.round(opts.liveMedianHz);
  }

  // Map F0 (Hz) relative to neutral 155 Hz into calibration range [0.5 .. 1.8]
  const pitch = Number(clamp(0.5, 1.8, fundamentalHz / 155).toFixed(2));
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

  let preferredVoiceURI: string | undefined;
  if (isSpeechSynthesisSupported()) {
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const matched = pickSpeechVoice(
      voices,
      getBcp47ForLanguage(opts.language || 'Auto-Detect'),
      genderHint
    );
    preferredVoiceURI = matched?.voiceURI;
  }

  return {
    id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: opts.profileName?.trim() || 'Sample Voice 1',
    createdAt: Date.now(),
    durationSec,
    fundamentalHz,
    pitch,
    rate: Number(clamp(0.7, 1.4, rate).toFixed(2)),
    spectralBrightness: brightness,
    genderHint,
    timbreLabel,
    preferredVoiceURI,
    sampleDataUrl,
  };
}

export function getResolvedVoiceParameters(settings: VoiceStudioSettings): {
  label: string;
  voiceName: string;
  pitch: number;
  rate: number;
  genderHint: 'male' | 'female' | 'neutral';
  preferredVoiceURI?: string;
} {
  if (settings.activeVoiceId === 'cloned' && settings.clonedProfile) {
    return {
      label: `${settings.clonedProfile.name} (${settings.clonedProfile.timbreLabel})`,
      voiceName: settings.clonedProfile.name,
      pitch: clamp(0.5, 1.8, settings.clonedProfile.pitch),
      rate: clamp(0.7, 1.4, settings.clonedProfile.rate),
      genderHint: settings.clonedProfile.genderHint,
      preferredVoiceURI: settings.clonedProfile.preferredVoiceURI,
    };
  }

  const preset = VOICE_PRESETS.find((p) => p.id === settings.activeVoiceId) ?? VOICE_PRESETS[0];
  return {
    label: preset.label,
    voiceName: preset.label,
    pitch: preset.pitch,
    rate: preset.rate,
    genderHint: preset.genderHint,
  };
}

export function getAvailableSpeechVoices(language: string): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  if (voices.length === 0) return [];
  const bcp47 = getBcp47ForLanguage(language);
  const langPrefix = bcp47.split('-')[0].toLowerCase();
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const others = voices.filter((v) => !v.lang.toLowerCase().startsWith(langPrefix));
  return [...sameLang, ...others];
}

export function pickSpeechVoice(
  voices: SpeechSynthesisVoice[],
  bcp47Lang: string,
  genderHint: 'male' | 'female' | 'neutral',
  preferredVoiceURI?: string
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  if (preferredVoiceURI) {
    const exactMatch = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (exactMatch) return exactMatch;
  }

  const langPrefix = bcp47Lang.split('-')[0].toLowerCase();
  const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const pool = langMatches.length > 0 ? langMatches : voices;

  const maleKeywords = /(male|david|mark|daniel|george|alex|guy|christopher|ryan|arthur|liam|james|arjun|rishi|prabhat)/i;
  const femaleKeywords = /(female|samantha|victoria|karen|zira|aria|jenny|sonia|libby|sara|emma|olivia|priya|fatima|neerja|google uk english female)/i;
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

export function estimateSpeechDurationSec(rawText: string, rate = 1.0): number {
  const words = rawText.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 1;
  // Average ~2.5 words/sec at rate 1.0
  const sec = words / (2.5 * clamp(0.7, 1.4, rate));
  return Math.max(1, Math.round(sec));
}

export function unlockSpeechSynthesis(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.getVoices?.();
    if (!window.speechSynthesis.speaking) {
      const prime = new SpeechSynthesisUtterance('');
      prime.volume = 0;
      window.speechSynthesis.speak(prime);
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore mobile speech unlock errors
  }
}

export function speakWithVoiceProfile(options: {
  text: string;
  language: string;
  voiceSettings: VoiceStudioSettings;
  overrideParams?: {
    pitch: number;
    rate: number;
    genderHint: 'male' | 'female' | 'neutral';
    preferredVoiceURI?: string;
  };
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
    const resolved = options.overrideParams ?? getResolvedVoiceParameters(options.voiceSettings);

    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = bcp47;
    utterance.pitch = clamp(0.5, 1.8, resolved.pitch);
    utterance.rate = clamp(0.65, 2.0, resolved.rate * (options.speedMultiplier ?? 1));

    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const matchedVoice = pickSpeechVoice(
      voices,
      bcp47,
      resolved.genderHint,
      resolved.preferredVoiceURI
    );
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
