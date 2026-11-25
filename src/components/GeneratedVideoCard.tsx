import {
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GeneratedVideo, VoiceStudioSettings } from '../types';
import { speakWithVoiceProfile } from '../utils/voiceEngine';

interface GeneratedVideoCardProps {
  video: GeneratedVideo;
  language: string;
  voiceSettings: VoiceStudioSettings;
}

const SCENE_DURATION_MS = 3200;
const CROSSFADE_MS = 650;

function getVideoDims(aspectRatio?: GeneratedVideo['aspectRatio']): { w: number; h: number } {
  if (aspectRatio === '9:16') return { w: 540, h: 960 };
  if (aspectRatio === '1:1') return { w: 720, h: 720 };
  return { w: 960, h: 540 };
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawFallbackScene(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  sceneIndex: number,
  caption: string,
  title: string,
  mood: GeneratedVideo['mood'],
  progress: number
) {
  const palettes: Record<GeneratedVideo['mood'], [string, string, string]> = {
    cinematic: ['#0b1222', '#1a2744', '#ffd700'],
    calm: ['#081c24', '#123b47', '#00d4ff'],
    epic: ['#1a0b1e', '#38123b', '#ff6b35'],
    study: ['#0b172a', '#16304f', '#38bdf8'],
  };
  const [c1, c2, accent] = palettes[mood] || palettes.cinematic;
  const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Subtle animated light orb
  const orbX = canvasW * (0.25 + 0.5 * ((sceneIndex * 0.25 + progress * 0.4) % 1));
  const orbY = canvasH * (0.35 + 0.2 * Math.sin(progress * Math.PI + sceneIndex));
  const radial = ctx.createRadialGradient(orbX, orbY, 10, orbX, orbY, 300);
  radial.addColorStop(0, `${accent}44`);
  radial.addColorStop(1, 'transparent');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `bold ${canvasW < 640 ? 24 : 34}px Plus Jakarta Sans, sans-serif`;
  ctx.textAlign = 'center';
  const lines = wrapCanvasLines(ctx, caption, canvasW - 64);
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, canvasW / 2, canvasH / 2 - 14 + idx * 32);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 17px Plus Jakarta Sans, sans-serif';
  ctx.fillText(title, canvasW / 2, canvasH / 2 + 28 + lines.length * 18);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  img: HTMLImageElement,
  sceneIndex: number,
  sceneProgress: number,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const iw = img.naturalWidth || canvasW;
  const ih = img.naturalHeight || canvasH;
  const baseScale = Math.max(canvasW / iw, canvasH / ih);

  // Distinct 4-act cinematic Ken Burns camera choreography
  let zoomFactor = 1.04;
  let panX = 0;
  let panY = 0;

  if (sceneIndex === 0) {
    zoomFactor = 1.0 + 0.12 * sceneProgress;
    panX = (sceneProgress - 0.5) * 44;
    panY = -10 * sceneProgress;
  } else if (sceneIndex === 1) {
    zoomFactor = 1.12 + 0.12 * sceneProgress;
    panX = -32 * (sceneProgress - 0.3);
    panY = 18 * (0.5 - sceneProgress);
  } else if (sceneIndex === 2) {
    zoomFactor = 1.18 - 0.04 * sceneProgress;
    panX = (0.5 - sceneProgress) * 64;
    panY = Math.sin(sceneProgress * Math.PI) * 14;
  } else {
    zoomFactor = 1.22 - 0.18 * sceneProgress;
    panX = (sceneProgress - 0.5) * 26;
    panY = -14 * (1 - sceneProgress);
  }

  const scale = baseScale * zoomFactor;
  const drawW = iw * scale;
  const drawH = ih * scale;

  const x = (canvasW - drawW) / 2 + panX;
  const y = (canvasH - drawH) / 2 + panY;

  ctx.drawImage(img, x, y, drawW, drawH);
  ctx.restore();
}

function drawCinematicOverlays(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  sceneIndex: number,
  sceneProgress: number,
  totalElapsedMs: number,
  mood: GeneratedVideo['mood']
) {
  const accentMap: Record<GeneratedVideo['mood'], { primary: string; glow: string }> = {
    cinematic: { primary: 'rgba(255, 215, 0, ', glow: 'rgba(0, 212, 255, ' },
    calm: { primary: 'rgba(56, 189, 248, ', glow: 'rgba(167, 243, 208, ' },
    epic: { primary: 'rgba(251, 146, 60, ', glow: 'rgba(255, 215, 0, ' },
    study: { primary: 'rgba(0, 212, 255, ', glow: 'rgba(255, 215, 0, ' },
  };
  const palette = accentMap[mood] || accentMap.cinematic;

  const sweepX = canvasW * (0.18 + 0.64 * ((sceneProgress + sceneIndex * 0.25) % 1));
  const sweepY = canvasH * (0.28 + 0.14 * Math.sin(totalElapsedMs * 0.0012));
  const flare = ctx.createRadialGradient(sweepX, sweepY, 8, sweepX, sweepY, 340);
  flare.addColorStop(0, `${palette.primary}0.16)`);
  flare.addColorStop(0.55, `${palette.glow}0.06)`);
  flare.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const t = totalElapsedMs * 0.0007;
  for (let i = 0; i < 14; i++) {
    const px = (Math.sin(t * 0.9 + i * 1.7) * 0.5 + 0.5) * canvasW;
    const py = (Math.cos(t * 0.65 + i * 2.3) * 0.5 + 0.5) * (canvasH - 90);
    const radius = 1.6 + (i % 3) * 1.1;
    const alpha = 0.14 + 0.14 * Math.sin(t * 2 + i);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = `${i % 2 === 0 ? palette.primary : palette.glow}${alpha.toFixed(2)})`;
    ctx.fill();
  }

  const topScrim = ctx.createLinearGradient(0, 0, 0, 72);
  topScrim.addColorStop(0, 'rgba(5, 6, 8, 0.45)');
  topScrim.addColorStop(1, 'rgba(5, 6, 8, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, canvasW, 72);
}

async function fetchImageSafe(url: string): Promise<{ img: HTMLImageElement | null; objectUrl?: string }> {
  if (!url) return { img: null };

  if (url.startsWith('data:')) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ img: im });
      im.onerror = () => resolve({ img: null });
      im.src = url;
    });
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 14000);
    const resp = await fetch(url, { mode: 'cors', signal: controller.signal });
    window.clearTimeout(timer);
    if (resp.ok) {
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = objUrl;
      });
      if (loaded) return { img: loaded, objectUrl: objUrl };
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    // Fallback to direct Image element with crossOrigin='anonymous'
  }

  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.referrerPolicy = 'no-referrer';
    const timer = window.setTimeout(() => resolve({ img: null }), 10000);
    im.onload = () => {
      window.clearTimeout(timer);
      resolve({ img: im });
    };
    im.onerror = () => {
      window.clearTimeout(timer);
      resolve({ img: null });
    };
    im.src = url;
  });
}

function createAmbientPadNodes(
  audioCtx: AudioContext,
  mood: GeneratedVideo['mood'],
  destination: AudioNode
): () => void {
  const chords: Record<GeneratedVideo['mood'], number[]> = {
    cinematic: [130.81, 196.0, 246.94, 293.66],
    calm: [146.83, 220.0, 261.63, 329.63],
    epic: [110.0, 164.81, 220.0, 261.63],
    study: [164.81, 246.94, 293.66, 392.0],
  };
  const freqs = chords[mood] || chords.cinematic;
  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  masterGain.gain.exponentialRampToValueAtTime(0.055, audioCtx.currentTime + 1.2);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 620;
  filter.connect(masterGain);
  masterGain.connect(destination);

  const oscs = freqs.map((f, idx) => {
    const osc = audioCtx.createOscillator();
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = f;
    osc.connect(filter);
    osc.start();
    return osc;
  });

  return () => {
    try {
      masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
      window.setTimeout(() => {
        oscs.forEach((o) => {
          try {
            o.stop();
            o.disconnect();
          } catch {
            // ignore
          }
        });
        masterGain.disconnect();
      }, 280);
    } catch {
      // ignore
    }
  };
}

export function GeneratedVideoCard({
  video,
  language,
  voiceSettings,
}: GeneratedVideoCardProps) {
  const [loadedCount, setLoadedCount] = useState(0);
  const [isReady, setIsReady] = useState(Boolean(video.veoVideoUrl));
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [timelinePct, setTimelinePct] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportNotice, setExportNotice] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImagesRef = useRef<Array<HTMLImageElement | null>>([null, null, null, null]);
  const elapsedMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(true);
  const stopPadRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const dims = getVideoDims(video.aspectRatio);
  const canvasW = dims.w;
  const canvasH = dims.h;

  const hasVeoMp4 = Boolean(video.veoVideoUrl);
  const totalDurationMs = Math.max(1, video.scenes.length) * SCENE_DURATION_MS;
  const safeSlug =
    video.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 44) || 'roosters-ai-video';

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying) {
      lastTickRef.current = null;
    }
  }, [isPlaying]);

  // Load unique scene image(s) for AI Motion fallback
  useEffect(() => {
    if (hasVeoMp4) {
      setIsReady(true);
      setLoadedCount(video.scenes.length);
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];

    const loadAll = async () => {
      setLoadedCount(0);
      setIsReady(false);

      const cache = new Map<string, HTMLImageElement | null>();
      const uniqueUrls = Array.from(
        new Set(
          [video.heroImageUrl, ...video.scenes.map((s) => s.imageUrl)].filter(
            (u): u is string => Boolean(u)
          )
        )
      );

      for (const u of uniqueUrls) {
        const res = await fetchImageSafe(u);
        if (res.objectUrl) objectUrls.push(res.objectUrl);
        cache.set(u, res.img);
        if (!cancelled) setLoadedCount((prev) => Math.min(video.scenes.length, prev + 1));
      }

      if (!cancelled) {
        const mapped = video.scenes.map(
          (scene) => cache.get(scene.imageUrl || video.heroImageUrl || '') ?? null
        );
        loadedImagesRef.current = mapped;
        setLoadedCount(video.scenes.length);
        setIsReady(true);
      }
    };

    void loadAll();

    return () => {
      cancelled = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [hasVeoMp4, video]);

  const drawFrameAt = useCallback(
    (ctx: CanvasRenderingContext2D, elapsedMs: number) => {
      const sceneCount = Math.max(1, video.scenes.length);
      const looped = ((elapsedMs % totalDurationMs) + totalDurationMs) % totalDurationMs;
      const sceneIdx = Math.min(sceneCount - 1, Math.floor(looped / SCENE_DURATION_MS));
      const sceneOffset = looped - sceneIdx * SCENE_DURATION_MS;
      const sceneProgress = Math.min(1, sceneOffset / SCENE_DURATION_MS);
      const nextSceneIdx = (sceneIdx + 1) % sceneCount;

      ctx.clearRect(0, 0, canvasW, canvasH);

      const curImg = loadedImagesRef.current[sceneIdx];
      const curScene = video.scenes[sceneIdx];
      if (curImg) {
        drawCoverImage(ctx, canvasW, canvasH, curImg, sceneIdx, sceneProgress, 1);
      } else {
        drawFallbackScene(ctx, canvasW, canvasH, sceneIdx, curScene.caption, video.title, video.mood, sceneProgress);
      }

      const fadeStart = SCENE_DURATION_MS - CROSSFADE_MS;
      if (sceneOffset > fadeStart) {
        const fadeAlpha = Math.min(1, (sceneOffset - fadeStart) / CROSSFADE_MS);
        const nextImg = loadedImagesRef.current[nextSceneIdx];
        const nextScene = video.scenes[nextSceneIdx];
        if (nextImg) {
          drawCoverImage(ctx, canvasW, canvasH, nextImg, nextSceneIdx, 0, fadeAlpha);
        } else {
          ctx.save();
          ctx.globalAlpha = fadeAlpha;
          drawFallbackScene(ctx, canvasW, canvasH, nextSceneIdx, nextScene.caption, video.title, video.mood, 0);
          ctx.restore();
        }
      }

      drawCinematicOverlays(ctx, canvasW, canvasH, sceneIdx, sceneProgress, elapsedMs, video.mood);

      const scrim = ctx.createLinearGradient(0, canvasH - 180, 0, canvasH);
      scrim.addColorStop(0, 'rgba(7, 9, 14, 0)');
      scrim.addColorStop(1, 'rgba(7, 9, 14, 0.9)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, canvasH - 180, canvasW, 180);

      // Wrapped caption text (works crisply in portrait 9:16 & landscape 16:9)
      const isNarrow = canvasW < 640;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${isNarrow ? 20 : 24}px Plus Jakarta Sans, sans-serif`;
      ctx.textAlign = 'left';
      const maxCaptionW = isNarrow ? canvasW - 44 : canvasW - 280;
      const capLines = wrapCanvasLines(ctx, curScene.caption, maxCaptionW);
      const startY = canvasH - 44 - (capLines.length - 1) * (isNarrow ? 24 : 28);
      capLines.forEach((line, i) => {
        ctx.fillText(line, 24, startY + i * (isNarrow ? 24 : 28));
      });

      // Subtle watermark & scene counter
      ctx.fillStyle = 'rgba(255, 215, 0, 0.92)';
      ctx.font = '600 13px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = isNarrow ? 'left' : 'right';
      ctx.fillText(
        `Roosters AI Cinema · Scene ${sceneIdx + 1}/${sceneCount}`,
        isNarrow ? 24 : canvasW - 24,
        isNarrow ? canvasH - 18 : canvasH - 42
      );
    },
    [canvasH, canvasW, totalDurationMs, video]
  );

  // Animation loop for canvas fallback
  useEffect(() => {
    if (!isReady || hasVeoMp4) return;
    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (isPlayingRef.current) {
        if (lastTickRef.current !== null) {
          elapsedMsRef.current = (elapsedMsRef.current + (now - lastTickRef.current)) % totalDurationMs;
        }
        lastTickRef.current = now;
      }

      if (ctx) {
        drawFrameAt(ctx, elapsedMsRef.current);
      }

      const curIdx = Math.min(
        video.scenes.length - 1,
        Math.floor(elapsedMsRef.current / SCENE_DURATION_MS)
      );
      setActiveSceneIdx(curIdx);
      setTimelinePct((elapsedMsRef.current / totalDurationMs) * 100);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrameAt, hasVeoMp4, isReady, totalDurationMs, video.scenes.length]);

  useEffect(() => {
    return () => {
      stopPadRef.current?.();
      stopPadRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  const stopSoundtrackAndVoice = () => {
    stopPadRef.current?.();
    stopPadRef.current = null;
    window.speechSynthesis?.cancel();
  };

  const handleToggleMuteAudio = () => {
    if (!isMuted) {
      stopSoundtrackAndVoice();
      setIsMuted(true);
      return;
    }

    setIsMuted(false);
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = audioCtxRef.current ?? new AudioCtx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        stopPadRef.current = createAmbientPadNodes(ctx, video.mood, ctx.destination);
      }
    } catch {
      // Ignore Web Audio errors
    }

    if (video.narration) {
      speakWithVoiceProfile({
        text: video.narration,
        language,
        voiceSettings,
      });
    }
  };

  const handleJumpScene = (idx: number) => {
    elapsedMsRef.current = idx * SCENE_DURATION_MS + 10;
    lastTickRef.current = performance.now();
    setActiveSceneIdx(idx);
    setTimelinePct((elapsedMsRef.current / totalDurationMs) * 100);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawFrameAt(ctx, elapsedMsRef.current);
  };

  const handleDownloadVideo = async () => {
    if (video.veoVideoUrl) {
      const link = document.createElement('a');
      link.href = video.veoVideoUrl;
      link.download = `${safeSlug}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    if (isExporting || !isReady) return;
    setExportNotice('');

    const probeCanvas = document.createElement('canvas') as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };

    if (typeof MediaRecorder === 'undefined' || typeof probeCanvas.captureStream !== 'function') {
      setExportNotice(
        'Video file (.webm) recording is not supported in this browser (e.g. older browsers or Safari). You can still play and switch scenes right here!'
      );
      return;
    }

    setIsExporting(true);
    setExportPct(0);

    const exportCanvas = document.createElement('canvas') as HTMLCanvasElement & {
      captureStream: (fps?: number) => MediaStream;
    };
    exportCanvas.width = canvasW;
    exportCanvas.height = canvasH;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      setIsExporting(false);
      return;
    }

    const canvasStream = exportCanvas.captureStream(30);
    let audioCtx: AudioContext | null = null;
    let stopPad: (() => void) | null = null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const dest = audioCtx.createMediaStreamDestination();
        stopPad = createAmbientPadNodes(audioCtx, video.mood, dest);
        dest.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
      }
    } catch {
      // Proceed video-only if audio stream creation isn't available
    }

    const canCheck = typeof MediaRecorder.isTypeSupported === 'function';
    const preferredMime =
      canCheck && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : canCheck && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : canCheck && MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';

    const chunks: Blob[] = [];
    const recorder = preferredMime
      ? new MediaRecorder(canvasStream, { mimeType: preferredMime, videoBitsPerSecond: 2_800_000 })
      : new MediaRecorder(canvasStream, { videoBitsPerSecond: 2_800_000 });

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const recordedPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
    });

    recorder.start(250);

    const exportDuration = totalDurationMs;
    const startTime = performance.now();

    await new Promise<void>((resolve) => {
      const renderStep = (now: number) => {
        const elapsed = now - startTime;
        drawFrameAt(exportCtx, Math.min(elapsed, exportDuration - 1));
        setExportPct(Math.min(99, Math.round((elapsed / exportDuration) * 100)));
        if (elapsed < exportDuration) {
          requestAnimationFrame(renderStep);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(renderStep);
    });

    recorder.stop();
    const webmBlob = await recordedPromise;

    stopPad?.();
    audioCtx?.close().catch(() => {});

    const url = URL.createObjectURL(webmBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeSlug}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setExportPct(100);
    setIsExporting(false);
  };

  const viewportClass =
    video.aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[520px] max-w-[300px] mx-auto w-full'
      : video.aspectRatio === '1:1'
        ? 'aspect-square max-h-[480px] max-w-[480px] mx-auto w-full'
        : 'aspect-video w-full';

  return (
    <div className="mt-3 rounded-xl border border-[#1f293d] bg-[#090b10] overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-[#1f293d] bg-[#0f1420]">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-[#00d4ff] shrink-0" />
          <span className="text-[13px] font-semibold text-white truncate">{video.title}</span>
          <span className="text-[11px] text-[#64748b] shrink-0">
            {hasVeoMp4 ? 'Veo 2 HD' : `${video.style} · ${video.aspectRatio || '16:9'}`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleDownloadVideo()}
          disabled={!isReady || isExporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-[#050608] text-[11.5px] font-bold hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="tabular-nums">Rendering ({exportPct}%)</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download Video</span>
            </>
          )}
        </button>
      </div>

      {/* Video Player Viewport */}
      <div className="bg-[#050608] p-2 flex items-center justify-center">
        <div className={`relative bg-[#050608] overflow-hidden rounded-lg flex items-center justify-center ${viewportClass}`}>
          {hasVeoMp4 ? (
            <video
              src={video.veoVideoUrl}
              controls
              playsInline
              autoPlay
              loop
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <>
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className="w-full h-full object-contain block"
              />

              {!isReady && (
                <div className="absolute inset-0 bg-[#07090e]/95 flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <div className="w-11 h-11 rounded-full border-2 border-[#ffd700]/30 border-t-[#00d4ff] animate-spin" />
                  <div>
                    <p className="text-[13.5px] font-semibold text-white">
                      Synthesizing Multi-Scene AI Video...
                    </p>
                    <p className="text-[12px] text-[#94a3b8] mt-1 tabular-nums">
                      Rendering HD frame {Math.min(video.scenes.length, loadedCount + 1)} of{' '}
                      {video.scenes.length}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Player Controls + Scene Selector */}
      <div className="px-3.5 py-2.5 bg-[#0f1420] border-t border-[#1f293d] space-y-2.5">
        {!hasVeoMp4 && (
          <>
            <div className="w-full h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#ffd700] to-[#00d4ff] transition-[width] duration-75"
                style={{ width: `${timelinePct}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isReady}
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182032] border border-[#334155] text-[12px] font-semibold text-white hover:border-[#00d4ff] disabled:opacity-45 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-[#ffd700]" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#00d4ff] fill-current" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!isReady}
                  onClick={handleToggleMuteAudio}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182032] border border-[#334155] text-[12px] font-medium text-slate-200 hover:border-[#ffd700] disabled:opacity-45 cursor-pointer"
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-[#94a3b8]" />
                      <span>Play Narration &amp; Audio</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-[#ffd700]" />
                      <span>Mute Audio</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {video.scenes.map((scene, idx) => (
                  <button
                    key={scene.caption + idx}
                    type="button"
                    disabled={!isReady}
                    onClick={() => handleJumpScene(idx)}
                    title={scene.caption}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                      activeSceneIdx === idx
                        ? 'bg-[#00d4ff]/15 border-[#00d4ff] text-[#00d4ff]'
                        : 'bg-[#121622] border-[#1f293d] text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    S{idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {video.narration && (
          <p dir="auto" className="text-[12px] text-[#94a3b8] leading-relaxed">
            {video.narration}
          </p>
        )}

        {exportNotice && (
          <p className="text-[11.5px] text-amber-300 leading-relaxed">{exportNotice}</p>
        )}
      </div>
    </div>
  );
}
