/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { MainSuperApp } from './components/MainSuperApp';
import { SplashScreen } from './components/SplashScreen';
import { ActiveUser, AppScreen } from './types';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);

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

  if (screen === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (screen === 'app' && activeUser) {
    return <MainSuperApp user={activeUser} onLogout={handleLogout} />;
  }

  return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
}
