import {useCallback, useEffect, useState} from 'react';

export type Route = {path: string; query: URLSearchParams};

/** Route hashes start with "/", e.g. #/board?x=1. Anything else is an in-page anchor on the home page. */
function parse(): Route {
  const raw = location.hash.replace(/^#/, '');
  if (!raw.startsWith('/')) return {path: '/', query: new URLSearchParams()};
  const [p, q = ''] = raw.split('?');
  return {path: p.replace(/\/+$/, '') || '/', query: new URLSearchParams(q)};
}

function anchorId(): string | null {
  const raw = location.hash.replace(/^#/, '');
  return raw && !raw.startsWith('/') ? raw : null;
}

/** Hash routing: no server config, works from file:// and any static host. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => {
      const id = anchorId();
      setRoute(parse());
      if (id) {
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'}));
      } else {
        window.scrollTo({top: 0});
      }
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((to: string) => {
    location.hash = to.startsWith('#') ? to : `#${to}`;
  }, []);
  return {...route, navigate};
}

export const href = (path: string, query?: Record<string, string>) => {
  const q = query ? new URLSearchParams(query).toString() : '';
  return `#${path}${q ? `?${q}` : ''}`;
};
