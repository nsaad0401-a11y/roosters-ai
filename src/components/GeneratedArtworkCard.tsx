import { Download, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { GeneratedArtwork } from '../types';

interface GeneratedArtworkCardProps {
  artwork: GeneratedArtwork;
}

export function GeneratedArtworkCard({ artwork }: GeneratedArtworkCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const hasRaster = Boolean(artwork.imageUrl) && !imgFailed;
  const hasSvg = Boolean(artwork.svgCode);
  const svgDataUrl = artwork.svgCode
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork.svgCode)}`
    : '';
  const safeFileSlug =
    artwork.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'roosters-artwork';

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

  const handleDownloadPng = async () => {
    if (hasRaster && artwork.imageUrl) {
      try {
        const resp = await fetch(artwork.imageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${safeFileSlug}.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          return;
        }
      } catch {
        // Fallback to direct download anchor
      }
      const link = document.createElement('a');
      link.href = artwork.imageUrl;
      link.download = `${safeFileSlug}.png`;
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
          link.download = `${safeFileSlug}.png`;
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

  return (
    <div className="mt-3 rounded-xl border border-[#1f293d] bg-[#090b10] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-[#1f293d] bg-[#0f1420]">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon className="w-4 h-4 text-[#ffd700] shrink-0" />
          <span className="text-[13px] font-semibold text-white truncate">{artwork.title}</span>
          <span className="text-[11px] text-[#64748b] tabular-nums shrink-0">{artwork.aspectRatio}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(hasRaster || hasSvg) && (
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#182032] border border-[#334155] text-[11px] font-medium text-slate-200 hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>PNG</span>
            </button>
          )}
          {hasSvg && !hasRaster && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#182032] border border-[#334155] text-[11px] font-medium text-slate-200 hover:border-[#ffd700] hover:text-[#ffd700] transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>SVG</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-3 flex items-center justify-center bg-[#07090e]">
        {hasRaster && artwork.imageUrl ? (
          <img
            src={artwork.imageUrl}
            alt={artwork.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="max-h-[420px] w-auto rounded-lg object-contain border border-[#1f293d]"
          />
        ) : hasSvg ? (
          <img
            src={svgDataUrl}
            alt={artwork.title}
            referrerPolicy="no-referrer"
            className="max-h-[400px] w-auto rounded-lg object-contain border border-[#1f293d]"
          />
        ) : (
          <div className="w-full py-12 rounded-lg border border-[#1f293d] bg-gradient-to-br from-[#111622] to-[#090b10] flex flex-col items-center justify-center gap-2 text-center px-4">
            <ImageIcon className="w-8 h-8 text-[#00d4ff]" />
            <span className="text-[13px] font-semibold text-white">{artwork.title}</span>
          </div>
        )}
      </div>

      {artwork.description && (
        <p dir="auto" className="px-3.5 py-2.5 text-[12.5px] text-[#94a3b8] border-t border-[#1f293d]">
          {artwork.description}
        </p>
      )}
    </div>
  );
}
