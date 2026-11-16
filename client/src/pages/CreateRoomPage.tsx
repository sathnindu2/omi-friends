import { useState, type FormEvent } from 'react';
import { ProfileForm } from '../components/ProfileForm';
import { PageShell, Segmented, Toggle } from '../components/ui';
import { useGame } from '../context/GameContext';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/router';
import { storage } from '../lib/storage';

export function CreateRoomPage() {
  const { t, settings } = useSettings();
  const { createRoom, connected, errorText } = useGame();
  const [profile, setProfile] = useState(storage.getProfile);
  const [target, setTarget] = useState<5 | 10>(settings.defaultTarget);
  const [announced, setAnnounced] = useState(settings.defaultAnnouncedKapothi);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!profile.nickname.trim()) return setError(t('error.INVALID_NICKNAME'));
    setBusy(true);
    setError(null);
    storage.setProfile(profile);
    const res = await createRoom(profile, { targetTokens: target, announcedKapothi: announced });
    setBusy(false);
    if (res.ok) navigate(`/room/${res.data.roomCode}`, { replace: true });
    else setError(errorText(res.error));
  }

  return (
    <PageShell title={t('create.title')}>
      <form onSubmit={submit} className="panel space-y-6 p-5 anim-fade-up">
        <ProfileForm profile={profile} onChange={setProfile} />
        <div>
          <span className="mb-2 block text-sm font-semibold text-gold-200">{t('create.target')}</span>
          <Segmented<5 | 10>
            value={target}
            onChange={setTarget}
            options={[
              { value: 10, label: `${t('create.standard')} · ${t('create.tokens', { n: 10 })}` },
              { value: 5, label: `${t('create.quick')} · ${t('create.tokens', { n: 5 })}` },
            ]}
          />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gold-200">{t('settings.kapothiVariation')}</div>
            <p className="mt-1 text-xs text-white/60">{t('settings.kapothiVariationHelp')}</p>
          </div>
          <Toggle checked={announced} onChange={setAnnounced} label={t('settings.kapothiVariation')} />
        </div>
        {error && <p className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100" role="alert">{error}</p>}
        <button className="btn btn-gold w-full text-lg" disabled={busy || !connected}>
          {busy ? <span className="spinner !h-5 !w-5" /> : t('create.submit')}
        </button>
        {!connected && <p className="text-center text-xs text-gold-200/70">{t('conn.connecting')}</p>}
      </form>
    </PageShell>
  );
}
