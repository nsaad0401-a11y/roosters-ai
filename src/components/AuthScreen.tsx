import { FormEvent, useState } from 'react';
import { Eye, EyeOff, User } from 'lucide-react';
import { ROOSTERS_LOGO_SRC } from '../constants';
import { ActiveUser, AuthTab } from '../types';
import { authenticateAccount, registerAccount } from '../utils/storage';

interface AuthScreenProps {
  onLoginSuccess: (user: ActiveUser) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleTabChange = (tab: AuthTab) => {
    setActiveTab(tab);
    setError('');
    setShowPassword(false);
  };

  const handleSignInSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    const result = authenticateAccount(trimmedEmail, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    onLoginSuccess({
      id: result.account.id,
      fullName: result.account.fullName,
      email: result.account.email,
      isGuest: false,
    });
  };

  const handleCreateAccountSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      setError('Please fill in your full name, email address, and password.');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Full Name must be at least 2 characters.');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    const result = registerAccount(trimmedName, trimmedEmail, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    onLoginSuccess({
      id: result.account.id,
      fullName: result.account.fullName,
      email: result.account.email,
      isGuest: false,
    });
  };

  const handleGuestMode = () => {
    setError('');
    onLoginSuccess({
      id: 'guest_user',
      fullName: 'Guest User',
      email: 'guest@sandsoft.local',
      isGuest: true,
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#07090e] flex items-center justify-center px-4 py-8">
      {/* Center Card */}
      <div
        className="w-full max-w-[380px] bg-[#121622] rounded-[16px] border border-[#1f293d] p-7"
        style={{
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(255, 255, 255, 0.02)',
        }}
      >
        {/* Card Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-[65px] h-[65px] rounded-[12px] overflow-hidden bg-[#111622] border border-[#1f293d] flex items-center justify-center shadow-md">
            <img
              src={ROOSTERS_LOGO_SRC}
              alt="Roosters AI Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <h1
            className="mt-3 font-display font-bold text-[22px] leading-tight bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(90deg, #ffd700 0%, #00d4ff 100%)',
            }}
          >
            Roosters AI
          </h1>

          <p className="mt-1 text-[12px] text-[#94a3b8] font-medium tracking-wide">
            By SandSoft
          </p>
        </div>

        {/* Segmented Tab Bar */}
        <div
          className="bg-[#090b10] p-[4px] rounded-[8px] my-[16px] grid grid-cols-2 gap-1"
          role="tablist"
          aria-label="Authentication Mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'signin'}
            onClick={() => handleTabChange('signin')}
            className={`py-2 px-3 rounded-[6px] text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'signin'
                ? 'bg-[#1e273b] text-[#00d4ff] font-bold'
                : 'bg-transparent text-[#94a3b8] font-medium hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create'}
            onClick={() => handleTabChange('create')}
            className={`py-2 px-3 rounded-[6px] text-[13px] transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'create'
                ? 'bg-[#1e273b] text-[#00d4ff] font-bold'
                : 'bg-transparent text-[#94a3b8] font-medium hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Forms */}
        {activeTab === 'signin' ? (
          <form onSubmit={handleSignInSubmit} noValidate className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="Email Address"
              autoComplete="email"
              aria-label="Email Address"
              className="w-full bg-[#090b10] border border-[#2a344a] rounded-[8px] p-[12px] text-[14px] text-white placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff] transition-colors"
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Password"
                autoComplete="current-password"
                aria-label="Password"
                className="w-full bg-[#090b10] border border-[#2a344a] rounded-[8px] p-[12px] pr-10 text-[14px] text-white placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-slate-300 transition-colors cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              className="w-full mt-[12px] p-[12px] rounded-[8px] font-bold text-[14px] text-[#050608] transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
              style={{
                backgroundImage: 'linear-gradient(90deg, #ffd700 0%, #00d4ff 100%)',
              }}
            >
              Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateAccountSubmit} noValidate className="flex flex-col gap-3">
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (error) setError('');
              }}
              placeholder="Full Name"
              autoComplete="name"
              aria-label="Full Name"
              className="w-full bg-[#090b10] border border-[#2a344a] rounded-[8px] p-[12px] text-[14px] text-white placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff] transition-colors"
            />

            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="Email Address"
              autoComplete="email"
              aria-label="Email Address"
              className="w-full bg-[#090b10] border border-[#2a344a] rounded-[8px] p-[12px] text-[14px] text-white placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff] transition-colors"
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Create Password"
                autoComplete="new-password"
                aria-label="Create Password"
                className="w-full bg-[#090b10] border border-[#2a344a] rounded-[8px] p-[12px] pr-10 text-[14px] text-white placeholder-[#64748b] focus:outline-none focus:border-[#00d4ff] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-slate-300 transition-colors cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              className="w-full mt-[12px] p-[12px] rounded-[8px] font-bold text-[14px] text-[#050608] transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
              style={{
                backgroundImage: 'linear-gradient(90deg, #ffd700 0%, #00d4ff 100%)',
              }}
            >
              Create Account
            </button>
          </form>
        )}

        {/* Error Message Area */}
        {error && (
          <p role="alert" className="mt-3 text-center text-[12.5px] font-medium text-[#ff4d4d] leading-snug">
            {error}
          </p>
        )}

        {/* Guest Mode Button */}
        <div className="mt-4 pt-4 border-t border-[#1f293d]">
          <button
            type="button"
            onClick={handleGuestMode}
            className="w-full bg-[#182032] border border-[#334155] rounded-[8px] p-[11px] text-[#e2e8f0] text-[14px] font-medium flex items-center justify-center gap-2.5 hover:bg-[#1e293b] hover:border-[#475569] active:scale-[0.99] transition-all cursor-pointer"
          >
            <User className="w-4 h-4 text-[#94a3b8] shrink-0" />
            <span>Continue as Guest</span>
          </button>
        </div>
      </div>
    </div>
  );
}
