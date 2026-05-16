import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env');
}

// Routing:
//   HTTPS page → use same origin (Vite proxies /rest, /auth, /realtime, /storage)
//   HTTP page on LAN → swap loopback for current hostname so phone reaches Supabase
//   HTTP page on localhost → use env URL as-is
function resolveUrl(raw: string): string {
  if (typeof window === 'undefined') return raw;
  if (window.location.protocol === 'https:') {
    return window.location.origin;
  }
  try {
    const u = new URL(raw);
    const hostname = window.location.hostname;
    const isLoopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    const browserIsRemote = hostname && hostname !== '127.0.0.1' && hostname !== 'localhost';
    if (isLoopback && browserIsRemote) {
      u.hostname = hostname;
      return u.toString().replace(/\/$/, '');
    }
    return raw;
  } catch {
    return raw;
  }
}

export const supabase = createClient(resolveUrl(url), anon);
