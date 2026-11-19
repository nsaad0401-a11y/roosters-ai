import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AppTheme } from '../themes';
import { detectApiKeyProvider, loadCustomApiKey, saveCustomApiKey } from '../utils/storage';

interface ApiKeyModalProps {
  isOpen: boolean;
  theme: AppTheme;
  hasServerGeminiKey: boolean;
  hasEnvGeminiKey: boolean;
  onSaved: () => void;
  onClose: () => void;
}

export function ApiKeyModal({
  isOpen,
  theme,
  hasServerGeminiKey,
  hasEnvGeminiKey,
  onSaved,
  onClose,
}: ApiKeyModalProps) {
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputKey(loadCustomApiKey());
      setShowKey(false);
      setErrorMsg('');
      setSavedNotice('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const detected = detectApiKeyProvider(inputKey);
  const storedKey = loadCustomApiKey();

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setErrorMsg('Please paste a valid Google Gemini key (AIza...) or Groq key (gsk_...).');
      return;
    }

    const provider = detectApiKeyProvider(trimmed);
    if (provider === 'unknown') {
      setErrorMsg(
        'Unrecognized key format. Google Gemini keys start with "AIza..." and free Groq keys start with "gsk_...".'
      );
      return;
    }

    saveCustomApiKey(trimmed);
    setErrorMsg('');
    setSavedNotice(
      provider === 'groq'
        ? 'Groq API key saved! Chats & coding will stream via Llama 3.3 70B.'
        : 'Google Gemini API key saved! Ready for fast streaming & vision.'
    );
    onSaved();
    window.setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleRemove = () => {
    saveCustomApiKey('');
    setInputKey('');
    setErrorMsg('');
    setSavedNotice('Custom API key removed.');
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apikey-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              <KeyRound className="w-5 h-5" style={{ color: theme.accentPrimary }} />
            </div>
            <div>
              <h2 id="apikey-modal-title" className="font-display text-[18px] font-bold">
                Owner Settings (API Provider)
              </h2>
              <p className="text-[12.5px]" style={{ color: theme.textMuted }}>
                Optional browser override when environment variables are not set
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close API Key Settings"
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Guide Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          <div
            className="rounded-xl border p-3"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: detected === 'gemini' ? theme.accentSecondary : theme.borderColor,
            }}
          >
            <div className="text-[12.5px] font-bold" style={{ color: theme.accentSecondary }}>
              Google Gemini Key
            </div>
            <div className="text-[11.5px] mt-1" style={{ color: theme.textMuted }}>
              Starts with <code className="font-mono font-semibold">AIza...</code>
              <br />
              Full streaming, study tutor, vision &amp; artwork.
            </div>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1.5 text-[11px] font-semibold underline"
              style={{ color: theme.accentSecondary }}
            >
              Get free Gemini key
            </a>
          </div>

          <div
            className="rounded-xl border p-3"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: detected === 'groq' ? theme.accentPrimary : theme.borderColor,
            }}
          >
            <div className="text-[12.5px] font-bold" style={{ color: theme.accentPrimary }}>
              Free Groq API Key
            </div>
            <div className="text-[11.5px] mt-1" style={{ color: theme.textMuted }}>
              Starts with <code className="font-mono font-semibold">gsk_...</code>
              <br />
              Ultra-fast streaming via Llama 3.3 70B Versatile.
            </div>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1.5 text-[11px] font-semibold underline"
              style={{ color: theme.accentPrimary }}
            >
              Get free Groq key
            </a>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label
              htmlFor="custom-api-key-input"
              className="block text-[12.5px] font-semibold mb-1.5"
              style={{ color: theme.textSecondary }}
            >
              Paste Your Gemini (AIza...) or Groq (gsk_...) Key
            </label>
            <div className="relative flex items-center">
              <input
                id="custom-api-key-input"
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setErrorMsg('');
                  setSavedNotice('');
                }}
                placeholder="AIza... or gsk_..."
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border pl-3.5 pr-11 py-2.5 text-[13.5px] font-mono focus:outline-none"
                style={{
                  backgroundColor: theme.inputBg,
                  borderColor: errorMsg
                    ? '#ff4d4d'
                    : detected === 'groq'
                      ? theme.accentPrimary
                      : detected === 'gemini'
                        ? theme.accentSecondary
                        : theme.borderColor,
                  color: theme.textPrimary,
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'Hide API Key' : 'Show API Key'}
                className="absolute right-2.5 p-1.5 rounded-lg cursor-pointer"
                style={{ color: theme.textMuted }}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Live Detected Provider Status */}
          <div className="flex items-center justify-between text-[12px] px-1">
            <span className="inline-flex items-center gap-1.5" style={{ color: theme.textMuted }}>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
              <span>Stored only in your browser localStorage</span>
            </span>

            {detected === 'groq' && (
              <span className="font-semibold" style={{ color: theme.accentPrimary }}>
                Detected: Groq (Llama 3.3 70B)
              </span>
            )}
            {detected === 'gemini' && (
              <span className="font-semibold" style={{ color: theme.accentSecondary }}>
                Detected: Google Gemini
              </span>
            )}
          </div>

          {(hasServerGeminiKey || hasEnvGeminiKey) && !storedKey && (
            <div
              className="rounded-xl border px-3 py-2 text-[12px]"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textSecondary,
              }}
            >
              A default environment Gemini key is already active on this host. Adding your own key above overrides it locally.
            </div>
          )}

          {errorMsg && <p className="text-[12.5px] text-[#ff4d4d] font-medium">{errorMsg}</p>}

          {savedNotice && (
            <p className="text-[12.5px] text-emerald-400 font-medium inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{savedNotice}</span>
            </p>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
            <div>
              {storedKey && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12.5px] font-medium text-[#ff4d4d] cursor-pointer"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Saved Key</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                  color: theme.textPrimary,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl font-bold text-[13px] cursor-pointer transition-all hover:brightness-110"
                style={{
                  backgroundImage: theme.sendButtonGradient,
                  color: theme.sendButtonText,
                }}
              >
                Save Key
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
