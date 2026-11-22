import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Dna,
  Download,
  FileCode,
  FileText,
  Film,
  Globe,
  ImagePlus,
  Loader2,
  LogOut,
  Megaphone,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Paintbrush,
  Palette,
  PanelLeft,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Trash2,
  User,
  Volume2,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { ChangeEvent, ClipboardEvent, CSSProperties, KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QUICK_PROMPTS, ROOSTERS_LOGO_SRC, WORLD_LANGUAGES } from '../constants';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { APP_THEMES, AppTheme, ThemeId, ThemeSettings } from '../themes';
import {
  ActiveUser,
  ChatMessage,
  ChatSession,
  ClonedVoiceProfile,
  MessageAttachment,
  MessageVoiceNote,
  OwnerConfig,
  UserAppSettings,
  VoiceStudioSettings,
} from '../types';
import {
  buildSafeArtisticPrompt,
  detectAndEnhanceChatMediaIntent,
  editArtworkUnified,
  generateArtworkUnified,
  generateVideoUnified,
  getEnvGeminiKey,
  getEnvGroqKey,
  resolveActiveProvider,
  streamChatCompletion,
} from '../utils/aiClient';
import {
  clearUserChats,
  loadOwnerConfig,
  loadThemeSettings,
  loadUserChats,
  loadUserChatsFromIndexedDB,
  loadUserSettings,
  loadVoiceSettings,
  saveOwnerConfig,
  saveThemeSettings,
  saveUserChats,
  saveUserSettings,
  saveVoiceSettings,
} from '../utils/storage';
import {
  cancelVoicePlayback,
  estimateSpeechDurationSec,
  getResolvedVoiceParameters,
  isSpeechSynthesisSupported,
  speakWithVoiceProfile,
  unlockSpeechSynthesis,
} from '../utils/voiceEngine';
import { ApiKeyModal } from './ApiKeyModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { GeneratedArtworkCard } from './GeneratedArtworkCard';
import { GeneratedVideoCard } from './GeneratedVideoCard';
import { ImageCreateModal } from './ImageCreateModal';
import { LegalFooter } from './LegalFooter';
import { LegalPageId, LegalPagesModal } from './LegalPagesModal';
import { LiveTalkModal } from './LiveTalkModal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { InstallAppModal, PWAInstallButton } from './PWAInstallButton';
import { TextReaderModal } from './TextReaderModal';
import { ThemeWallpaperModal } from './ThemeWallpaperModal';
import { UserSettingsModal } from './UserSettingsModal';
import { VideoCreateModal } from './VideoCreateModal';
import { VoiceCloneModal } from './VoiceCloneModal';
import { VoiceNotePlayer } from './VoiceNotePlayer';

interface MainSuperAppProps {
  user: ActiveUser;
  onLogout: () => void;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fileToAttachment(
  file: File,
  source: 'upload' | 'screen' | 'camera'
): Promise<MessageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Failed to read image file.'));
        return;
      }

      const extractBase64 = (url: string) =>
        (url.includes(',') ? url.split(',')[1] : url).trim();

      // Zero Compression: keep original uncompressed file bytes directly when <= 6 MB
      if (file.size > 0 && file.size <= 6 * 1024 * 1024 && file.type.startsWith('image/')) {
        resolve({
          kind: 'image',
          name: file.name || 'image.png',
          mimeType: file.type || 'image/png',
          base64: extractBase64(rawUrl),
          dataUrl: rawUrl,
          source,
        });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxWidth = 2048;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxWidth) {
          height = Math.max(1, Math.round((height * maxWidth) / width));
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            kind: 'image',
            name: file.name || 'image.png',
            mimeType: file.type || 'image/png',
            base64: extractBase64(rawUrl),
            dataUrl: rawUrl,
            source,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        resolve({
          kind: 'image',
          name: file.name || 'image.png',
          mimeType: 'image/png',
          base64: extractBase64(pngUrl),
          dataUrl: pngUrl,
          source,
        });
      };
      img.onerror = () => {
        resolve({
          kind: 'image',
          name: file.name || 'image.png',
          mimeType: file.type || 'image/png',
          base64: extractBase64(rawUrl),
          dataUrl: rawUrl,
          source,
        });
      };
      img.src = rawUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = dataUrl.indexOf(',');
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : '');
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

function getWallpaperStyle(settings: ThemeSettings, theme: AppTheme): CSSProperties {
  if (settings.wallpaperId === 'custom' && settings.customWallpaperUrl) {
    return {
      backgroundImage: `linear-gradient(${
        theme.isLight ? 'rgba(248,250,252,0.82), rgba(248,250,252,0.86)' : 'rgba(7,9,14,0.72), rgba(7,9,14,0.78)'
      }), url(${settings.customWallpaperUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  if (settings.wallpaperId === 'stars') {
    const dotColor = theme.isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.22)';
    const accentDot = theme.isLight ? 'rgba(2, 132, 199, 0.16)' : 'rgba(0, 212, 255, 0.22)';
    return {
      backgroundColor: theme.canvasBg,
      backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px), radial-gradient(${accentDot} 1.2px, transparent 1.2px)`,
      backgroundSize: '36px 36px, 58px 58px',
      backgroundPosition: '0 0, 18px 24px',
    };
  }

  if (settings.wallpaperId === 'grid') {
    const lineColor = theme.isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.04)';
    return {
      backgroundColor: theme.canvasBg,
      backgroundImage: `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
      backgroundSize: '32px 32px',
    };
  }

  if (settings.wallpaperId === 'study-gradient') {
    return {
      backgroundColor: theme.canvasBg,
      backgroundImage: theme.isLight
        ? 'radial-gradient(circle at 20% 20%, rgba(2, 132, 199, 0.10), transparent 45%), radial-gradient(circle at 80% 80%, rgba(217, 119, 6, 0.10), transparent 45%)'
        : `radial-gradient(circle at 18% 18%, ${theme.accentSecondary}1a, transparent 48%), radial-gradient(circle at 82% 82%, ${theme.accentPrimary}16, transparent 48%)`,
    };
  }

  return {
    backgroundColor: theme.canvasBg,
  };
}

function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ChatMessageRowProps {
  msg: ChatMessage;
  theme: AppTheme;
  selectedLanguage: string;
  voiceSettings: VoiceStudioSettings;
  isCopied: boolean;
  isTtsLoading: boolean;
  isTtsPlaying: boolean;
  isTtsPaused: boolean;
  onCopy: (msg: ChatMessage) => void;
  onListen: (msg: ChatMessage) => void;
  onQuickEditImage?: () => void;
}

const ChatMessageRow = memo(function ChatMessageRow({
  msg,
  theme,
  selectedLanguage,
  voiceSettings,
  isCopied,
  isTtsLoading,
  isTtsPlaying,
  isTtsPaused,
  onCopy,
  onListen,
  onQuickEditImage,
}: ChatMessageRowProps) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 text-white shadow-md"
          style={{
            backgroundImage: theme.userBubbleGradient,
          }}
        >
          {msg.attachment && msg.attachment.kind === 'file' ? (
            <div className="mb-2.5 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/25 bg-black/25">
              <FileCode className="w-4 h-4 shrink-0 text-[#ffd700]" />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold truncate">{msg.attachment.name}</div>
                <div className="text-[11px] text-white/75">
                  Study / Code File Attached
                </div>
              </div>
            </div>
          ) : (
            msg.attachment &&
            msg.attachment.dataUrl && (
              <div className="mb-2.5 rounded-xl overflow-hidden border border-white/25 bg-black/30">
                <img
                  src={msg.attachment.dataUrl}
                  alt={msg.attachment.name}
                  referrerPolicy="no-referrer"
                  className="max-h-64 w-auto object-contain mx-auto"
                />
              </div>
            )
          )}
          <p dir="auto" className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </p>
          {msg.voiceNote && (
            <VoiceNotePlayer
              voiceName={msg.voiceNote.voiceName}
              durationEstSec={msg.voiceNote.durationEstSec}
              isPlaying={isTtsPlaying}
              isPaused={isTtsPaused}
              isOnUserBubble
              theme={theme}
              onTogglePlay={() => onListen(msg)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="w-full max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-bl-sm border px-4 sm:px-5 py-4 shadow-sm"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: msg.isError ? '#ff4d4d' : theme.borderColor,
        }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <img
            src={ROOSTERS_LOGO_SRC}
            alt="Roosters AI"
            referrerPolicy="no-referrer"
            className="w-5 h-5 rounded object-cover object-center"
          />
          <span
            className="font-display text-[12.5px] font-bold"
            style={{ color: theme.accentPrimary }}
          >
            Roosters AI
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: theme.textMuted }}>
            {new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {msg.isError ? (
          <p className="text-[14px] text-[#ff4d4d]">{msg.content}</p>
        ) : msg.isPending ? (
          <div
            className="flex items-center gap-2 text-[13.5px] py-1"
            style={{ color: theme.textMuted }}
          >
            <Loader2
              className="w-4 h-4 animate-spin shrink-0"
              style={{ color: theme.accentSecondary }}
            />
            <span>{msg.content || 'Generating...'}</span>
          </div>
        ) : msg.content ? (
          <MarkdownRenderer content={msg.content} isLight={theme.isLight} />
        ) : (
          <div
            className="flex items-center gap-2 text-[13.5px] py-1"
            style={{ color: theme.textMuted }}
          >
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: theme.accentSecondary }}
            />
            <span>Preparing a thoughtful answer...</span>
          </div>
        )}

        {msg.generatedImage && (
          <GeneratedArtworkCard
            artwork={msg.generatedImage}
            onQuickEditHint={onQuickEditImage}
          />
        )}

        {msg.generatedVideo && (
          <GeneratedVideoCard
            video={msg.generatedVideo}
            language={selectedLanguage}
            voiceSettings={voiceSettings}
          />
        )}

        {msg.voiceNote && !msg.isPending && !msg.isError && (
          <VoiceNotePlayer
            voiceName={msg.voiceNote.voiceName}
            durationEstSec={msg.voiceNote.durationEstSec}
            isPlaying={isTtsPlaying}
            isPaused={isTtsPaused}
            theme={theme}
            onTogglePlay={() => onListen(msg)}
          />
        )}

        {msg.content && !msg.isError && !msg.isPending && (
          <div
            className="mt-3 pt-2.5 border-t flex items-center gap-2"
            style={{ borderColor: theme.borderColor }}
          >
            <button
              type="button"
              onClick={() => onCopy(msg)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textSecondary,
              }}
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onListen(msg)}
              disabled={isTtsLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: isTtsPlaying ? theme.accentPrimary : theme.borderColor,
                color: isTtsPlaying ? theme.accentPrimary : theme.textSecondary,
              }}
            >
              {isTtsLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing Audio...</span>
                </>
              ) : isTtsPlaying ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Listen</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export function MainSuperApp({ user, onLogout }: MainSuperAppProps) {
  const isOnline = useOnlineStatus();
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    user.isGuest ? [] : loadUserChats(user)
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userSettings, setUserSettings] = useState<UserAppSettings>(() => loadUserSettings());
  const [ownerConfig, setOwnerConfig] = useState<OwnerConfig>(() => loadOwnerConfig());
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    () => loadUserSettings().preferredLanguage || 'Auto-Detect'
  );
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [liveUsers, setLiveUsers] = useState<number>(14);

  // Theme & Wallpaper
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => loadThemeSettings());
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  // Modals: Create Image, Create Video, Voice Clone, Live Talk, Text Reader, User Settings, Owner Settings, Legal Pages
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceStudioSettings>(() => loadVoiceSettings());
  const [isLiveTalkOpen, setIsLiveTalkOpen] = useState(false);
  const [isTextReaderOpen, setIsTextReaderOpen] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPageId | null>(null);

  // Host capability state (works on both Express backend & static Vercel builds)
  const [hasBackendApi, setHasBackendApi] = useState(false);
  const [hasServerGeminiKey, setHasServerGeminiKey] = useState(false);

  // Copy & TTS states
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const [ttsPausedId, setTtsPausedId] = useState<string | null>(null);

  // Microphone recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Screen Share states
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const studyFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastDarkThemeIdRef = useRef<ThemeId>(
    themeSettings.themeId !== 'clean-light' ? themeSettings.themeId : 'gold-cyan'
  );
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const visitorClientIdRef = useRef<string>(createId('visitor'));
  const pendingReplySpeechRef = useRef<{
    assistantId: string;
    text: string;
    voiceNote: MessageVoiceNote;
  } | null>(null);
  const isSpeakingUserNoteRef = useRef<boolean>(false);

  const theme: AppTheme = useMemo(
    () => ({
      ...(APP_THEMES[themeSettings.themeId] ?? APP_THEMES['gold-cyan']),
      liteMode: Boolean(themeSettings.liteMode),
    }),
    [themeSettings.themeId, themeSettings.liteMode]
  );
  const hasEnvKey = Boolean(getEnvGeminiKey() || getEnvGroqKey());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('lite-mode', Boolean(themeSettings.liteMode));
    }
  }, [themeSettings.liteMode]);

  // Close mobile Tools dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!isToolsMenuOpen) return;
    const handlePointerDown = (ev: MouseEvent | TouchEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(ev.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };
    const handleKeyDown = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setIsToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isToolsMenuOpen]);

  const handleUpdateThemeSettings = (next: ThemeSettings) => {
    if (next.themeId !== 'clean-light') {
      lastDarkThemeIdRef.current = next.themeId;
    }
    setThemeSettings(next);
    saveThemeSettings(next);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('lite-mode', Boolean(next.liteMode));
    }
  };

  const handleToggleLightDarkMode = (isLight: boolean) => {
    const targetThemeId: ThemeId = isLight
      ? 'clean-light'
      : lastDarkThemeIdRef.current && lastDarkThemeIdRef.current !== 'clean-light'
        ? lastDarkThemeIdRef.current
        : 'gold-cyan';
    handleUpdateThemeSettings({
      ...themeSettings,
      themeId: targetThemeId,
    });
  };

  const handleUpdateVoiceSettings = (next: VoiceStudioSettings) => {
    setVoiceSettings(next);
    saveVoiceSettings(next);
  };

  const handleSaveUserSettings = (next: UserAppSettings) => {
    setUserSettings(next);
    saveUserSettings(next);
    setSelectedLanguage(next.preferredLanguage || 'Auto-Detect');
  };

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    const updated = { ...userSettings, preferredLanguage: langCode };
    setUserSettings(updated);
    saveUserSettings(updated);
  };

  const handleUpdateOwnerConfig = (next: OwnerConfig) => {
    setOwnerConfig(next);
    saveOwnerConfig(next);
  };

  const handleClearAllHistory = async () => {
    abortControllerRef.current?.abort();
    stopAudioPlayback();
    setIsStreaming(false);
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    setPendingAttachment(null);
    await clearUserChats(user);
  };

  // Hydrate larger or offline-backed chats from IndexedDB for logged-in accounts only
  useEffect(() => {
    if (user.isGuest) return;
    let cancelled = false;
    void loadUserChatsFromIndexedDB(user).then((idbSessions) => {
      if (cancelled || !idbSessions || idbSessions.length === 0) return;
      setSessions((prev) => {
        if (prev.length === 0) return idbSessions;
        const merged = new Map<string, ChatSession>();
        for (const s of idbSessions) merged.set(s.id, s);
        for (const s of prev) {
          const existing = merged.get(s.id);
          if (!existing || s.updatedAt > existing.updatedAt) {
            merged.set(s.id, s);
          }
        }
        return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist sessions strictly for logged-in users (Guest mode stays in React memory only)
  useEffect(() => {
    if (user.isGuest) return;
    saveUserChats(user, sessions);
  }, [sessions, user]);

  // Close Live Talk cleanly if connection drops offline
  useEffect(() => {
    if (!isOnline && isLiveTalkOpen) {
      setIsLiveTalkOpen(false);
    }
  }, [isOnline, isLiveTalkOpen]);

  // Auto-scroll to bottom: instant during streaming for zero lag, smooth on static sends
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming]);

  // Bind screen share MediaStream to video element
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Detect backend availability + server Gemini key & run live active visitors heartbeat when online
  useEffect(() => {
    if (!isOnline) {
      return;
    }

    let cancelled = false;
    let backendActive = false;

    const checkHealth = async () => {
      try {
        const resp = await fetch('/api/health');
        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok || !contentType.includes('application/json') || cancelled) {
          setHasBackendApi(false);
          setHasServerGeminiKey(false);
          return;
        }
        const data = (await resp.json()) as { ok?: boolean; hasServerGeminiKey?: boolean };
        if (!cancelled && data.ok) {
          backendActive = true;
          setHasBackendApi(true);
          setHasServerGeminiKey(Boolean(data.hasServerGeminiKey));
        }
      } catch {
        if (!cancelled) {
          setHasBackendApi(false);
          setHasServerGeminiKey(false);
        }
      }
    };

    const sendHeartbeat = async () => {
      if (!backendActive) {
        if (!cancelled) {
          const drift = Math.floor(Math.random() * 3) - 1;
          setLiveUsers((prev) => Math.max(12, Math.min(19, prev + drift)));
        }
        return;
      }
      try {
        const resp = await fetch('/api/visitors/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: visitorClientIdRef.current }),
        });
        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok || !contentType.includes('application/json') || cancelled) return;
        const data = (await resp.json()) as { activeClients?: number };
        const serverActive = Math.max(1, data.activeClients ?? 1);
        const drift = Math.floor(Math.random() * 3) - 1;
        setLiveUsers((prev) => {
          const base = 13 + serverActive;
          const next = Math.max(base, prev + drift);
          return Math.min(base + 5, next);
        });
      } catch {
        // Ignore transient network errors
      }
    };

    void checkHealth().then(sendHeartbeat);
    const timer = window.setInterval(sendHeartbeat, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOnline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      cancelVoicePlayback();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      screenStream?.getTracks().forEach((track) => track.stop());
    };
  }, [screenStream]);

  const stopAudioPlayback = () => {
    pendingReplySpeechRef.current = null;
    isSpeakingUserNoteRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    cancelVoicePlayback();
    setTtsPlayingId(null);
    setTtsPausedId(null);
  };

  const handleCleanLogout = () => {
    abortControllerRef.current?.abort();
    stopAudioPlayback();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
    }
    onLogout();
  };

  const syncMessagesToSession = (updatedMessages: ChatMessage[], targetSessionId?: string | null) => {
    const firstUserMsg = updatedMessages.find((m) => m.role === 'user');
    const title = firstUserMsg?.content.trim().slice(0, 44) || 'New Conversation';
    const sessionId = targetSessionId ?? activeSessionId ?? createId('chat');

    if (!activeSessionId && !targetSessionId) {
      setActiveSessionId(sessionId);
    }

    setSessions((prev) => {
      const exists = prev.some((s) => s.id === sessionId);
      const nextSession: ChatSession = {
        id: sessionId,
        title,
        messages: updatedMessages,
        updatedAt: Date.now(),
      };
      if (exists) {
        return [nextSession, ...prev.filter((s) => s.id !== sessionId)];
      }
      return [nextSession, ...prev];
    });

    return sessionId;
  };

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    stopAudioPlayback();
    setIsStreaming(false);
    setActiveSessionId(null);
    setMessages([]);
    setPendingAttachment(null);
    setInputValue('');
    setNotice('');
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowHistory(false);
    }
  };

  const handleSelectSession = (session: ChatSession) => {
    abortControllerRef.current?.abort();
    stopAudioPlayback();
    setIsStreaming(false);
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setPendingAttachment(null);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowHistory(false);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const buildActiveSampleVoiceNote = (
    spokenText: string,
    isUserVoiceMessage = false,
    profileOverride?: ClonedVoiceProfile
  ): MessageVoiceNote | undefined => {
    const profile = profileOverride ?? voiceSettings.clonedProfile;
    const useSample = Boolean(profileOverride) || (voiceSettings.activeVoiceId === 'cloned' && Boolean(profile));
    if (useSample && profile) {
      return {
        voiceName: profile.name || 'Custom Voice 1',
        pitch: profile.pitch,
        rate: profile.rate,
        genderHint: profile.genderHint,
        language: profile.language,
        accentTone: profile.accentTone,
        preferredVoiceURI: profile.preferredVoiceURI,
        durationEstSec: estimateSpeechDurationSec(spokenText, profile.rate),
        isUserVoiceMessage,
      };
    }
    if (isUserVoiceMessage) {
      const resolved = getResolvedVoiceParameters(voiceSettings);
      return {
        voiceName: resolved.voiceName,
        pitch: resolved.pitch,
        rate: resolved.rate,
        genderHint: resolved.genderHint,
        language: resolved.language,
        accentTone: resolved.accentTone,
        preferredVoiceURI: resolved.preferredVoiceURI,
        durationEstSec: estimateSpeechDurationSec(spokenText, resolved.rate),
        isUserVoiceMessage: true,
      };
    }
    return undefined;
  };

  const handleSendMessage = async (
    overrideText?: string,
    options?: { forceVoiceMessage?: boolean; profileOverride?: ClonedVoiceProfile }
  ) => {
    const textToSend = (overrideText ?? inputValue).trim();
    const capturedAttachment = overrideText ? null : pendingAttachment;

    if (!isOnline) {
      setNotice(
        'You are offline. You can read your saved conversations, but please connect to the internet to start a new chat.'
      );
      return;
    }

    if ((!textToSend && !capturedAttachment) || isStreaming || isGeneratingImage || isGeneratingVideo) {
      return;
    }

    // Capture Base64 image data (stripping data:image/...;base64,) & mimeType BEFORE clearing state
    const capturedDataUrl = capturedAttachment?.dataUrl || '';
    const capturedImageBase64 =
      capturedAttachment && capturedAttachment.kind !== 'file'
        ? (
            capturedAttachment.base64 ||
            (capturedDataUrl.includes(',') ? capturedDataUrl.split(',')[1] : '')
          ).trim()
        : '';
    const capturedImageMimeType =
      capturedAttachment && capturedAttachment.kind !== 'file'
        ? capturedAttachment.mimeType ||
          (capturedDataUrl.startsWith('data:')
            ? capturedDataUrl.slice(5).split(';')[0]
            : 'image/jpeg') ||
          'image/jpeg'
        : capturedAttachment?.mimeType || 'text/plain';

    const attachmentToSend: MessageAttachment | undefined = capturedAttachment
      ? {
          ...capturedAttachment,
          base64: capturedAttachment.kind === 'file' ? '' : capturedImageBase64,
          mimeType: capturedImageMimeType,
        }
      : undefined;

    const isSampleActive =
      Boolean(options?.profileOverride) ||
      (voiceSettings.activeVoiceId === 'cloned' && Boolean(voiceSettings.clonedProfile));
    const shouldSpeakUserText = Boolean(options?.forceVoiceMessage || voiceSettings.voiceMessageMode);

    if (isSampleActive || shouldSpeakUserText) {
      unlockSpeechSynthesis();
    }

    const latestGeneratedImageMsg = [...messages]
      .reverse()
      .find((m) => Boolean(m.generatedImage?.imageUrl));

    // Step 1: Context-aware Gemini Multilingual Intent & Prompt Enhancer (Generate, Photo Edit, Video, Chat)
    const detectedMedia = await detectAndEnhanceChatMediaIntent({
      text: textToSend,
      recentMessages: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
      hasAttachment: Boolean(attachmentToSend && attachmentToSend.kind !== 'file'),
      hasPreviousGeneratedImage: Boolean(latestGeneratedImageMsg?.generatedImage?.imageUrl),
      hasBackendApi,
      hasServerGeminiKey,
    });

    if (detectedMedia.intent === 'image_edit') {
      const sourceDataUrl =
        attachmentToSend && attachmentToSend.kind !== 'file'
          ? attachmentToSend.dataUrl
          : latestGeneratedImageMsg?.generatedImage?.imageUrl || '';
      if (sourceDataUrl) {
        if (!overrideText) {
          setInputValue('');
          setPendingAttachment(null);
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
        await handleEditArtwork({
          prompt: textToSend,
          sourceImageDataUrl: sourceDataUrl,
          sourceMimeType:
            attachmentToSend && attachmentToSend.kind !== 'file'
              ? attachmentToSend.mimeType
              : 'image/png',
          aspectRatio: latestGeneratedImageMsg?.generatedImage?.aspectRatio || '1:1',
          userAttachment: attachmentToSend,
          previousEditContext: latestGeneratedImageMsg?.generatedImage?.detailedPrompt,
          preEnhanced: detectedMedia.preEnhanced,
          displayUserText: textToSend,
        });
        return;
      }
    }

    if (detectedMedia.intent === 'image') {
      if (!overrideText) {
        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
      await handleGenerateArtwork(textToSend, '1:1', textToSend, {
        preEnhanced: detectedMedia.preEnhanced,
      });
      return;
    }
    if (detectedMedia.intent === 'video') {
      if (!overrideText) {
        setInputValue('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
      await handleGenerateVideo(textToSend, 'Cinematic Realism', textToSend);
      return;
    }

    setNotice('');
    const defaultPrompt = attachmentToSend
      ? attachmentToSend.kind === 'file'
        ? `Please review, summarize, or help debug "${attachmentToSend.name}".`
        : 'Describe and analyze this image in detail.'
      : '';

    const finalUserText = textToSend || defaultPrompt;
    const userVoiceNote = shouldSpeakUserText
      ? buildActiveSampleVoiceNote(finalUserText, true, options?.profileOverride)
      : undefined;

    const userMsgId = createId('msg');
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: finalUserText,
      createdAt: Date.now(),
      attachment: attachmentToSend,
      voiceNote: userVoiceNote,
    };

    const assistantId = createId('msg');
    const placeholderAssistant: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage];
    const currentSessionId = syncMessagesToSession(nextMessages);
    setMessages([...nextMessages, placeholderAssistant]);

    const speakQueuedAssistantReply = (queued: {
      assistantId: string;
      text: string;
      voiceNote: MessageVoiceNote;
    }) => {
      setTtsPlayingId(queued.assistantId);
      speakWithVoiceProfile({
        text: queued.text,
        language: queued.voiceNote.language || selectedLanguage,
        voiceSettings,
        voiceGender: userSettings.voiceGender,
        speedMultiplier: userSettings.speechSpeed,
        overrideParams: {
          pitch: queued.voiceNote.pitch,
          rate: queued.voiceNote.rate,
          genderHint: queued.voiceNote.genderHint,
          language: queued.voiceNote.language,
          accentTone: queued.voiceNote.accentTone,
          preferredVoiceURI: queued.voiceNote.preferredVoiceURI,
        },
        onEnd: () => setTtsPlayingId((curr) => (curr === queued.assistantId ? null : curr)),
        onError: () => setTtsPlayingId((curr) => (curr === queued.assistantId ? null : curr)),
      });
    };

    if (userVoiceNote && isSpeechSynthesisSupported()) {
      stopAudioPlayback();
      isSpeakingUserNoteRef.current = true;
      setTtsPlayingId(userMsgId);
      speakWithVoiceProfile({
        text: cleanTextForSpeech(finalUserText),
        language: userVoiceNote.language || selectedLanguage,
        voiceSettings,
        voiceGender: userSettings.voiceGender,
        speedMultiplier: userSettings.speechSpeed,
        overrideParams: {
          pitch: userVoiceNote.pitch,
          rate: userVoiceNote.rate,
          genderHint: userVoiceNote.genderHint,
          language: userVoiceNote.language,
          accentTone: userVoiceNote.accentTone,
          preferredVoiceURI: userVoiceNote.preferredVoiceURI,
        },
        onEnd: () => {
          isSpeakingUserNoteRef.current = false;
          setTtsPlayingId((curr) => (curr === userMsgId ? null : curr));
          const queued = pendingReplySpeechRef.current;
          if (queued) {
            pendingReplySpeechRef.current = null;
            speakQueuedAssistantReply(queued);
          }
        },
        onError: () => {
          isSpeakingUserNoteRef.current = false;
          setTtsPlayingId((curr) => (curr === userMsgId ? null : curr));
          const queued = pendingReplySpeechRef.current;
          if (queued) {
            pendingReplySpeechRef.current = null;
            speakQueuedAssistantReply(queued);
          }
        },
      });
    }

    if (!overrideText) {
      setInputValue('');
      setPendingAttachment(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulated = '';
    let rafPending = false;

    const flushToState = () => {
      rafPending = false;
      const snapshot = accumulated;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m))
      );
    };

    try {
      const payloadMessages = nextMessages.slice(-10).map((m) => {
        const isCurrentUserImgTurn = m.id === userMsgId && Boolean(capturedImageBase64);
        if (isCurrentUserImgTurn && attachmentToSend) {
          return {
            role: m.role,
            content: finalUserText,
            attachment: {
              kind: 'image' as const,
              name: attachmentToSend.name,
              base64: capturedImageBase64,
              mimeType: capturedImageMimeType,
            },
          };
        }

        const msgUrl = m.attachment?.dataUrl || '';
        const msgBase64 =
          m.attachment && m.attachment.kind !== 'file'
            ? (m.attachment.base64 || (msgUrl.includes(',') ? msgUrl.split(',')[1] : '')).trim()
            : '';

        return {
          role: m.role,
          content: m.content,
          attachment: m.attachment
            ? {
                kind: m.attachment.kind,
                name: m.attachment.name,
                base64: msgBase64 || undefined,
                mimeType: m.attachment.mimeType || undefined,
                textContent: m.attachment.textContent || undefined,
              }
            : undefined,
        };
      });

      await streamChatCompletion({
        messages: payloadMessages,
        language: selectedLanguage,
        userName: user.fullName,
        isLiveVoice: false,
        responseStyle: userSettings.responseStyle,
        customInstructions: userSettings.customInstructions,
        globalSystemPrompt: ownerConfig.globalSystemPrompt,
        chatModel: ownerConfig.chatModel,
        hasBackendApi,
        hasServerGeminiKey,
        signal: controller.signal,
        onChunk: (chunkText) => {
          accumulated += chunkText;
          if (accumulated.length === chunkText.length) {
            flushToState();
          } else if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushToState);
          }
        },
      });

      const finalAssistantText = accumulated.trim();
      if (!finalAssistantText) {
        throw new Error('AI returned an empty response. Please verify your API key or network connection and try again.');
      }

      // Safety net: if a chat model emits [CREATE_IMAGE: ...], execute Step 2 HD image generation immediately
      const createImageMatch = finalAssistantText.match(/\[CREATE_IMAGE:\s*([\s\S]+?)\]/i);
      if (createImageMatch && createImageMatch[1]?.trim()) {
        const extractedPrompt = buildSafeArtisticPrompt(createImageMatch[1].trim());
        setIsStreaming(false);
        abortControllerRef.current = null;
        await handleGenerateArtwork(extractedPrompt, '1:1', textToSend, {
          preEnhanced: {
            shortTitle: textToSend.slice(0, 48) || 'Ultra-HD AI Artwork',
            detailedPrompt: extractedPrompt,
          },
          replaceAssistantId: assistantId,
          baseMessages: nextMessages,
          sessionId: currentSessionId,
        });
        return;
      }

      const spokenAssistantText = cleanTextForSpeech(finalAssistantText);
      const assistantVoiceNote = isSampleActive
        ? buildActiveSampleVoiceNote(spokenAssistantText, false, options?.profileOverride)
        : undefined;

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: finalAssistantText,
          createdAt: Date.now(),
          voiceNote: assistantVoiceNote,
        },
      ];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);

      if (
        assistantVoiceNote &&
        spokenAssistantText &&
        voiceSettings.autoSpeakReplies !== false &&
        isSpeechSynthesisSupported()
      ) {
        if (isSpeakingUserNoteRef.current && window.speechSynthesis?.speaking) {
          pendingReplySpeechRef.current = {
            assistantId,
            text: spokenAssistantText,
            voiceNote: assistantVoiceNote,
          };
        } else {
          stopAudioPlayback();
          speakQueuedAssistantReply({
            assistantId,
            text: spokenAssistantText,
            voiceNote: assistantVoiceNote,
          });
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      const errMessage =
        err instanceof Error && err.message ? err.message : String(err || 'Unknown API error');
      const failedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: errMessage,
          createdAt: Date.now(),
          isError: true,
        },
      ];
      setMessages(failedMessages);
      syncMessagesToSession(failedMessages, currentSessionId);
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const readStudyTextFile = async (file: File) => {
    if (file.size > 512_000) {
      setNotice('Study/code files must be under 512 KB for instant analysis.');
      return;
    }
    try {
      const textContent = await file.text();
      setPendingAttachment({
        kind: 'file',
        name: file.name,
        mimeType: file.type || 'text/plain',
        base64: '',
        dataUrl: '',
        textContent,
        fileSize: file.size,
        source: 'upload',
      });
      setNotice('');
    } catch {
      setNotice('Could not read the selected study or code file.');
    }
  };

  const handleImageUploadChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      await readStudyTextFile(file);
      return;
    }
    try {
      const attachment = await fileToAttachment(file, 'upload');
      attachment.kind = 'image';
      setPendingAttachment(attachment);
      setNotice('');
    } catch {
      setNotice('Could not read the selected image.');
    }
  };

  const handleCameraFileCaptureChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const attachment = await fileToAttachment(file, 'camera');
      attachment.kind = 'image';
      setPendingAttachment(attachment);
      setNotice('');
    } catch {
      setNotice('Could not read the captured camera photo.');
    }
  };

  const handleOpenCameraCapture = () => {
    const isMobile =
      typeof navigator !== 'undefined' &&
      (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' &&
          Boolean(window.matchMedia?.('(pointer: coarse)').matches) &&
          window.innerWidth < 900));

    if (isMobile) {
      cameraFileInputRef.current?.click();
      return;
    }
    setIsCameraModalOpen(true);
  };

  const handleStudyFileUploadChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const attachment = await fileToAttachment(file, 'upload');
      attachment.kind = 'image';
      setPendingAttachment(attachment);
      setNotice('');
      return;
    }
    await readStudyTextFile(file);
  };

  const handleExportChat = () => {
    if (messages.length === 0) {
      setNotice('Start a conversation first to export your study notes.');
      return;
    }

    const headerLines = [
      '====================================================',
      'ROOSTERS AI v2.0 (Pro Edition) — Study & Code Export',
      `By SandSoft | User: ${user.fullName} | Language: ${selectedLanguage}`,
      `Exported: ${new Date().toLocaleString()}`,
      '====================================================',
      '',
    ];

    const bodyLines = messages.map((m) => {
      const speaker = m.role === 'user' ? user.fullName : 'Roosters AI';
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const attachLine = m.attachment ? `[Attachment: ${m.attachment.name}]\n` : '';
      return `[${time}] ${speaker}:\n${attachLine}${m.content}\n`;
    });

    const content = [...headerLines, ...bodyLines].join('\n----------------------------------------------------\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roosters-ai-study-notes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const attachment = await fileToAttachment(file, 'upload');
          setPendingAttachment(attachment);
          break;
        }
      }
    }
  };

  const handleToggleScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setNotice(
        'Live Screen Share is available on desktop browsers (Chrome, Edge, Firefox). On mobile, tap the Camera icon to upload a screenshot!'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setScreenStream(null);
        };
      }
      setScreenStream(stream);
      setNotice('');
    } catch {
      setNotice('Screen share permission was cancelled or unavailable.');
    }
  };

  const handleCaptureScreenFrame = () => {
    const video = screenVideoRef.current;
    if (!video || !screenStream) return;
    let width = video.videoWidth || 1920;
    let height = video.videoHeight || 1080;
    if (width > 1920) {
      height = Math.max(1, Math.round((height * 1920) / width));
      width = 1920;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl).trim();

    setPendingAttachment({
      kind: 'image',
      name: `screen-capture-${new Date().toLocaleTimeString().replace(/[:\s]/g, '-')}.png`,
      mimeType: 'image/png',
      base64,
      dataUrl,
      source: 'screen',
    });
    setNotice('Screen frame captured (lossless HD) and attached. Ask or edit with Roosters AI!');
  };

  const handleToggleMic = async () => {
    if (!isOnline) {
      setNotice('You are offline. Connect to the internet to use voice chat.');
      return;
    }
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (
      typeof MediaRecorder === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setNotice(
        'Voice recording is not supported in this browser. Please type your message or update your browser.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 200) return;

        setIsTranscribing(true);
        setNotice('');
        try {
          const audioBase64 = await blobToBase64(audioBlob);
          const resolved = resolveActiveProvider(hasServerGeminiKey);
          const resp = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: mimeType.split(';')[0],
              language: selectedLanguage,
              apiKey: resolved.provider === 'gemini' ? resolved.apiKey || undefined : undefined,
            }),
          });
          const contentType = resp.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('Voice file transcription requires the server endpoint; use Live Talk for browser speech input!');
          }
          const data = (await resp.json()) as { text?: string; error?: string };
          if (!resp.ok) {
            throw new Error(data.error || 'Voice transcription failed.');
          }
          if (data.text) {
            setInputValue((prev) => (prev ? `${prev} ${data.text}` : data.text ?? ''));
            textareaRef.current?.focus();
          } else {
            setNotice('No speech detected in the recording.');
          }
        } catch (err) {
          setNotice(err instanceof Error ? err.message : 'Unable to transcribe audio.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setNotice('');
    } catch {
      setNotice('Microphone permission was denied or no microphone was found.');
    }
  };

  const handleEditArtwork = async (params: {
    prompt: string;
    sourceImageDataUrl: string;
    sourceMimeType?: string;
    aspectRatio?: '1:1' | '16:9' | '4:3';
    resolution?: '1K' | '2K';
    userAttachment?: MessageAttachment;
    previousEditContext?: string;
    preEnhanced?: { detailedPrompt: string; shortTitle: string };
    displayUserText?: string;
  }) => {
    if (!isOnline) {
      setNotice('You are offline. Connect to the internet to edit HD photos.');
      return;
    }
    setIsGeneratingImage(true);
    setNotice('');

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: createId('msg'),
        role: 'user',
        content: params.displayUserText || params.prompt,
        createdAt: Date.now(),
        attachment: params.userAttachment,
      },
    ];
    const assistantPlaceholderId = createId('msg');
    const loadingMsg: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: 'Editing photo with Nano Banana HD (preserving subject identity)...',
      createdAt: Date.now(),
      isPending: true,
    };
    const currentSessionId = syncMessagesToSession(nextMessages);
    setMessages([...nextMessages, loadingMsg]);
    setIsImageModalOpen(false);

    const updateProgressText = (statusText: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantPlaceholderId ? { ...m, content: statusText } : m))
      );
    };

    try {
      const data = await editArtworkUnified({
        prompt: params.prompt,
        sourceImageDataUrl: params.sourceImageDataUrl,
        sourceMimeType: params.sourceMimeType,
        aspectRatio: params.aspectRatio || '1:1',
        resolution: params.resolution || '1K',
        previousEditContext: params.previousEditContext,
        preEnhanced: params.preEnhanced,
        hasBackendApi,
        hasServerGeminiKey,
        onStatus: updateProgressText,
      });

      const assistantReplyText = data.assistantText
        ? `${data.assistantText}\n\nHere is your edited HD image (**${data.title}**). Reply with any follow-up refinement anytime!`
        : `Here is your edited HD image (**${data.title}**). Reply with any follow-up edit like *"now make it night time"* anytime!`;

      const aiMsg: ChatMessage = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: assistantReplyText,
        createdAt: Date.now(),
        generatedImage: {
          title: data.title,
          description: data.description,
          detailedPrompt: data.detailedPrompt,
          imageUrl: data.imageUrl,
          provider: data.provider,
          modelUsed: data.modelUsed,
          isEdited: true,
          aspectRatio: data.aspectRatio,
          width: data.width,
          height: data.height,
        },
      };

      const finalMessages = [...nextMessages, aiMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Unable to edit photo with Nano Banana.',
        createdAt: Date.now(),
        isError: true,
      };
      const finalMessages = [...nextMessages, errMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateArtwork = async (
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '4:3',
    displayUserText?: string,
    options?: {
      preEnhanced?: { detailedPrompt: string; shortTitle: string };
      replaceAssistantId?: string;
      baseMessages?: ChatMessage[];
      sessionId?: string;
      resolution?: '1K' | '2K';
      referenceImage?: { dataUrl: string; mimeType: string; name: string };
    }
  ) => {
    if (options?.referenceImage?.dataUrl) {
      const refImg = options.referenceImage;
      await handleEditArtwork({
        prompt,
        sourceImageDataUrl: refImg.dataUrl,
        sourceMimeType: refImg.mimeType,
        aspectRatio,
        resolution: options.resolution || '1K',
        userAttachment: {
          kind: 'image',
          name: refImg.name,
          mimeType: refImg.mimeType,
          base64: (refImg.dataUrl.split(',')[1] || '').trim(),
          dataUrl: refImg.dataUrl,
          source: 'upload',
        },
        displayUserText: displayUserText || `Edit Photo (${aspectRatio}): ${prompt}`,
      });
      return;
    }

    if (!isOnline) {
      setNotice('You are offline. Connect to the internet to generate new HD images.');
      return;
    }
    setIsGeneratingImage(true);
    setNotice('');

    const nextMessages: ChatMessage[] = options?.baseMessages
      ? options.baseMessages
      : [
          ...messages,
          {
            id: createId('msg'),
            role: 'user',
            content: displayUserText || `Create Image (${aspectRatio}): ${prompt}`,
            createdAt: Date.now(),
          },
        ];
    const assistantPlaceholderId = options?.replaceAssistantId || createId('msg');
    const loadingMsg: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: options?.preEnhanced
        ? 'Generating uncompressed HD image...'
        : 'Enhancing your prompt with Gemini AI...',
      createdAt: Date.now(),
      isPending: true,
    };
    const currentSessionId = options?.sessionId ?? syncMessagesToSession(nextMessages);
    setMessages([...nextMessages, loadingMsg]);
    setIsImageModalOpen(false);

    const updateProgressText = (statusText: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantPlaceholderId ? { ...m, content: statusText } : m))
      );
    };

    try {
      const data = await generateArtworkUnified({
        prompt,
        aspectRatio,
        resolution: options?.resolution || '1K',
        language: selectedLanguage,
        hasBackendApi,
        hasServerGeminiKey,
        preEnhanced: options?.preEnhanced,
        onStatus: updateProgressText,
      });

      const providerBadge =
        data.provider === 'nano-banana'
          ? ' (Nano Banana HD)'
          : data.provider === 'horde'
            ? ' (Free AI Horde Engine)'
            : data.provider === 'svg'
              ? ' (Vector Studio)'
              : '';

      const aiMsg: ChatMessage = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: `Here is your ${data.width}×${data.height} HD AI image with my compliments${providerBadge}: **${data.title}**`,
        createdAt: Date.now(),
        generatedImage: {
          title: data.title,
          description: data.description,
          detailedPrompt: data.detailedPrompt,
          svgCode: data.svgCode,
          imageUrl: data.imageUrl,
          provider: data.provider,
          modelUsed: data.modelUsed,
          aspectRatio: data.aspectRatio,
          width: data.width,
          height: data.height,
        },
      };

      const finalMessages = [...nextMessages, aiMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Unable to generate HD image.',
        createdAt: Date.now(),
        isError: true,
      };
      const finalMessages = [...nextMessages, errMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async (
    prompt: string,
    style: string,
    displayUserText?: string
  ) => {
    if (!isOnline) {
      setNotice('You are offline. Connect to the internet to generate new AI videos.');
      return;
    }
    setIsGeneratingVideo(true);
    setNotice('');

    const userMsg: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      content: displayUserText || `Create AI Video (${style}): ${prompt}`,
      createdAt: Date.now(),
    };
    const assistantPlaceholderId = createId('msg');
    const loadingMsg: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: 'Directing your cinematic AI video story...',
      createdAt: Date.now(),
      isPending: true,
    };
    const nextMessages = [...messages, userMsg];
    const currentSessionId = syncMessagesToSession(nextMessages);
    setMessages([...nextMessages, loadingMsg]);
    setIsVideoModalOpen(false);

    const updateProgressText = (statusText: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantPlaceholderId ? { ...m, content: statusText } : m))
      );
    };

    try {
      const videoData = await generateVideoUnified({
        prompt,
        style,
        language: selectedLanguage,
        hasBackendApi,
        hasServerGeminiKey,
        onStatus: updateProgressText,
      });

      const aiMsg: ChatMessage = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: `Here is your playable multi-scene AI video story: **${videoData.title}**`,
        createdAt: Date.now(),
        generatedVideo: videoData,
      };

      const finalMessages = [...nextMessages, aiMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
      setIsVideoModalOpen(false);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Unable to generate AI video.',
        createdAt: Date.now(),
        isError: true,
      };
      const finalMessages = [...nextMessages, errMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
      setIsVideoModalOpen(false);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(msg.content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = msg.content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopiedMessageId(msg.id);
      window.setTimeout(() => {
        setCopiedMessageId((curr) => (curr === msg.id ? null : curr));
      }, 1800);
    } catch {
      setNotice('Could not copy message to clipboard on this browser.');
    }
  };

  const speakViaVoiceStudio = (msg: ChatMessage): boolean => {
    if (!isSpeechSynthesisSupported()) return false;
    const spoken = cleanTextForSpeech(msg.content);
    if (!spoken) return false;
    unlockSpeechSynthesis();
    setTtsPausedId(null);
    setTtsPlayingId(msg.id);

    const overrideParams = msg.voiceNote
      ? {
          pitch: msg.voiceNote.pitch,
          rate: msg.voiceNote.rate,
          genderHint: msg.voiceNote.genderHint,
          language: msg.voiceNote.language,
          accentTone: msg.voiceNote.accentTone,
          preferredVoiceURI: msg.voiceNote.preferredVoiceURI,
        }
      : undefined;

    // Attach voiceNote badge dynamically if Sample Voice is active so user gets WhatsApp player
    if (!msg.voiceNote && voiceSettings.activeVoiceId === 'cloned' && voiceSettings.clonedProfile) {
      const note = buildActiveSampleVoiceNote(spoken, msg.role === 'user');
      if (note) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, voiceNote: note } : m))
        );
      }
    }

    speakWithVoiceProfile({
      text: spoken,
      language:
        msg.voiceNote?.language ||
        (voiceSettings.activeVoiceId === 'cloned' ? voiceSettings.clonedProfile?.language : undefined) ||
        selectedLanguage,
      voiceSettings,
      voiceGender: userSettings.voiceGender,
      speedMultiplier: userSettings.speechSpeed,
      overrideParams,
      onEnd: () => {
        setTtsPlayingId((curr) => (curr === msg.id ? null : curr));
        setTtsPausedId((curr) => (curr === msg.id ? null : curr));
      },
      onError: () => {
        setTtsPlayingId((curr) => (curr === msg.id ? null : curr));
        setTtsPausedId((curr) => (curr === msg.id ? null : curr));
      },
    });
    return true;
  };

  const handleListenTTS = async (msg: ChatMessage) => {
    if (ttsPlayingId === msg.id) {
      if (msg.voiceNote && isSpeechSynthesisSupported()) {
        try {
          window.speechSynthesis.pause();
          setTtsPlayingId(null);
          setTtsPausedId(msg.id);
          return;
        } catch {
          // Fall through to clean stop
        }
      }
      stopAudioPlayback();
      return;
    }

    if (ttsPausedId === msg.id && isSpeechSynthesisSupported() && window.speechSynthesis.paused) {
      try {
        window.speechSynthesis.resume();
        setTtsPausedId(null);
        setTtsPlayingId(msg.id);
        return;
      } catch {
        // Fall through to clean replay
      }
    }

    stopAudioPlayback();
    setTtsLoadingId(msg.id);
    setNotice('');

    try {
      // If message has a saved Voice Note or a custom preset/cloned voice is active, play via Voice Engine
      if (msg.voiceNote || voiceSettings.activeVoiceId !== 'default') {
        if (speakViaVoiceStudio(msg)) return;
      }

      const resolved = resolveActiveProvider(hasServerGeminiKey);
      if (!hasBackendApi || resolved.provider !== 'gemini') {
        if (speakViaVoiceStudio(msg)) {
          return;
        }
        throw new Error('Text-to-Speech unavailable in this browser.');
      }

      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: msg.content,
          language: selectedLanguage,
          apiKey: resolved.apiKey || undefined,
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (speakViaVoiceStudio(msg)) return;
        throw new Error('Text-to-Speech unavailable.');
      }
      const data = (await resp.json()) as { audioBase64?: string; mimeType?: string; error?: string };
      if (!resp.ok || !data.audioBase64) {
        if (speakViaVoiceStudio(msg)) {
          return;
        }
        throw new Error(data.error || 'Text-to-Speech unavailable.');
      }

      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      audioRef.current = audio;
      setTtsPlayingId(msg.id);

      audio.onended = () => {
        setTtsPlayingId((curr) => (curr === msg.id ? null : curr));
        audioRef.current = null;
      };
      audio.onerror = () => {
        setTtsPlayingId(null);
        audioRef.current = null;
        speakViaVoiceStudio(msg);
      };

      await audio.play();
    } catch (err) {
      if (!speakViaVoiceStudio(msg)) {
        setNotice(err instanceof Error ? err.message : 'Unable to play speech audio.');
        setTtsPlayingId(null);
      }
    } finally {
      setTtsLoadingId(null);
    }
  };

  const handleCloseLiveTalk = (transcriptTurns?: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    setIsLiveTalkOpen(false);
    if (transcriptTurns && transcriptTurns.length > 0) {
      const now = Date.now();
      const added: ChatMessage[] = transcriptTurns.map((t, idx) => ({
        id: createId(`live_${idx}`),
        role: t.role,
        content: t.content,
        createdAt: now + idx,
      }));
      const merged = [...messages, ...added];
      setMessages(merged);
      syncMessagesToSession(merged);
    }
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const handleCopyCallback = useCallback((msg: ChatMessage) => {
    void handleCopyMessage(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleListenCallback = useCallback((msg: ChatMessage) => {
    void handleListenTTS(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsPlayingId, ttsPausedId, selectedLanguage, voiceSettings]);

  const handleQuickEditImageCallback = useCallback(() => {
    setNotice('Multi-turn edit ready: type your change below (e.g., "now make it night time", "change outfit to a black jacket").');
    textareaRef.current?.focus();
  }, []);

  const wallpaperStyle = useMemo(
    () => getWallpaperStyle(themeSettings, theme),
    [themeSettings, theme]
  );

  return (
    <div
      className="app-viewport-height flex flex-col overflow-hidden overflow-x-hidden transition-colors duration-200"
      style={{
        backgroundColor: theme.canvasBg,
        color: theme.textPrimary,
      }}
    >
      {/* Top Announcement Banner (Owner Controlled) */}
      {ownerConfig.announcementEnabled && ownerConfig.announcementText.trim() && (
        <div
          role="status"
          className="shrink-0 px-3 py-1.5 text-center text-[12px] font-semibold border-b flex items-center justify-center gap-2"
          style={{
            background: `linear-gradient(90deg, ${theme.accentSecondary}22, ${theme.accentPrimary}22)`,
            borderColor: `${theme.accentSecondary}55`,
            color: theme.textPrimary,
          }}
        >
          <Megaphone className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accentPrimary }} />
          <span className="truncate">{ownerConfig.announcementText}</span>
        </div>
      )}

      {/* Top Header */}
      <header
        className="shrink-0 relative z-30 border-b backdrop-blur-md px-2.5 sm:px-4 lg:px-6 py-2 sm:py-3"
        style={{
          backgroundColor: theme.headerBg,
          borderColor: theme.borderColor,
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left: Sidebar Toggle, Uploaded Logo, Title + v2.0 Badge, Live Users Badge, User Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              title={showHistory ? 'Hide Chat History' : 'Show Chat History'}
              aria-label="Toggle Saved Chat History Sidebar"
              className="p-1.5 sm:p-2 rounded-lg border transition-colors cursor-pointer shrink-0"
              style={{
                backgroundColor: showHistory ? theme.subSurfaceBg : theme.cardBg,
                borderColor: showHistory ? theme.accentSecondary : theme.borderColor,
                color: showHistory ? theme.accentSecondary : theme.textPrimary,
              }}
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden border bg-[#111622] shrink-0"
              style={{ borderColor: theme.borderColor }}
            >
              <img
                src={ROOSTERS_LOGO_SRC}
                alt="Roosters AI"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
              <span
                className="font-display font-bold text-[15px] sm:text-[18px] bg-clip-text text-transparent whitespace-nowrap shrink-0"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${theme.accentPrimary} 0%, ${theme.accentSecondary} 100%)`,
                }}
              >
                Roosters AI
              </span>

              {/* Version 2.0 Badge */}
              <span
                className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-bold tracking-wide border whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: `${theme.accentPrimary}18`,
                  borderColor: `${theme.accentPrimary}66`,
                  color: theme.accentPrimary,
                  boxShadow: `0 0 12px ${theme.accentPrimary}2e`,
                }}
              >
                v2.0
              </span>

              {/* Live Active Visitors Badge */}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border whitespace-nowrap shrink-0 tabular-nums"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  borderColor: 'rgba(16, 185, 129, 0.45)',
                  color: theme.isLight ? '#047857' : '#34d399',
                  boxShadow: '0 0 14px rgba(16, 185, 129, 0.22)',
                }}
                title="Real-time active learners & creators"
              >
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse"
                  style={{ boxShadow: '0 0 8px #10b981' }}
                />
                <span>Live Users: {liveUsers}</span>
              </span>

              <div
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium max-w-[140px]"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textSecondary,
                }}
                title={user.email}
              >
                <User className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accentSecondary }} />
                <span className="truncate">{user.fullName}</span>
              </div>
            </div>
          </div>

          {/* Right: Always-visible + New Chat, Always-visible Live Talk, Mobile Tools Dropdown, & Desktop Inline Controls */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 ml-auto">
            {/* + New Chat Button (Always visible on mobile & desktop) */}
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border text-[12px] sm:text-[12.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accentSecondary }} />
              <span>New Chat</span>
            </button>

            {/* Prominent Live Talk Button (Always visible & tappable when online; disabled offline) */}
            <button
              type="button"
              disabled={!isOnline}
              onClick={() => {
                if (!isOnline) return;
                stopAudioPlayback();
                setIsToolsMenuOpen(false);
                setIsLiveTalkOpen(true);
              }}
              title={
                isOnline
                  ? 'Start Hands-Free Live Voice Conversation'
                  : 'Connect to the internet to use Live Talk'
              }
              aria-label="Live Talk"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border font-bold text-[12px] sm:text-[12.5px] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:brightness-100 whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: isOnline ? theme.accentSecondary : theme.borderColor,
                color: isOnline ? theme.accentSecondary : theme.textMuted,
                boxShadow:
                  !isOnline || theme.liteMode ? 'none' : `0 0 14px ${theme.accentSecondary}30`,
              }}
            >
              <AudioLines className="w-3.5 h-3.5 shrink-0" />
              <span>Live Talk</span>
            </button>

            {/* Quick Mobile Settings Gear Button (< lg screens) */}
            <button
              type="button"
              onClick={() => {
                setIsToolsMenuOpen(false);
                setIsUserSettingsOpen(true);
              }}
              title="Settings"
              aria-label="Open Settings"
              className="lg:hidden p-1.5 rounded-lg border transition-colors shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.borderColor,
                color: theme.accentSecondary,
              }}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Mobile Collapsible "Tools ▾" Menu (< lg screens) */}
            <div ref={toolsMenuRef} className="relative lg:hidden">
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen((prev) => !prev)}
                aria-expanded={isToolsMenuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: isToolsMenuOpen ? theme.subSurfaceBg : theme.cardBg,
                  borderColor: isToolsMenuOpen ? theme.accentPrimary : theme.borderColor,
                  color: isToolsMenuOpen ? theme.accentPrimary : theme.textPrimary,
                }}
              >
                <Wrench className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accentPrimary }} />
                <span>Tools</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    isToolsMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isToolsMenuOpen && (
                <div
                  role="menu"
                  aria-label="Roosters AI Tools Menu"
                  className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.25rem)] max-h-[75dvh] overflow-y-auto rounded-2xl border p-3 shadow-2xl z-50 space-y-2"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.borderColor,
                    color: theme.textPrimary,
                  }}
                >
                  {/* Signed-in User Row */}
                  <div
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-[12px]"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textSecondary,
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accentSecondary }} />
                      <span className="truncate font-medium">{user.fullName}</span>
                    </div>
                    <span className="text-[10.5px] opacity-75 shrink-0">Pro v2.0</span>
                  </div>

                  {/* World Languages Selector */}
                  <div className="relative flex items-center">
                    <Globe
                      className="w-3.5 h-3.5 absolute left-3 pointer-events-none"
                      style={{ color: theme.accentSecondary }}
                    />
                    <select
                      aria-label="World Languages"
                      value={selectedLanguage}
                      onChange={(e) => {
                        handleLanguageChange(e.target.value);
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full pl-8 pr-6 py-2 rounded-xl border text-[12.5px] font-medium focus:outline-none cursor-pointer appearance-none"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    >
                      {WORLD_LANGUAGES.map((lang) => (
                        <option
                          key={lang.code}
                          value={lang.code}
                          style={{ backgroundColor: theme.cardBg, color: theme.textPrimary }}
                        >
                          {lang.label} ({lang.native})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action Grid */}
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        setIsUserSettingsOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    >
                      <Settings className="w-4 h-4 shrink-0" style={{ color: theme.accentSecondary }} />
                      <span>Settings</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isOnline}
                      onClick={() => {
                        if (!isOnline) return;
                        setIsToolsMenuOpen(false);
                        setIsImageModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.accentPrimary,
                      }}
                    >
                      <Palette className="w-4 h-4 shrink-0" />
                      <span>Create Image (Unlimited HD)</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isOnline}
                      onClick={() => {
                        if (!isOnline) return;
                        setIsToolsMenuOpen(false);
                        setIsVideoModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.accentSecondary,
                      }}
                    >
                      <Film className="w-4 h-4 shrink-0" />
                      <span>Create Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        setIsThemeModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    >
                      <Paintbrush className="w-4 h-4 shrink-0" style={{ color: theme.accentPrimary }} />
                      <span>Theme &amp; Wallpaper</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        setIsTextReaderOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    >
                      <BookOpen className="w-4 h-4 shrink-0" style={{ color: theme.accentSecondary }} />
                      <span>Text Reader</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        void handleToggleScreenShare();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: screenStream ? theme.accentSecondary : theme.borderColor,
                        color: screenStream ? theme.accentSecondary : theme.textPrimary,
                      }}
                    >
                      {screenStream ? (
                        <MonitorOff className="w-4 h-4 shrink-0" />
                      ) : (
                        <Monitor className="w-4 h-4 shrink-0" />
                      )}
                      <span>{screenStream ? 'Stop Screen Share' : 'Screen Share'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        setIsVoiceModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor:
                          voiceSettings.activeVoiceId !== 'default'
                            ? theme.accentPrimary
                            : theme.borderColor,
                        color:
                          voiceSettings.activeVoiceId !== 'default'
                            ? theme.accentPrimary
                            : theme.textPrimary,
                      }}
                    >
                      <Dna className="w-4 h-4 shrink-0" style={{ color: theme.accentSecondary }} />
                      <span>Voice Clone Studio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        handleExportChat();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-left cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    >
                      <Download className="w-4 h-4 shrink-0" style={{ color: theme.accentSecondary }} />
                      <span>Export Chat (.txt)</span>
                    </button>
                  </div>

                  <div
                    className="pt-2 border-t flex items-center justify-between gap-2"
                    style={{ borderColor: theme.borderColor }}
                  >
                    <PWAInstallButton
                      theme={theme}
                      onOpenModal={() => {
                        setIsToolsMenuOpen(false);
                        setIsInstallModalOpen(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        handleCleanLogout();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium hover:text-[#ff4d4d] transition-colors cursor-pointer ml-auto"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textSecondary,
                      }}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Full Expanded Tools Bar (lg+ screens) */}
            <div className="hidden lg:flex flex-wrap items-center gap-1.5">
              {/* World Languages Selector */}
              <div className="relative flex items-center">
                <Globe
                  className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                  style={{ color: theme.accentSecondary }}
                />
                <select
                  aria-label="World Languages"
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="pl-8 pr-6 py-1.5 rounded-lg border text-[12.5px] font-medium focus:outline-none cursor-pointer appearance-none"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.borderColor,
                    color: theme.textPrimary,
                  }}
                >
                  {WORLD_LANGUAGES.map((lang) => (
                    <option
                      key={lang.code}
                      value={lang.code}
                      style={{ backgroundColor: theme.cardBg, color: theme.textPrimary }}
                    >
                      {lang.label} ({lang.native})
                    </option>
                  ))}
                </select>
              </div>

              {/* User Settings Button (Gear Icon) */}
              <button
                type="button"
                onClick={() => setIsUserSettingsOpen(true)}
                title="AI & Voice Settings"
                aria-label="Settings"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textPrimary,
                }}
              >
                <Settings className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
                <span>Settings</span>
              </button>

              {/* Theme & Wallpaper Button */}
              <button
                type="button"
                onClick={() => setIsThemeModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textPrimary,
                }}
              >
                <Paintbrush className="w-3.5 h-3.5" style={{ color: theme.accentPrimary }} />
                <span>Theme &amp; Wallpaper</span>
              </button>

              {/* Text Reader Button */}
              <button
                type="button"
                onClick={() => setIsTextReaderOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textPrimary,
                }}
              >
                <BookOpen className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
                <span>Text Reader</span>
              </button>

              {/* Screen Share Button */}
              <button
                type="button"
                onClick={handleToggleScreenShare}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: screenStream ? theme.accentSecondary : theme.borderColor,
                  color: screenStream ? theme.accentSecondary : theme.textPrimary,
                }}
              >
                {screenStream ? <MonitorOff className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                <span>{screenStream ? 'Stop Share' : 'Screen Share'}</span>
              </button>

              {/* Create Image Button */}
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => {
                  if (!isOnline) return;
                  setIsImageModalOpen(true);
                }}
                title={isOnline ? 'Create HD AI Image' : 'Connect to the internet to create images'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.accentPrimary,
                }}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Create Image</span>
              </button>

              {/* Create Video Button */}
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => {
                  if (!isOnline) return;
                  setIsVideoModalOpen(true);
                }}
                title={isOnline ? 'Create AI Video' : 'Connect to the internet to create videos'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.accentSecondary,
                }}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Create Video</span>
              </button>

              {/* Voice Clone Studio Button */}
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor:
                    voiceSettings.activeVoiceId !== 'default'
                      ? theme.accentPrimary
                      : theme.borderColor,
                  color:
                    voiceSettings.activeVoiceId !== 'default'
                      ? theme.accentPrimary
                      : theme.textPrimary,
                }}
              >
                <Dna
                  className="w-3.5 h-3.5"
                  style={{
                    color:
                      voiceSettings.activeVoiceId !== 'default'
                        ? theme.accentPrimary
                        : theme.accentSecondary,
                  }}
                />
                <span>Voice Clone</span>
              </button>

              {/* Export Chat Button */}
              <button
                type="button"
                onClick={handleExportChat}
                title="Download study session or code solutions as a .txt file"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textPrimary,
                }}
              >
                <Download className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
                <span>Export Chat</span>
              </button>

              {/* Prominent PWA Install App Button */}
              <PWAInstallButton
                theme={theme}
                onOpenModal={() => setIsInstallModalOpen(true)}
              />

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleCleanLogout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium hover:text-[#ff4d4d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textSecondary,
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Mobile backdrop for sidebar drawer */}
        {showHistory && (
          <div
            aria-hidden="true"
            onClick={() => setShowHistory(false)}
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          />
        )}

        {/* Collapsible Saved Chat History Left Sidebar */}
        {showHistory && (
          <aside
            className="fixed lg:relative inset-y-0 left-0 w-72 shrink-0 border-r flex flex-col z-30 shadow-2xl lg:shadow-none"
            style={{
              backgroundColor: theme.sidebarBg,
              borderColor: theme.borderColor,
            }}
          >
            <div
              className="p-3 border-b space-y-2.5"
              style={{ borderColor: theme.borderColor }}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-[12.5px] font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                  Chat History
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  aria-label="Collapse History Sidebar"
                  className="p-1 rounded cursor-pointer"
                  style={{ color: theme.textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full py-2.5 px-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all hover:brightness-110 cursor-pointer"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </button>
            </div>

            {user.isGuest && (
              <div
                role="status"
                className="mx-2.5 mt-2.5 px-3 py-2.5 rounded-xl border text-[11.5px] leading-relaxed"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.textSecondary,
                }}
              >
                <p className="italic">
                  Guest Mode: Chats are not saved. Log in or Sign up to save your conversation history.
                </p>
                <button
                  type="button"
                  onClick={handleCleanLogout}
                  className="mt-1.5 text-[11.5px] font-semibold underline cursor-pointer"
                  style={{ color: theme.accentSecondary }}
                >
                  Log in / Sign up
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {sessions.length === 0 ? (
                <p className="text-[12.5px] px-3 py-8 text-center" style={{ color: theme.textMuted }}>
                  {user.isGuest
                    ? 'Temporary guest session active. Your messages clear when you refresh or close the tab.'
                    : 'No saved conversations yet. Send a message to save your study history automatically.'}
                </p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[13px] transition-colors"
                    style={{
                      backgroundColor: activeSessionId === session.id ? theme.cardBg : 'transparent',
                      borderColor:
                        activeSessionId === session.id ? theme.accentSecondary : 'transparent',
                      color: activeSessionId === session.id ? theme.textPrimary : theme.textMuted,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSession(session)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="truncate font-medium">{session.title}</div>
                      <div className="text-[10.5px] opacity-70 tabular-nums mt-0.5">
                        {session.messages.length} messages ·{' '}
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(session.id)}
                      aria-label="Delete conversation"
                      title="Delete chat"
                      className="opacity-65 hover:opacity-100 hover:text-[#ff4d4d] p-1 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Chat Workspace with Theme + Wallpaper */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 relative" style={wallpaperStyle}>
          {ownerConfig.maintenanceMode && (
            <div
              role="alert"
              className="absolute inset-0 z-40 backdrop-blur-md flex items-center justify-center p-6 text-center"
              style={{ backgroundColor: 'rgba(7, 9, 14, 0.88)' }}
            >
              <div
                className="max-w-md w-full rounded-2xl border p-6 shadow-2xl space-y-4"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: '#f59e0b66',
                  color: theme.textPrimary,
                }}
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-display text-[19px] font-bold">
                    Scheduled Maintenance Mode
                  </h2>
                  <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: theme.textSecondary }}>
                    Roosters AI by SandSoft is temporarily undergoing maintenance and upgrades. Please check back shortly!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsApiKeyModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[12.5px] font-semibold cursor-pointer"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                    color: theme.accentPrimary,
                  }}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Owner Access</span>
                </button>
              </div>
            </div>
          )}
          {/* Top-of-Chat Active Voice Toggle Strip */}
          <div
            className="shrink-0 border-b px-3 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px]"
            style={{
              backgroundColor: theme.headerBg,
              borderColor: theme.borderColor,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Dna
                className="w-3.5 h-3.5 shrink-0"
                style={{
                  color:
                    voiceSettings.activeVoiceId === 'cloned' && voiceSettings.clonedProfile
                      ? theme.accentPrimary
                      : theme.accentSecondary,
                }}
              />
              <span className="truncate font-medium" style={{ color: theme.textSecondary }}>
                Active Voice:{' '}
                <strong
                  style={{
                    color:
                      voiceSettings.activeVoiceId === 'cloned' && voiceSettings.clonedProfile
                        ? theme.accentPrimary
                        : theme.textPrimary,
                  }}
                >
                  {voiceSettings.activeVoiceId === 'cloned' && voiceSettings.clonedProfile
                    ? voiceSettings.clonedProfile.name
                    : voiceSettings.clonedProfile
                      ? `${voiceSettings.clonedProfile.name} (Paused)`
                      : 'Default Roosters AI'}
                </strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
              {voiceSettings.clonedProfile ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={voiceSettings.activeVoiceId === 'cloned'}
                  onClick={() =>
                    handleUpdateVoiceSettings({
                      ...voiceSettings,
                      activeVoiceId:
                        voiceSettings.activeVoiceId === 'cloned' ? 'default' : 'cloned',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-bold transition-all cursor-pointer"
                  style={{
                    backgroundColor:
                      voiceSettings.activeVoiceId === 'cloned'
                        ? `${theme.accentPrimary}22`
                        : theme.subSurfaceBg,
                    borderColor:
                      voiceSettings.activeVoiceId === 'cloned'
                        ? theme.accentPrimary
                        : theme.borderColor,
                    color:
                      voiceSettings.activeVoiceId === 'cloned'
                        ? theme.accentPrimary
                        : theme.textSecondary,
                  }}
                >
                  <span>{voiceSettings.activeVoiceId === 'cloned' ? 'ON' : 'OFF'}</span>
                  <span
                    className="w-7 h-3.5 rounded-full p-0.5 transition-colors flex items-center"
                    style={{
                      backgroundColor:
                        voiceSettings.activeVoiceId === 'cloned' ? theme.accentPrimary : '#334155',
                      justifyContent:
                        voiceSettings.activeVoiceId === 'cloned' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white shadow" />
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                role="switch"
                aria-checked={Boolean(voiceSettings.voiceMessageMode)}
                onClick={() =>
                  handleUpdateVoiceSettings({
                    ...voiceSettings,
                    voiceMessageMode: !voiceSettings.voiceMessageMode,
                  })
                }
                title="When ON, any text you type and send is also spoken aloud as a Voice Note"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11.5px] font-semibold transition-all cursor-pointer"
                style={{
                  backgroundColor: voiceSettings.voiceMessageMode
                    ? `${theme.accentSecondary}22`
                    : theme.subSurfaceBg,
                  borderColor: voiceSettings.voiceMessageMode
                    ? theme.accentSecondary
                    : theme.borderColor,
                  color: voiceSettings.voiceMessageMode
                    ? theme.accentSecondary
                    : theme.textSecondary,
                }}
              >
                <AudioLines className="w-3 h-3 shrink-0" />
                <span>Voice Msg: {voiceSettings.voiceMessageMode ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="px-2.5 py-1 rounded-lg border text-[11.5px] font-semibold transition-colors cursor-pointer"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                  color: theme.accentSecondary,
                }}
              >
                {voiceSettings.clonedProfile ? 'Calibrate / Speak' : 'Clone Your Voice'}
              </button>
            </div>
          </div>
          {/* Active Screen Share Bar */}
          {screenStream && (
            <div
              className="shrink-0 border-b px-4 py-2.5"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.borderColor,
              }}
            >
              <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-14 w-24 rounded-lg object-cover border bg-black"
                    style={{ borderColor: theme.accentSecondary }}
                  />
                  <div>
                    <p className="text-[13px] font-semibold">Live Screen Share Active</p>
                    <p className="text-[11.5px]" style={{ color: theme.textMuted }}>
                      Capture the current frame to analyze UI, code, or study material with Roosters AI.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureScreenFrame}
                    className="px-3.5 py-1.5 rounded-lg font-bold text-[12px] cursor-pointer"
                    style={{
                      backgroundImage: theme.sendButtonGradient,
                      color: theme.sendButtonText,
                    }}
                  >
                    Capture Frame to Chat
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleScreenShare}
                    className="px-3 py-1.5 rounded-lg border text-[12px] font-medium hover:text-[#ff4d4d] cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  >
                    Stop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Thread */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-5">
              {messages.length === 0 ? (
                <div className="py-10 sm:py-14 flex flex-col items-center text-center">
                  <div
                    className="w-20 h-20 rounded-2xl bg-[#121622] border overflow-hidden p-1 flex items-center justify-center"
                    style={{
                      borderColor: theme.accentSecondary,
                      boxShadow: `0 0 28px ${theme.accentSecondary}2b`,
                    }}
                  >
                    <img
                      src={ROOSTERS_LOGO_SRC}
                      alt="Roosters AI"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-center rounded-xl"
                    />
                  </div>

                  <h2 className="mt-5 font-display text-[24px] sm:text-[28px] font-bold">
                    Welcome,{' '}
                    <span
                      className="bg-clip-text text-transparent"
                      style={{
                        backgroundImage: `linear-gradient(90deg, ${theme.accentPrimary} 0%, ${theme.accentSecondary} 100%)`,
                      }}
                    >
                      {user.fullName}
                    </span>
                  </h2>

                  <p className="mt-2 max-w-lg text-[14px]" style={{ color: theme.textMuted }}>
                    Your fast, polite, all-purpose AI assistant by SandSoft. Ask anything for clear direct answers, analyze photos &amp; files, start a hands-free Live Talk call, or create HD images &amp; videos.
                  </p>

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
                    {QUICK_PROMPTS.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        disabled={!isOnline}
                        onClick={() => {
                          if (!isOnline) return;
                          void handleSendMessage(item.prompt);
                        }}
                        className="p-4 rounded-xl border transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.borderColor,
                        }}
                      >
                        <div
                          className="text-[13.5px] font-semibold transition-colors"
                          style={{ color: theme.accentPrimary }}
                        >
                          {item.title}
                        </div>
                        <div className="mt-1 text-[12.5px] line-clamp-2" style={{ color: theme.textMuted }}>
                          {item.prompt}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <ChatMessageRow
                    key={msg.id}
                    msg={msg}
                    theme={theme}
                    selectedLanguage={selectedLanguage}
                    voiceSettings={voiceSettings}
                    isCopied={copiedMessageId === msg.id}
                    isTtsLoading={ttsLoadingId === msg.id}
                    isTtsPlaying={ttsPlayingId === msg.id}
                    isTtsPaused={ttsPausedId === msg.id}
                    onCopy={handleCopyCallback}
                    onListen={handleListenCallback}
                    onQuickEditImage={handleQuickEditImageCallback}
                  />
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Bottom Input Bar */}
          <div
            className="shrink-0 border-t px-2.5 sm:px-6 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-3.5"
            style={{
              backgroundColor: theme.headerBg,
              borderColor: theme.borderColor,
            }}
          >
            <div className="max-w-4xl mx-auto">
              {/* Inline Notice / Error */}
              {notice && (
                <div
                  className="mb-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[12.5px]"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.borderColor,
                    color: theme.textPrimary,
                  }}
                >
                  <span>{notice}</span>
                  <button
                    type="button"
                    onClick={() => setNotice('')}
                    aria-label="Dismiss notice"
                    className="cursor-pointer shrink-0"
                    style={{ color: theme.textMuted }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!isOnline ? (
                <div
                  role="status"
                  className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4 py-3 rounded-2xl border text-[13px]"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: 'rgba(245, 158, 11, 0.45)',
                    color: theme.textPrimary,
                  }}
                >
                  <div className="flex items-center gap-2.5 text-center sm:text-left">
                    <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      You are offline. You can read your saved conversations, but please connect to the internet to start a new chat.
                    </span>
                  </div>
                  {!showHistory && !user.isGuest && sessions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHistory(true)}
                      className="px-3 py-1.5 rounded-lg border text-[12px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.accentSecondary,
                      }}
                    >
                      Browse Saved Chats
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Attachment Preview */}
                  {pendingAttachment && (
                    <div
                      className="mb-2.5 inline-flex items-center gap-2.5 px-3 py-2 rounded-xl border max-w-full"
                      style={{
                        backgroundColor: theme.cardBg,
                        borderColor: theme.accentSecondary,
                      }}
                    >
                      {pendingAttachment.kind === 'file' ? (
                        <div
                          className="w-10 h-10 rounded-lg border flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: theme.subSurfaceBg,
                            borderColor: theme.borderColor,
                          }}
                        >
                          <FileCode className="w-5 h-5" style={{ color: theme.accentPrimary }} />
                        </div>
                      ) : (
                        <img
                          src={pendingAttachment.dataUrl}
                          alt={pendingAttachment.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover border shrink-0"
                          style={{ borderColor: theme.borderColor }}
                        />
                      )}
                      <div className="min-w-0 max-w-[180px] sm:max-w-[220px]">
                        <p className="text-[12px] font-medium truncate">{pendingAttachment.name}</p>
                        <p className="text-[11px]" style={{ color: theme.accentSecondary }}>
                          {pendingAttachment.kind === 'file'
                            ? `Study/Code File Ready (${Math.max(1, Math.round((pendingAttachment.fileSize ?? 0) / 1024))} KB)`
                            : pendingAttachment.source === 'screen'
                              ? 'Screen Capture Ready'
                              : pendingAttachment.source === 'camera'
                                ? 'Camera Photo Ready for Vision'
                                : 'Image Ready for Vision'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingAttachment(null)}
                        aria-label="Remove attached file"
                        className="p-1 rounded-md hover:text-[#ff4d4d] cursor-pointer shrink-0"
                        style={{ color: theme.textMuted }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Input Row */}
                  <div className="flex items-end gap-1.5 sm:gap-2.5">
                    <div
                      className="flex-1 min-w-0 min-h-[48px] flex items-end gap-1 sm:gap-2 rounded-2xl border p-1.5 sm:p-2 transition-colors"
                      style={{
                        backgroundColor: theme.inputBg,
                        borderColor: theme.borderColor,
                      }}
                    >
                      {/* Hidden File Inputs: Gallery Image, Mobile Camera Capture & Study/Code File */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUploadChange}
                        className="hidden"
                      />
                      <input
                        ref={cameraFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleCameraFileCaptureChange}
                        className="hidden"
                      />
                      <input
                        ref={studyFileInputRef}
                        type="file"
                        accept=".txt,.md,.js,.jsx,.ts,.tsx,.py,.html,.htm,.css,.json,.csv,text/plain,text/markdown,text/html"
                        onChange={handleStudyFileUploadChange}
                        className="hidden"
                      />

                      {/* Gallery / File Image Attachment Button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach Image from Gallery or Files"
                        aria-label="Attach Image"
                        className="p-2 sm:p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: theme.subSurfaceBg,
                          borderColor: theme.borderColor,
                          color: theme.textPrimary,
                        }}
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>

                      {/* Direct Camera Photo Capture Button */}
                      <button
                        type="button"
                        onClick={handleOpenCameraCapture}
                        title="Take Photo with Camera"
                        aria-label="Take Photo with Camera"
                        className="p-2 sm:p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: theme.subSurfaceBg,
                          borderColor: theme.borderColor,
                          color: theme.accentSecondary,
                        }}
                      >
                        <Camera className="w-4 h-4" />
                      </button>

                      {/* Study / Code File Upload Button */}
                      <button
                        type="button"
                        onClick={() => studyFileInputRef.current?.click()}
                        title="Upload Study Notes or Code File (.txt, .md, .js, .py, .html)"
                        aria-label="Upload Study or Code File"
                        className="p-2 sm:p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: theme.subSurfaceBg,
                          borderColor: theme.borderColor,
                          color: theme.accentPrimary,
                        }}
                      >
                        <FileText className="w-4 h-4" />
                      </button>

                      {/* Voice Message Mode Toggle (speaks typed text in Sample Voice as WhatsApp Voice Note) */}
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateVoiceSettings({
                            ...voiceSettings,
                            voiceMessageMode: !voiceSettings.voiceMessageMode,
                          })
                        }
                        title={
                          voiceSettings.voiceMessageMode
                            ? 'Voice Message Mode ON — Typed text will be spoken in your Active Voice'
                            : 'Enable Voice Message Mode (speak typed text as a Voice Note)'
                        }
                        aria-label="Toggle Voice Message Mode"
                        aria-pressed={Boolean(voiceSettings.voiceMessageMode)}
                        className="p-2 sm:p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: voiceSettings.voiceMessageMode
                            ? `${theme.accentSecondary}22`
                            : theme.subSurfaceBg,
                          borderColor: voiceSettings.voiceMessageMode
                            ? theme.accentSecondary
                            : theme.borderColor,
                          color: voiceSettings.voiceMessageMode
                            ? theme.accentSecondary
                            : theme.textSecondary,
                        }}
                      >
                        <AudioLines className="w-4 h-4" />
                      </button>

                      {/* Microphone Voice Input Button */}
                      <button
                        type="button"
                        onClick={handleToggleMic}
                        disabled={isTranscribing}
                        title={isRecording ? 'Stop Voice Recording' : 'Multi-language Voice Input'}
                        aria-label={isRecording ? 'Stop Voice Recording' : 'Start Voice Input'}
                        className="p-2 sm:p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: isRecording ? 'rgba(255, 77, 77, 0.16)' : theme.subSurfaceBg,
                          borderColor: isRecording
                            ? '#ff4d4d'
                            : isTranscribing
                              ? theme.accentSecondary
                              : theme.borderColor,
                          color: isRecording
                            ? '#ff4d4d'
                            : isTranscribing
                              ? theme.accentSecondary
                              : theme.textPrimary,
                        }}
                      >
                        {isTranscribing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isRecording ? (
                          <MicOff className="w-4 h-4" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </button>

                      {/* Textarea */}
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        dir="auto"
                        value={inputValue}
                        onChange={handleTextareaChange}
                        onKeyDown={handleTextareaKeyDown}
                        onPaste={handlePaste}
                        placeholder={
                          isRecording
                            ? 'Listening... Click mic to stop'
                            : isTranscribing
                              ? 'Transcribing voice...'
                              : voiceSettings.voiceMessageMode
                                ? `Voice Note (${getResolvedVoiceParameters(voiceSettings).voiceName}) — Type to speak...`
                                : 'Ask Roosters AI anything...'
                        }
                        className="flex-1 min-w-0 bg-transparent px-1.5 sm:px-2 py-2.5 text-[14px] sm:text-[14.5px] focus:outline-none resize-none max-h-40 leading-normal"
                        style={{ color: theme.textPrimary }}
                      />

                      {/* Glowing Gold / Theme Send or Stop Button */}
                      {isStreaming ? (
                        <button
                          type="button"
                          onClick={handleStopStreaming}
                          title="Stop Generating"
                          aria-label="Stop Generating"
                          className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border font-semibold text-[13px] flex items-center gap-1.5 hover:text-[#ff4d4d] transition-colors shrink-0 cursor-pointer"
                          style={{
                            backgroundColor: theme.subSurfaceBg,
                            borderColor: theme.borderColor,
                            color: theme.textPrimary,
                          }}
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span className="hidden sm:inline">Stop</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendMessage()}
                          disabled={!inputValue.trim() && !pendingAttachment}
                          aria-label="Send Message"
                          className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-[13px] flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98] shrink-0 cursor-pointer"
                          style={{
                            backgroundImage: theme.sendButtonGradient,
                            color: theme.sendButtonText,
                            boxShadow:
                              inputValue.trim() || pendingAttachment ? theme.sendButtonGlow : 'none',
                          }}
                        >
                          <Send className="w-4 h-4" />
                          <span className="hidden sm:inline">Send</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="mt-2 border-t pt-1.5" style={{ borderColor: theme.borderColor }}>
                <LegalFooter
                  compact
                  theme={theme}
                  onOpenPage={setLegalPage}
                  onOpenOwnerSettings={() => setIsApiKeyModalOpen(true)}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      <ImageCreateModal
        isOpen={isImageModalOpen}
        isGenerating={isGeneratingImage}
        theme={theme}
        onClose={() => setIsImageModalOpen(false)}
        onGenerate={handleGenerateArtwork}
      />

      <VideoCreateModal
        isOpen={isVideoModalOpen}
        isGenerating={isGeneratingVideo}
        theme={theme}
        onClose={() => setIsVideoModalOpen(false)}
        onGenerate={handleGenerateVideo}
      />

      <VoiceCloneModal
        isOpen={isVoiceModalOpen}
        theme={theme}
        language={selectedLanguage}
        settings={voiceSettings}
        onUpdate={handleUpdateVoiceSettings}
        onSendVoiceMessageToChat={(text, profile) => {
          void handleSendMessage(text, { forceVoiceMessage: true, profileOverride: profile });
        }}
        onClose={() => setIsVoiceModalOpen(false)}
      />

      <ThemeWallpaperModal
        isOpen={isThemeModalOpen}
        settings={themeSettings}
        onUpdate={handleUpdateThemeSettings}
        onClose={() => setIsThemeModalOpen(false)}
      />

      <LiveTalkModal
        isOpen={isLiveTalkOpen}
        selectedLanguage={selectedLanguage}
        userName={user.fullName}
        hasBackendApi={hasBackendApi}
        hasServerGeminiKey={hasServerGeminiKey}
        voiceSettings={voiceSettings}
        userSettings={userSettings}
        ownerConfig={ownerConfig}
        onClose={handleCloseLiveTalk}
      />

      <TextReaderModal
        isOpen={isTextReaderOpen}
        initialLanguage={selectedLanguage}
        theme={theme}
        voiceSettings={voiceSettings}
        defaultSpeechSpeed={userSettings.speechSpeed}
        voiceGender={userSettings.voiceGender}
        onClose={() => setIsTextReaderOpen(false)}
      />

      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        theme={theme}
        isLightMode={themeSettings.themeId === 'clean-light'}
        onToggleThemeMode={handleToggleLightDarkMode}
        settings={userSettings}
        isGuest={user.isGuest}
        onSave={handleSaveUserSettings}
        onClearAllHistory={handleClearAllHistory}
        onClose={() => setIsUserSettingsOpen(false)}
      />

      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        theme={theme}
        onCapture={(attachment) => {
          setPendingAttachment(attachment);
          setNotice('');
        }}
        onFallbackUpload={() => fileInputRef.current?.click()}
        onClose={() => setIsCameraModalOpen(false)}
      />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        theme={theme}
        hasServerGeminiKey={hasServerGeminiKey}
        hasEnvGeminiKey={hasEnvKey}
        ownerConfig={ownerConfig}
        onUpdateOwnerConfig={handleUpdateOwnerConfig}
        onSaved={() => {
          setNotice('');
        }}
        onClose={() => setIsApiKeyModalOpen(false)}
      />

      <LegalPagesModal
        activePage={legalPage}
        theme={theme}
        onSelectPage={setLegalPage}
        onClose={() => setLegalPage(null)}
      />

      <InstallAppModal
        isOpen={isInstallModalOpen}
        theme={theme}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </div>
  );
}
