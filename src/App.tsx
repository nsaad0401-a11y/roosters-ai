/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { MainSuperApp } from './components/MainSuperApp';
import { OfflineIndicator } from './components/PWAInstallButton';
import { SplashScreen } from './components/SplashScreen';
import { ActiveUser, AppScreen } from './types';
import { loadThemeSettings } from './utils/storage';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);

  useEffect(() => {
    const initial = loadThemeSettings();
    document.documentElement.classList.toggle('lite-mode', Boolean(initial.liteMode));
  }, []);

  const handleSplashComplete = useCallback(() => {
    setScreen('auth');
  }, []);

  const handleLoginSuccess = useCallback((user: ActiveUser) => {
    setActiveUser(user);
    setScreen('app');
  }, []);

  const handleLogout = useCallback(() => {
    setActiveUser(null);
    setScreen('auth');
  }, []);

  return (
    <>
      {screen === 'splash' ? (
        <SplashScreen onComplete={handleSplashComplete} />
      ) : screen === 'app' && activeUser ? (
        <MainSuperApp user={activeUser} onLogout={handleLogout} />
      ) : (
        <AuthScreen onLoginSuccess={handleLoginSuccess} />
      )}
      <OfflineIndicator />
    </>
  );
}
