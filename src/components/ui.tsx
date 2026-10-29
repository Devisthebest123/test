import {useEffect, useState, type ReactNode} from 'react';

/** Pixel label with a rule running out to the right. Section openers. */
export function Rule({label, right}: {label: string; right?: ReactNode}) {
  return (
    <div className="flex items-center gap-4">
      <span className="pixel-light text-[11px] tracking-[0.08em] text-ink">{label}</span>
      <span className="h-px flex-1 bg-ink" />
      {right && <span className="text-fine text-ink-60">{right}</span>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-2 flex items-baseline justify-between text-ui">
        <span>{label}</span>
        {hint && <span className="text-fine text-ink-60">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Button({
  children,
  ghost,
  sm,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {ghost?: boolean; sm?: boolean}) {
  return (
    <button type="button" className={`btn ${ghost ? 'btn-ghost' : ''} ${sm ? 'btn-sm' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({href, children, ghost, className = ''}: {href: string; children: ReactNode; ghost?: boolean; className?: string}) {
  return (
    <a href={href} className={`btn ${ghost ? 'btn-ghost' : ''} ${className}`}>
      {children}
    </a>
  );
}

/** Copy-to-clipboard that reports in words, not icons. */
export function Copy({text, label = 'Copy', sm = true}: {text: string; label?: string; sm?: boolean}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <Button
      ghost
      sm={sm}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          prompt('Copy this', text);
        }
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

/** Key/value rows with dotted leaders, the way a spec sheet lays out figures. */
export function Specs({rows}: {rows: [ReactNode, ReactNode][]}) {
  return (
    <dl className="text-body">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline gap-2 py-1.5">
          <dt className="shrink-0 text-ink-60">{k}</dt>
          <span className="mb-[0.35em] flex-1 border-b border-dotted border-ink-40" />
          <dd className="shrink-0 text-right break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Single-line status with a live cursor. */
export function Status({children, live}: {children: ReactNode; live?: boolean}) {
  return (
    <p className={`text-fine text-ink-60 ${live ? 'cursor' : ''}`} aria-live="polite">
      {children}
    </p>
  );
}

/** Something went wrong, said once, in a dashed box. */
export function Notice({children, kind = 'note'}: {children: ReactNode; kind?: 'note' | 'error'}) {
  return (
    <div className={`border px-4 py-3 text-body ${kind === 'error' ? 'border-dashed' : ''} hairline`}>
      <span className="pixel-light mr-3 text-[10px]">{kind === 'error' ? 'ERR' : 'NOTE'}</span>
      {children}
    </div>
  );
}

export function PageTitle({kicker, title, aside}: {kicker?: string; title: string; aside?: ReactNode}) {
  return (
    <div className="mb-[clamp(24px,4vh,44px)] flex flex-wrap items-end justify-between gap-4 border-b hairline pb-5">
      <div>
        {kicker && <p className="mb-3 text-fine text-ink-60">{kicker}</p>}
        <h1 className="pixel text-title">{title}</h1>
      </div>
      {aside && <div className="text-fine text-ink-60">{aside}</div>}
    </div>
  );
}

export const utc = (unix: number | null, withDate = false) => {
  if (unix == null) return '--:--:--';
  const d = new Date(unix * 1000);
  const hms = d.toISOString().slice(11, 19);
  if (!withDate) return hms;
  return `${d.toISOString().slice(0, 10)} ${hms}`;
};

export const ago = (unix: number | null) => {
  if (unix == null) return 'unknown';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
