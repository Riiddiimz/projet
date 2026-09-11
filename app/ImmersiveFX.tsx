'use client';

import { useEffect, useState } from 'react';

export default function ImmersiveFX() {
  const [coords, setCoords] = useState({ x: 50, y: 50 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    let raf = 0;
    let target = { x: 50, y: 50 };
    let current = { x: 50, y: 50 };
    const move = (event: MouseEvent) => {
      target = { x: (event.clientX / window.innerWidth) * 100, y: (event.clientY / window.innerHeight) * 100 };
      setActive(true);
    };
    const leave = () => setActive(false);
    const animate = () => {
      current.x += (target.x - current.x) * 0.075;
      current.y += (target.y - current.y) * 0.075;
      setCoords({ x: current.x, y: current.y });
      raf = requestAnimationFrame(animate);
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseleave', leave);
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseleave', leave);
    };
  }, []);

  return (
    <>
      <div className="cursor-aura" aria-hidden="true" style={{ left: `${coords.x}%`, top: `${coords.y}%`, opacity: active ? 1 : 0 }} />
      <div className="immersive-grid" aria-hidden="true" />
      <div className="immersive-vignette" aria-hidden="true" />
    </>
  );
}
