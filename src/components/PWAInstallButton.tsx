import { Monitor, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useState } from 'react';
import { ROOSTERS_LOGO_SRC } from '../constants';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { AppTheme } from '../themes';

interface PWAInstallButtonProps {
  theme: AppTheme;
}

export function PWAInstallButton({ theme }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Suppress when already running in standalone installed PWA mode
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Install Roosters AI directly onto your phone or PC"
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

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border p-5 sm:p-6 shadow-2xl max-h-[90dvh] overflow-y-auto"
            style={{
              backgroundColor: theme.cardBg,
              borderColor: theme.borderColor,
              color: theme.textPrimary,
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <img
                  src={ROOSTERS_LOGO_SRC}
                  alt="Roosters AI App Icon"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-xl object-cover border shrink-0"
                  style={{ borderColor: theme.borderColor }}
                />
                <div>
                  <h2 id="pwa-install-guide-title" className="font-display text-[17px] font-bold">
                    Install Roosters AI App
                  </h2>
                  <p className="text-[12px]" style={{ color: theme.textMuted }}>
                    Add to Home Screen or Desktop for instant 1-tap launch
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close Install Guide"
                className="p-2 rounded-lg cursor-pointer"
                style={{ color: theme.textMuted }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              {isIOS ? (
                <div
                  className="rounded-xl border p-3.5"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.accentSecondary,
                  }}
                >
                  <div className="flex items-center gap-2 font-bold mb-1.5" style={{ color: theme.accentSecondary }}>
                    <Share className="w-4 h-4" />
                    <span>iPhone &amp; iPad (Safari — 1 Step)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[12.5px]" style={{ color: theme.textSecondary }}>
                    <li>
                      Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                    </li>
                    <li>
                      Scroll down and tap <strong>Add to Home Screen</strong>.
                    </li>
                  </ol>
                </div>
              ) : (
                <>
                  <div
                    className="rounded-xl border p-3.5"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                    }}
                  >
                    <div className="flex items-center gap-2 font-bold mb-1.5" style={{ color: theme.accentPrimary }}>
                      <Smartphone className="w-4 h-4" />
                      <span>Android Phone / Tablet (Chrome or Edge)</span>
                    </div>
                    <p className="text-[12.5px]" style={{ color: theme.textSecondary }}>
                      Open the browser menu (<strong>⋮</strong>) and tap{' '}
                      <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                    </p>
                  </div>

                  <div
                    className="rounded-xl border p-3.5"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: theme.borderColor,
                    }}
                  >
                    <div className="flex items-center gap-2 font-bold mb-1.5" style={{ color: theme.accentSecondary }}>
                      <Monitor className="w-4 h-4" />
                      <span>Windows / Mac / Chromebook PC</span>
                    </div>
                    <p className="text-[12.5px]" style={{ color: theme.textSecondary }}>
                      Click the <strong>Install Roosters AI</strong> icon on the right side of the
                      address bar (or Browser Menu → <strong>Cast, save, and share</strong> →{' '}
                      <strong>Install Roosters AI</strong>).
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
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
        </div>
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
