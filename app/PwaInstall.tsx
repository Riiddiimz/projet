'use client';

import { useEffect, useState } from 'react';

export default function PwaInstall() {
  const [event, setEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!event || installed) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        const promptEvent = event;
        setEvent(null);
        await promptEvent.prompt();
        await promptEvent.userChoice.catch(() => null);
      }}
      className="fixed bottom-3 right-4 z-[120] inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-cyan-300/25 bg-zinc-950/90 px-4 py-2 text-xs font-black leading-none text-cyan-50 shadow-[0_0_35px_rgba(124,58,237,.28)] backdrop-blur-xl sm:bottom-4 sm:right-5"
      aria-label="Installer Col'inCall"
    >
      <span className="inline-flex items-center leading-none">✦</span>
      <span className="leading-none">Installer Col'inCall</span>
    </button>
  );
}
