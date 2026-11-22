import { Camera, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppTheme } from '../themes';
import { MessageAttachment } from '../types';

interface CameraCaptureModalProps {
  isOpen: boolean;
  theme: AppTheme;
  onCapture: (attachment: MessageAttachment) => void;
  onFallbackUpload?: () => void;
  onClose: () => void;
}

export function CameraCaptureModal({
  isOpen,
  theme,
  onCapture,
  onFallbackUpload,
  onClose,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(
    async (preferredFacing: 'environment' | 'user') => {
      stopCameraStream();
      setErrorMsg('');
      setIsStarting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsStarting(false);
        setErrorMsg('Webcam capture is not supported in this browser. You can upload an image instead.');
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: preferredFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Please allow camera permission in your browser settings.'
            : 'No webcam detected or camera is busy in another app.';
        setErrorMsg(message);
      } finally {
        setIsStarting(false);
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setErrorMsg('');
      return;
    }
    void startCameraStream(facingMode);
    return () => {
      stopCameraStream();
    };
  }, [isOpen, facingMode, startCameraStream, stopCameraStream]);

  if (!isOpen) return null;

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setErrorMsg('Camera feed is still warming up. Please wait a moment and try again.');
      return;
    }

    const maxWidth = 1024;
    let targetW = video.videoWidth;
    let targetH = video.videoHeight;
    if (targetW > maxWidth) {
      targetH = Math.max(1, Math.round((targetH * maxWidth) / targetW));
      targetW = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMsg('Unable to process camera snapshot on this device.');
      return;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(video, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl).trim();
    if (!base64) {
      setErrorMsg('Captured image was empty. Please try again.');
      return;
    }

    const attachment: MessageAttachment = {
      kind: 'image',
      name: `camera-photo-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      base64,
      dataUrl,
      source: 'camera',
    };

    stopCameraStream();
    onCapture(attachment);
    onClose();
  };

  const handleCancel = () => {
    stopCameraStream();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Capture Photo with Camera"
    >
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: theme.borderColor }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: theme.subSurfaceBg,
                borderColor: `${theme.accentSecondary}44`,
              }}
            >
              <Camera className="w-4 h-4" style={{ color: theme.accentSecondary }} />
            </div>
            <div>
              <h2 className="text-[15.5px] font-bold leading-tight">Take a Photo</h2>
              <p className="text-[11.5px]" style={{ color: theme.textMuted }}>
                Capture an image to analyze directly with Roosters AI Vision
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!errorMsg && (
              <button
                type="button"
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                title="Switch Camera"
                aria-label="Switch Camera"
                className="p-1.5 rounded-lg border transition-colors cursor-pointer"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                  color: theme.textSecondary,
                }}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Close Camera"
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: theme.textMuted }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Video Preview */}
        <div className="p-4">
          <div
            className="relative w-full aspect-video rounded-xl overflow-hidden border bg-black flex items-center justify-center"
            style={{ borderColor: theme.borderColor }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />

            {isStarting && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-slate-200">
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: theme.accentSecondary }} />
                <span className="text-[12.5px] font-medium">Starting camera preview...</span>
              </div>
            )}

            {errorMsg && !isStarting && (
              <div className="absolute inset-0 bg-slate-950/95 p-5 flex flex-col items-center justify-center text-center gap-3">
                <Camera className="w-9 h-9 text-amber-400 opacity-85" />
                <p className="text-[13px] text-slate-200 max-w-sm leading-relaxed">{errorMsg}</p>
                {onFallbackUpload && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCancel();
                      onFallbackUpload();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 text-[12.5px] font-semibold hover:bg-slate-800 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose Photo from Device</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Controls */}
        <div
          className="px-5 py-3.5 border-t flex items-center justify-end gap-2.5"
          style={{ borderColor: theme.borderColor }}
        >
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
            style={{
              backgroundColor: theme.subSurfaceBg,
              borderColor: theme.borderColor,
              color: theme.textSecondary,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCapturePhoto}
            disabled={isStarting || Boolean(errorMsg)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-bold transition-all hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            style={{
              backgroundImage: theme.sendButtonGradient,
              color: theme.sendButtonText,
              boxShadow: !isStarting && !errorMsg ? theme.sendButtonGlow : 'none',
            }}
          >
            <Camera className="w-4 h-4" />
            <span>Capture Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
