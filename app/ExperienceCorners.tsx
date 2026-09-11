'use client';

import { Command, Zap } from 'lucide-react';

export default function ExperienceCorners() {
  return (
    <>
      <div className="experience-corner experience-corner-left"><Zap size={11}/> <span>COL&apos;INCALL</span><b>01</b></div>
      <div className="experience-corner experience-corner-right"><Command size={11}/> <span>CONNECTED WORLD</span><b>∞</b></div>
    </>
  );
}
