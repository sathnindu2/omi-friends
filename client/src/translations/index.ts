/**
 * Central translation system. To add a language:
 *  1. create e.g. `ta.ts` exporting `Record<TranslationKey, string>`
 *  2. add it to LANGUAGES below.
 */
import { en, type TranslationKey } from './en';
import { si } from './si';

export const LANGUAGES = {
  en: { label: 'English', dict: en },
  si: { label: 'සිංහල', dict: si },
} as const;

export type Lang = keyof typeof LANGUAGES;
export type { TranslationKey };

export function translate(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict: Record<string, string> = LANGUAGES[lang]?.dict ?? en;
  let s = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
