import { Check, ChevronDown, Globe, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WORLD_LANGUAGES, WorldLanguageOption } from '../constants';
import { AppTheme } from '../themes';

interface SearchableLanguageSelectProps {
  value: string;
  onChange: (languageCode: string) => void;
  theme?: AppTheme;
  includeAutoDetect?: boolean;
  compact?: boolean;
  align?: 'left' | 'right';
  dropDirection?: 'down' | 'up';
  ariaLabel?: string;
  id?: string;
}

export function SearchableLanguageSelect({
  value,
  onChange,
  theme,
  includeAutoDetect = true,
  compact = false,
  align = 'left',
  dropDirection = 'down',
  ariaLabel = 'Select Language',
  id,
}: SearchableLanguageSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const options = useMemo<WorldLanguageOption[]>(() => {
    const base = includeAutoDetect
      ? WORLD_LANGUAGES
      : WORLD_LANGUAGES.filter((l) => l.code !== 'Auto-Detect');
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.bcp47.toLowerCase().includes(q) ||
        (l.region && l.region.toLowerCase().includes(q))
    );
  }, [includeAutoDetect, query]);

  const currentOption = useMemo(
    () =>
      WORLD_LANGUAGES.find((l) => l.code === value) ??
      (includeAutoDetect ? WORLD_LANGUAGES[0] : WORLD_LANGUAGES[1]),
    [includeAutoDetect, value]
  );

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    const onOutsideClick = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setIsOpen(false);
      }
    };
    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  const bgSurface = theme?.subSurfaceBg ?? '#0f1420';
  const bgCard = theme?.cardBg ?? '#090b10';
  const borderCol = theme?.borderColor ?? '#263147';
  const textPri = theme?.textPrimary ?? '#f8fafc';
  const textMut = theme?.textMuted ?? '#94a3b8';
  const accentSec = theme?.accentSecondary ?? '#00d4ff';

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 border text-left transition-colors cursor-pointer ${
          compact ? 'rounded-lg px-2.5 py-1.5 text-[12px]' : 'rounded-xl px-3 py-2 text-[13px]'
        } font-medium`}
        style={{
          backgroundColor: bgSurface,
          borderColor: isOpen ? accentSec : borderCol,
          color: textPri,
        }}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: accentSec }} />
          <span className="truncate">
            {currentOption.label}
            {currentOption.native !== currentOption.label ? ` (${currentOption.native})` : ''}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: textMut }}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-[70] ${
            dropDirection === 'up' ? 'bottom-full mb-1.5' : 'mt-1.5'
          } w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-xl border shadow-2xl overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{
            backgroundColor: bgCard,
            borderColor: borderCol,
            color: textPri,
          }}
        >
          <div className="p-2 border-b flex items-center gap-2" style={{ borderColor: borderCol }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: accentSec }} />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 100+ world languages..."
              aria-label="Search languages"
              className="flex-1 bg-transparent text-[12.5px] focus:outline-none min-w-0"
              style={{ color: textPri }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear language search"
                className="p-0.5 rounded hover:opacity-80 cursor-pointer"
                style={{ color: textMut }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div role="listbox" className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            {options.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px]" style={{ color: textMut }}>
                No matching language found.
              </p>
            ) : (
              options.map((lang) => {
                const isSelected = lang.code === value;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(lang.code);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-[12.5px] transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isSelected ? `${accentSec}22` : 'transparent',
                      color: isSelected ? accentSec : textPri,
                    }}
                  >
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{lang.label}</span>
                      <span className="text-[11px] block truncate" style={{ color: textMut }}>
                        {lang.native}
                        {lang.region ? ` · ${lang.region}` : ''}
                      </span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: accentSec }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
