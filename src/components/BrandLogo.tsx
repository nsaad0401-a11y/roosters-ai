import { useId } from 'react';

interface BrandLogoProps {
  className?: string;
  variant?: 'emblem' | 'badge';
  ariaLabel?: string;
}

/**
 * Built-in crisp HD inline SVG emblem for SandSoft / Roosters AI.
 * Features a glowing golden sand pile with "SAND" written on it and "SOFT" underneath.
 * Zero external image dependencies so it always renders instantly in any offline or static environment.
 */
export function BrandLogo({
  className = 'w-10 h-10',
  variant = 'emblem',
  ariaLabel = 'Roosters AI by SandSoft Logo',
}: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `ss-bg-${uid}`;
  const sandGradId = `ss-sand-${uid}`;
  const sandHighlightId = `ss-sand-hi-${uid}`;
  const softGradId = `ss-soft-${uid}`;
  const glowId = `ss-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <defs>
        <linearGradient id={bgId} x1="12" y1="8" x2="108" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0e1628" />
          <stop offset="55%" stopColor="#090d16" />
          <stop offset="100%" stopColor="#121a2d" />
        </linearGradient>

        <linearGradient id={sandGradId} x1="60" y1="26" x2="60" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="32%" stopColor="#ffd700" />
          <stop offset="72%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>

        <linearGradient id={sandHighlightId} x1="25" y1="32" x2="95" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#fde68a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={softGradId} x1="24" y1="86" x2="96" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="50%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#ffd700" />
        </linearGradient>

        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Rounded Emblem Base */}
      <rect x="2" y="2" width="116" height="116" rx="26" fill={`url(#${bgId})`} />
      <rect
        x="3.5"
        y="3.5"
        width="113"
        height="113"
        rx="24.5"
        stroke={`url(#${softGradId})`}
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />

      {/* Ambient radial gold & cyan aura behind the sand pile */}
      <ellipse cx="60" cy="58" rx="44" ry="26" fill="#ffd700" fillOpacity="0.14" />
      <ellipse cx="60" cy="40" rx="28" ry="14" fill="#00d4ff" fillOpacity="0.09" />

      {/* Crisp Golden Sparkle Stars */}
      {variant === 'emblem' && (
        <g fill="#fde047" opacity="0.85">
          <circle cx="24" cy="28" r="1.4" />
          <circle cx="95" cy="26" r="1.6" />
          <circle cx="84" cy="19" r="1.1" fill="#00d4ff" />
          <path d="M36 18 L37.3 21.2 L40.5 22.5 L37.3 23.8 L36 27 L34.7 23.8 L31.5 22.5 L34.7 21.2 Z" />
        </g>
      )}

      {/* Glowing Golden Sand Pile (Main Mound + Secondary Slope) */}
      <g filter={`url(#${glowId})`}>
        <path
          d="M14 78 C24 72 34 52 47 41 C54 35 64 34 72 41 C84 51 95 70 106 78 C91 81 30 81 14 78 Z"
          fill={`url(#${sandGradId})`}
        />
        {/* Sculpted Dune Ridge Highlight */}
        <path
          d="M22 76 C33 66 44 45 58 37 C63 36 69 40 74 47 C64 46 53 56 44 77 Z"
          fill={`url(#${sandHighlightId})`}
        />
        {/* Golden Sand Grains Base Line */}
        <ellipse cx="60" cy="79.5" rx="45" ry="2.6" fill="#f59e0b" fillOpacity="0.45" />
      </g>

      {/* Bold "SAND" Engraved Typography on the Glowing Golden Sand Pile */}
      <text
        x="60"
        y="69"
        textAnchor="middle"
        fill="#1e1204"
        fillOpacity="0.88"
        fontSize="19"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        letterSpacing="2.2"
      >
        SAND
      </text>
      <text
        x="60"
        y="68"
        textAnchor="middle"
        fill="#fff8dc"
        fillOpacity="0.92"
        fontSize="19"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        letterSpacing="2.2"
      >
        SAND
      </text>

      {/* "SOFT" Underneath in Crisp Neon-Cyan to Gold Gradient */}
      <text
        x="60"
        y="100"
        textAnchor="middle"
        fill={`url(#${softGradId})`}
        fontSize="18.5"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        letterSpacing="4.5"
      >
        SOFT
      </text>

      {/* Fine Underline Accent */}
      <rect x="33" y="106" width="54" height="2" rx="1" fill={`url(#${softGradId})`} opacity="0.7" />
    </svg>
  );
}
