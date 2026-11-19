import {
  AudioLines,
  BookOpen,
  Camera,
  Check,
  Copy,
  Download,
  FileCode,
  FileText,
  Globe,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Paintbrush,
  Palette,
  PanelLeft,
  Plus,
  Send,
  Square,
  Trash2,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { ChangeEvent, ClipboardEvent, CSSProperties, KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBcp47ForLanguage, QUICK_PROMPTS, ROOSTERS_LOGO_SRC, WORLD_LANGUAGES } from '../constants';
import { APP_THEMES, AppTheme, ThemeSettings } from '../themes';
import { ActiveUser, ChatMessage, ChatSession, MessageAttachment } from '../types';
import {
  generateArtworkUnified,
  getEnvGeminiKey,
  getEnvGroqKey,
  resolveActiveProvider,
  streamChatCompletion,
} from '../utils/aiClient';
import { loadThemeSettings, loadUserChats, saveThemeSettings, saveUserChats } from '../utils/storage';
import { AdBannerSlot } from './AdBannerSlot';
import { ApiKeyModal } from './ApiKeyModal';
import { GeneratedArtworkCard } from './GeneratedArtworkCard';
import { ImageCreateModal } from './ImageCreateModal';
import { LegalFooter } from './LegalFooter';
import { LegalPageId, LegalPagesModal } from './LegalPagesModal';
import { LiveTalkModal } from './LiveTalkModal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TextReaderModal } from './TextReaderModal';
import { ThemeWallpaperModal } from './ThemeWallpaperModal';

interface MainSuperAppProps {
  user: ActiveUser;
  onLogout: () => void;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fileToAttachment(file: File, source: 'upload' | 'screen'): Promise<MessageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Failed to read image file.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        const needsResize = width > maxDim || height > maxDim || file.size > 350_000;

        if (!needsResize) {
          const commaIdx = rawUrl.indexOf(',');
          resolve({
            name: file.name || 'image.png',
            mimeType: file.type || 'image/png',
            base64: commaIdx >= 0 ? rawUrl.slice(commaIdx + 1) : '',
            dataUrl: rawUrl,
            source,
          });
          return;
        }

        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const commaIdx = rawUrl.indexOf(',');
          resolve({
            name: file.name || 'image.png',
            mimeType: file.type || 'image/png',
            base64: commaIdx >= 0 ? rawUrl.slice(commaIdx + 1) : '',
            dataUrl: rawUrl,
            source,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.84);
        const commaIndex = compressedUrl.indexOf(',');
        resolve({
          name: file.name || 'image.jpg',
          mimeType: 'image/jpeg',
          base64: commaIndex >= 0 ? compressedUrl.slice(commaIndex + 1) : '',
          dataUrl: compressedUrl,
          source,
        });
      };
      img.onerror = () => {
        const commaIdx = rawUrl.indexOf(',');
        resolve({
          name: file.name || 'image.png',
          mimeType: file.type || 'image/png',
          base64: commaIdx >= 0 ? rawUrl.slice(commaIdx + 1) : '',
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
  isCopied: boolean;
  isTtsLoading: boolean;
  isTtsPlaying: boolean;
  onCopy: (msg: ChatMessage) => void;
  onListen: (msg: ChatMessage) => void;
}

const ChatMessageRow = memo(function ChatMessageRow({
  msg,
  theme,
  isCopied,
  isTtsLoading,
  isTtsPlaying,
  onCopy,
  onListen,
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

        {msg.generatedImage && <GeneratedArtworkCard artwork={msg.generatedImage} />}

        {msg.content && !msg.isError && (
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
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadUserChats(user.id));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('Auto-Detect');
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

  // Modals: Create Image, Live Talk, Text Reader, API Key Settings, Legal Pages
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isLiveTalkOpen, setIsLiveTalkOpen] = useState(false);
  const [isTextReaderOpen, setIsTextReaderOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPageId | null>(null);

  // Host capability state (works on both Express backend & static Vercel builds)
  const [hasBackendApi, setHasBackendApi] = useState(false);
  const [hasServerGeminiKey, setHasServerGeminiKey] = useState(false);

  // Copy & TTS states
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);

  // Microphone recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Screen Share states
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const studyFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const visitorClientIdRef = useRef<string>(createId('visitor'));

  const theme = APP_THEMES[themeSettings.themeId] ?? APP_THEMES['gold-cyan'];
  const hasEnvKey = Boolean(getEnvGeminiKey() || getEnvGroqKey());

  const handleUpdateThemeSettings = (next: ThemeSettings) => {
    setThemeSettings(next);
    saveThemeSettings(next);
  };

  // Persist sessions whenever they change
  useEffect(() => {
    saveUserChats(user.id, sessions);
  }, [sessions, user.id]);

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

  // Detect backend availability + server Gemini key & run live active visitors heartbeat
  useEffect(() => {
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
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      screenStream?.getTracks().forEach((track) => track.stop());
    };
  }, [screenStream]);

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Ignore speechSynthesis cancel errors
    }
    setTtsPlayingId(null);
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

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = (overrideText ?? inputValue).trim();
    const attachmentToSend = overrideText ? null : pendingAttachment;

    if ((!textToSend && !attachmentToSend) || isStreaming) return;

    setNotice('');
    const defaultPrompt = attachmentToSend
      ? attachmentToSend.kind === 'file'
        ? `Please review, summarize, or help debug "${attachmentToSend.name}".`
        : 'Please analyze this image kindly.'
      : '';

    const userMessage: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      content: textToSend || defaultPrompt,
      createdAt: Date.now(),
      attachment: attachmentToSend ?? undefined,
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
      const payloadMessages = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
        attachment: m.attachment
          ? {
              kind: m.attachment.kind,
              name: m.attachment.name,
              base64: m.attachment.base64 || undefined,
              mimeType: m.attachment.mimeType || undefined,
              textContent: m.attachment.textContent || undefined,
            }
          : undefined,
      }));

      await streamChatCompletion({
        messages: payloadMessages,
        language: selectedLanguage,
        userName: user.fullName,
        isLiveVoice: false,
        hasBackendApi,
        hasServerGeminiKey,
        signal: controller.signal,
        onChunk: (chunkText) => {
          accumulated += chunkText;
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushToState);
          }
        },
      });

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: accumulated || 'I am right here to help whenever you are ready.',
          createdAt: Date.now(),
        },
      ];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      const errMessage = err instanceof Error ? err.message : 'Unable to reach Roosters AI right now.';
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
      setNotice('Screen sharing is not supported in this browser.');
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
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64 = dataUrl.split(',')[1] || '';

    setPendingAttachment({
      name: `screen-capture-${new Date().toLocaleTimeString().replace(/[:\s]/g, '-')}.jpg`,
      mimeType: 'image/jpeg',
      base64,
      dataUrl,
      source: 'screen',
    });
    setNotice('Screen frame captured and attached. Ask Roosters AI anything about it!');
  };

  const handleToggleMic = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setNotice('Microphone input is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
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

  const handleGenerateArtwork = async (prompt: string, aspectRatio: '1:1' | '16:9' | '4:3') => {
    setIsGeneratingImage(true);
    setNotice('');

    const userMsg: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      content: `Create Image (${aspectRatio}): ${prompt}`,
      createdAt: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    const currentSessionId = syncMessagesToSession(nextMessages);
    setMessages(nextMessages);

    try {
      const data = await generateArtworkUnified({
        prompt,
        aspectRatio,
        language: selectedLanguage,
        hasBackendApi,
        hasServerGeminiKey,
      });

      const aiMsg: ChatMessage = {
        id: createId('msg'),
        role: 'assistant',
        content: `Here is your generated artwork with my compliments: **${data.title}**`,
        createdAt: Date.now(),
        generatedImage: {
          title: data.title,
          description: data.description,
          svgCode: data.svgCode,
          imageUrl: data.imageUrl,
          provider: data.provider,
          aspectRatio: data.aspectRatio,
          width: data.width,
          height: data.height,
        },
      };

      const finalMessages = [...nextMessages, aiMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
      setIsImageModalOpen(false);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: createId('msg'),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Unable to generate artwork.',
        createdAt: Date.now(),
        isError: true,
      };
      const finalMessages = [...nextMessages, errMsg];
      setMessages(finalMessages);
      syncMessagesToSession(finalMessages, currentSessionId);
      setIsImageModalOpen(false);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMessageId(msg.id);
      window.setTimeout(() => {
        setCopiedMessageId((curr) => (curr === msg.id ? null : curr));
      }, 1800);
    } catch {
      setNotice('Could not copy message to clipboard.');
    }
  };

  const speakViaBrowserFallback = (msg: ChatMessage): boolean => {
    if (!window.speechSynthesis) return false;
    const spoken = cleanTextForSpeech(msg.content);
    if (!spoken) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = getBcp47ForLanguage(selectedLanguage);
    setTtsPlayingId(msg.id);
    utterance.onend = () => setTtsPlayingId((curr) => (curr === msg.id ? null : curr));
    utterance.onerror = () => setTtsPlayingId(null);
    window.speechSynthesis.speak(utterance);
    return true;
  };

  const handleListenTTS = async (msg: ChatMessage) => {
    if (ttsPlayingId === msg.id) {
      stopAudioPlayback();
      return;
    }

    stopAudioPlayback();
    setTtsLoadingId(msg.id);
    setNotice('');

    try {
      const resolved = resolveActiveProvider(hasServerGeminiKey);
      if (!hasBackendApi || resolved.provider !== 'gemini') {
        if (speakViaBrowserFallback(msg)) {
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
        if (speakViaBrowserFallback(msg)) return;
        throw new Error('Text-to-Speech unavailable.');
      }
      const data = (await resp.json()) as { audioBase64?: string; mimeType?: string; error?: string };
      if (!resp.ok || !data.audioBase64) {
        if (speakViaBrowserFallback(msg)) {
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
        speakViaBrowserFallback(msg);
      };

      await audio.play();
    } catch (err) {
      if (!speakViaBrowserFallback(msg)) {
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
  }, [ttsPlayingId, selectedLanguage]);

  const wallpaperStyle = useMemo(
    () => getWallpaperStyle(themeSettings, theme),
    [themeSettings, theme]
  );

  return (
    <div
      className="min-h-screen h-screen flex flex-col overflow-hidden transition-colors duration-200"
      style={{
        backgroundColor: theme.canvasBg,
        color: theme.textPrimary,
      }}
    >
      {/* Top Header */}
      <header
        className="shrink-0 border-b backdrop-blur-md px-4 lg:px-6 py-3"
        style={{
          backgroundColor: theme.headerBg,
          borderColor: theme.borderColor,
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Sidebar Toggle, Uploaded Logo, Title + v2.0 Badge, Live Users Badge, User Badge */}
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              title={showHistory ? 'Hide Chat History' : 'Show Chat History'}
              aria-label="Toggle Saved Chat History Sidebar"
              className="p-2 rounded-lg border transition-colors cursor-pointer shrink-0"
              style={{
                backgroundColor: showHistory ? theme.subSurfaceBg : theme.cardBg,
                borderColor: showHistory ? theme.accentSecondary : theme.borderColor,
                color: showHistory ? theme.accentSecondary : theme.textPrimary,
              }}
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            <div
              className="w-9 h-9 rounded-lg overflow-hidden border bg-[#111622] shrink-0"
              style={{ borderColor: theme.borderColor }}
            >
              <img
                src={ROOSTERS_LOGO_SRC}
                alt="Roosters AI"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span
                className="font-display font-bold text-[18px] bg-clip-text text-transparent whitespace-nowrap shrink-0"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${theme.accentPrimary} 0%, ${theme.accentSecondary} 100%)`,
                }}
              >
                Roosters AI
              </span>

              {/* Version 2.0 Badge */}
              <span
                className="px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide border whitespace-nowrap shrink-0"
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
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap shrink-0 tabular-nums"
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
                  className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                  style={{ boxShadow: '0 0 8px #10b981' }}
                />
                <span>Live Users: {liveUsers}</span>
              </span>

              <div
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium max-w-[140px]"
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

          {/* Right: World Languages, Theme & Wallpaper, Text Reader, Screen Share, Create Image, Export Chat, New Chat, Logout */}
          <div className="flex flex-wrap items-center gap-2">
            {/* World Languages Selector */}
            <div className="relative flex items-center">
              <Globe
                className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                style={{ color: theme.accentSecondary }}
              />
              <select
                aria-label="World Languages"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
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

            {/* Theme & Wallpaper Button */}
            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              onClick={() => setIsImageModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.borderColor,
                color: theme.accentPrimary,
              }}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Create Image</span>
            </button>

            {/* Export Chat Button */}
            <button
              type="button"
              onClick={handleExportChat}
              title="Download study session or code solutions as a .txt file"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            >
              <Download className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
              <span>Export Chat</span>
            </button>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            >
              <Plus className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
              <span>New Chat</span>
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleCleanLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium hover:text-[#ff4d4d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
      </header>

      {/* Non-Intrusive Responsive Sponsored Header Banner (728x90 / 320x50) */}
      <AdBannerSlot variant="header-banner" theme={theme} />

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

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {sessions.length === 0 ? (
                <p className="text-[12.5px] px-3 py-8 text-center" style={{ color: theme.textMuted }}>
                  No saved conversations yet. Send a message to save your study history automatically.
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

            {/* Sidebar Sponsored Ad Slot */}
            <AdBannerSlot variant="sidebar-footer" theme={theme} />
          </aside>
        )}

        {/* Chat Workspace with Theme + Wallpaper */}
        <main className="flex-1 flex flex-col min-w-0" style={wallpaperStyle}>
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
                    Your polite, encouraging Study Tutor and AI workspace. Ask questions step-by-step, start a hands-free Live Talk call, paste notes into Text Reader, or customize your theme.
                  </p>

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
                    {QUICK_PROMPTS.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => handleSendMessage(item.prompt)}
                        className="p-4 rounded-xl border transition-colors cursor-pointer group"
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
                    isCopied={copiedMessageId === msg.id}
                    isTtsLoading={ttsLoadingId === msg.id}
                    isTtsPlaying={ttsPlayingId === msg.id}
                    onCopy={handleCopyCallback}
                    onListen={handleListenCallback}
                  />
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Bottom Input Bar */}
          <div
            className="shrink-0 border-t px-4 sm:px-6 py-3.5"
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
                    className="cursor-pointer"
                    style={{ color: theme.textMuted }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Attachment Preview */}
              {pendingAttachment && (
                <div
                  className="mb-2.5 inline-flex items-center gap-2.5 px-3 py-2 rounded-xl border"
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
                      className="w-10 h-10 rounded-lg object-cover border"
                      style={{ borderColor: theme.borderColor }}
                    />
                  )}
                  <div className="min-w-0 max-w-[220px]">
                    <p className="text-[12px] font-medium truncate">{pendingAttachment.name}</p>
                    <p className="text-[11px]" style={{ color: theme.accentSecondary }}>
                      {pendingAttachment.kind === 'file'
                        ? `Study/Code File Ready (${Math.max(1, Math.round((pendingAttachment.fileSize ?? 0) / 1024))} KB)`
                        : pendingAttachment.source === 'screen'
                          ? 'Screen Capture Ready'
                          : 'Image Ready for Vision'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    aria-label="Remove attached file"
                    className="p-1 rounded-md hover:text-[#ff4d4d] cursor-pointer"
                    style={{ color: theme.textMuted }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Input Row + Prominent Live Talk Button */}
              <div className="flex items-end gap-2.5">
                <div
                  className="flex-1 flex items-end gap-2 rounded-2xl border p-2 transition-colors"
                  style={{
                    backgroundColor: theme.inputBg,
                    borderColor: theme.borderColor,
                  }}
                >
                  {/* Hidden File Inputs: Image + Study/Code File */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUploadChange}
                    className="hidden"
                  />
                  <input
                    ref={studyFileInputRef}
                    type="file"
                    accept=".txt,.md,.js,.jsx,.ts,.tsx,.py,.html,.htm,.css,.json,.csv,text/plain,text/markdown,text/html"
                    onChange={handleStudyFileUploadChange}
                    className="hidden"
                  />

                  {/* Image Upload Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload Image for Vision Analysis"
                    aria-label="Upload Image"
                    className="p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
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
                    className="p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.accentPrimary,
                    }}
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  {/* Microphone Voice Input Button */}
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    disabled={isTranscribing}
                    title={isRecording ? 'Stop Voice Recording' : 'Multi-language Voice Input'}
                    aria-label={isRecording ? 'Stop Voice Recording' : 'Start Voice Input'}
                    className="p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer"
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
                        ? 'Listening... Click microphone to stop and transcribe'
                        : isTranscribing
                          ? 'Transcribing voice...'
                          : `Ask your Study Tutor (${selectedLanguage})...`
                    }
                    className="flex-1 bg-transparent px-2 py-2 text-[14.5px] focus:outline-none resize-none max-h-40 leading-relaxed"
                    style={{ color: theme.textPrimary }}
                  />

                  {/* Glowing Gold / Theme Send or Stop Button */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStopStreaming}
                      title="Stop Generating"
                      aria-label="Stop Generating"
                      className="px-4 py-2.5 rounded-xl border font-semibold text-[13px] flex items-center gap-1.5 hover:text-[#ff4d4d] transition-colors shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: theme.subSurfaceBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendMessage()}
                      disabled={!inputValue.trim() && !pendingAttachment}
                      aria-label="Send Message"
                      className="px-4 py-2.5 rounded-xl font-bold text-[13px] flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98] shrink-0 cursor-pointer"
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

                {/* Prominent Live Talk Button */}
                <button
                  type="button"
                  onClick={() => {
                    stopAudioPlayback();
                    setIsLiveTalkOpen(true);
                  }}
                  title="Start Hands-Free Live Voice Conversation"
                  className="px-4 py-3.5 rounded-2xl border font-bold text-[13px] flex items-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] shrink-0 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.accentSecondary,
                    color: theme.accentSecondary,
                    boxShadow: `0 0 18px ${theme.accentSecondary}30`,
                  }}
                >
                  <AudioLines className="w-4 h-4" />
                  <span>Live Talk</span>
                </button>
              </div>

              <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: theme.borderColor }}>
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
        onClose={handleCloseLiveTalk}
      />

      <TextReaderModal
        isOpen={isTextReaderOpen}
        initialLanguage={selectedLanguage}
        theme={theme}
        onClose={() => setIsTextReaderOpen(false)}
      />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        theme={theme}
        hasServerGeminiKey={hasServerGeminiKey}
        hasEnvGeminiKey={hasEnvKey}
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
    </div>
  );
}
