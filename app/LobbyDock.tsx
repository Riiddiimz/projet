'use client';

import { Compass, MessageCircle, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

function clickButton(match: RegExp) {
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const target = buttons.find((button) => match.test((button.textContent || '').trim()));
  target?.click();
}

export default function LobbyDock() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => {
      const loggedIn = !document.getElementById('userUsernameInput');
      const inRoom = !!document.getElementById('roomName');
      setVisible(loggedIn && !inRoom);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div className="lobby-dock" aria-label="Navigation rapide">
      <button type="button" onClick={() => clickButton(/créer un salon/i)} aria-label="Créer un salon">
        <span className="lobby-dock-icon lobby-dock-primary"><Plus size={18} /></span>
        <span>Créer</span>
      </button>
      <button type="button" onClick={() => clickButton(/utilisateurs/i)} aria-label="Utilisateurs">
        <span className="lobby-dock-icon"><Users size={17} /></span>
        <span>Communauté</span>
      </button>
      <button type="button" onClick={() => clickButton(/général/i)} aria-label="Chat général">
        <span className="lobby-dock-icon"><MessageCircle size={17} /></span>
        <span>Général</span>
      </button>
      <div className="lobby-dock-live"><span /><Compass size={12} /> LIVE</div>
      <style jsx global>{`
        .lobby-dock{position:fixed;left:50%;bottom:18px;z-index:85;display:flex;align-items:center;gap:5px;padding:7px;border:1px solid rgba(255,255,255,.10);border-radius:22px;background:linear-gradient(180deg,rgba(19,19,29,.82),rgba(7,7,13,.78));backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);box-shadow:0 24px 70px rgba(0,0,0,.42),0 0 45px rgba(217,70,239,.07),inset 0 1px 0 rgba(255,255,255,.08);transform:translateX(-50%);animation:lobby-dock-in .55s cubic-bezier(.2,.8,.2,1) both}
        .lobby-dock button{position:relative;display:flex;align-items:center;gap:7px;padding:7px 10px;border:0;border-radius:15px;background:transparent;color:rgba(255,255,255,.54);font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;white-space:nowrap}
        .lobby-dock button:hover{background:rgba(255,255,255,.07);color:#fff;transform:translateY(-1px)}
        .lobby-dock-icon{display:grid;place-items:center;width:30px;height:30px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.045);color:rgba(255,255,255,.72)}
        .lobby-dock-primary{background:linear-gradient(135deg,#f0abfc,#d946ef);color:#19051b;border-color:rgba(255,255,255,.25);box-shadow:0 8px 24px rgba(217,70,239,.25)}
        .lobby-dock-live{display:flex;align-items:center;gap:5px;margin:0 4px 0 2px;padding:0 7px;color:rgba(255,255,255,.28);font:800 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em}
        .lobby-dock-live span{width:5px;height:5px;border-radius:50%;background:#34d399;box-shadow:0 0 10px rgba(52,211,153,.8);animation:lobby-dock-pulse 1.8s ease-in-out infinite}
        @keyframes lobby-dock-in{from{opacity:0;transform:translate(-50%,18px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes lobby-dock-pulse{50%{opacity:.35;transform:scale(.65)}}
        @media(max-width:640px){.lobby-dock{left:10px;right:10px;bottom:10px;justify-content:space-around;transform:none;border-radius:20px;padding:6px}.lobby-dock button{flex:1;justify-content:center;flex-direction:column;gap:3px;padding:5px 4px;font-size:7px;letter-spacing:.04em}.lobby-dock-icon{width:30px;height:30px}.lobby-dock-live{display:none}}
        @media(prefers-reduced-motion:reduce){.lobby-dock,.lobby-dock-live span{animation:none}}
      `}</style>
    </div>
  );
}
