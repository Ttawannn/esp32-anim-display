import { getLang, LANGS, setLang } from '../i18n';

// EN / ไทย toggle. The whole page re-renders on change (main.tsx).
export function LangSwitch() {
  const lang = getLang();
  return (
    <div class="lang-switch" role="radiogroup" aria-label="Language / ภาษา">
      {LANGS.map((l) => (
        <button key={l.id} role="radio" aria-checked={lang === l.id} class={lang === l.id ? 'active' : ''} onClick={() => setLang(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
