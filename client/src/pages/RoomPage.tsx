import { useEffect } from 'react';
import { GameTable } from '../components/game/GameTable';
import { Lobby } from '../components/Lobby';
import { useGame } from '../context/GameContext';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/router';

export function RoomPage({ code }: { code: string }) {
  const upper = code.toUpperCase();
  const { t } = useSettings();
  const { snapshot, enterRoom, restoreError, connected } = useGame();

  useEffect(() => {
    enterRoom(upper);
  }, [upper, enterRoom]);

  useEffect(() => {
    if (restoreError && restoreError.message !== 'TIMEOUT' && !(snapshot && snapshot.room.code === upper)) {
      navigate(`/join/${upper}`, { replace: true });
    }
  }, [restoreError, snapshot, upper]);

  if (!snapshot || snapshot.room.code !== upper) {
    return (
      <div className="felt flex min-h-full flex-col items-center justify-center gap-4 safe-area">
        <div className="spinner" />
        <p className="text-gold-200">{connected ? t('conn.restoring') : t('conn.connecting')}</p>
        <button className="btn btn-ghost btn-sm mt-4" onClick={() => navigate('/')}>
          {t('common.back')}
        </button>
      </div>
    );
  }

  return snapshot.room.status === 'lobby' ? <Lobby snapshot={snapshot} /> : <GameTable snapshot={snapshot} />;
}
