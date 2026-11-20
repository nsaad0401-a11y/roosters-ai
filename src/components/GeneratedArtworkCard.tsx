import { Download, Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { GeneratedArtwork } from '../types';

interface GeneratedArtworkCardProps {
  artwork: GeneratedArtwork;
}

export function GeneratedArtworkCard({ artwork }: GeneratedArtworkCardProps) {
  const [imgLoading, setImgLoading] = useState(Boolean(artwork.imageUrl));
  const [imgFailed, setImgFailed] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);

  const activeImageUrl = artwork.imageUrl
    ? retrySeed > 0 && artwork.imageUrl.startsWith('http')
      ? `${artwork.imageUrl}${artwork.imageUrl.includes('?') ? '&' : '?'}retry=${retrySeed}`
      : artwork.imageUrl
    : '';
  const engineLabel =
    artwork.provider === 'horde'
      ? 'AI Horde Studio'
      : artwork.provider === 'svg'
        ? 'Vector Art'
        : 'AI Studio HD';
  const hasRaster = Boolean(activeImageUrl) && !imgFailed;
  const hasSvg = Boolean(artwork.svgCode);
  const svgDataUrl = artwork.svgCode
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork.svgCode)}`
    : '';
  const safeFileSlug =
    artwork.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'roosters-hd-image';

  const handleDownloadSvg = () => {
    if (!artwork.svgCode) return;
    const blob = new Blob([artwork.svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileSlug}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHD = async () => {
    if (hasRaster && activeImageUrl) {
      try {
        const resp = await fetch(activeImageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${safeFileSlug}-hd.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          return;
        }
      } catch {
        // Fallback to direct anchor if cross-origin blob fetch is restricted
      }
      const link = document.createElement('a');
      link.href = activeImageUrl;
      link.download = `${safeFileSlug}-hd.png`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    if (!artwork.svgCode) return;
    const img = new Image();
    const blob = new Blob([artwork.svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = artwork.width || 1024;
      canvas.height = artwork.height || 1024;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) return;
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `${safeFileSlug}-hd.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(pngUrl);
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleRetryImage = () => {
    setImgFailed(false);
    setImgLoading(true);
    setRetrySeed((prev) => prev + 1);
  };

  return (
    <div className="mt-3 rounded-xl border border-[#1f293d] bg-[#090b10] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-[#1f293d] bg-[#0f1420]">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon className="w-4 h-4 text-[#ffd700] shrink-0" />
          <span className="text-[13px] font-semibold text-white truncate">{artwork.title}</span>
          <span className="text-[11px] text-[#64748b] tabular-nums shrink-0">
            {artwork.width}×{artwork.height} HD
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(hasRaster || hasSvg) && (
            <button
              type="button"
              onClick={handleDownloadHD}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182032] border border-[#334155] text-[11.5px] font-semibold text-slate-100 hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download HD Image</span>
            </button>
          )}
          {hasSvg && !hasRaster && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#182032] border border-[#334155] text-[11.5px] font-medium text-slate-200 hover:border-[#ffd700] hover:text-[#ffd700] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SVG</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative p-3 flex items-center justify-center bg-[#07090e] min-h-[260px]">
        {hasRaster && imgLoading && (
          <div className="absolute inset-3 rounded-lg border border-[#1f293d] bg-[#0d121d]/95 flex flex-col items-center justify-center gap-3 z-10 text-center px-4">
            <div className="w-11 h-11 rounded-full border-2 border-[#00d4ff]/30 border-t-[#ffd700] animate-spin" />
            <div>
              <p className="text-[13.5px] font-semibold text-white">
                Rendering {artwork.width}×{artwork.height} HD AI Image...
              </p>
              <p className="text-[11.5px] text-[#94a3b8] mt-1">
                {engineLabel} synthesis in progress
              </p>
            </div>
          </div>
        )}

        {hasRaster ? (
          <img
            src={activeImageUrl}
            alt={artwork.title}
            referrerPolicy="no-referrer"
            onLoad={() => {
              setImgLoading(false);
              setImgFailed(false);
            }}
            onError={() => {
              setImgLoading(false);
              setImgFailed(true);
            }}
            className={`max-h-[460px] w-auto rounded-lg object-contain border border-[#1f293d] transition-opacity duration-300 ${
              imgLoading ? 'opacity-0' : 'opacity-100'
            }`}
          />
        ) : hasSvg ? (
          <img
            src={svgDataUrl}
            alt={artwork.title}
            referrerPolicy="no-referrer"
            className="max-h-[420px] w-auto rounded-lg object-contain border border-[#1f293d]"
          />
        ) : (
          <div className="w-full py-12 rounded-lg border border-[#1f293d] bg-gradient-to-br from-[#111622] to-[#090b10] flex flex-col items-center justify-center gap-3 text-center px-4">
            <ImageIcon className="w-8 h-8 text-[#00d4ff]" />
            <div>
              <span className="text-[13.5px] font-semibold text-white block">{artwork.title}</span>
              <span className="text-[12px] text-[#94a3b8]">
                The image server took too long to respond. Click below to retry rendering.
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetryImage}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#182032] border border-[#334155] text-[12px] font-semibold text-[#00d4ff] hover:border-[#00d4ff] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry HD Image</span>
            </button>
          </div>
        )}
      </div>

      {artwork.description && (
        <div className="px-3.5 py-2.5 border-t border-[#1f293d] flex items-center justify-between gap-3">
          <p dir="auto" className="text-[12px] text-[#94a3b8] line-clamp-2">
            {artwork.description}
          </p>
          {imgLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#00d4ff] shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{engineLabel}</span>
            </span>
          ) : (
            <span className="text-[11px] text-[#64748b] shrink-0">{engineLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
