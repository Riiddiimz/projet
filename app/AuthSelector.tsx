'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Shield, UserRound } from 'lucide-react';

const WS = 'wss://projet-nz7b.onrender.com';

type Mode = 'choice' | 'user' | 'admin';

export default function AuthSelector() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('choice');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setVisible(!localStorage.getItem('colincall_session') && !!document.getElementById('userUsernameInput'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!mounted || !visible) return null;

  const login = () => {
    const name = username.trim();
    if (!name) {
      setError(mode === 'admin' ? "Entrez le nom d'administrateur." : "Entrez un nom d'utilisateur.");
      return;
    }
    if (mode === 'admin' && !password) {
      setError('Entrez le code administrateur.');
      return;
    }

    setLoading(true);
    setError('');
    const socket = new WebSocket(WS);
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      setLoading(false);
      try { socket.close(); } catch {}
      setError(message || 'Connexion impossible.');
    };

    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'login-success' && message.sessionToken) {
          settled = true;
          localStorage.setItem('colincall_session', message.sessionToken);
          try { socket.close(); } catch {}
          window.location.reload();
          return;
        }
        if (message.type === 'login-error' || message.type === 'auth-error') {
          fail(message.message || 'Identifiants incorrects.');
        }
      } catch {
        fail('Réponse serveur invalide.');
      }
    };
    socket.onerror = () => fail('Impossible de contacter le serveur.');
    socket.onclose = () => {
      if (!settled && loading) setLoading(false);
    };
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'login',
        username: name,
        password: mode === 'admin' ? password : '',
        isAdmin: mode === 'admin'
      }));
    };
  };

  const choose = (next: Mode) => {
    setMode(next);
    setError('');
    setUsername('');
    setPassword('');
  };

  const back = () => {
    setMode('choice');
    setError('');
    setUsername('');
    setPassword('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-zinc-950 px-5 text-zinc-50">
      <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[120px]" />
      <div className="absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[.045] p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-400 font-black text-xl text-zinc-950">C</div>
          <b className="text-2xl">COL&apos;IN<span className="text-fuchsia-400">CALL</span></b>
          <p className="mt-2 text-sm text-zinc-500">Parle. Rencontre. Passe un bon moment.</p>
        </div>

        {mode === 'choice' && (
          <div className="space-y-3">
            <button id="authUserMode" type="button" onClick={() => choose('user')} className="flex w-full items-center gap-4 rounded-2xl bg-fuchsia-400 px-5 py-4 text-left font-black text-zinc-950 transition hover:brightness-110">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/10"><UserRound size={21} /></span>
              <span className="flex-1"><span className="block">Utilisateur</span><span className="block text-xs font-medium opacity-65">Accéder aux salons et conversations</span></span>
              <ArrowRight size={19} />
            </button>
            <button id="authAdminMode" type="button" onClick={() => choose('admin')} className="flex w-full items-center gap-4 rounded-2xl border border-fuchsia-400/20 bg-white/5 px-5 py-4 text-left font-black transition hover:border-fuchsia-400/40 hover:bg-white/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-400/10"><Shield size={21} className="text-fuchsia-300" /></span>
              <span className="flex-1"><span className="block">Administrateur</span><span className="block text-xs font-medium text-zinc-500">Accès à la gestion de Col&apos;inCall</span></span>
              <ArrowRight size={19} />
            </button>
          </div>
        )}

        {mode !== 'choice' && (
          <div className="space-y-3">
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-fuchsia-400/15 bg-fuchsia-400/[.045] p-3">
              {mode === 'admin' ? <Shield size={20} className="text-fuchsia-300" /> : <UserRound size={20} className="text-fuchsia-300" />}
              <div><b>{mode === 'admin' ? 'Administrateur' : 'Utilisateur'}</b><div className="text-xs text-zinc-500">{mode === 'admin' ? 'Connexion sécurisée administrateur' : 'Connexion à Col&apos;inCall'}</div></div>
            </div>
            <input id="authUsername" autoFocus value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && (mode === 'admin' ? document.getElementById('authPassword')?.focus() : login())} placeholder={mode === 'admin' ? "Nom d'administrateur" : "Nom d'utilisateur"} autoComplete="username" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition focus:border-fuchsia-400/60" />
            {mode === 'admin' && <input id="authPassword" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Code administrateur" autoComplete="current-password" className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition focus:border-fuchsia-400/60" />}
            {mode === 'user' && <p className="px-1 text-xs text-zinc-500">Le code est facultatif pour une connexion utilisateur.</p>}
            {mode === 'admin' && <p className="px-1 text-xs text-zinc-500">Le nom et le code administrateur sont à saisir manuellement.</p>}
            {error && <div role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
            <button id="authLoginButton" type="button" onClick={login} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-400 py-3.5 font-black text-zinc-950 disabled:cursor-wait disabled:opacity-60">
              {loading ? 'Connexion…' : mode === 'admin' ? 'Se connecter en administrateur' : 'Se connecter'}
              {!loading && <ArrowRight size={18} />}
            </button>
            <button id="authBackButton" type="button" onClick={back} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-50"><ArrowLeft size={17} /> Retour</button>
          </div>
        )}
      </section>
    </div>
  );
}
