import { Film, Loader2, ShieldCheck, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { APP_THEMES, AppTheme } from '../themes';
import { VideoAspectRatio } from '../types';

interface VideoCreateModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  theme?: AppTheme;
  onClose: () => void;
  onGenerate: (
    prompt: string,
    style: string,
    displayUserText?: string,
    aspectRatio?: VideoAspectRatio
  ) => void;
}

const VIDEO_STYLES = [
  'Cinematic Realism',
  'Anime & Stylized',
  'Educational Documentary',
  'Sci-Fi Futuristic',
];

const VIDEO_ASPECT_RATIOS: Array<{ value: VideoAspectRatio; label: string; sub: string }> = [
  { value: '16:9', label: '16:9 YouTube', sub: 'Landscape' },
  { value: '9:16', label: '9:16 Reels/Shorts', sub: 'Portrait' },
  { value: '1:1', label: '1:1 Square', sub: 'Feed Post' },
];

const QUICK_VIDEO_IDEAS = [
  'A majestic golden eagle soaring over snowy mountain peaks at sunrise',
  'Journey through the solar system showing glowing nebulae and Saturn rings',
  'Rain falling on a peaceful neon-lit Tokyo street at midnight',
];

export function VideoCreateModal({
  isOpen,
  isGenerating,
  theme = APP_THEMES['gold-cyan'],
  onClose,
  onGenerate,
}: VideoCreateModalProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(VIDEO_STYLES[0]);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim(), style, undefined, aspectRatio);
    setPrompt('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-video-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl max-h-[92dvh] overflow-y-auto"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
              }}
            >
              <Film className="w-4 h-4" style={{ color: theme.accentSecondary }} />
            </div>
            <div>
              <h2 id="create-video-title" className="font-display text-[17px] font-bold">
                Create AI Video Studio
              </h2>
              <p className="text-[12px]" style={{ color: theme.textMuted }}>
                Synthesize a playable 100% free &amp; unlimited AI video with download
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Create Video Studio"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="video-prompt"
              className="block text-[12.5px] font-medium mb-1.5"
              style={{ color: theme.textSecondary }}
            >
              Describe your video story (in any language)
            </label>
            <textarea
              id="video-prompt"
              rows={3}
              dir="auto"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A futuristic astronaut walking on Mars at sunset, or Urdu/Roman Urdu video banao..."
              className="w-full rounded-xl border p-3 text-[14px] focus:outline-none resize-none"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            />
          </div>

          <div>
            <span
              className="block text-[12px] font-medium mb-1.5"
              style={{ color: theme.textMuted }}
            >
              Quick Ideas
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_VIDEO_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setPrompt(idea)}
                  className="text-left text-[11.5px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                    color: theme.textSecondary,
                  }}
                >
                  {idea.slice(0, 48)}...
                </button>
              ))}
            </div>
          </div>

          <div>
            <span
              className="block text-[12.5px] font-medium mb-1.5"
              style={{ color: theme.textSecondary }}
            >
              Video Aspect Ratio
            </span>
            <div className="grid grid-cols-3 gap-2">
              {VIDEO_ASPECT_RATIOS.map((ratio) => {
                const active = aspectRatio === ratio.value;
                return (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => setAspectRatio(ratio.value)}
                    className="py-2 px-2.5 rounded-lg border transition-colors cursor-pointer text-left"
                    style={{
                      backgroundColor: active ? `${theme.accentSecondary}1a` : theme.subSurfaceBg,
                      borderColor: active ? theme.accentSecondary : theme.borderColor,
                      color: active ? theme.accentSecondary : theme.textMuted,
                    }}
                  >
                    <div className="text-[12px] font-bold leading-tight">{ratio.label}</div>
                    <div className="text-[10.5px] opacity-80">{ratio.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span
              className="block text-[12.5px] font-medium mb-1.5"
              style={{ color: theme.textSecondary }}
            >
              Visual Style
            </span>
            <div className="grid grid-cols-2 gap-2">
              {VIDEO_STYLES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStyle(item)}
                  className="py-2 px-3 rounded-lg text-[12px] font-medium border transition-colors cursor-pointer text-left"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: style === item ? theme.accentSecondary : theme.borderColor,
                    color: style === item ? theme.accentSecondary : theme.textMuted,
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Veo 2 + AI Motion Engine Notice */}
          <div
            className="rounded-xl border px-3 py-2 text-[11.5px] flex items-center gap-2"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.borderColor,
              color: theme.textSecondary,
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span>
              Veo 2 + Unlimited AI Motion Engine: Seamless multi-scene rendering &amp; instant video download with zero paywalls.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer"
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
              disabled={!prompt.trim() || isGenerating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              style={{
                backgroundImage: theme.sendButtonGradient,
                color: theme.sendButtonText,
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Directing Scenes...</span>
                </>
              ) : (
                <span>Generate AI Video</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
