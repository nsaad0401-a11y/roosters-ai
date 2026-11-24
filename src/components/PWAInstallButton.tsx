import { Monitor, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { AppTheme } from '../themes';
import { BrandLogo } from './BrandLogo';

const ANDROID_APK_URL =
  'https://github.com/nsaad0401-a11y/roosters-ai/releases/download/v1.0/app-release.apk';

interface InstallAppModalProps {
  isOpen: boolean;
  theme: AppTheme;
  onClose: () => void;
}

export function InstallAppModal({ isOpen, theme, onClose }: InstallAppModalProps) {
  const { isInstallable, isIOS, install } = usePWAInstall();

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const handleDesktopInstallNow = async () => {
    if (!isInstallable) return;
    const accepted = await install();
    if (accepted) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-guide-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <BrandLogo variant="badge" className="w-11 h-11 shrink-0" ariaLabel="Roosters AI App Icon" />
            <div>
              <h2 id="pwa-install-guide-title" className="font-display text-[17px] font-bold">
                Install Roosters AI App
              </h2>
              <p className="text-[12px]" style={{ color: theme.textMuted }}>
                Download Android APK or install on Desktop &amp; iOS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Install Guide"
            className="p-2 rounded-lg cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Official Android APK Direct Download Button */}
        <div className="mb-4">
          <a
            href={ANDROID_APK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-[14.5px] transition-all shadow-lg"
            style={{
              boxShadow: theme.liteMode ? 'none' : '0 0 20px rgba(16, 185, 129, 0.35)',
            }}
          >
            <span>📥 Download Android App (.apk)</span>
          </a>
          <p className="mt-1.5 text-center text-[11.5px]" style={{ color: theme.textMuted }}>
            Official Roosters AI v1.0 by SandSoft · Direct 1-click Android APK download
          </p>
        </div>

        <div className="space-y-3 text-[13px]">
          {/* Desktop / Windows / Mac Install Option */}
          <div
            className="rounded-xl border p-3.5"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.borderColor,
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div
                className="flex items-center gap-2 font-bold"
                style={{ color: theme.accentSecondary }}
              >
                <Monitor className="w-4 h-4 shrink-0" />
                <span>Desktop / Windows / Mac</span>
              </div>
              {isInstallable && (
                <button
                  type="button"
                  onClick={handleDesktopInstallNow}
                  className="px-3 py-1 rounded-lg font-bold text-[12px] transition-all hover:brightness-110 cursor-pointer shrink-0"
                  style={{
                    backgroundImage: theme.sendButtonGradient,
                    color: theme.sendButtonText,
                  }}
                >
                  Install Now
                </button>
              )}
            </div>
            <p className="text-[12.5px]" style={{ color: theme.textSecondary }}>
              {isInstallable
                ? 'Click Install Now above, or use the Install Roosters AI icon in your browser address bar.'
                : 'Click the Install Roosters AI icon on the right side of your address bar (or Browser Menu → Cast, save, and share → Install Roosters AI).'}
            </p>
          </div>

          {/* iPhone & iPad (Safari) Instructions */}
          <div
            className="rounded-xl border p-3.5"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: isIOS ? theme.accentPrimary : theme.borderColor,
            }}
          >
            <div
              className="flex items-center gap-2 font-bold mb-1.5"
              style={{ color: theme.accentPrimary }}
            >
              <Share className="w-4 h-4 shrink-0" />
              <span>iPhone &amp; iPad (Safari)</span>
            </div>
            <ol
              className="list-decimal list-inside space-y-1 text-[12.5px]"
              style={{ color: theme.textSecondary }}
            >
              <li>
                Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
            </ol>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {isInstallable ? (
            <button
              type="button"
              onClick={handleDesktopInstallNow}
              className="px-4 py-2 rounded-xl border font-bold text-[13px] transition-all hover:brightness-110 cursor-pointer"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.accentSecondary,
                color: theme.accentSecondary,
              }}
            >
              Install Now
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl font-bold text-[13px] cursor-pointer"
            style={{
              backgroundImage: theme.sendButtonGradient,
              color: theme.sendButtonText,
            }}
          >
            Got It
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface PWAInstallButtonProps {
  theme: AppTheme;
  onOpenGuide?: () => void;
  onOpenModal?: () => void;
}

export function PWAInstallButton({ theme, onOpenGuide, onOpenModal }: PWAInstallButtonProps) {
  const { isInstalled } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Suppress when already running in standalone installed PWA mode
  if (isInstalled) {
    return null;
  }

  const handleClick = () => {
    onOpenGuide?.();
    if (onOpenModal) {
      onOpenModal();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Download Android APK or Install Roosters AI on Desktop & iOS"
        className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-bold text-[12px] sm:text-[12.5px] transition-all hover:brightness-110 whitespace-nowrap shrink-0 cursor-pointer"
        style={{
          backgroundImage: theme.sendButtonGradient,
          color: theme.sendButtonText,
          boxShadow: theme.liteMode ? 'none' : theme.sendButtonGlow,
        }}
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>
      {!onOpenModal && (
        <InstallAppModal
          isOpen={showGuideModal}
          theme={theme}
          onClose={() => setShowGuideModal(false)}
        />
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Saved chats remain available</span>
    </div>
  );
}
