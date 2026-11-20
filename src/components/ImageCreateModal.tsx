import { FormEvent, useState } from 'react';
import { Loader2, Palette, ShieldCheck, X } from 'lucide-react';
import { APP_THEMES, AppTheme } from '../themes';

interface ImageCreateModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  theme?: AppTheme;
  onClose: () => void;
  onGenerate: (prompt: string, aspectRatio: '1:1' | '16:9' | '4:3') => void;
}

const ASPECT_RATIOS: Array<{ value: '1:1' | '16:9' | '4:3'; label: string }> = [
  { value: '1:1', label: 'Square (1:1)' },
  { value: '16:9', label: 'Widescreen (16:9)' },
  { value: '4:3', label: 'Classic (4:3)' },
];

export function ImageCreateModal({
  isOpen,
  isGenerating,
  theme = APP_THEMES['gold-cyan'],
  onClose,
  onGenerate,
}: ImageCreateModalProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '4:3'>('1:1');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim(), aspectRatio);
    setPrompt('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-image-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
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
              <Palette className="w-4 h-4" style={{ color: theme.accentPrimary }} />
            </div>
            <div>
              <h2 id="create-image-title" className="font-display text-[17px] font-bold">
                Create Image Studio
              </h2>
              <p className="text-[12px]" style={{ color: theme.textMuted }}>
                Synthesize bespoke high-resolution artwork
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Create Image Studio"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: theme.textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="image-prompt"
              className="block text-[12.5px] font-medium mb-1.5"
              style={{ color: theme.textSecondary }}
            >
              Describe your artwork
            </label>
            <textarea
              id="image-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Futuristic cybernetic falcon soaring above golden desert dunes at twilight"
              className="w-full rounded-xl border p-3 text-[14px] focus:outline-none resize-none"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            />
          </div>

          <div>
            <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: theme.textSecondary }}>
              Aspect Ratio
            </span>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.value}
                  type="button"
                  onClick={() => setAspectRatio(ratio.value)}
                  className="py-2 px-2.5 rounded-lg text-[12px] font-medium border transition-colors cursor-pointer"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: aspectRatio === ratio.value ? theme.accentSecondary : theme.borderColor,
                    color: aspectRatio === ratio.value ? theme.accentSecondary : theme.textMuted,
                  }}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unlimited Image Generation Notice */}
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
              Unlimited HD Image Generation · Safe Prompt Enhancer &amp; Auto-Fallback ready.
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
                  <span>Creating...</span>
                </>
              ) : (
                <span>Generate Image</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
