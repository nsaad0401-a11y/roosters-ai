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
  source: 'upload' | 'screen';
}

export interface GeneratedArtwork {
  title: string;
  description: string;
  detailedPrompt?: string;
  svgCode?: string;
  imageUrl?: string;
  provider?: 'pollinations' | 'svg';
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

export interface ClonedVoiceProfile {
  name: string;
  createdAt: number;
  durationSec: number;
  fundamentalHz: number;
  pitch: number;
  rate: number;
  spectralBrightness: number;
  genderHint: 'male' | 'female' | 'neutral';
  timbreLabel: string;
  sampleDataUrl?: string;
}

export interface VoiceStudioSettings {
  activeVoiceId: VoicePresetId;
  clonedProfile: ClonedVoiceProfile | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachment?: MessageAttachment;
  generatedImage?: GeneratedArtwork;
  generatedVideo?: GeneratedVideo;
  isError?: boolean;
  isMissingKeyPrompt?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}
