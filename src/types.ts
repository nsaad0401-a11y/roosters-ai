export type AppScreen = 'splash' | 'auth' | 'app';

export type AuthTab = 'signin' | 'create';

export interface UserAccount {
  id: string;
  fullName: string;
  email: string;
  password: string;
  createdAt: string;
}

export interface ActiveUser {
  id: string;
  fullName: string;
  email: string;
  isGuest: boolean;
}

export interface MessageAttachment {
  kind?: 'image' | 'file';
  name: string;
  mimeType: string;
  base64: string;
  dataUrl: string;
  textContent?: string;
  fileSize?: number;
  source: 'upload' | 'screen' | 'camera';
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GeneratedArtwork {
  title: string;
  description: string;
  detailedPrompt?: string;
  svgCode?: string;
  imageUrl?: string;
  provider?: 'pollinations' | 'airforce' | 'flux-hd' | 'ai-horde' | 'imagen' | 'nano-banana' | 'svg';
  modelUsed?: string;
  isEdited?: boolean;
  aspectRatio: '1:1' | '16:9' | '4:3';
  width: number;
  height: number;
}

export interface VideoScene {
  caption: string;
  visualPrompt: string;
  imageUrl: string;
}

export interface GeneratedVideo {
  title: string;
  prompt: string;
  narration: string;
  mood: 'cinematic' | 'calm' | 'epic' | 'study';
  style: string;
  heroImageUrl?: string;
  provider?: 'pollinations' | 'airforce' | 'flux-hd' | 'ai-horde' | 'imagen' | 'nano-banana' | 'svg';
  scenes: VideoScene[];
  aspectRatio: '16:9';
  createdAt: number;
}

export type VoicePresetId =
  | 'default'
  | 'deep-male'
  | 'warm-female'
  | 'energetic-youth'
  | 'news-anchor'
  | 'cloned';

export type ClonedVoiceLanguage = string;

export type VoiceAccentToneId =
  | 'pakistani-south-asian'
  | 'american'
  | 'british'
  | 'middle-eastern'
  | 'european'
  | 'natural-friendly'
  | 'deep-serious'
  | 'news-anchor';

export interface ClonedVoiceProfile {
  id?: string;
  name: string;
  createdAt: number;
  durationSec: number;
  fundamentalHz: number;
  pitch: number;
  rate: number;
  spectralBrightness: number;
  genderHint: 'male' | 'female' | 'neutral';
  timbreLabel: string;
  language?: ClonedVoiceLanguage;
  accentTone?: VoiceAccentToneId;
  preferredVoiceURI?: string;
  sampleDataUrl?: string;
}

export interface VoiceStudioSettings {
  activeVoiceId: VoicePresetId;
  clonedProfile: ClonedVoiceProfile | null;
  savedProfiles?: ClonedVoiceProfile[];
  autoSpeakReplies?: boolean;
  voiceMessageMode?: boolean;
}

export type ResponseStyleMode = 'simple' | 'detailed' | 'study';
export type VoiceGenderChoice = 'default' | 'male' | 'female';
export type SpeechSpeedChoice = 0.8 | 1.0 | 1.2;

export interface UserAppSettings {
  responseStyle: ResponseStyleMode;
  preferredLanguage: string;
  voiceGender: VoiceGenderChoice;
  speechSpeed: SpeechSpeedChoice;
  customInstructions: string;
}

export type OwnerImageModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-image-preview';

export interface OwnerConfig {
  chatModel: string;
  imageModel: OwnerImageModel;
  globalSystemPrompt: string;
  announcementEnabled: boolean;
  announcementText: string;
  maintenanceMode: boolean;
  ownerPin: string;
}


export interface MessageVoiceNote {
  voiceName: string;
  pitch: number;
  rate: number;
  genderHint: 'male' | 'female' | 'neutral';
  language?: ClonedVoiceLanguage;
  accentTone?: VoiceAccentToneId;
  preferredVoiceURI?: string;
  durationEstSec: number;
  isUserVoiceMessage?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachment?: MessageAttachment;
  generatedImage?: GeneratedArtwork;
  generatedVideo?: GeneratedVideo;
  voiceNote?: MessageVoiceNote;
  sources?: GroundingSource[];
  isDeepResearch?: boolean;
  isError?: boolean;
  isPending?: boolean;
  isMissingKeyPrompt?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}
