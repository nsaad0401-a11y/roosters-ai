import { Building2, CheckCircle2, FileText, Mail, Send, ShieldCheck, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { ROOSTERS_LOGO_SRC } from '../constants';
import { APP_THEMES, AppTheme } from '../themes';

export type LegalPageId = 'about' | 'privacy' | 'terms' | 'contact';

interface LegalPagesModalProps {
  activePage: LegalPageId | null;
  theme?: AppTheme;
  onSelectPage: (page: LegalPageId) => void;
  onClose: () => void;
}

const TABS: Array<{ id: LegalPageId; label: string }> = [
  { id: 'about', label: 'About Us' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Service' },
  { id: 'contact', label: 'Contact Us' },
];

export function LegalPagesModal({
  activePage,
  theme = APP_THEMES['gold-cyan'],
  onSelectPage,
  onClose,
}: LegalPagesModalProps) {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactError, setContactError] = useState('');
  const [contactSent, setContactSent] = useState(false);

  if (!activePage) return null;

  const handleContactSubmit = (e: FormEvent) => {
    e.preventDefault();
    setContactError('');

    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setContactError('Please fill in your name, email address, and message.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setContactError('Please enter a valid email address.');
      return;
    }

    setContactSent(true);
    setContactName('');
    setContactEmail('');
    setContactSubject('');
    setContactMessage('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.borderColor,
          color: theme.textPrimary,
        }}
      >
        {/* Top Modal Header + Navigation Tabs */}
        <div
          className="px-6 pt-5 pb-4 border-b shrink-0"
          style={{
            backgroundColor: theme.headerBg,
            borderColor: theme.borderColor,
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <img
                src={ROOSTERS_LOGO_SRC}
                alt="Roosters AI"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-lg object-cover border"
                style={{ borderColor: theme.borderColor }}
              />
              <div>
                <h2 id="legal-modal-title" className="font-display text-[18px] font-bold">
                  Roosters AI · Legal &amp; Company Information
                </h2>
                <p className="text-[12px]" style={{ color: theme.textMuted }}>
                  SandSoft Digital Studio · Founded by Saad Nadeem
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close legal information modal"
              className="p-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: theme.textMuted }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Company and Legal Pages">
            {TABS.map((tab) => {
              const isActive = activePage === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setContactSent(false);
                    setContactError('');
                    onSelectPage(tab.id);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border text-[12.5px] font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: isActive ? theme.subSurfaceBg : 'transparent',
                    borderColor: isActive ? theme.accentSecondary : theme.borderColor,
                    color: isActive ? theme.accentSecondary : theme.textMuted,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-[14px] leading-relaxed">
          {activePage === 'about' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5" style={{ color: theme.accentPrimary }} />
                <h3 className="font-display text-[20px] font-bold">About SandSoft &amp; Roosters AI</h3>
              </div>

              <p style={{ color: theme.textSecondary }}>
                <strong>Roosters AI (v2.0 Pro Edition)</strong> is an intelligent, multilingual study tutor,
                coding assistant, and creative workspace crafted by <strong>SandSoft</strong>, a software
                studio founded by <strong>Saad Nadeem</strong>.
              </p>

              <div
                className="rounded-xl border p-4 space-y-2"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                }}
              >
                <h4 className="font-semibold text-[15px]" style={{ color: theme.accentPrimary }}>
                  Our Mission
                </h4>
                <p style={{ color: theme.textSecondary }}>
                  Our mission is to make respectful, patient, step-by-step education and modern software
                  engineering accessible to students, lifelong learners, and developers everywhere—across
                  Urdu, English, Arabic, Hindi, Punjabi, Pashto, and major world languages—without paywalls
                  or complicated setup.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className="rounded-xl border p-4"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                  }}
                >
                  <div className="text-[12px] uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>
                    Founder &amp; Lead Architect
                  </div>
                  <div className="mt-1 text-[16px] font-bold" style={{ color: theme.accentSecondary }}>
                    Saad Nadeem
                  </div>
                  <p className="mt-1 text-[12.5px]" style={{ color: theme.textMuted }}>
                    Creator of SandSoft &amp; Roosters AI Study Tutor Suite
                  </p>
                </div>

                <div
                  className="rounded-xl border p-4"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: theme.borderColor,
                  }}
                >
                  <div className="text-[12px] uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>
                    Core Capabilities
                  </div>
                  <p className="mt-1 text-[12.5px]" style={{ color: theme.textSecondary }}>
                    Real-time streaming AI chat (Gemini &amp; Groq), Live Voice Talk, Text Reader, Study Note
                    &amp; Code File Analysis, Screen Share Vision, and AI Artwork Generation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePage === 'privacy' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5" style={{ color: theme.accentSecondary }} />
                <h3 className="font-display text-[20px] font-bold">Privacy Policy</h3>
              </div>
              <p className="text-[12.5px]" style={{ color: theme.textMuted }}>
                Effective Date: November 19, 2026 · Operated by SandSoft (Roosters AI)
              </p>

              <div className="space-y-3" style={{ color: theme.textSecondary }}>
                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    1. Information Stored Locally on Your Device
                  </h4>
                  <p>
                    Roosters AI stores your user profile preferences, saved conversation history, selected theme
                    and wallpaper settings, and any optional custom API key exclusively in your web browser&apos;s{' '}
                    <code>localStorage</code>. SandSoft does not sell, rent, or harvest your personal chat logs
                    or API keys to third-party data brokers. You may delete individual chats or clear browser
                    storage at any time.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    2. Third-Party AI Processing (Google Gemini, Groq &amp; Pollinations AI)
                  </h4>
                  <p>
                    When you submit prompts, study files, voice transcripts, or image generation requests, the
                    text or media payload is transmitted securely over HTTPS to your selected AI provider
                    (Google Gemini API, Groq API, or Pollinations AI) solely to generate your requested
                    response. Please avoid submitting sensitive personal identification, banking credentials, or
                    confidential passwords in chat prompts.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    3. Advertising Partners, Cookies &amp; Web Beacons
                  </h4>
                  <p>
                    To keep Roosters AI free for students and creators, we may display non-intrusive
                    advertisements served by third-party advertising networks including{' '}
                    <strong>Google AdSense</strong>, <strong>Adsterra</strong>, and <strong>Monetag</strong>.
                    These third-party vendors may use cookies, JavaScript, or web beacons to measure ad
                    effectiveness and serve relevant ads based on prior visits to this or other websites.
                  </p>
                  <p className="mt-2">
                    Users may opt out of personalized advertising by visiting Google&apos;s{' '}
                    <a
                      href="https://adssettings.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: theme.accentSecondary }}
                    >
                      Ads Settings
                    </a>{' '}
                    or{' '}
                    <a
                      href="https://www.aboutads.info/choices/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: theme.accentSecondary }}
                    >
                      aboutads.info
                    </a>
                    . You may also disable cookies directly through your individual browser settings.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    4. Microphone, Screen Share &amp; File Permissions
                  </h4>
                  <p>
                    Microphone access (for Live Talk and Voice Input) and Screen Sharing permissions are
                    strictly opt-in and only activate when explicitly triggered by the user. Audio and captured
                    frames are never recorded silently in the background.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    5. Children&apos;s Privacy &amp; Contact
                  </h4>
                  <p>
                    Roosters AI is an educational study tool suitable for general audiences. For any privacy
                    inquiries, data removal requests, or compliance questions, please contact SandSoft founder{' '}
                    <strong>Saad Nadeem</strong> at <strong>nsaad0401@gmail.com</strong>.
                  </p>
                </section>
              </div>
            </div>
          )}

          {activePage === 'terms' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5" style={{ color: theme.accentPrimary }} />
                <h3 className="font-display text-[20px] font-bold">Terms of Service</h3>
              </div>
              <p className="text-[12.5px]" style={{ color: theme.textMuted }}>
                Last Updated: November 19, 2026 · SandSoft / Roosters AI
              </p>

              <div className="space-y-3" style={{ color: theme.textSecondary }}>
                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    1. Acceptance of Terms
                  </h4>
                  <p>
                    By accessing or using Roosters AI (&quot;the Service&quot;), operated by SandSoft, you agree
                    to be bound by these Terms of Service and all applicable laws and regulations.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    2. Acceptable Educational &amp; Creative Use
                  </h4>
                  <p>
                    Roosters AI is designed for learning, tutoring, software development, translation, and
                    creative artwork generation. Users agree not to use the Service to generate unlawful,
                    harmful, abusive, or deceptive content, attempt automated scraping, or bypass rate limits.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    3. API Keys &amp; Third-Party Services
                  </h4>
                  <p>
                    When supplying your own Google Gemini or Groq API key in the API Key Settings modal, you
                    are responsible for complying with the respective provider&apos;s usage policies and quota
                    limits. Keys entered are stored solely in your local browser storage.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    4. Accuracy Disclaimer &amp; Limitation of Liability
                  </h4>
                  <p>
                    AI responses are provided &quot;as is&quot; for educational and productivity assistance.
                    While Roosters AI strives for high accuracy, users should independently verify critical
                    academic, medical, legal, financial, or production code outputs. SandSoft shall not be
                    liable for any indirect or consequential damages arising from use of the Service.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-[15px] mb-1" style={{ color: theme.textPrimary }}>
                    5. Intellectual Property
                  </h4>
                  <p>
                    The Roosters AI brand, logo, UI design, and original application code are the property of
                    SandSoft (founded by Saad Nadeem).
                  </p>
                </section>
              </div>
            </div>
          )}

          {activePage === 'contact' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5" style={{ color: theme.accentSecondary }} />
                <h3 className="font-display text-[20px] font-bold">Contact SandSoft</h3>
              </div>

              <div
                className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
                style={{
                  backgroundColor: theme.subSurfaceBg,
                  borderColor: theme.borderColor,
                }}
              >
                <div>
                  <div className="text-[11.5px] uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>
                    Company &amp; Founder
                  </div>
                  <div className="text-[14px] font-bold mt-0.5">SandSoft · Saad Nadeem</div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: theme.textMuted }}>
                    Roosters AI Education &amp; Productivity Suite
                  </div>
                </div>
                <div>
                  <div className="text-[11.5px] uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>
                    Official Support Email
                  </div>
                  <a
                    href="mailto:nsaad0401@gmail.com"
                    className="inline-block text-[14px] font-bold mt-0.5 underline"
                    style={{ color: theme.accentSecondary }}
                  >
                    nsaad0401@gmail.com
                  </a>
                  <div className="text-[12px] mt-0.5" style={{ color: theme.textMuted }}>
                    Typical response time: within 24–48 hours
                  </div>
                </div>
              </div>

              {contactSent ? (
                <div
                  className="rounded-xl border p-5 text-center space-y-2"
                  style={{
                    backgroundColor: theme.subSurfaceBg,
                    borderColor: '#10b981',
                  }}
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="font-bold text-[15px]">Thank you for reaching out!</h4>
                  <p className="text-[13px]" style={{ color: theme.textSecondary }}>
                    Your message for Saad Nadeem / SandSoft has been recorded. For urgent inquiries, you can
                    also email <strong>nsaad0401@gmail.com</strong> directly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setContactSent(false)}
                    className="mt-2 px-4 py-2 rounded-lg border text-[12.5px] font-semibold cursor-pointer"
                    style={{
                      backgroundColor: theme.cardBg,
                      borderColor: theme.borderColor,
                      color: theme.textPrimary,
                    }}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full name"
                        className="w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] focus:outline-none"
                        style={{
                          backgroundColor: theme.inputBg,
                          borderColor: theme.borderColor,
                          color: theme.textPrimary,
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] focus:outline-none"
                        style={{
                          backgroundColor: theme.inputBg,
                          borderColor: theme.borderColor,
                          color: theme.textPrimary,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
                      Subject (Optional)
                    </label>
                    <input
                      type="text"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      placeholder="Feedback, Support, Partnership, or Ad Inquiry"
                      className="w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] focus:outline-none"
                      style={{
                        backgroundColor: theme.inputBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
                      Message
                    </label>
                    <textarea
                      rows={3}
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="How can SandSoft help you?"
                      className="w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] focus:outline-none resize-none"
                      style={{
                        backgroundColor: theme.inputBg,
                        borderColor: theme.borderColor,
                        color: theme.textPrimary,
                      }}
                    />
                  </div>

                  {contactError && <p className="text-[12.5px] text-[#ff4d4d] font-medium">{contactError}</p>}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[13px] cursor-pointer hover:brightness-110"
                      style={{
                        backgroundImage: theme.sendButtonGradient,
                        color: theme.sendButtonText,
                      }}
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Message</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
