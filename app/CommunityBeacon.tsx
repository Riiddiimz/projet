'use client';

import { Globe2, Sparkles } from 'lucide-react';

export default function CommunityBeacon() {
  return (
    <div className="community-beacon" aria-hidden="true">
      <div className="community-beacon-ring community-beacon-ring-a"/><div className="community-beacon-ring community-beacon-ring-b"/>
      <div className="community-beacon-core"><Globe2 size={14}/></div><div className="community-beacon-label"><Sparkles size={11}/> SOCIAL SPACE</div>
      <style jsx global>{`.community-beacon{position:fixed;right:24px;bottom:84px;width:92px;height:92px;z-index:60;pointer-events:none;opacity:.7}.community-beacon-ring{position:absolute;inset:12px;border:1px solid rgba(232,121,249,.16);border-radius:50%;animation:cb-spin 9s linear infinite}.community-beacon-ring-b{inset:2px;border-color:rgba(99,102,241,.11);animation-duration:14s;animation-direction:reverse}.community-beacon-core{position:absolute;inset:31px;border-radius:50%;display:grid;place-items:center;color:#f0abfc;background:radial-gradient(circle,rgba(232,121,249,.18),rgba(10,10,18,.72));border:1px solid rgba(255,255,255,.1);box-shadow:0 0 30px rgba(232,121,249,.12)}.community-beacon-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;display:flex;align-items:center;gap:4px;color:rgba(255,255,255,.22);font:700 7px/1 ui-monospace,monospace;letter-spacing:.12em;white-space:nowrap}@keyframes cb-spin{to{transform:rotate(360deg)}}@media(max-width:640px){.community-beacon{display:none}}@media(prefers-reduced-motion:reduce){.community-beacon-ring{animation:none}}`}</style>
    </div>
  );
}
