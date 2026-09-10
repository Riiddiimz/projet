import { ArrowRight, MessageCircle, Mic2, Users, Video } from "lucide-react";

const features = [
  { icon: Users, label: "Rencontre des personnes" },
  { icon: Video, label: "Vidéo en direct" },
  { icon: Mic2, label: "Audio instantané" },
  { icon: MessageCircle, label: "Discute en salon" },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <div className="text-lg font-black tracking-[-0.04em]">COL&apos;IN<span className="text-fuchsia-400">CALL</span></div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-400">
            Nouvelle interface
          </div>
        </header>

        <section className="flex flex-1 items-center py-16 lg:py-24">
          <div className="grid w-full gap-14 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
            <div>
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-fuchsia-300">
                Social • vidéo • conversation
              </p>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
                Parle.
                <br />
                Rencontre.
                <br />
                <span className="text-fuchsia-400">Passe un bon moment.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-zinc-400">
                Col&apos;inCall prépare une nouvelle expérience de salons vidéo et de conversations en ligne.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <button className="inline-flex items-center gap-2 rounded-full bg-fuchsia-400 px-6 py-3.5 font-bold text-zinc-950 transition hover:scale-[1.02] hover:bg-fuchsia-300">
                  Entrer dans Col&apos;inCall <ArrowRight size={18} />
                </button>
                <button className="rounded-full border border-white/10 bg-white/5 px-6 py-3.5 font-semibold text-zinc-200 transition hover:bg-white/10">
                  Découvrir
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-10 rounded-full bg-fuchsia-500/15 blur-3xl" />
              <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-xl">
                <div className="grid aspect-[4/5] grid-cols-2 gap-3 rounded-[1.5rem] bg-zinc-900 p-3 sm:aspect-square">
                  {["A", "M", "S", "+"].map((item, index) => (
                    <div
                      key={item}
                      className={`flex items-end rounded-2xl border border-white/10 p-4 ${index === 3 ? "items-center justify-center bg-fuchsia-400 text-4xl font-black text-zinc-950" : "bg-gradient-to-br from-zinc-700 to-zinc-900"}`}
                    >
                      {index === 3 ? item : <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold">Participant {item}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-2 pb-1 pt-4">
                  <span className="text-sm font-semibold">Salon Chill</span>
                  <span className="text-xs text-emerald-400">● 8 en ligne</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-sm text-zinc-400">
              <Icon size={17} className="text-fuchsia-400" />
              {label}
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
