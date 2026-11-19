import { AppTheme, APP_THEMES } from '../themes';
import { LegalPageId } from './LegalPagesModal';

interface LegalFooterProps {
  theme?: AppTheme;
  compact?: boolean;
  onOpenPage: (page: LegalPageId) => void;
}

export function LegalFooter({
  theme = APP_THEMES['gold-cyan'],
  compact = false,
  onOpenPage,
}: LegalFooterProps) {
  return (
    <footer
      className={`w-full flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11.5px] ${
        compact ? 'py-2 px-3' : 'py-3 px-4'
      }`}
      style={{ color: theme.textMuted }}
    >
      <span className="font-medium">© 2026 SandSoft · Roosters AI</span>
      <span aria-hidden="true">·</span>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="Legal and Company Links">
        <button
          type="button"
          onClick={() => onOpenPage('about')}
          className="hover:underline cursor-pointer transition-colors"
          style={{ color: theme.textSecondary }}
        >
          About Us
        </button>
        <button
          type="button"
          onClick={() => onOpenPage('privacy')}
          className="hover:underline cursor-pointer transition-colors"
          style={{ color: theme.textSecondary }}
        >
          Privacy Policy
        </button>
        <button
          type="button"
          onClick={() => onOpenPage('terms')}
          className="hover:underline cursor-pointer transition-colors"
          style={{ color: theme.textSecondary }}
        >
          Terms of Service
        </button>
        <button
          type="button"
          onClick={() => onOpenPage('contact')}
          className="hover:underline cursor-pointer transition-colors"
          style={{ color: theme.textSecondary }}
        >
          Contact Us
        </button>
      </nav>
    </footer>
  );
}
