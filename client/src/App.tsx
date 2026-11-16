import { ConnectionBanner, PageShell, Toasts } from './components/ui';
import { GameProvider } from './context/GameContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { matchPath, usePath } from './lib/router';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { HomePage } from './pages/HomePage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { JoinRoomPage } from './pages/JoinRoomPage';
import { RoomPage } from './pages/RoomPage';
import { SettingsPage } from './pages/SettingsPage';

function Routes() {
  const path = usePath();
  const { t } = useSettings();
  let m: Record<string, string> | null;

  if (path === '/' || path === '') return <HomePage />;
  if (path === '/create') return <CreateRoomPage />;
  if (path === '/join') return <JoinRoomPage />;
  if ((m = matchPath('/join/:code', path))) return <JoinRoomPage key={m.code} inviteCode={m.code} />;
  if ((m = matchPath('/room/:code', path))) return <RoomPage key={m.code} code={m.code} />;
  if (path === '/how-to-play') return <HowToPlayPage />;
  if (path === '/settings') return <SettingsPage />;
  return (
    <PageShell title={t('notfound.title')}>
      <p className="text-center text-6xl">🃏❓</p>
    </PageShell>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <GameProvider>
        <Routes />
        <Toasts />
        <ConnectionBanner />
      </GameProvider>
    </SettingsProvider>
  );
}
