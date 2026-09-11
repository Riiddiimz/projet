'use client';

import { Activity, Radio, Users } from 'lucide-react';

export default function LiveTicker() {
  return (
    <div className="live-ticker" aria-hidden="true">
      <span className="live-ticker-pulse" />
      <span>LIVE NETWORK</span>
      <i />
      <Activity size={12} />
      <span className="live-ticker-strong">REALTIME</span>
      <i />
      <Users size={12} />
      <span>COMMUNITY ONLINE</span>
      <i />
      <Radio size={12} />
      <span className="live-ticker-strong">AUDIO + VIDEO</span>
    </div>
  );
}
