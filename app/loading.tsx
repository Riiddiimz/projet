export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#050509] text-white">
      <div className="text-center">
        <div className="relative mx-auto mb-7 grid h-20 w-20 place-items-center rounded-[1.7rem] border border-fuchsia-300/20 bg-white/[.04] shadow-[0_0_80px_rgba(232,121,249,.2)]">
          <div className="absolute inset-[-10px] rounded-[2rem] border border-fuchsia-300/10 animate-ping" />
          <span className="text-3xl font-black text-fuchsia-300">C</span>
        </div>
        <div className="text-xl font-black tracking-[.22em]">COL&apos;IN<span className="text-fuchsia-300">CALL</span></div>
        <p className="mt-2 text-xs uppercase tracking-[.35em] text-white/30">Connexion à l&apos;expérience</p>
      </div>
    </main>
  );
}
