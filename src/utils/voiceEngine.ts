import {
  detectBcp47FromText,
  getBcp47ForLanguage,
  WORLD_LANGUAGES,
  WorldLanguageOption,
} from '../constants';
import {
  ClonedVoiceLanguage,
  ClonedVoiceProfile,
  VoiceAccentToneId,
  VoiceGenderChoice,
  VoicePresetId,
  VoiceStudioSettings,
} from '../types';
import { loadUserSettings } from './storage';

export const SAFE_PITCH_MIN = 0.82;
export const SAFE_PITCH_MAX = 1.22;
export const SAFE_RATE_MIN = 0.82;
export const SAFE_RATE_MAX = 1.22;

export const CLONED_VOICE_LANGUAGES: WorldLanguageOption[] = WORLD_LANGUAGES.filter(
  (l) => l.code !== 'Auto-Detect'
);

export interface VoiceAccentToneOption {
  id: VoiceAccentToneId;
  label: string;
  shortLabel: string;
  lahjaNote: string;
  pitchFactor: number;
  rateFactor: number;
  genderPreference?: 'male' | 'female';
}

export const VOICE_ACCENT_TONES: VoiceAccentToneOption[] = [
  {
    id: 'pakistani-south-asian',
    label: 'Pakistani / South Asian Accent',
    shortLabel: 'Pakistani / South Asian',
    lahjaNote: 'Warm Pakistani & South Asian conversational lahja',
    pitchFactor: 0.99,
    rateFactor: 0.96,
  },
  {
    id: 'american',
    label: 'American Accent',
    shortLabel: 'American',
    lahjaNote: 'Crisp modern US English cadence & pronunciation',
    pitchFactor: 1.0,
    rateFactor: 1.0,
  },
  {
    id: 'british',
    label: 'British Accent',
    shortLabel: 'British',
    lahjaNote: 'Refined UK RP cadence & articulate delivery',
    pitchFactor: 0.98,
    rateFactor: 0.97,
  },
  {
    id: 'middle-eastern',
    label: 'Middle Eastern Accent',
    shortLabel: 'Middle Eastern',
    lahjaNote: 'Expressive Gulf & Levantine melodic cadence',
    pitchFactor: 0.97,
    rateFactor: 0.96,
  },
  {
    id: 'european',
    label: 'European Accent',
    shortLabel: 'European',
    lahjaNote: 'Polished Continental European tone & clarity',
    pitchFactor: 1.01,
    rateFactor: 0.98,
  },
  {
    id: 'natural-friendly',
    label: 'Natural Friendly Tone',
    shortLabel: 'Natural Friendly',
    lahjaNote: 'Polite, expressive, everyday friendly tone',
    pitchFactor: 1.03,
    rateFactor: 0.99,
  },
  {
    id: 'deep-serious',
    label: 'Deep & Serious',
    shortLabel: 'Deep & Serious',
    lahjaNote: 'Calm, grounded baritone depth with steady pacing',
    pitchFactor: 0.88,
    rateFactor: 0.92,
    genderPreference: 'male',
  },
  {
    id: 'news-anchor',
    label: 'News Anchor Style',
    shortLabel: 'News Anchor',
    lahjaNote: 'Clear broadcast authority & balanced studio rhythm',
    pitchFactor: 0.95,
    rateFactor: 1.04,
  },
];

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
    previewLine: 'Hello! I am Roosters AI, ready to help you clearly step by step.',
  },
  {
    id: 'deep-male',
    label: 'Deep Male Mentor',
    tagline: 'Grounded baritone timbre with calm, reassuring delivery',
    pitch: 0.86,
    rate: 0.94,
    genderHint: 'male',
    previewLine: 'Welcome back. Let us break down this concept clearly and calmly.',
  },
  {
    id: 'warm-female',
    label: 'Warm Female Tutor',
    tagline: 'Gentle, encouraging tone ideal for study & explanations',
    pitch: 1.1,
    rate: 0.98,
    genderHint: 'female',
    previewLine: 'You are doing wonderfully! Let us walk through the next example together.',
  },
  {
    id: 'energetic-youth',
    label: 'Energetic Youth',
    tagline: 'Bright, upbeat pace for quick coding & brainstorms',
    pitch: 1.12,
    rate: 1.08,
    genderHint: 'neutral',
    previewLine: 'Awesome idea! Here is the fastest way to build and test this project.',
  },
  {
    id: 'news-anchor',
    label: 'News Anchor',
    tagline: 'Crisp studio articulation and authoritative broadcast cadence',
    pitch: 0.94,
    rate: 1.04,
    genderHint: 'male',
    previewLine: 'Good day. Here is a clear executive summary of your topic.',
  },
];

function clamp(min: number, max: number, val: number): number {
  return Math.max(min, Math.min(max, val));
}

export function normalizeClonedVoiceLanguage(raw?: string): ClonedVoiceLanguage {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === 'Auto-Detect') return 'English';
  const match = WORLD_LANGUAGES.find(
    (l) => l.code.toLowerCase() === trimmed.toLowerCase() && l.code !== 'Auto-Detect'
  );
  return match?.code ?? trimmed;
}

export function getAccentToneMeta(id?: VoiceAccentToneId): VoiceAccentToneOption {
  return (
    VOICE_ACCENT_TONES.find((a) => a.id === id) ??
    VOICE_ACCENT_TONES.find((a) => a.id === 'natural-friendly') ??
    VOICE_ACCENT_TONES[0]
  );
}

export function resolveBcp47ForVoice(
  language?: string,
  accentTone?: VoiceAccentToneId,
  textHint?: string
): string {
  const normalizedLang = language?.trim() || 'Auto-Detect';

  if (normalizedLang === 'Auto-Detect') {
    if (textHint?.trim()) {
      return detectBcp47FromText(textHint);
    }
    return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
  }

  if (normalizedLang === 'English') {
    if (accentTone === 'british') return 'en-GB';
    if (accentTone === 'pakistani-south-asian') return 'en-IN';
    if (accentTone === 'european') return 'en-IE';
    return 'en-US';
  }
  if (normalizedLang === 'Urdu' || normalizedLang === 'Roman Urdu' || normalizedLang === 'Saraiki') {
    return 'ur-PK';
  }
  if (normalizedLang === 'Hindi' || normalizedLang === 'Roman Hindi') {
    return 'hi-IN';
  }
  if (normalizedLang === 'Arabic') {
    return accentTone === 'middle-eastern' ? 'ar-AE' : 'ar-SA';
  }
  if (normalizedLang === 'Spanish') {
    return accentTone === 'american' ? 'es-US' : 'es-ES';
  }
  return getBcp47ForLanguage(normalizedLang);
}

export function getSamplePreviewText(
  language: ClonedVoiceLanguage,
  accentTone: VoiceAccentToneId,
  profileName: string
): string {
  const accentLabel = getAccentToneMeta(accentTone).shortLabel;
  switch (language) {
    case 'Urdu':
    case 'Roman Urdu':
      return `Assalam-o-Alaikum! Main ${profileName} hoon, aur ab main ${accentLabel} lahjay mein bilkul saaf bol raha hoon.`;
    case 'Hindi':
    case 'Roman Hindi':
      return `Namaste! Main ${profileName} hoon, aur ab main ${accentLabel} style mein bilkul saaf bol raha hoon.`;
    case 'Arabic':
      return `Marhaban! Ana ${profileName}, atahaddathu al-aan bi-nibratin wadihatin wa tabi-iyyah.`;
    case 'Punjabi':
      return `Sat Sri Akal te Assalam-o-Alaikum! Main ${profileName} haan, bilkul saaf te qudrati awaaz vich.`;
    case 'Pashto':
      return `Assalam-o-Alaikum! Za ${profileName} yam, da ${accentLabel} pah lahja ke khabare kawam.`;
    case 'Persian':
      return `Salam! Man ${profileName} hastam va ba sedaye tabiee va shafaf sohbat mikonam.`;
    case 'Spanish':
      return `Hola! Soy ${profileName}, hablando ahora con una entonación clara y natural.`;
    case 'French':
      return `Bonjour! Je suis ${profileName}, je parle maintenant avec une voix claire et naturelle.`;
    case 'German':
      return `Hallo! Ich bin ${profileName} und spreche jetzt mit einer klaren und natürlichen Stimme.`;
    case 'Turkish':
      return `Merhaba! Ben ${profileName}, şimdi net ve doğal bir ses tonuyla konuşuyorum.`;
    case 'Portuguese':
      return `Olá! Eu sou ${profileName}, falando agora com uma voz clara e natural.`;
    case 'Chinese (Simplified)':
    case 'Chinese (Traditional)':
      return `你好！我是${profileName}，现在正在用清晰自然的声音为您朗读。`;
    case 'Japanese':
      return `こんにちは！${profileName}です。今、自然で聞き取りやすい声でお話ししています。`;
    case 'Korean':
      return `안녕하세요! 저는 ${profileName}입니다. 지금 자연스럽고 또렷한 목소리로 말하고 있습니다.`;
    case 'Russian':
      return `Привет! Меня зовут ${profileName}, сейчас я говорю чистым и естественным голосом.`;
    case 'English':
      if (accentTone === 'british') {
        return `Good day! This is ${profileName}, speaking clearly in a refined British tone.`;
      }
      if (accentTone === 'pakistani-south-asian') {
        return `Assalam-o-Alaikum and hello! This is ${profileName}, calibrated in a warm South Asian tone.`;
      }
      return `Hello! This is ${profileName}, calibrated clearly with a ${accentLabel.toLowerCase()} voice.`;
    default:
      return `Hello! This is ${profileName}, calibrated for ${language} with a ${accentLabel.toLowerCase()} tone.`;
  }
}

export function getClonedVoiceLiveTalkInstruction(profile: ClonedVoiceProfile): string {
  const lang = normalizeClonedVoiceLanguage(profile.language);
  const accent = getAccentToneMeta(profile.accentTone);
  const parts: string[] = [
    `Voice Persona Active ("${profile.name}"):`,
    `Primary spoken language preference: ${lang}.`,
    `Speaking tone & accent (lahja): ${accent.label} (${accent.lahjaNote}).`,
  ];
  if ((lang === 'Urdu' || lang === 'Roman Urdu') && accent.id === 'pakistani-south-asian') {
    parts.push('Use natural conversational Pakistani Urdu or Roman Urdu phrasing suitable for spoken voice.');
  } else if (accent.id === 'british') {
    parts.push('Use polite, natural British English phrasing.');
  } else if (accent.id === 'middle-eastern') {
    parts.push('Speak with warm, hospitable Middle Eastern conversational cadence.');
  } else if (accent.id === 'european') {
    parts.push('Speak with polite, articulate European phrasing.');
  } else if (accent.id === 'deep-serious') {
    parts.push('Keep sentences concise, calm, and thoughtful.');
  } else if (accent.id === 'news-anchor') {
    parts.push('Keep delivery crisp, structured, and broadcast-ready.');
  }
  return parts.join(' ');
}

function estimateFundamentalHz(samples: Float32Array, sampleRate: number): number {
  const minHz = 80;
  const maxHz = 310;
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

    if (bestLag > 0 && bestCorr > 0.34) {
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
  let zeroCrossings = 0;
  const sampleLimit = Math.min(samples.length, sampleRate * 8);
  for (let i = 1; i < sampleLimit; i++) {
    if ((samples[i - 1] >= 0 && samples[i] < 0) || (samples[i - 1] < 0 && samples[i] >= 0)) {
      zeroCrossings++;
    }
  }
  const zcrPerSec = sampleLimit > 0 ? zeroCrossings / (sampleLimit / sampleRate) : 1200;
  const brightness = clamp(0.1, 0.95, (zcrPerSec - 400) / 2800);

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
  // Natural speech speed window [0.90 .. 1.12] to avoid rushed or sluggish distortion
  const rate = Number(clamp(0.9, 1.12, 0.91 + (peaksPerSec / 6.5) * 0.19).toFixed(2));
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
  const minHz = 80;
  const maxHz = 310;
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
  language?: ClonedVoiceLanguage;
  accentTone?: VoiceAccentToneId;
}

export async function analyzeVoiceAudioBlob(
  blob: Blob,
  options: number | AnalyzeVoiceOptions = 5
): Promise<ClonedVoiceProfile> {
  const opts: AnalyzeVoiceOptions =
    typeof options === 'number' ? { measuredDurationSec: options } : options;

  const selectedLanguage = normalizeClonedVoiceLanguage(opts.language);
  const selectedAccent: VoiceAccentToneId = opts.accentTone ?? 'natural-friendly';
  const sampleDataUrl = blob.size <= 1_200_000 ? await blobToDataUrl(blob) : undefined;

  let fundamentalHz = opts.liveMedianHz && opts.liveMedianHz >= 75 ? opts.liveMedianHz : 152;
  let rate =
    typeof opts.liveRate === 'number'
      ? Number(clamp(0.86, 1.14, opts.liveRate).toFixed(2))
      : 1.0;
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
              ? Math.round(decodedF0 * 0.65 + opts.liveMedianHz * 0.35)
              : decodedF0;
        }
        const metrics = estimateSpeakingRateAndBrightness(channelData, audioBuffer.sampleRate);
        rate =
          typeof opts.liveRate === 'number'
            ? Number(clamp(0.86, 1.14, (metrics.rate + opts.liveRate) / 2).toFixed(2))
            : Number(clamp(0.86, 1.14, metrics.rate).toFixed(2));
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

  // Gentle natural pitch mapping [0.86 .. 1.16] prevents robotic formant artifacts
  const pitch = Number(clamp(0.86, 1.16, 0.86 + ((fundamentalHz - 85) / 180) * 0.28).toFixed(2));
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
    const targetBcp47 = resolveBcp47ForVoice(selectedLanguage, selectedAccent);
    const matched = pickSpeechVoice(voices, targetBcp47, genderHint, undefined, selectedAccent);
    preferredVoiceURI = matched?.voiceURI;
  }

  return {
    id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: opts.profileName?.trim() || 'Custom Voice 1',
    createdAt: Date.now(),
    durationSec,
    fundamentalHz,
    pitch,
    rate: Number(clamp(SAFE_RATE_MIN, SAFE_RATE_MAX, rate).toFixed(2)),
    spectralBrightness: brightness,
    genderHint,
    timbreLabel,
    language: selectedLanguage,
    accentTone: selectedAccent,
    preferredVoiceURI,
    sampleDataUrl,
  };
}

export function getResolvedVoiceParameters(
  settings: VoiceStudioSettings,
  preferredGender?: VoiceGenderChoice
): {
  label: string;
  voiceName: string;
  pitch: number;
  rate: number;
  genderHint: 'male' | 'female' | 'neutral';
  language?: ClonedVoiceLanguage;
  accentTone?: VoiceAccentToneId;
  preferredVoiceURI?: string;
} {
  if (settings.activeVoiceId === 'cloned' && settings.clonedProfile) {
    const profile = settings.clonedProfile;
    const accent = getAccentToneMeta(profile.accentTone);
    const lang = normalizeClonedVoiceLanguage(profile.language);
    const finalPitch = Number(clamp(SAFE_PITCH_MIN, SAFE_PITCH_MAX, profile.pitch * accent.pitchFactor).toFixed(2));
    const finalRate = Number(clamp(SAFE_RATE_MIN, SAFE_RATE_MAX, profile.rate * accent.rateFactor).toFixed(2));
    const effectiveGender = accent.genderPreference ?? profile.genderHint;

    return {
      label: `${profile.name} (${lang} · ${accent.shortLabel})`,
      voiceName: profile.name,
      pitch: finalPitch,
      rate: finalRate,
      genderHint: effectiveGender,
      language: lang,
      accentTone: accent.id,
      preferredVoiceURI: profile.preferredVoiceURI,
    };
  }

  const preset = VOICE_PRESETS.find((p) => p.id === settings.activeVoiceId) ?? VOICE_PRESETS[0];
  let genderHint = preset.genderHint;
  let pitch = preset.pitch;
  if (preferredGender === 'male') {
    genderHint = 'male';
    if (preset.id === 'default') pitch = 0.9;
  } else if (preferredGender === 'female') {
    genderHint = 'female';
    if (preset.id === 'default') pitch = 1.08;
  }

  return {
    label: preset.label,
    voiceName: preset.label,
    pitch: clamp(SAFE_PITCH_MIN, SAFE_PITCH_MAX, pitch),
    rate: clamp(SAFE_RATE_MIN, SAFE_RATE_MAX, preset.rate),
    genderHint,
  };
}

export function getAvailableSpeechVoices(
  language: string,
  accentTone?: VoiceAccentToneId
): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  if (voices.length === 0) return [];
  const bcp47 = resolveBcp47ForVoice(language, accentTone);
  const langPrefix = bcp47.split('-')[0].toLowerCase();
  const sameExact = voices.filter((v) => v.lang.toLowerCase() === bcp47.toLowerCase());
  const samePrefix = voices.filter(
    (v) => v.lang.toLowerCase().startsWith(langPrefix) && v.lang.toLowerCase() !== bcp47.toLowerCase()
  );
  const others = voices.filter((v) => !v.lang.toLowerCase().startsWith(langPrefix));
  return [...sameExact, ...samePrefix, ...others];
}

export function pickSpeechVoice(
  voices: SpeechSynthesisVoice[],
  bcp47Lang: string,
  genderHint: 'male' | 'female' | 'neutral',
  preferredVoiceURI?: string,
  accentTone?: VoiceAccentToneId
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const langPrefix = bcp47Lang.split('-')[0].toLowerCase();

  if (preferredVoiceURI) {
    const exactMatch = voices.find((v) => v.voiceURI === preferredVoiceURI);
    // Only reuse preferredVoiceURI if its language family matches target language
    if (exactMatch && exactMatch.lang.toLowerCase().startsWith(langPrefix)) {
      return exactMatch;
    }
  }

  let langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  // If Urdu TTS voice pack isn't installed on device, gracefully try Hindi/South Asian English before generic fallback
  if (langMatches.length === 0 && langPrefix === 'ur') {
    langMatches = voices.filter(
      (v) =>
        v.lang.toLowerCase().startsWith('hi') ||
        v.lang.toLowerCase() === 'en-in' ||
        /(urdu|hindi|pakistan|india|heera|ravi|neerja|prabhat)/i.test(v.name)
    );
  }
  const pool = langMatches.length > 0 ? langMatches : voices;

  const maleKeywords = /(male|david|mark|daniel|george|alex|guy|christopher|ryan|arthur|liam|james|arjun|rishi|prabhat|ravi|asad|salman|maged|tarik)/i;
  const femaleKeywords = /(female|samantha|victoria|karen|zira|aria|jenny|sonia|libby|sara|emma|olivia|priya|fatima|neerja|heera|uzma|leila|monica|paulina|google uk english female)/i;
  const qualityKeywords = /(natural|neural|online|google|microsoft|enhanced|premium)/i;

  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -999;

  for (const voice of pool) {
    let score = 0;
    const vLang = voice.lang.toLowerCase();
    const vName = voice.name;

    if (vLang === bcp47Lang.toLowerCase()) score += 16;
    else if (vLang.startsWith(langPrefix)) score += 9;

    if (qualityKeywords.test(vName)) score += 6;

    // Accent-specific scoring
    if (accentTone === 'pakistani-south-asian') {
      if (/(ur-pk|ur-in|hi-in|en-in|en-pk)/i.test(vLang) || /(pakistan|urdu|india|hindi|heera|ravi|neerja|prabhat|uzma|asad|lekha|veena|rishi)/i.test(vName)) {
        score += 18;
      }
    } else if (accentTone === 'british') {
      if (vLang === 'en-gb' || /(uk|british|england|daniel|sonia|libby|george|kate|hazel|serena)/i.test(vName)) {
        score += 18;
      }
    } else if (accentTone === 'american') {
      if (vLang === 'en-us' || vLang === 'es-us' || /(united states|us english|samantha|alex|aria|jenny|guy|david|zira|mark)/i.test(vName)) {
        score += 18;
      }
    } else if (accentTone === 'middle-eastern') {
      if (/^(ar-|fa-|tr-|he-)/i.test(vLang) || /(arabic|maged|tarik|leila|salma|hoda|naayf|zeina|mehdi)/i.test(vName)) {
        score += 18;
      }
    } else if (accentTone === 'european') {
      if (/^(en-gb|en-ie|fr-|de-|es-es|it-|nl-|pt-|sv-|pl-)/i.test(vLang) || /(europe|french|german|spanish|italian|thomas|amélie|anna|monica|elsa)/i.test(vName)) {
        score += 18;
      }
    } else if (accentTone === 'deep-serious') {
      if (maleKeywords.test(vName)) score += 14;
    } else if (accentTone === 'news-anchor') {
      if (/(natural|neural|online|daniel|aria|jenny|guy|mark|george|ravi)/i.test(vName)) score += 10;
    }

    if (genderHint === 'male') {
      if (maleKeywords.test(vName)) score += 12;
      if (femaleKeywords.test(vName)) score -= 8;
    } else if (genderHint === 'female') {
      if (femaleKeywords.test(vName)) score += 12;
      if (maleKeywords.test(vName)) score -= 8;
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
  const sec = words / (2.5 * clamp(SAFE_RATE_MIN, SAFE_RATE_MAX, rate));
  return Math.max(1, Math.round(sec));
}

export function unlockSpeechSynthesis(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.getVoices?.();
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      const prime = new SpeechSynthesisUtterance(' ');
      prime.volume = 0;
      window.speechSynthesis.speak(prime);
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore mobile speech unlock errors
  }
}

function splitIntoNaturalSpeechChunks(text: string, maxLen = 210): string[] {
  const normalized = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[*_`#>~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];
  if (normalized.length <= maxLen) return [normalized];

  const sentences = normalized.split(/(?<=[.!?۔؟\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    if ((current ? `${current} ${sentence}` : sentence).length <= maxLen) {
      current = current ? `${current} ${sentence}` : sentence;
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxLen) {
        current = sentence;
      } else {
        // Split very long clause at commas or spaces
        const words = sentence.split(/\s+/);
        let sub = '';
        for (const w of words) {
          if ((sub ? `${sub} ${w}` : w).length <= maxLen) {
            sub = sub ? `${sub} ${w}` : w;
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        current = sub;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

let activeSpeechToken = 0;

export function cancelVoicePlayback(): void {
  activeSpeechToken += 1;
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore cancel errors
  }
}

export function speakWithVoiceProfile(options: {
  text: string;
  language: string;
  voiceSettings: VoiceStudioSettings;
  voiceGender?: VoiceGenderChoice;
  overrideParams?: {
    pitch: number;
    rate: number;
    genderHint: 'male' | 'female' | 'neutral';
    language?: ClonedVoiceLanguage;
    accentTone?: VoiceAccentToneId;
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
    cancelVoicePlayback();
  }

  const myToken = activeSpeechToken;

  try {
    const userPrefs = loadUserSettings();
    const resolved =
      options.overrideParams ??
      getResolvedVoiceParameters(options.voiceSettings, options.voiceGender ?? userPrefs.voiceGender);

    const effectiveAccent: VoiceAccentToneId | undefined =
      options.overrideParams?.accentTone ??
      ('accentTone' in resolved ? resolved.accentTone : undefined);

    const effectiveLanguage =
      options.overrideParams?.language ??
      ('language' in resolved && resolved.language ? resolved.language : undefined) ??
      options.language;

    const accentMeta = effectiveAccent ? getAccentToneMeta(effectiveAccent) : null;
    const bcp47 = resolveBcp47ForVoice(effectiveLanguage, effectiveAccent, trimmed);

    const accentPitchMultiplier =
      options.overrideParams && accentMeta ? accentMeta.pitchFactor : 1.0;
    const accentRateMultiplier =
      options.overrideParams && accentMeta ? accentMeta.rateFactor : 1.0;

    const effectiveSpeed = options.speedMultiplier ?? userPrefs.speechSpeed ?? 1.0;
    const safePitch = clamp(SAFE_PITCH_MIN, SAFE_PITCH_MAX, resolved.pitch * accentPitchMultiplier);
    const safeRate = clamp(
      SAFE_RATE_MIN,
      SAFE_RATE_MAX,
      resolved.rate * accentRateMultiplier * (effectiveSpeed === 1.0 ? 1.0 : 0.92 + (effectiveSpeed - 1.0) * 0.6)
    );

    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const matchedVoice = pickSpeechVoice(
      voices,
      bcp47,
      resolved.genderHint,
      resolved.preferredVoiceURI,
      effectiveAccent
    );

    const chunks = splitIntoNaturalSpeechChunks(trimmed);
    if (chunks.length === 0) {
      options.onEnd?.();
      return null;
    }

    let firstUtterance: SpeechSynthesisUtterance | null = null;

    const speakChunkAt = (index: number) => {
      if (myToken !== activeSpeechToken && options.cancelPrevious !== false) return;
      if (index >= chunks.length) {
        options.onEnd?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = bcp47;
      utterance.pitch = safePitch;
      utterance.rate = safeRate;
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      if (index === 0) {
        utterance.onstart = () => options.onStart?.();
        firstUtterance = utterance;
      }
      utterance.onend = () => {
        if (options.cancelPrevious !== false && myToken !== activeSpeechToken) return;
        speakChunkAt(index + 1);
      };
      utterance.onerror = () => {
        if (options.cancelPrevious !== false && myToken !== activeSpeechToken) return;
        options.onError?.();
      };

      window.speechSynthesis.speak(utterance);
    };

    speakChunkAt(0);
    return firstUtterance;
  } catch {
    options.onError?.();
    return null;
  }
}
