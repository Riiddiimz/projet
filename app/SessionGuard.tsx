"use client";

import { useEffect, useRef } from "react";

export default function SessionGuard() {
  const initialToken = useRef<string | null>(null);

  useEffect(() => {
    initialToken.current = localStorage.getItem("colincall_session");
    if (!initialToken.current) return;

    const timer = window.setInterval(() => {
      const current = localStorage.getItem("colincall_session");
      if (initialToken.current && !current) {
        window.location.replace("/");
      }
    }, 750);

    return () => window.clearInterval(timer);
  }, []);

  return null;
}
