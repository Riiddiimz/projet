'use client';

import { Command, Zap } from 'lucide-react';

export default function ExperienceCorners() {
  return (<>
    <div className="experience-corner experience-corner-left"><Zap size={11}/> <span>COL&apos;INCALL</span><b>01</b></div>
    <div className="experience-corner experience-corner-right"><Command size={11}/> <span>CONNECTED WORLD</span><b>∞</b></div>
    <style jsx global>{`.experience-corner{position:fixed;top:18px;z-index:80;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.2);font:700 8px/1 ui-monospace,monospace;letter-spacing:.18em;pointer-events:none}.experience-corner svg{color:rgba(232,121,249,.65)}.experience-corner b{color:rgba(52,211,153,.48);font-weight:800}.experience-corner-left{left:18px}.experience-corner-right{right:18px}@media(max-width:640px){.experience-corner{top:56px;font-size:7px}.experience-corner-right{display:none}}`}</style>
  </>);
}
