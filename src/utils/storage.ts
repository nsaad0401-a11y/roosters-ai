import {
  ActiveUser,
  ChatSession,
  OwnerConfig,
  OwnerImageModel,
  ResponseStyleMode,
  SpeechSpeedChoice,
  UserAccount,
  UserAppSettings,
  VoiceGenderChoice,
} from '../types';
import { DEFAULT_THEME_SETTINGS, ThemeSettings } from '../themes';

const ACCOUNTS_KEY = 'roosters_ai_accounts_v1';
const CHATS_PREFIX = 'roosters_ai_chats_v1_';
const ACTIVE_SESSION_KEY = 'roosters_ai_active_session_v1';
const THEME_KEY = 'roosters_ai_theme_v1';
const IDB_NAME = 'roosters_ai_offline_db';
const IDB_VERSION = 1;
const IDB_STORE = 'chat_histories';

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

function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal errors
  }
}

function isGuestAccount(userOrId: Pick<ActiveUser, 'id' | 'isGuest'> | string): boolean {
  if (typeof userOrId === 'string') {
    return !userOrId || userOrId === 'guest_user';
  }
  return Boolean(userOrId.isGuest) || !userOrId.id || userOrId.id === 'guest_user';
}

function getScopedAccountKey(user: Pick<ActiveUser, 'id' | 'email'>): string {
  const normalizedEmail = (user.email || '').trim().toLowerCase();
  return `${user.id}__${normalizedEmail}`;
}

function openChatsIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'accountKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeChatsToIDB(accountKey: string, sessions: ChatSession[]): Promise<void> {
  const db = await openChatsIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ accountKey, sessions, updatedAt: Date.now() });
  } catch {
    // Ignore IDB write errors cleanly
  }
}

async function readChatsFromIDB(accountKey: string): Promise<ChatSession[] | null> {
  const db = await openChatsIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(accountKey);
      req.onsuccess = () => {
        const record = req.result as { sessions?: ChatSession[] } | undefined;
        resolve(Array.isArray(record?.sessions) ? record.sessions : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function purgeGuestChatStorage(): Promise<void> {
  memoryChats.delete('guest_user');
  safeRemoveItem(`${CHATS_PREFIX}guest_user`);
  const db = await openChatsIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete('guest_user');
    tx.objectStore(IDB_STORE).delete('guest_user__guest@sandsoft.local');
  } catch {
    // Ignore IDB delete errors
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

export function saveActiveUser(user: ActiveUser): void {
  if (isGuestAccount(user)) {
    safeRemoveItem(ACTIVE_SESSION_KEY);
    return;
  }
  safeSetItem(ACTIVE_SESSION_KEY, JSON.stringify(user));
}

export function loadActiveUser(): ActiveUser | null {
  const raw = safeGetItem(ACTIVE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveUser>;
    if (!parsed || parsed.isGuest || !parsed.id || !parsed.email || parsed.id === 'guest_user') {
      safeRemoveItem(ACTIVE_SESSION_KEY);
      return null;
    }
    const accounts = loadAccounts();
    const matched = accounts.find(
      (acc) => acc.id === parsed.id && acc.email.toLowerCase() === parsed.email!.trim().toLowerCase()
    );
    if (!matched) {
      return null;
    }
    return {
      id: matched.id,
      fullName: matched.fullName,
      email: matched.email,
      isGuest: false,
    };
  } catch {
    return null;
  }
}

export function clearActiveUser(): void {
  safeRemoveItem(ACTIVE_SESSION_KEY);
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

export function loadUserChats(user: Pick<ActiveUser, 'id' | 'email' | 'isGuest'> | string): ChatSession[] {
  if (isGuestAccount(user)) {
    void purgeGuestChatStorage();
    return [];
  }

  const userId = typeof user === 'string' ? user : user.id;
  const scopedKey = typeof user === 'string' ? user : getScopedAccountKey(user);

  // Read primary account-scoped key first, with backward-compatible fallback to legacy userId key
  const rawScoped = safeGetItem(`${CHATS_PREFIX}${scopedKey}`);
  const rawLegacy = scopedKey !== userId ? safeGetItem(`${CHATS_PREFIX}${userId}`) : null;
  const raw = rawScoped ?? rawLegacy;

  if (!raw) return memoryChats.get(scopedKey) ?? [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryChats.set(scopedKey, parsed);
      if (!rawScoped && rawLegacy) {
        safeSetItem(`${CHATS_PREFIX}${scopedKey}`, rawLegacy);
      }
      return parsed;
    }
  } catch {
    // Ignore malformed JSON
  }
  return memoryChats.get(scopedKey) ?? [];
}

export async function loadUserChatsFromIndexedDB(
  user: Pick<ActiveUser, 'id' | 'email' | 'isGuest'>
): Promise<ChatSession[] | null> {
  if (isGuestAccount(user)) {
    await purgeGuestChatStorage();
    return null;
  }
  const scopedKey = getScopedAccountKey(user);
  const idbSessions = await readChatsFromIDB(scopedKey);
  if (idbSessions && idbSessions.length > 0) {
    memoryChats.set(scopedKey, idbSessions);
    return idbSessions;
  }
  return null;
}

export async function clearUserChats(
  user: Pick<ActiveUser, 'id' | 'email' | 'isGuest'> | string
): Promise<void> {
  if (isGuestAccount(user)) {
    await purgeGuestChatStorage();
    return;
  }
  const userId = typeof user === 'string' ? user : user.id;
  const scopedKey = typeof user === 'string' ? user : getScopedAccountKey(user);
  memoryChats.delete(scopedKey);
  memoryChats.delete(userId);
  safeRemoveItem(`${CHATS_PREFIX}${scopedKey}`);
  if (scopedKey !== userId) {
    safeRemoveItem(`${CHATS_PREFIX}${userId}`);
  }
  const db = await openChatsIDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(scopedKey);
    if (scopedKey !== userId) {
      tx.objectStore(IDB_STORE).delete(userId);
    }
  } catch {
    // Ignore IDB clear errors
  }
}

export function saveUserChats(
  user: Pick<ActiveUser, 'id' | 'email' | 'isGuest'> | string,
  sessions: ChatSession[]
): void {
  if (isGuestAccount(user)) {
    // Guest chats remain strictly in transient React state and are NEVER persisted to localStorage or IndexedDB
    return;
  }

  const scopedKey = typeof user === 'string' ? user : getScopedAccountKey(user);
  memoryChats.set(scopedKey, sessions);

  // Full backup in IndexedDB (supports crisp HD DataURLs & offline reading)
  void writeChatsToIDB(scopedKey, sessions.slice(0, 40));

  const compactSessions = sessions.slice(0, 20).map((session) => ({
    ...session,
    messages: session.messages.map((msg) => ({
      ...msg,
      generatedImage:
        msg.generatedImage &&
        msg.generatedImage.imageUrl &&
        msg.generatedImage.imageUrl.startsWith('data:') &&
        msg.generatedImage.imageUrl.length > 220000
          ? {
              ...msg.generatedImage,
              imageUrl: '',
            }
          : msg.generatedImage,
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
  safeSetItem(`${CHATS_PREFIX}${scopedKey}`, JSON.stringify(compactSessions));
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
const USER_GEMINI_KEYS_STORAGE = 'roosters_ai_user_gemini_keys_v1';
let memoryApiKey = '';
let memoryUserGeminiKeys = '';

export type ApiKeyProvider = 'gemini' | 'groq' | 'unknown' | 'none';

export function parseApiKeysList(rawInput: string | undefined | null): string[] {
  if (!rawInput || typeof rawInput !== 'string') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of rawInput.split(/[,\n;]+/)) {
    const k = part.trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function detectApiKeyProvider(rawKey: string): ApiKeyProvider {
  const keys = parseApiKeysList(rawKey);
  if (keys.length === 0) return 'none';
  if (keys.some((k) => k.startsWith('AIza'))) return 'gemini';
  if (keys.some((k) => k.startsWith('gsk_'))) return 'groq';
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

export function loadUserCustomApiKeys(): string {
  const raw = safeGetItem(USER_GEMINI_KEYS_STORAGE);
  if (raw !== null) {
    memoryUserGeminiKeys = raw.trim();
    return memoryUserGeminiKeys;
  }
  return memoryUserGeminiKeys;
}

export function saveUserCustomApiKeys(rawKeys: string): void {
  const trimmed = rawKeys.trim();
  memoryUserGeminiKeys = trimmed;
  if (!trimmed) {
    safeRemoveItem(USER_GEMINI_KEYS_STORAGE);
    return;
  }
  safeSetItem(USER_GEMINI_KEYS_STORAGE, trimmed);
}

export function loadAllConfiguredApiKeys(): string[] {
  return Array.from(
    new Set([
      ...parseApiKeysList(loadCustomApiKey()),
      ...parseApiKeysList(loadUserCustomApiKeys()),
    ])
  );
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

function normalizeClonedLanguage(
  lang?: string
): import('../types').ClonedVoiceLanguage {
  if (
    lang === 'Urdu' ||
    lang === 'English' ||
    lang === 'Hindi' ||
    lang === 'Arabic' ||
    lang === 'Spanish'
  ) {
    return lang;
  }
  return 'English';
}

function normalizeAccentTone(
  accent?: string
): import('../types').VoiceAccentToneId {
  if (
    accent === 'pakistani-south-asian' ||
    accent === 'american' ||
    accent === 'british' ||
    accent === 'natural-friendly' ||
    accent === 'deep-serious' ||
    accent === 'news-anchor'
  ) {
    return accent;
  }
  return 'natural-friendly';
}

function hydrateProfileSample(
  profile: import('../types').ClonedVoiceProfile
): import('../types').ClonedVoiceProfile {
  const normalized: import('../types').ClonedVoiceProfile = {
    ...profile,
    language: normalizeClonedLanguage(profile.language),
    accentTone: normalizeAccentTone(profile.accentTone),
  };
  if (normalized.sampleDataUrl) {
    memorySampleAudioMap.set(getProfileStorageKey(normalized), normalized.sampleDataUrl);
    return normalized;
  }
  const cached = memorySampleAudioMap.get(getProfileStorageKey(normalized));
  return cached ? { ...normalized, sampleDataUrl: cached } : normalized;
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
      profile.sampleDataUrl && profile.sampleDataUrl.length < 350_000
        ? profile.sampleDataUrl
        : undefined,
  };
}

export function saveVoiceSettings(settings: import('../types').VoiceStudioSettings): void {
  const hydratedSaved = (settings.savedProfiles ?? []).slice(0, 8).map(hydrateProfileSample);
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

const USER_SETTINGS_KEY = 'roosters_ai_user_settings_v1';

export const DEFAULT_USER_SETTINGS: UserAppSettings = {
  responseStyle: 'simple',
  preferredLanguage: 'Auto-Detect',
  voiceGender: 'default',
  speechSpeed: 1.0,
  customInstructions: '',
};

let memoryUserSettings: UserAppSettings = { ...DEFAULT_USER_SETTINGS };

export function loadUserSettings(): UserAppSettings {
  const raw = safeGetItem(USER_SETTINGS_KEY);
  if (!raw) return memoryUserSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<UserAppSettings>;
    const style: ResponseStyleMode =
      parsed.responseStyle === 'detailed' || parsed.responseStyle === 'study'
        ? parsed.responseStyle
        : 'simple';
    const voiceGender: VoiceGenderChoice =
      parsed.voiceGender === 'male' || parsed.voiceGender === 'female'
        ? parsed.voiceGender
        : 'default';
    const speechSpeed: SpeechSpeedChoice =
      parsed.speechSpeed === 0.8 || parsed.speechSpeed === 1.2 ? parsed.speechSpeed : 1.0;

    const merged: UserAppSettings = {
      responseStyle: style,
      preferredLanguage:
        typeof parsed.preferredLanguage === 'string' && parsed.preferredLanguage.trim()
          ? parsed.preferredLanguage.trim()
          : 'Auto-Detect',
      voiceGender,
      speechSpeed,
      customInstructions:
        typeof parsed.customInstructions === 'string' ? parsed.customInstructions : '',
    };
    memoryUserSettings = merged;
    return merged;
  } catch {
    return memoryUserSettings;
  }
}

export function saveUserSettings(settings: UserAppSettings): void {
  memoryUserSettings = settings;
  safeSetItem(USER_SETTINGS_KEY, JSON.stringify(settings));
}

const OWNER_CONFIG_KEY = 'roosters_ai_owner_config_v1';

export const DEFAULT_OWNER_CONFIG: OwnerConfig = {
  chatModel: 'auto',
  imageModel: 'gemini-2.5-flash-image',
  globalSystemPrompt: '',
  announcementEnabled: false,
  announcementText: '',
  maintenanceMode: false,
  ownerPin: 'sadd1+2=3',
};

let memoryOwnerConfig: OwnerConfig = { ...DEFAULT_OWNER_CONFIG };

const VALID_IMAGE_MODELS: ReadonlyArray<OwnerImageModel> = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
];

export function loadOwnerConfig(): OwnerConfig {
  const raw = safeGetItem(OWNER_CONFIG_KEY);
  if (!raw) return memoryOwnerConfig;
  try {
    const parsed = JSON.parse(raw) as Partial<OwnerConfig>;
    const imgModel: OwnerImageModel = VALID_IMAGE_MODELS.includes(parsed.imageModel as OwnerImageModel)
      ? (parsed.imageModel as OwnerImageModel)
      : 'gemini-2.5-flash-image';

    const rawPin = typeof parsed.ownerPin === 'string' ? parsed.ownerPin.trim() : '';
    const resolvedPin = !rawPin || rawPin === '2026' ? 'sadd1+2=3' : rawPin;

    const merged: OwnerConfig = {
      chatModel:
        typeof parsed.chatModel === 'string' && parsed.chatModel.trim()
          ? parsed.chatModel.trim()
          : 'auto',
      imageModel: imgModel,
      globalSystemPrompt:
        typeof parsed.globalSystemPrompt === 'string' ? parsed.globalSystemPrompt : '',
      announcementEnabled: Boolean(parsed.announcementEnabled),
      announcementText:
        typeof parsed.announcementText === 'string' ? parsed.announcementText : '',
      maintenanceMode: Boolean(parsed.maintenanceMode),
      ownerPin: resolvedPin,
    };
    memoryOwnerConfig = merged;
    return merged;
  } catch {
    return memoryOwnerConfig;
  }
}

export function saveOwnerConfig(config: OwnerConfig): void {
  memoryOwnerConfig = config;
  safeSetItem(OWNER_CONFIG_KEY, JSON.stringify(config));
}



