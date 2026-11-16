import { useEffect, useState, type FormEvent } from 'react';
import { ProfileForm } from '../components/ProfileForm';
import { PageShell } from '../components/ui';
import { useGame } from '../context/GameContext';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/router';
import { storage } from '../lib/storage';

export function JoinRoomPage({ inviteCode }: { inviteCode?: string }) {
  const { t } = useSettings();
  const { joinRoom, connected, errorText, restoreError } = useGame();
  const [profile, setProfile] = useState(storage.getProfile);
  const [code, setCode] = useState((inviteCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidInvite = inviteCode !== undefined && !/^[A-Za-z0-9]{6}$/.test(inviteCode);

  // Opening an invite link for a room you are already in → go straight back to your seat.
  useEffect(() => {
    if (inviteCode && !invalidInvite && storage.getSession(inviteCode)) navigate(`/room/${inviteCode.toUpperCase()}`, { replace: true });
  }, [inviteCode, invalidInvite]);

  useEffect(() => {
    if (invalidInvite) setError(t('error.INVALID_INVITE'));
    else if (restoreError && restoreError.message && restoreError.code !== 'SESSION_INVALID') setError(errorText(restoreError));
  }, [invalidInvite, restoreError, errorText, t]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!profile.nickname.trim()) return setError(t('error.INVALID_NICKNAME'));
    if (code.length !== 6) return setError(t('error.INVALID_INVITE'));
    setBusy(true);
    setError(null);
    storage.setProfile(profile);
    const res = await joinRoom(code, profile);
    setBusy(false);
    if (res.ok) navigate(`/room/${res.data.roomCode}`, { replace: true });
    else setError(errorText(res.error));
  }

  return (
    <PageShell title={t('join.title')}>
      <form onSubmit={submit} className="panel space-y-6 p-5 anim-fade-up">
        {inviteCode && !invalidInvite && (
          <p className="rounded-xl bg-gold-400/15 px-3 py-2 text-center text-sm font-semibold text-gold-200">
            🃏 {t('join.fromInvite', { code: inviteCode.toUpperCase() })}
          </p>
        )}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gold-200">{t('join.code')}</span>
          <input
            className="input text-center font-mono text-2xl tracking-[0.4em] uppercase"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder={t('join.codePlaceholder')}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          />
        </label>
        <ProfileForm profile={profile} onChange={setProfile} />
        {error && <p className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100" role="alert">{error}</p>}
        <button className="btn btn-gold w-full text-lg" disabled={busy || !connected}>
          {busy ? <span className="spinner !h-5 !w-5" /> : t('join.submit')}
        </button>
        {!connected && <p className="text-center text-xs text-gold-200/70">{t('conn.connecting')}</p>}
      </form>
    </PageShell>
  );
}
