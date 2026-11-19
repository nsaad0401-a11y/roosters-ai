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
  name: string;
  mimeType: string;
  base64: string;
  dataUrl: string;
  source: 'upload' | 'screen';
}

export interface GeneratedArtwork {
  title: string;
  description: string;
  svgCode: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  width: number;
  height: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachment?: MessageAttachment;
  generatedImage?: GeneratedArtwork;
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}
