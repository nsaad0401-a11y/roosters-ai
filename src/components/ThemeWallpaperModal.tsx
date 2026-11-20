import { Check, Image as ImageIcon, Palette, Trash2, Upload, X, Zap } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { APP_THEMES, BUILTIN_WALLPAPERS, ThemeId, ThemeSettings, WallpaperId } from '../themes';

interface ThemeWallpaperModalProps {
  isOpen: boolean;
  settings: ThemeSettings;
  onUpdate: (next: ThemeSettings) => void;
  onClose: () => void;
}

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Could not read file'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export function ThemeWallpaperModal({
  isOpen,
  settings,
  onUpdate,
  onClose,
}: ThemeWallpaperModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState('');

  if (!isOpen) return null;

  const activeTheme = APP_THEMES[settings.themeId];
  const themeList = Object.values(APP_THEMES);

  const handleSelectTheme = (themeId: ThemeId) => {
    onUpdate({ ...settings, themeId });
  };

  const handleSelectWallpaper = (wallpaperId: WallpaperId) => {
    onUpdate({ ...settings, wallpaperId });
  };

  const handleUploadWallpaper = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload a valid image file (JPG, PNG, or WebP).');
      return;
    }
    setUploadError('');
    try {
      const compressed = await compressImageToDataUrl(file);
      onUpdate({
        ...settings,
        wallpaperId: 'custom',
        customWallpaperUrl: compressed,
      });
    } catch {
      setUploadError('Could not process that wallpaper image.');
    }
  };

  const handleClearCustomWallpaper = () => {
    onUpdate({
      ...settings,
      wallpaperId: settings.wallpaperId === 'custom' ? 'solid' : settings.wallpaperId,
      customWallpaperUrl: '',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 sm:px-4 py-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-modal-title"
    >
      <div
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border p-4 sm:p-6 shadow-2xl"
        style={{
          backgroundColor: activeTheme.cardBg,
          borderColor: activeTheme.borderColor,
          color: activeTheme.textPrimary,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: activeTheme.subSurfaceBg,
                borderColor: activeTheme.borderColor,
              }}
            >
              <Palette className="w-5 h-5" style={{ color: activeTheme.accentPrimary }} />
            </div>
            <div>
              <h2 id="theme-modal-title" className="font-display text-[18px] font-bold">
                Theme &amp; Chat Wallpaper
              </h2>
              <p className="text-[12.5px]" style={{ color: activeTheme.textMuted }}>
                Personalize your Roosters AI study &amp; creative workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Theme & Wallpaper modal"
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: activeTheme.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5 Color Themes */}
        <section className="mb-6">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: activeTheme.textSecondary }}>
            Color Themes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {themeList.map((theme) => {
              const isSelected = settings.themeId === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleSelectTheme(theme.id)}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer"
                  style={{
                    backgroundColor: activeTheme.subSurfaceBg,
                    borderColor: isSelected ? activeTheme.accentSecondary : activeTheme.borderColor,
                    boxShadow: isSelected ? `0 0 0 1px ${activeTheme.accentSecondary}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center -space-x-1.5 shrink-0">
                      {theme.previewColors.map((hex, i) => (
                        <span
                          key={i}
                          className="w-5 h-5 rounded-full border border-white/20"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold truncate">{theme.name}</div>
                      <div className="text-[11.5px] truncate" style={{ color: activeTheme.textMuted }}>
                        {theme.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 shrink-0" style={{ color: activeTheme.accentSecondary }} />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Built-in Wallpapers & Custom Upload */}
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: activeTheme.textSecondary }}>
            Chat Background Wallpaper
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            {BUILTIN_WALLPAPERS.map((wp) => {
              const isSelected = settings.wallpaperId === wp.id;
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => handleSelectWallpaper(wp.id)}
                  className="p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[82px]"
                  style={{
                    backgroundColor: activeTheme.subSurfaceBg,
                    borderColor: isSelected ? activeTheme.accentPrimary : activeTheme.borderColor,
                    boxShadow: isSelected ? `0 0 0 1px ${activeTheme.accentPrimary}` : 'none',
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12.5px] font-semibold leading-tight">{wp.name}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 shrink-0" style={{ color: activeTheme.accentPrimary }} />
                    )}
                  </div>
                  <span className="text-[11px] leading-snug mt-1" style={{ color: activeTheme.textMuted }}>
                    {wp.description}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Device Upload */}
          <div
            className="rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
            style={{
              backgroundColor: activeTheme.subSurfaceBg,
              borderColor:
                settings.wallpaperId === 'custom' ? activeTheme.accentSecondary : activeTheme.borderColor,
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {settings.customWallpaperUrl ? (
                <img
                  src={settings.customWallpaperUrl}
                  alt="Custom chat wallpaper preview"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover border shrink-0"
                  style={{ borderColor: activeTheme.borderColor }}
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-lg border flex items-center justify-center shrink-0"
                  style={{ borderColor: activeTheme.borderColor, backgroundColor: activeTheme.cardBg }}
                >
                  <ImageIcon className="w-5 h-5" style={{ color: activeTheme.textMuted }} />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">Custom Wallpaper Image</div>
                <div className="text-[11.5px]" style={{ color: activeTheme.textMuted }}>
                  Upload any photo or study aesthetic from your device
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadWallpaper}
                className="hidden"
              />
              {settings.customWallpaperUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectWallpaper('custom')}
                    className="px-3 py-1.5 rounded-lg border text-[12px] font-medium cursor-pointer"
                    style={{
                      backgroundColor:
                        settings.wallpaperId === 'custom' ? activeTheme.accentSecondary : activeTheme.cardBg,
                      color: settings.wallpaperId === 'custom' ? '#050608' : activeTheme.textPrimary,
                      borderColor: activeTheme.borderColor,
                    }}
                  >
                    {settings.wallpaperId === 'custom' ? 'Active' : 'Use Photo'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCustomWallpaper}
                    aria-label="Remove custom wallpaper"
                    className="p-2 rounded-lg border text-[#ff4d4d] cursor-pointer"
                    style={{ borderColor: activeTheme.borderColor, backgroundColor: activeTheme.cardBg }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-[12.5px] cursor-pointer"
                style={{
                  backgroundImage: activeTheme.sendButtonGradient,
                  color: activeTheme.sendButtonText,
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{settings.customWallpaperUrl ? 'Change Photo' : 'Upload Image'}</span>
              </button>
            </div>
          </div>

          {uploadError && <p className="mt-2 text-[12px] text-[#ff4d4d]">{uploadError}</p>}
        </section>

        {/* Lite Performance Mode for Older Low-RAM Phones & Legacy PCs */}
        <section
          className="mt-5 rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: activeTheme.subSurfaceBg,
            borderColor: settings.liteMode ? activeTheme.accentSecondary : activeTheme.borderColor,
          }}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: activeTheme.cardBg,
                borderColor: activeTheme.borderColor,
              }}
            >
              <Zap
                className="w-4 h-4"
                style={{
                  color: settings.liteMode ? activeTheme.accentSecondary : activeTheme.textMuted,
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold">Lite Performance Mode</div>
              <p className="text-[11.5px] mt-0.5" style={{ color: activeTheme.textMuted }}>
                Disables heavy background blurs &amp; animations so older low-RAM phones and older PCs run fast with zero lag.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={Boolean(settings.liteMode)}
            onClick={() => onUpdate({ ...settings, liteMode: !settings.liteMode })}
            className="px-4 py-2 rounded-lg border text-[12.5px] font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: settings.liteMode ? activeTheme.accentSecondary : activeTheme.cardBg,
              borderColor: settings.liteMode ? activeTheme.accentSecondary : activeTheme.borderColor,
              color: settings.liteMode ? '#050608' : activeTheme.textPrimary,
            }}
          >
            {settings.liteMode ? 'Lite Mode: ON' : 'Enable Lite Mode'}
          </button>
        </section>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl font-bold text-[13px] cursor-pointer"
            style={{
              backgroundImage: activeTheme.sendButtonGradient,
              color: activeTheme.sendButtonText,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
