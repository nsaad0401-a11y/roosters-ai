/**
 * Processes a direct Flux / Pollinations image URL through an offscreen HTML5 <canvas>
 * with crossOrigin="anonymous" to trim the bottom 4.5% (cleanly removing the bottom-right
 * watermark) and outputs a crisp, uncompressed PNG data URL labeled for Roosters AI HD.
 */
export async function trimImageBottomWatermarkToPng(
  imageUrl: string,
  trimBottomRatio = 0.045
): Promise<{ pngDataUrl: string; width: number; height: number } | null> {
  if (typeof window === 'undefined' || !imageUrl || !imageUrl.startsWith('http')) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (res: { pngDataUrl: string; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    const timer = window.setTimeout(() => {
      finish(null);
    }, 28_000);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w < 32 || h < 32) {
          finish(null);
          return;
        }

        const croppedHeight = Math.max(32, Math.round(h * (1 - trimBottomRatio)));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = croppedHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, croppedHeight, 0, 0, w, croppedHeight);

        const pngDataUrl = canvas.toDataURL('image/png');
        if (pngDataUrl && pngDataUrl.startsWith('data:image/png')) {
          finish({ pngDataUrl, width: w, height: croppedHeight });
        } else {
          finish(null);
        }
      } catch {
        // SecurityError (tainted canvas if CDN omits CORS headers) falls back cleanly
        finish(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };

    img.src = imageUrl;
  });
}
