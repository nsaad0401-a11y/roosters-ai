import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { ImagePlus, Loader2, Palette, ShieldCheck, X } from 'lucide-react';
import { APP_THEMES, AppTheme } from '../themes';

interface ImageCreateModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  theme?: AppTheme;
  onClose: () => void;
  onGenerate: (
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '4:3',
    displayUserText?: string,
    options?: {
      resolution?: '1K' | '2K';
      referenceImage?: { dataUrl: string; mimeType: string; name: string };
    }
  ) => void;
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
  const [resolution, setResolution] = useState<'1K' | '2K'>('1K');
  const [referenceImage, setReferenceImage] = useState<{
    dataUrl: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleRefFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setReferenceImage({
        dataUrl,
        mimeType: file.type || 'image/png',
        name: file.name || 'reference-photo.png',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim(), aspectRatio, undefined, {
      resolution,
      referenceImage: referenceImage || undefined,
    });
    setPrompt('');
    setReferenceImage(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-image-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl max-h-[92dvh] overflow-y-auto"
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
                Roosters HD Image Studio
              </h2>
              <p className="text-[12px]" style={{ color: theme.textMuted }}>
                Instant Zero-Setup HD Image Studio · Unlimited Creations
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
          {/* Optional Photo Upload for Photo-to-Photo Editing */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12.5px] font-medium" style={{ color: theme.textSecondary }}>
                Reference Photo (Optional — for Photo Editing)
              </span>
              {referenceImage && (
                <button
                  type="button"
                  onClick={() => setReferenceImage(null)}
                  className="text-[11px] font-medium text-[#ff6b6b] hover:underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleRefFileChange}
              className="hidden"
            />
            {referenceImage ? (
              <div
                className="flex items-center gap-3 p-2.5 rounded-xl border"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.accentSecondary,
                }}
              >
                <img
                  src={referenceImage.dataUrl}
                  alt={referenceImage.name}
                  className="w-12 h-12 rounded-lg object-cover border shrink-0"
                  style={{ borderColor: theme.borderColor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold truncate">{referenceImage.name}</p>
                  <p className="text-[11px]" style={{ color: theme.accentSecondary }}>
                    Photo-to-Photo Edit Mode Active
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed text-[12px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                  color: theme.textMuted,
                }}
              >
                <ImagePlus className="w-4 h-4" style={{ color: theme.accentSecondary }} />
                <span>Upload a Photo to Edit (e.g., change background, 3D figurine, restore)</span>
              </button>
            )}
          </div>

          <div>
            <label
              htmlFor="image-prompt"
              className="block text-[12.5px] font-medium mb-1.5"
              style={{ color: theme.textSecondary }}
            >
              {referenceImage ? 'Describe how to edit this photo' : 'Describe your artwork (English, Urdu, or Roman Urdu)'}
            </label>
            <textarea
              id="image-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                referenceImage
                  ? 'e.g., Change background to a sunset beach, keep face consistent, or make this a 3D collectible figurine'
                  : 'e.g., Futuristic cybernetic falcon over Lahore Minar-e-Pakistan at twilight with glowing neon gold text'
              }
              className="w-full rounded-xl border p-3 text-[14px] focus:outline-none resize-none"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                Aspect Ratio
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => setAspectRatio(ratio.value)}
                    className="py-2 px-1.5 rounded-lg text-[11.5px] font-medium border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: aspectRatio === ratio.value ? theme.accentSecondary : theme.borderColor,
                      color: aspectRatio === ratio.value ? theme.accentSecondary : theme.textMuted,
                    }}
                  >
                    {ratio.value}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                HD Output Quality
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(['1K', '2K'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setResolution(res)}
                    className="py-2 px-2 rounded-lg text-[11.5px] font-semibold border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: theme.subSurfaceBg,
                      borderColor: resolution === res ? theme.accentPrimary : theme.borderColor,
                      color: resolution === res ? theme.accentPrimary : theme.textMuted,
                    }}
                  >
                    {res === '2K' ? '2K Ultra-HD' : '1K HD'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Engine Notice */}
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
              Instant automatic HD synthesis for all guests &amp; users — no API key or token required.
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
                  <span>{referenceImage ? 'Editing...' : 'Creating...'}</span>
                </>
              ) : (
                <span>{referenceImage ? 'Edit Photo HD' : 'Generate Image'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
