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
import {
  clearActiveUser,
  loadActiveUser,
  loadThemeSettings,
  purgeGuestChatStorage,
  saveActiveUser,
} from './utils/storage';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);

  useEffect(() => {
    const initial = loadThemeSettings();
    document.documentElement.classList.toggle('lite-mode', Boolean(initial.liteMode));
    void purgeGuestChatStorage();
  }, []);

  const handleSplashComplete = useCallback(() => {
    const savedSession = loadActiveUser();
    if (savedSession && !savedSession.isGuest) {
      setActiveUser(savedSession);
      setScreen('app');
      return;
    }
    setActiveUser({
      id: 'guest_user',
      fullName: 'Guest User',
      email: 'guest@sandsoft.local',
      isGuest: true,
    });
    setScreen('app');
  }, []);

  const handleLoginSuccess = useCallback((user: ActiveUser) => {
    if (user.isGuest) {
      clearActiveUser();
      void purgeGuestChatStorage();
    } else {
      saveActiveUser(user);
    }
    setActiveUser(user);
    setScreen('app');
  }, []);

  const handleLogout = useCallback(() => {
    clearActiveUser();
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
      {screen === 'auth' && <OfflineIndicator />}
    </>
  );
}
