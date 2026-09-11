'use client';

import { Activity, Radio, Sparkles } from 'lucide-react';

export default function SocialHUD() {
  return (
    <div className="social-hud" aria-hidden="true">
      <div className="social-hud-orb" />
      <div className="social-hud-shell">
        <span className="social-hud-live"><span className="social-hud-dot" />LIVE</span>
        <span className="social-hud-divider" />
        <span className="social-hud-item"><Activity size={11} /> REALTIME</span>
        <span className="social-hud-item"><Radio size={11} /> SOCIAL</span>
        <span className="social-hud-item"><Sparkles size={11} /> EXPERIENCE</span>
      </div>
      <style jsx global>{`
        .social-hud{position:fixed;left:50%;top:14px;z-index:79;transform:translateX(-50%);pointer-events:none;display:flex;align-items:center;justify-content:center}
        .social-hud-shell{position:relative;display:flex;align-items:center;gap:12px;padding:8px 13px;border:1px solid rgba(255,255,255,.085);border-radius:999px;background:linear-gradient(180deg,rgba(15,15,23,.72),rgba(6,6,12,.58));backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 12px 45px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.08),0 0 34px rgba(217,70,239,.055);overflow:hidden}
        .social-hud-shell:before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 15%,rgba(255,255,255,.08) 50%,transparent 85%);transform:translateX(-120%);animation:social-hud-sweep 6s ease-in-out infinite}
        .social-hud-live,.social-hud-item{position:relative;display:inline-flex;align-items:center;gap:5px;font:800 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;white-space:nowrap}
        .social-hud-live{color:#f0abfc}.social-hud-item{color:rgba(255,255,255,.34)}.social-hud-item svg{color:rgba(232,121,249,.58)}
        .social-hud-dot{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 12px rgba(52,211,153,.9);animation:social-hud-pulse 1.8s ease-in-out infinite}
        .social-hud-divider{width:1px;height:12px;background:rgba(255,255,255,.10)}
        .social-hud-orb{position:absolute;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(232,121,249,.14),transparent 68%);filter:blur(12px);animation:social-hud-orbit 7s ease-in-out infinite;pointer-events:none}
        @keyframes social-hud-pulse{50%{opacity:.35;transform:scale(.65)}}
        @keyframes social-hud-sweep{0%,60%{transform:translateX(-120%)}80%,100%{transform:translateX(120%)}}
        @keyframes social-hud-orbit{0%,100%{transform:translateX(-90px) scale(.8);opacity:.35}50%{transform:translateX(90px) scale(1.1);opacity:.8}}
        @media(max-width:640px){.social-hud{top:12px}.social-hud-shell{gap:8px;padding:7px 10px}.social-hud-item:nth-of-type(4){display:none}.social-hud-live,.social-hud-item{font-size:8px}.social-hud-divider{height:10px}}
        @media(prefers-reduced-motion:reduce){.social-hud-shell:before,.social-hud-dot,.social-hud-orb{animation:none}}
      `}</style>
    </div>
  );
}
