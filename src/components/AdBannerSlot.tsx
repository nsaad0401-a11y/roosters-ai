import { Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { AppTheme } from '../themes';

interface AdBannerSlotProps {
  variant: 'header-banner' | 'sidebar-footer';
  theme: AppTheme;
}

export function AdBannerSlot({ variant, theme }: AdBannerSlotProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (variant === 'sidebar-footer') {
    return (
      <div
        className="m-2.5 mt-0 rounded-xl border p-2.5 shrink-0"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: theme.textMuted }}
          >
            Sponsored
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss sponsored sidebar banner"
            title="Hide ad"
            className="p-0.5 rounded hover:opacity-80 cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* <!-- PASTE AD NETWORK SCRIPT HERE (Sidebar / Native Ad Slot: Adsterra / Monetag / AdSense) --> */}
        <div
          className="rounded-lg border border-dashed px-3 py-3 text-center flex flex-col items-center justify-center gap-1 min-h-[76px]"
          style={{
            backgroundColor: theme.subSurfaceBg,
            borderColor: `${theme.accentPrimary}44`,
          }}
        >
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: theme.accentPrimary }}>
            <Megaphone className="w-3.5 h-3.5" />
            <span>Partner Ad Space</span>
          </div>
          <p className="text-[10.5px] leading-snug" style={{ color: theme.textMuted }}>
            Responsive Sidebar Slot · Ready for AdSense / Adsterra
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 border-b px-3 sm:px-6 py-2"
      style={{
        backgroundColor: theme.headerBg,
        borderColor: theme.borderColor,
      }}
    >
      <div className="max-w-4xl mx-auto relative flex items-center justify-center">
        {/* <!-- PASTE AD NETWORK SCRIPT HERE (Responsive 728x90 Desktop / 320x50 Mobile Banner: AdSense / Adsterra / Monetag) --> */}
        <div
          className="w-full max-w-[728px] min-h-[50px] sm:min-h-[68px] rounded-xl border border-dashed px-4 py-2 pr-9 flex items-center justify-between gap-3"
          style={{
            backgroundColor: theme.cardBg,
            borderColor: `${theme.accentSecondary}44`,
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.accentPrimary,
              }}
            >
              Sponsored
            </span>
            <span className="text-[12px] truncate" style={{ color: theme.textMuted }}>
              Responsive Ad Slot (728×90 / 320×50) — Supports Roosters AI Free Access
            </span>
          </div>
          <span
            className="hidden md:inline text-[11px] font-medium shrink-0"
            style={{ color: theme.accentSecondary }}
          >
            AdSense / Adsterra Ready
          </span>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss sponsored banner"
          title="Dismiss ad"
          className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:opacity-80 cursor-pointer"
          style={{ color: theme.textMuted }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
