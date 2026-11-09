export type Route =
  | { name: 'home' }
  | { name: 'unit'; unitId: string }
  | { name: 'task'; unitId: string; taskId: string }
  | { name: 'notfound' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'unit' && parts.length === 2) return { name: 'unit', unitId: parts[1] };
  if (parts[0] === 'unit' && parts.length === 4 && parts[2] === 'task') return { name: 'task', unitId: parts[1], taskId: parts[3] };
  return { name: 'notfound' };
}

export const nav = $state({ route: parseRoute(typeof location === 'undefined' ? '' : location.hash) });

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    nav.route = parseRoute(location.hash);
    window.scrollTo(0, 0);
  });
}

export const hrefHome = () => '#/';
export const hrefUnit = (u: string) => `#/unit/${encodeURIComponent(u)}`;
export const hrefTask = (u: string, t: string) => `#/unit/${encodeURIComponent(u)}/task/${encodeURIComponent(t)}`;
