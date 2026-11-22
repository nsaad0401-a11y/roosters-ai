import {
  AlertTriangle,
  Check,
  Cpu,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Megaphone,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AppTheme } from '../themes';
import { OwnerConfig, OwnerImageModel } from '../types';
import {
  DEFAULT_OWNER_CONFIG,
  detectApiKeyProvider,
  loadCustomApiKey,
  loadOwnerConfig,
  saveCustomApiKey,
  saveOwnerConfig,
} from '../utils/storage';

interface ApiKeyModalProps {
  isOpen: boolean;
  theme: AppTheme;
  hasServerGeminiKey: boolean;
  hasEnvGeminiKey: boolean;
  ownerConfig?: OwnerConfig;
  onUpdateOwnerConfig?: (next: OwnerConfig) => void;
  onSaved: () => void;
  onClose: () => void;
}

const CHAT_MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto Fast Routing (Recommended)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Instant & Vision)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { value: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
  { value: 'llama-3.1-8b-instant', label: 'Groq Llama 3.1 8B Instant (Requires Groq Key)' },
  { value: 'llama-3.3-70b-versatile', label: 'Groq Llama 3.3 70B Versatile (Requires Groq Key)' },
];

const IMAGE_MODEL_OPTIONS: Array<{ value: OwnerImageModel; label: string }> = [
  { value: 'nano-banana', label: 'Nano Banana Auto HD (2.1 / 3.1 / 2.5 — Recommended)' },
  { value: 'gemini-nano-banana-2.1', label: 'Gemini Nano Banana 2.1 (2K HD & Photo Edit)' },
  { value: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image (Fast HD & Editing)' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (Compatible Fallback)' },
  { value: 'flux', label: 'Flux Ultra-HD 1024×1024 (Fallback Engine)' },
  { value: 'flux-realism', label: 'Flux Realism 1024×1024' },
  { value: 'turbo', label: 'Turbo Fast 1024×1024' },
  { value: 'horde', label: 'AI Horde Studio (Backup Engine)' },
];

export function ApiKeyModal({
  isOpen,
  theme,
  hasServerGeminiKey,
  hasEnvGeminiKey,
  ownerConfig: externalOwnerConfig,
  onUpdateOwnerConfig,
  onSaved,
  onClose,
}: ApiKeyModalProps) {
  // Always require Owner PIN verification first when opening Owner Settings
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');

  // Admin dashboard states
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [chatModel, setChatModel] = useState('auto');
  const [imageModel, setImageModel] = useState<OwnerImageModel>('nano-banana');
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [newOwnerPin, setNewOwnerPin] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setIsUnlocked(false);
      setPinInput('');
      setPinError('');
      return;
    }
    const cfg = externalOwnerConfig ?? loadOwnerConfig();
    setApiKeyInput(loadCustomApiKey());
    setChatModel(cfg.chatModel || 'auto');
    setImageModel(cfg.imageModel || 'nano-banana');
    setGlobalSystemPrompt(cfg.globalSystemPrompt || '');
    setAnnouncementEnabled(Boolean(cfg.announcementEnabled));
    setAnnouncementText(cfg.announcementText || '');
    setMaintenanceMode(Boolean(cfg.maintenanceMode));
    setNewOwnerPin('');
    setStatusMessage('');
    setPinError('');
  }, [isOpen, externalOwnerConfig]);

  if (!isOpen) return null;

  const activeConfig = externalOwnerConfig ?? loadOwnerConfig();
  const expectedPin =
    activeConfig.ownerPin && activeConfig.ownerPin !== '2026'
      ? activeConfig.ownerPin
      : DEFAULT_OWNER_CONFIG.ownerPin;

  const handleUnlockSubmit = (e: FormEvent) => {
    e.preventDefault();
    const entered = pinInput.trim();
    if (!entered || entered !== expectedPin) {
      setPinError('Invalid Password');
      return;
    }
    setPinError('');
    setIsUnlocked(true);
  };

  const detectedProvider = detectApiKeyProvider(apiKeyInput);
  const hasBuiltInKey = hasServerGeminiKey || hasEnvGeminiKey;

  const handleSaveAll = () => {
    const trimmedKey = apiKeyInput.trim();
    saveCustomApiKey(trimmedKey);

    const updatedConfig: OwnerConfig = {
      chatModel: chatModel || 'auto',
      imageModel: imageModel || 'nano-banana',
      globalSystemPrompt: globalSystemPrompt.trim(),
      announcementEnabled,
      announcementText: announcementText.trim(),
      maintenanceMode,
      ownerPin: newOwnerPin.trim() ? newOwnerPin.trim() : expectedPin,
    };

    saveOwnerConfig(updatedConfig);
    onUpdateOwnerConfig?.(updatedConfig);

    setStatusMessage('Owner settings & AI configuration saved successfully!');
    onSaved();
    window.setTimeout(() => {
      onClose();
    }, 550);
  };

  const handleRemoveCustomKey = () => {
    saveCustomApiKey('');
    setApiKeyInput('');
    onSaved();
    setStatusMessage('Custom API key removed. Using built-in engine.');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Owner Settings"
    >
      <div
        className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: theme.borderColor }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: `${theme.accentPrimary}44`,
              }}
            >
              {isUnlocked ? (
                <ShieldCheck className="w-4 h-4" style={{ color: theme.accentPrimary }} />
              ) : (
                <Lock className="w-4 h-4" style={{ color: theme.accentPrimary }} />
              )}
            </div>
            <div>
              <h2 className="text-[16px] font-bold leading-tight">
                {isUnlocked ? 'Owner Settings Panel' : 'Owner Authentication'}
              </h2>
              <p className="text-[11.5px]" style={{ color: theme.textMuted }}>
                {isUnlocked
                  ? 'Manage API keys, active AI models, system prompt & maintenance controls'
                  : 'Enter Owner Password to access admin controls'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Owner Settings"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isUnlocked ? (
          /* Password Verification Gate */
          <form onSubmit={handleUnlockSubmit} className="p-5 space-y-4">
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <KeyRound className="w-4 h-4" style={{ color: theme.accentSecondary }} />
                <span>Owner Password Required</span>
              </div>
              <p className="text-[12px]" style={{ color: theme.textMuted }}>
                This area controls global AI models, API keys, announcements, and maintenance mode.
              </p>

              <div className="relative flex items-center">
                <input
                  type={showPin ? 'text' : 'password'}
                  autoFocus
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    if (pinError) setPinError('');
                  }}
                  placeholder="Enter Owner Password..."
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-[14px] focus:outline-none"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: pinError ? '#ff4d4d' : theme.borderColor,
                    color: theme.textPrimary,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPin((p) => !p)}
                  aria-label={showPin ? 'Hide Password' : 'Show Password'}
                  className="absolute right-2.5 p-1 rounded cursor-pointer"
                  style={{ color: theme.textMuted }}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {pinError && (
                <p role="alert" className="text-[12.5px] font-semibold text-[#ff6b6b]">
                  {pinError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                  color: theme.textSecondary,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-bold transition-all hover:brightness-110 cursor-pointer"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Unlock Admin Panel</span>
              </button>
            </div>
          </form>
        ) : (
          /* Unlocked Owner Dashboard */
          <>
            <div className="p-5 overflow-y-auto space-y-4">
              {/* 1. API Key Section */}
              <div
                className="rounded-xl border p-3.5 space-y-2.5"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                    <KeyRound className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
                    <span>Gemini / Groq AI API Key</span>
                  </div>
                  <span
                    className="text-[11px] font-medium"
                    style={{
                      color:
                        detectedProvider === 'gemini' || detectedProvider === 'groq'
                          ? '#34d399'
                          : hasBuiltInKey
                            ? theme.accentSecondary
                            : theme.textMuted,
                    }}
                  >
                    {detectedProvider === 'gemini'
                      ? 'Gemini Key Active'
                      : detectedProvider === 'groq'
                        ? 'Groq Key Active'
                        : hasBuiltInKey
                          ? 'Built-In Engine Active'
                          : 'Optional Override'}
                  </span>
                </div>

                <div className="relative flex items-center">
                  <input
                    id="owner-api-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIza... (Gemini) or gsk_... (Groq)"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full pl-3.5 pr-10 py-2 rounded-xl border text-[13px] font-mono focus:outline-none"
                    style={{
                      backgroundColor: theme.cardBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => !prev)}
                    aria-label={showKey ? 'Hide API Key' : 'Show API Key'}
                    className="absolute right-2.5 p-1 rounded cursor-pointer"
                    style={{ color: theme.textMuted }}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {apiKeyInput.trim() && (
                  <button
                    type="button"
                    onClick={handleRemoveCustomKey}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#ff6b6b] hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove Custom Key (Use Built-In)</span>
                  </button>
                )}
              </div>

              {/* 2. Active AI Models */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="owner-chat-model"
                    className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-1.5"
                  >
                    <Cpu className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
                    <span>Active Chat Model</span>
                  </label>
                  <select
                    id="owner-chat-model"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-[12.5px] font-medium focus:outline-none cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  >
                    {CHAT_MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="owner-image-model"
                    className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5" style={{ color: theme.accentPrimary }} />
                    <span>Image Generation Model</span>
                  </label>
                  <select
                    id="owner-image-model"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value as OwnerImageModel)}
                    className="w-full px-3 py-2.5 rounded-xl border text-[12.5px] font-medium focus:outline-none cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  >
                    {IMAGE_MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Global System Prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="owner-system-prompt"
                    className="flex items-center gap-1.5 text-[12.5px] font-semibold"
                  >
                    <Terminal className="w-3.5 h-3.5" style={{ color: theme.accentPrimary }} />
                    <span>Global System Prompt Override</span>
                  </label>
                  {globalSystemPrompt.trim() && (
                    <button
                      type="button"
                      onClick={() => setGlobalSystemPrompt('')}
                      className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline cursor-pointer"
                      style={{ color: theme.accentSecondary }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Default</span>
                    </button>
                  )}
                </div>
                <textarea
                  id="owner-system-prompt"
                  rows={3}
                  value={globalSystemPrompt}
                  onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                  placeholder="Optional global instructions appended/applied across all Roosters AI chats (leave blank to use default Roosters AI instructions)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-[12.5px] focus:outline-none resize-y"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                    color: theme.textPrimary,
                  }}
                />
              </div>

              {/* 4. Announcement Banner & Maintenance Mode */}
              <div
                className="rounded-xl border p-3.5 space-y-3"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 shrink-0" style={{ color: theme.accentSecondary }} />
                    <div>
                      <p className="text-[12.5px] font-semibold">Top Announcement Banner</p>
                      <p className="text-[11px]" style={{ color: theme.textMuted }}>
                        Display a broadcast bar across the top of the app
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={announcementEnabled}
                    onClick={() => setAnnouncementEnabled((prev) => !prev)}
                    className="w-11 h-6 rounded-full p-0.5 transition-colors flex items-center cursor-pointer shrink-0"
                    style={{
                      backgroundColor: announcementEnabled ? theme.accentSecondary : '#334155',
                      justifyContent: announcementEnabled ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow" />
                  </button>
                </div>

                {announcementEnabled && (
                  <input
                    type="text"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="Enter announcement text (e.g., 'Welcome to Roosters AI v2.0 — Now with Live Camera Vision!')"
                    className="w-full px-3 py-2 rounded-xl border text-[12.5px] focus:outline-none"
                    style={{
                      backgroundColor: theme.cardBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  />
                )}

                <div
                  className="pt-2.5 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: theme.borderColor }}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className="w-4 h-4 shrink-0"
                      style={{ color: maintenanceMode ? '#f59e0b' : theme.textMuted }}
                    />
                    <div>
                      <p className="text-[12.5px] font-semibold">Maintenance Mode</p>
                      <p className="text-[11px]" style={{ color: theme.textMuted }}>
                        Temporarily pause user chat access with an owner unlock option
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={maintenanceMode}
                    onClick={() => setMaintenanceMode((prev) => !prev)}
                    className="w-11 h-6 rounded-full p-0.5 transition-colors flex items-center cursor-pointer shrink-0"
                    style={{
                      backgroundColor: maintenanceMode ? '#f59e0b' : '#334155',
                      justifyContent: maintenanceMode ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow" />
                  </button>
                </div>
              </div>

              {/* 5. Update Owner Password */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 justify-between">
                <label htmlFor="owner-new-pin" className="text-[12px] font-medium" style={{ color: theme.textSecondary }}>
                  Update Owner Password (optional):
                </label>
                <input
                  id="owner-new-pin"
                  type="password"
                  value={newOwnerPin}
                  onChange={(e) => setNewOwnerPin(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="sm:w-64 px-3 py-1.5 rounded-lg border text-[12.5px] focus:outline-none"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                    color: theme.textPrimary,
                  }}
                />
              </div>

              {statusMessage && (
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-emerald-400">
                  <Check className="w-4 h-4" />
                  <span>{statusMessage}</span>
                </div>
              )}
            </div>

            <div
              className="px-5 py-3.5 border-t flex items-center justify-end gap-2.5"
              style={{ borderColor: theme.borderColor }}
            >
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                  color: theme.textSecondary,
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-bold transition-all hover:brightness-110 cursor-pointer"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                <Check className="w-4 h-4" />
                <span>Save Owner Settings</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
