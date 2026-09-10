'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Wifi, Zap } from 'lucide-react';

const dots = Array.from({ length: 44 }, (_, i) => i);

export default function ExperienceLayer() {
  const [online, setOnline] = useState(true);
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
    const sync = () => setOnline(navigator.onLine);
    update();
    sync();
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <>
      <div className="experience-orbit" aria-hidden="true">
        <div className="experience-aurora aurora-one" />
        <div className="experience-aurora aurora-two" />
        <div className="experience-aurora aurora-three" />
        <div className="experience-ring ring-one" />
        <div className="experience-ring ring-two" />
        <div className="experience-ring ring-three" />
        <div className="experience-ring ring-four" />
        <div className="experience-core" />
        {dots.map((dot) => (
          <span key={dot} className="experience-particle" style={{ '--i': dot } as React.CSSProperties} />
        ))}
      </div>
      <div className="experience-scanlines" aria-hidden="true" />
      <div className="experience-status" aria-hidden="true">
        <span className={online ? 'status-dot' : 'status-dot offline'} />
        <Wifi size={13} />
        <span>{online ? 'Réseau opérationnel' : 'Hors connexion'}</span>
        {time && <span className="status-time">{time}</span>}
      </div>
      <div className="experience-badge" aria-hidden="true"><Sparkles size={14} /> Col&apos;inCall <span>LIVE</span></div>
      <div className="experience-corner" aria-hidden="true"><Zap size={12} /> SOCIAL / VIDEO</div>
    </>
  );
}
