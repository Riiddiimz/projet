'use client';

import { Activity, Radio, Users } from 'lucide-react';

export default function LiveTicker() {
  return (
    <div className="live-ticker" aria-hidden="true">
      <span className="live-ticker-pulse" />
      <span>LIVE NETWORK</span><i />
      <Activity size={12}/><span className="live-ticker-strong">REALTIME</span><i />
      <Users size={12}/><span>COMMUNITY ONLINE</span><i />
      <Radio size={12}/><span className="live-ticker-strong">AUDIO + VIDEO</span>
      <style jsx global>{` .live-ticker{position:fixed;left:50%;bottom:18px;z-index:78;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid rgba(255,255,255,.07);border-radius:999px;background:rgba(7,7,12,.58);backdrop-filter:blur(18px);box-shadow:0 14px 50px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.07);color:rgba(255,255,255,.3);font:700 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;white-space:nowrap}.live-ticker svg{color:rgba(232,121,249,.55)}.live-ticker i{width:2px;height:2px;border-radius:50%;background:rgba(255,255,255,.16)}.live-ticker-strong{color:rgba(240,171,252,.65)}.live-ticker-pulse{width:5px;height:5px;border-radius:50%;background:#34d399;box-shadow:0 0 12px #34d399;animation:lt-pulse 1.8s infinite}@keyframes lt-pulse{50%{opacity:.3;transform:scale(.65)}}@media(max-width:640px){.live-ticker{bottom:76px;max-width:calc(100vw - 20px);overflow:hidden}.live-ticker span:not(.live-ticker-strong):not(.live-ticker-pulse),.live-ticker i{display:none}}@media(prefers-reduced-motion:reduce){.live-ticker-pulse{animation:none}} `}</style>
    </div>
  );
}
