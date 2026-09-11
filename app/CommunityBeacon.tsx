'use client';

import { Globe2, Sparkles } from 'lucide-react';

export default function CommunityBeacon() {
  return (
    <div className="community-beacon" aria-hidden="true">
      <div className="community-beacon-ring community-beacon-ring-a" />
      <div className="community-beacon-ring community-beacon-ring-b" />
      <div className="community-beacon-core"><Globe2 size={14} /></div>
      <div className="community-beacon-label"><Sparkles size={11} /> SOCIAL SPACE</div>
    </div>
  );
}
