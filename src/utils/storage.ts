import { ChatSession, UserAccount } from '../types';
import { DEFAULT_THEME_SETTINGS, ThemeSettings } from '../themes';

const ACCOUNTS_KEY = 'roosters_ai_accounts_v1';
const CHATS_PREFIX = 'roosters_ai_chats_v1_';
const THEME_KEY = 'roosters_ai_theme_v1';

let memoryAccounts: UserAccount[] = [];
const memoryChats = new Map<string, ChatSession[]>();
let memoryTheme: ThemeSettings = DEFAULT_THEME_SETTINGS;

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or restricted-mode errors; memory fallback remains active
  }
}

export function loadAccounts(): UserAccount[] {
  const raw = safeGetItem(ACCOUNTS_KEY);
  if (!raw) return memoryAccounts;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryAccounts = parsed;
      return parsed;
    }
  } catch {
    // Ignore malformed JSON
  }
  return memoryAccounts;
}

export function saveAccounts(accounts: UserAccount[]): void {
  memoryAccounts = accounts;
  safeSetItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function registerAccount(fullName: string, email: string, password: string): { ok: true; account: UserAccount } | { ok: false; error: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();
  const accounts = loadAccounts();

  const existing = accounts.find((acc) => acc.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return {
      ok: false,
      error: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const newAccount: UserAccount = {
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fullName: trimmedName,
    email: normalizedEmail,
    password,
    createdAt: new Date().toISOString(),
  };

  saveAccounts([...accounts, newAccount]);
  return { ok: true, account: newAccount };
}

export function authenticateAccount(email: string, password: string): { ok: true; account: UserAccount } | { ok: false; error: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = loadAccounts();
  const match = accounts.find((acc) => acc.email.toLowerCase() === normalizedEmail);

  if (!match) {
    return {
      ok: false,
      error: 'No account found with this email. Switch to Create Account or Continue as Guest.',
    };
  }

  if (match.password !== password) {
    return {
      ok: false,
      error: 'Incorrect password. Please try again.',
    };
  }

  return { ok: true, account: match };
}

export function loadUserChats(userId: string): ChatSession[] {
  const raw = safeGetItem(`${CHATS_PREFIX}${userId}`);
  if (!raw) return memoryChats.get(userId) ?? [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryChats.set(userId, parsed);
      return parsed;
    }
  } catch {
    // Ignore malformed JSON
  }
  return memoryChats.get(userId) ?? [];
}

export function saveUserChats(userId: string, sessions: ChatSession[]): void {
  memoryChats.set(userId, sessions);
  const compactSessions = sessions.slice(0, 20).map((session) => ({
    ...session,
    messages: session.messages.map((msg) => ({
      ...msg,
      attachment: msg.attachment
        ? {
            ...msg.attachment,
            base64: '',
            dataUrl: msg.attachment.dataUrl.length < 180000 ? msg.attachment.dataUrl : '',
            textContent:
              typeof msg.attachment.textContent === 'string' && msg.attachment.textContent.length > 25000
                ? msg.attachment.textContent.slice(0, 25000)
                : msg.attachment.textContent,
          }
        : undefined,
    })),
  }));
  safeSetItem(`${CHATS_PREFIX}${userId}`, JSON.stringify(compactSessions));
}

export function loadThemeSettings(): ThemeSettings {
  const raw = safeGetItem(THEME_KEY);
  if (!raw) return memoryTheme;
  try {
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    if (parsed && parsed.themeId && parsed.wallpaperId) {
      const merged: ThemeSettings = {
        themeId: parsed.themeId,
        wallpaperId: parsed.wallpaperId,
        customWallpaperUrl: typeof parsed.customWallpaperUrl === 'string' ? parsed.customWallpaperUrl : '',
        liteMode: Boolean(parsed.liteMode),
      };
      memoryTheme = merged;
      return merged;
    }
  } catch {
    // Ignore malformed JSON
  }
  return memoryTheme;
}

export function saveThemeSettings(settings: ThemeSettings): void {
  memoryTheme = settings;
  safeSetItem(THEME_KEY, JSON.stringify(settings));
}

const CUSTOM_API_KEY_STORAGE = 'roosters_ai_custom_api_key_v1';
let memoryApiKey = '';

export type ApiKeyProvider = 'gemini' | 'groq' | 'unknown' | 'none';

export function detectApiKeyProvider(rawKey: string): ApiKeyProvider {
  const key = rawKey.trim();
  if (!key) return 'none';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('AIza')) return 'gemini';
  return 'unknown';
}

export function loadCustomApiKey(): string {
  const raw = safeGetItem(CUSTOM_API_KEY_STORAGE);
  if (raw !== null) {
    memoryApiKey = raw.trim();
    return memoryApiKey;
  }
  return memoryApiKey;
}

export function saveCustomApiKey(rawKey: string): void {
  const trimmed = rawKey.trim();
  memoryApiKey = trimmed;
  if (!trimmed) {
    try {
      window.localStorage.removeItem(CUSTOM_API_KEY_STORAGE);
    } catch {
      // Ignore storage errors
    }
    return;
  }
  safeSetItem(CUSTOM_API_KEY_STORAGE, trimmed);
}

const VOICE_SETTINGS_KEY = 'roosters_ai_voice_v1';
const DEFAULT_VOICE_SETTINGS: import('../types').VoiceStudioSettings = {
  activeVoiceId: 'default',
  clonedProfile: null,
  savedProfiles: [],
  autoSpeakReplies: true,
  voiceMessageMode: false,
};
let memoryVoiceSettings: import('../types').VoiceStudioSettings = DEFAULT_VOICE_SETTINGS;

const memorySampleAudioMap = new Map<string, string>();

function getProfileStorageKey(profile: import('../types').ClonedVoiceProfile): string {
  return profile.id || String(profile.createdAt);
}

function hydrateProfileSample(
  profile: import('../types').ClonedVoiceProfile
): import('../types').ClonedVoiceProfile {
  if (profile.sampleDataUrl) {
    memorySampleAudioMap.set(getProfileStorageKey(profile), profile.sampleDataUrl);
    return profile;
  }
  const cached = memorySampleAudioMap.get(getProfileStorageKey(profile));
  return cached ? { ...profile, sampleDataUrl: cached } : profile;
}

export function loadVoiceSettings(): import('../types').VoiceStudioSettings {
  const raw = safeGetItem(VOICE_SETTINGS_KEY);
  if (!raw) return memoryVoiceSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<import('../types').VoiceStudioSettings>;
    if (parsed && parsed.activeVoiceId) {
      const cloned = parsed.clonedProfile ? hydrateProfileSample(parsed.clonedProfile) : null;
      const savedRaw = Array.isArray(parsed.savedProfiles)
        ? parsed.savedProfiles
        : cloned
          ? [cloned]
          : [];
      const merged: import('../types').VoiceStudioSettings = {
        activeVoiceId: parsed.activeVoiceId,
        clonedProfile: cloned,
        savedProfiles: savedRaw.map(hydrateProfileSample),
        autoSpeakReplies: parsed.autoSpeakReplies ?? true,
        voiceMessageMode: Boolean(parsed.voiceMessageMode),
      };
      memoryVoiceSettings = merged;
      return merged;
    }
  } catch {
    // Ignore malformed JSON
  }
  return memoryVoiceSettings;
}

function compactClonedProfileForStorage(
  profile: import('../types').ClonedVoiceProfile
): import('../types').ClonedVoiceProfile {
  if (profile.sampleDataUrl) {
    memorySampleAudioMap.set(getProfileStorageKey(profile), profile.sampleDataUrl);
  }
  return {
    ...profile,
    sampleDataUrl:
      profile.sampleDataUrl && profile.sampleDataUrl.length < 450_000
        ? profile.sampleDataUrl
        : undefined,
  };
}

export function saveVoiceSettings(settings: import('../types').VoiceStudioSettings): void {
  const hydratedSaved = (settings.savedProfiles ?? []).slice(0, 6).map(hydrateProfileSample);
  const hydratedCloned = settings.clonedProfile
    ? hydrateProfileSample(settings.clonedProfile)
    : null;

  memoryVoiceSettings = {
    activeVoiceId: settings.activeVoiceId,
    clonedProfile: hydratedCloned,
    savedProfiles: hydratedSaved,
    autoSpeakReplies: settings.autoSpeakReplies ?? true,
    voiceMessageMode: Boolean(settings.voiceMessageMode),
  };

  const compactForLocalStorage: import('../types').VoiceStudioSettings = {
    activeVoiceId: settings.activeVoiceId,
    clonedProfile: hydratedCloned ? compactClonedProfileForStorage(hydratedCloned) : null,
    savedProfiles: hydratedSaved.map(compactClonedProfileForStorage),
    autoSpeakReplies: settings.autoSpeakReplies ?? true,
    voiceMessageMode: Boolean(settings.voiceMessageMode),
  };
  safeSetItem(VOICE_SETTINGS_KEY, JSON.stringify(compactForLocalStorage));
}


