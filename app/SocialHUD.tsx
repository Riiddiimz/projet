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
    </div>
  );
}
