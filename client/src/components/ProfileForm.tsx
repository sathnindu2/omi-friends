import { AVATAR_IDS, AVATARS } from '../../../shared/rules';
import { useSettings } from '../context/SettingsContext';
import type { Profile } from '../lib/storage';

export function ProfileForm({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const { t } = useSettings();
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-gold-200">{t('profile.nickname')}</span>
        <input
          className="input"
          value={profile.nickname}
          maxLength={16}
          autoComplete="nickname"
          enterKeyHint="next"
          placeholder={t('profile.nicknamePlaceholder')}
          onChange={(e) => onChange({ ...profile, nickname: e.target.value })}
        />
      </label>
      <div>
        <span className="mb-2 block text-sm font-semibold text-gold-200">{t('profile.avatar')}</span>
        <div className="grid grid-cols-6 gap-2">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ ...profile, avatar: id })}
              aria-label={id}
              aria-pressed={profile.avatar === id}
              className={`aspect-square rounded-2xl text-2xl sm:text-3xl transition ${
                profile.avatar === id
                  ? 'bg-gold-400/25 ring-2 ring-gold-300 scale-105'
                  : 'bg-black/25 ring-1 ring-white/10 hover:bg-white/10'
              }`}
            >
              {AVATARS[id]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
