export type ThemeId =
  | 'gold-cyan'
  | 'emerald-matrix'
  | 'royal-purple'
  | 'midnight-crimson'
  | 'clean-light';

export type WallpaperId =
  | 'solid'
  | 'stars'
  | 'grid'
  | 'study-gradient'
  | 'custom';

export interface AppTheme {
  id: ThemeId;
  name: string;
  description: string;
  isLight: boolean;
  previewColors: [string, string, string];
  // Surfaces
  canvasBg: string;
  headerBg: string;
  sidebarBg: string;
  cardBg: string;
  inputBg: string;
  subSurfaceBg: string;
  borderColor: string;
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Accents
  accentPrimary: string;
  accentSecondary: string;
  userBubbleGradient: string;
  sendButtonGradient: string;
  sendButtonText: string;
  sendButtonGlow: string;
  codeBlockBg: string;
  codeHeaderBg: string;
  liteMode?: boolean;
}

export const APP_THEMES: Record<ThemeId, AppTheme> = {
  'gold-cyan': {
    id: 'gold-cyan',
    name: 'Default Gold & Neon Cyan',
    description: 'Signature Roosters AI obsidian palette',
    isLight: false,
    previewColors: ['#0d1017', '#ffd700', '#00d4ff'],
    canvasBg: '#0d1017',
    headerBg: '#090b10',
    sidebarBg: '#090b10',
    cardBg: '#121622',
    inputBg: '#121622',
    subSurfaceBg: '#090b10',
    borderColor: '#1f293d',
    textPrimary: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    accentPrimary: '#ffd700',
    accentSecondary: '#00d4ff',
    userBubbleGradient: 'linear-gradient(135deg, #0284c7 0%, #00b4d8 100%)',
    sendButtonGradient: 'linear-gradient(90deg, #ffd700 0%, #f59e0b 100%)',
    sendButtonText: '#050608',
    sendButtonGlow: '0 0 20px rgba(255, 215, 0, 0.38)',
    codeBlockBg: '#090b10',
    codeHeaderBg: '#0f1420',
  },
  'emerald-matrix': {
    id: 'emerald-matrix',
    name: 'Emerald Matrix Dark',
    description: 'Crisp emerald & mint focus mode',
    isLight: false,
    previewColors: ['#07110d', '#10b981', '#34d399'],
    canvasBg: '#07110d',
    headerBg: '#050c09',
    sidebarBg: '#050c09',
    cardBg: '#0d1b15',
    inputBg: '#0d1b15',
    subSurfaceBg: '#07110d',
    borderColor: '#1a362b',
    textPrimary: '#ecfdf5',
    textSecondary: '#a7f3d0',
    textMuted: '#6ee7b7',
    accentPrimary: '#34d399',
    accentSecondary: '#10b981',
    userBubbleGradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    sendButtonGradient: 'linear-gradient(90deg, #34d399 0%, #10b981 100%)',
    sendButtonText: '#022c22',
    sendButtonGlow: '0 0 20px rgba(16, 185, 129, 0.36)',
    codeBlockBg: '#050c09',
    codeHeaderBg: '#0a1812',
  },
  'royal-purple': {
    id: 'royal-purple',
    name: 'Royal Cyber Purple',
    description: 'Deep violet with electric sky highlights',
    isLight: false,
    previewColors: ['#0d0917', '#a855f7', '#38bdf8'],
    canvasBg: '#0d0917',
    headerBg: '#08050f',
    sidebarBg: '#08050f',
    cardBg: '#161026',
    inputBg: '#161026',
    subSurfaceBg: '#0c0816',
    borderColor: '#2d2147',
    textPrimary: '#f5f3ff',
    textSecondary: '#ddd6fe',
    textMuted: '#a78bfa',
    accentPrimary: '#c084fc',
    accentSecondary: '#38bdf8',
    userBubbleGradient: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
    sendButtonGradient: 'linear-gradient(90deg, #c084fc 0%, #38bdf8 100%)',
    sendButtonText: '#090514',
    sendButtonGlow: '0 0 20px rgba(168, 85, 247, 0.36)',
    codeBlockBg: '#08050f',
    codeHeaderBg: '#110c1e',
  },
  'midnight-crimson': {
    id: 'midnight-crimson',
    name: 'Midnight Crimson',
    description: 'Warm obsidian with rose-amber energy',
    isLight: false,
    previewColors: ['#12080c', '#f43f5e', '#fbbf24'],
    canvasBg: '#12080c',
    headerBg: '#0b0507',
    sidebarBg: '#0b0507',
    cardBg: '#1b0e14',
    inputBg: '#1b0e14',
    subSurfaceBg: '#11080c',
    borderColor: '#3b1c28',
    textPrimary: '#fff1f2',
    textSecondary: '#fecdd3',
    textMuted: '#fda4af',
    accentPrimary: '#fbbf24',
    accentSecondary: '#f43f5e',
    userBubbleGradient: 'linear-gradient(135deg, #be123c 0%, #f43f5e 100%)',
    sendButtonGradient: 'linear-gradient(90deg, #fbbf24 0%, #f43f5e 100%)',
    sendButtonText: '#140508',
    sendButtonGlow: '0 0 20px rgba(244, 63, 94, 0.36)',
    codeBlockBg: '#0b0507',
    codeHeaderBg: '#170b10',
  },
  'clean-light': {
    id: 'clean-light',
    name: 'Clean Study Light Mode',
    description: 'High-contrast daylight reading surface',
    isLight: true,
    previewColors: ['#f8fafc', '#0284c7', '#d97706'],
    canvasBg: '#f4f6fa',
    headerBg: '#ffffff',
    sidebarBg: '#ffffff',
    cardBg: '#ffffff',
    inputBg: '#ffffff',
    subSurfaceBg: '#eef2f7',
    borderColor: '#cbd5e1',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    accentPrimary: '#d97706',
    accentSecondary: '#0284c7',
    userBubbleGradient: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
    sendButtonGradient: 'linear-gradient(90deg, #f59e0b 0%, #eab308 100%)',
    sendButtonText: '#0f172a',
    sendButtonGlow: '0 4px 14px rgba(217, 119, 6, 0.25)',
    codeBlockBg: '#0f172a',
    codeHeaderBg: '#1e293b',
  },
};

export interface WallpaperOption {
  id: WallpaperId;
  name: string;
  description: string;
}

export const BUILTIN_WALLPAPERS: WallpaperOption[] = [
  { id: 'solid', name: 'Solid Clean', description: 'Distraction-free solid surface' },
  { id: 'stars', name: 'Subtle Stars', description: 'Soft cosmic starfield pattern' },
  { id: 'grid', name: 'Cyber Grid', description: 'Minimal architectural blueprint lines' },
  { id: 'study-gradient', name: 'Calm Study Gradient', description: 'Gentle ambient horizon glow' },
];

export interface ThemeSettings {
  themeId: ThemeId;
  wallpaperId: WallpaperId;
  customWallpaperUrl: string;
  liteMode?: boolean;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  themeId: 'gold-cyan',
  wallpaperId: 'solid',
  customWallpaperUrl: '',
  liteMode: false,
};
