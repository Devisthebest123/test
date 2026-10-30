import {useState} from 'react';
import {brand, nav, social} from '../content';
import {NETWORK_LABEL} from '../lib/board';
import {encodeAddress} from '../lib/protocol';
import {useApp} from '../state/AppContext';


/**
 * Three zones. Left: who we are. Middle: the places to go. Right: who you
 * are right now (network, identity) and the one thing you came to do.
 */
export function Header({current}: {current: string}) {
  const [open, setOpen] = useState(false);
  const {network, identity, inboxUnread} = useApp();
  const home = current === '/';
  const links = home ? [{label: 'How it works', href: '#how'}, ...nav] : [{label: 'Home', href: '#/'}, ...nav];
  const me = identity ? encodeAddress(identity.public) : null;

  return (
    <header className="relative z-20 flex items-center justify-between gap-4 px-[clamp(20px,2.6vw,40px)] pt-[clamp(20px,3.8vh,40px)]">
      <a href="#/" className="flex shrink-0 items-center gap-3" aria-label={`${brand} home`}>
        <img src="/brand/whisper-cat-400.png" alt="" className="h-8 w-8" />
        <span className="pixel-light text-[11px] tracking-[0.08em]">{brand}</span>
      </a>

      <nav aria-label="Main" className="hidden items-center gap-[clamp(18px,2.2vw,34px)] text-ui md:flex">
        {links.map((l) => {
          const active = current === l.href.slice(1);
          const badge = l.href === '#/inbox' && inboxUnread > 0;
          return (
            <a key={l.href} href={l.href} className={`lnk ${active ? 'underline' : ''}`} aria-current={active ? 'page' : undefined}>
              {l.label}
              {badge && <span className="ml-1.5 inline-block bg-ink px-1 text-[10px] leading-[14px] text-page">{inboxUnread}</span>}
            </a>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <a href={social.x} target="_blank" rel="noreferrer" aria-label="X" title="X" className="hidden text-ink hover:opacity-70 sm:block">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <a href={social.github} target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub" className="hidden text-ink hover:opacity-70 sm:block">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
            <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.19 7.69 10.68.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.5-3.79-1.5-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.64 0c2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.64 5.27-5.15 5.55.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54A11.26 11.26 0 0 0 23.25 11.75C23.25 5.48 18.27.5 12 .5z" />
          </svg>
        </a>
        <a
          href="#/me"
          className={`hidden items-center gap-2 border hairline px-2.5 py-1.5 text-fine sm:flex ${current === '/me' ? 'bg-ink text-page' : ''}`}
          title="Network and identity"
        >
          <span className={`inline-block h-[6px] w-[6px] ${identity ? 'bg-current' : 'border border-current'}`} />
          <span className="pixel-light text-[10px] tracking-[0.06em]">{NETWORK_LABEL[network]}</span>
          <span className="text-current/60">{me ? `${me.slice(0, 4)}…${me.slice(-4)}` : 'no identity'}</span>
        </a>
        <a href="#/drop" className={`btn btn-sm hidden sm:inline-flex ${current === '/drop' ? 'btn-ghost' : ''}`}>
          New drop
        </a>
        <button
          type="button"
          className="text-ui md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open && (
        <ul id="mobile-nav" className="absolute inset-x-[20px] top-full mt-3 flex flex-col gap-4 bg-ink p-5 text-ui text-page md:hidden">
          {[{label: 'New drop', href: '#/drop'}, ...links, {label: `Identity · ${NETWORK_LABEL[network]}`, href: '#/me'}, {label: 'X', href: social.x}, {label: 'GitHub', href: social.github}].map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
