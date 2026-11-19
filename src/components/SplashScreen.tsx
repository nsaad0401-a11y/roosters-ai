import { useEffect, useState } from 'react';
import { ROOSTERS_LOGO_SRC } from '../constants';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setFadingOut(true);
    }, 980);

    const doneTimer = window.setTimeout(() => {
      onComplete();
    }, 1200);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    if (fadingOut) return;
    setFadingOut(true);
    window.setTimeout(() => {
      onComplete();
    }, 180);
  };

  return (
    <div
      onClick={handleSkip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleSkip();
        }
      }}
      aria-label="Roosters AI Splash Screen. Click to continue."
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07090e] cursor-pointer select-none transition-opacity duration-300 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Subtle dark blue radial glow in center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 46%, rgba(0, 136, 255, 0.16) 0%, rgba(14, 34, 68, 0.22) 30%, rgba(7, 9, 14, 0) 64%)',
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* Centerpiece rounded square dark card (#111622) with subtle neon cyan outer glow */}
        <div
          className="relative flex items-center justify-center w-[180px] h-[180px] rounded-[24px] bg-[#111622] border border-[#00d4ff]/35 overflow-hidden p-1.5"
          style={{
            boxShadow:
              '0 0 38px rgba(0, 212, 255, 0.28), 0 0 14px rgba(0, 212, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          <img
            src={ROOSTERS_LOGO_SRC}
            alt="Roosters AI Logo"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center rounded-[18px]"
          />
        </div>

        {/* Below logo card: Bold uppercase title "ROOSTERS AI" in glowing gold (#ffd700) with wide letter spacing */}
        <h1
          className="mt-7 font-display text-[26px] sm:text-[28px] font-extrabold uppercase tracking-[0.28em] text-[#ffd700] text-center"
          style={{
            textShadow: '0 0 22px rgba(255, 215, 0, 0.45)',
          }}
        >
          ROOSTERS AI
        </h1>

        {/* Thin horizontal loading bar with gold-to-cyan gradient fill */}
        <div className="mt-5 w-52 h-[3px] rounded-full bg-[#151c2c] overflow-hidden">
          <div
            className="h-full w-full rounded-full animate-splash-bar"
            style={{
              background: 'linear-gradient(90deg, #ffd700 0%, #00d4ff 100%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
