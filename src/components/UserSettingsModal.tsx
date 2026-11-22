import {
  Check,
  Globe,
  MessageSquareText,
  Moon,
  Settings,
  Sliders,
  Sun,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppTheme } from '../themes';
import {
  ResponseStyleMode,
  SpeechSpeedChoice,
  UserAppSettings,
  VoiceGenderChoice,
} from '../types';
import { SearchableLanguageSelect } from './SearchableLanguageSelect';

interface UserSettingsModalProps {
  isOpen: boolean;
  theme: AppTheme;
  isLightMode: boolean;
  onToggleThemeMode: (isLight: boolean) => void;
  settings: UserAppSettings;
  isGuest: boolean;
  onSave: (next: UserAppSettings) => void;
  onClearAllHistory: () => Promise<void> | void;
  onClose: () => void;
}

export function UserSettingsModal({
  isOpen,
  theme,
  isLightMode,
  onToggleThemeMode,
  settings,
  isGuest,
  onSave,
  onClearAllHistory,
  onClose,
}: UserSettingsModalProps) {
  const [responseStyle, setResponseStyle] = useState<ResponseStyleMode>(settings.responseStyle);
  const [preferredLanguage, setPreferredLanguage] = useState<string>(settings.preferredLanguage);
  const [voiceGender, setVoiceGender] = useState<VoiceGenderChoice>(settings.voiceGender);
  const [speechSpeed, setSpeechSpeed] = useState<SpeechSpeedChoice>(settings.speechSpeed);
  const [customInstructions, setCustomInstructions] = useState<string>(settings.customInstructions);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedFeedback, setClearedFeedback] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setResponseStyle(settings.responseStyle);
    setPreferredLanguage(settings.preferredLanguage);
    setVoiceGender(settings.voiceGender);
    setSpeechSpeed(settings.speechSpeed);
    setCustomInstructions(settings.customInstructions);
    setConfirmClear(false);
    setClearedFeedback(false);
    setSavedNotice(false);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      responseStyle,
      preferredLanguage,
      voiceGender,
      speechSpeed,
      customInstructions: customInstructions.trim(),
    });
    setSavedNotice(true);
    window.setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 380);
  };

  const handleConfirmClear = async () => {
    await onClearAllHistory();
    setConfirmClear(false);
    setClearedFeedback(true);
    window.setTimeout(() => setClearedFeedback(false), 2600);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="User Settings"
    >
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] transition-colors duration-200"
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
                borderColor: `${theme.accentSecondary}44`,
              }}
            >
              <Settings className="w-4 h-4" style={{ color: theme.accentSecondary }} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold leading-tight">Settings</h2>
              <p className="text-[11.5px]" style={{ color: theme.textMuted }}>
                Personalize theme, AI response style, voice &amp; language
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* a) Theme Switcher: Dark Mode / Light Mode */}
          <div
            className="rounded-xl border p-3.5 flex items-center justify-between gap-3 transition-colors duration-200"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.borderColor,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                }}
              >
                {isLightMode ? (
                  <Sun className="w-4 h-4" style={{ color: theme.accentPrimary }} />
                ) : (
                  <Moon className="w-4 h-4" style={{ color: theme.accentPrimary }} />
                )}
              </div>
              <div>
                <p className="text-[12.5px] font-semibold" style={{ color: theme.textPrimary }}>
                  Appearance Theme
                </p>
                <p className="text-[11px]" style={{ color: theme.textMuted }}>
                  {isLightMode ? 'Clean Light Mode active' : 'Default Dark Neon & Gold active'}
                </p>
              </div>
            </div>

            <div
              className="inline-flex items-center p-1 rounded-xl border shrink-0"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.borderColor,
              }}
              role="group"
              aria-label="Theme Switcher"
            >
              <button
                type="button"
                onClick={() => onToggleThemeMode(false)}
                aria-pressed={!isLightMode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer"
                style={{
                  backgroundColor: !isLightMode ? `${theme.accentPrimary}22` : 'transparent',
                  color: !isLightMode ? theme.accentPrimary : theme.textMuted,
                }}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleThemeMode(true)}
                aria-pressed={isLightMode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer"
                style={{
                  backgroundColor: isLightMode ? `${theme.accentSecondary}22` : 'transparent',
                  color: isLightMode ? theme.accentSecondary : theme.textMuted,
                }}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
            </div>
          </div>

          {/* 1. AI Response Style */}
          <div>
            <label
              htmlFor="user-settings-style"
              className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-1.5"
              style={{ color: theme.textPrimary }}
            >
              <Sliders className="w-3.5 h-3.5" style={{ color: theme.accentPrimary }} />
              <span>AI Response Style</span>
            </label>
            <select
              id="user-settings-style"
              value={responseStyle}
              onChange={(e) => setResponseStyle(e.target.value as ResponseStyleMode)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-[13px] font-medium focus:outline-none cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            >
              <option value="simple">Simple &amp; Short (Direct answers)</option>
              <option value="detailed">Detailed (Comprehensive explanations)</option>
              <option value="study">Study &amp; Exam Mode (Notes + practice quiz)</option>
            </select>
          </div>

          {/* 2. Preferred Language */}
          <div>
            <label
              htmlFor="user-settings-language"
              className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-1.5"
              style={{ color: theme.textPrimary }}
            >
              <Globe className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
              <span>Preferred Language (100+ World Languages)</span>
            </label>
            <SearchableLanguageSelect
              id="user-settings-language"
              value={preferredLanguage}
              onChange={setPreferredLanguage}
              theme={theme}
              includeAutoDetect={true}
              ariaLabel="Preferred Language"
            />
          </div>

          {/* 3. Voice Settings (Gender + Speed) */}
          <div
            className="rounded-xl border p-3.5 space-y-3"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.borderColor,
            }}
          >
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
              <Volume2 className="w-3.5 h-3.5" style={{ color: theme.accentSecondary }} />
              <span>Voice Settings (Text Reader &amp; Live Talk)</span>
            </div>

            <div>
              <span className="block text-[11.5px] mb-1.5" style={{ color: theme.textSecondary }}>
                AI Voice
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'default', label: 'Default' },
                    { id: 'male', label: 'Male' },
                    { id: 'female', label: 'Female' },
                  ] as const
                ).map((item) => {
                  const active = voiceGender === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVoiceGender(item.id)}
                      className="py-2 rounded-lg border text-[12.5px] font-semibold transition-all cursor-pointer"
                      style={{
                        backgroundColor: active ? `${theme.accentSecondary}1f` : theme.cardBg,
                        borderColor: active ? theme.accentSecondary : theme.borderColor,
                        color: active ? theme.accentSecondary : theme.textSecondary,
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-[11.5px] mb-1.5" style={{ color: theme.textSecondary }}>
                Speech Speed
              </span>
              <div className="grid grid-cols-3 gap-2">
                {([0.8, 1.0, 1.2] as SpeechSpeedChoice[]).map((spd) => {
                  const active = speechSpeed === spd;
                  return (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSpeechSpeed(spd)}
                      className="py-2 rounded-lg border text-[12.5px] font-semibold tabular-nums transition-all cursor-pointer"
                      style={{
                        backgroundColor: active ? `${theme.accentPrimary}1f` : theme.cardBg,
                        borderColor: active ? theme.accentPrimary : theme.borderColor,
                        color: active ? theme.accentPrimary : theme.textSecondary,
                      }}
                    >
                      {spd.toFixed(1)}x
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Custom Instructions */}
          <div>
            <label
              htmlFor="user-settings-instructions"
              className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-1.5"
              style={{ color: theme.textPrimary }}
            >
              <MessageSquareText className="w-3.5 h-3.5" style={{ color: theme.accentPrimary }} />
              <span>Custom Instructions</span>
            </label>
            <textarea
              id="user-settings-instructions"
              rows={3}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Tell Roosters AI how you want it to reply (e.g., 'Explain coding concepts simply with real-life analogies' or 'Always reply in friendly Roman Urdu')..."
              className="w-full px-3.5 py-2.5 rounded-xl border text-[13px] focus:outline-none resize-y"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            />
          </div>

          {/* 5. Data Control */}
          <div
            className="rounded-xl border p-3.5 space-y-2.5"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.borderColor,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-semibold" style={{ color: theme.textPrimary }}>
                  Data Control
                </p>
                <p className="text-[11px]" style={{ color: theme.textMuted }}>
                  {isGuest
                    ? 'Clear current temporary guest conversation.'
                    : 'Permanently delete all saved chat history from this device.'}
                </p>
              </div>
            </div>

            {clearedFeedback ? (
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-400">
                <Check className="w-4 h-4" />
                <span>All chat history has been cleared.</span>
              </div>
            ) : confirmClear ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmClear()}
                  className="px-3.5 py-2 rounded-lg bg-[#ff4d4d] text-white text-[12px] font-bold hover:brightness-110 transition-all cursor-pointer"
                >
                  Yes, Clear All Chat History
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-2 rounded-lg border text-[12px] font-medium cursor-pointer"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.borderColor,
                    color: theme.textSecondary,
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#ff4d4d]/45 bg-[#ff4d4d]/10 text-[#ff6b6b] text-[12.5px] font-semibold hover:bg-[#ff4d4d]/20 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Chat History</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
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
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-bold transition-all hover:brightness-110 cursor-pointer"
            style={{
              backgroundImage: theme.sendButtonGradient,
              color: theme.sendButtonText,
            }}
          >
            <Check className="w-4 h-4" />
            <span>{savedNotice ? 'Saved!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
