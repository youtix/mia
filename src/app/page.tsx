import { FadeIn } from '@/app/_components/FadeIn';
import { DIFFICULTY_TIERS, type DifficultyTier } from '@/types/mia';
import { Footprints, GraduationCap, Mountain, Sprout, Target, type LucideIcon } from 'lucide-react';

const TIER_ICONS: Record<DifficultyTier, LucideIcon> = {
  very_easy: Sprout,
  easy: Footprints,
  medium: Target,
  hard: Mountain,
  very_hard: GraduationCap,
};

const tiers = Object.values(DIFFICULTY_TIERS).sort((a, b) => a.order - b.order);

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-10 px-6 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-6xl font-bold tracking-tight text-sky-400 md:text-7xl">Mia</h1>
        <p className="text-lg text-slate-300 md:text-xl">
          Entraînement cérébral pour Mobile, Tablette &amp; TV
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 id="tiers-title" className="text-center text-xl font-semibold text-slate-100">
          Les 5 paliers cognitifs
        </h2>
        <FadeIn delay={0.1}>
          <ol aria-labelledby="tiers-title" className="flex flex-col gap-3">
            {tiers.map((tier) => {
              const Icon = TIER_ICONS[tier.id];
              return (
                <li
                  key={tier.id}
                  className={`flex items-center gap-4 rounded-2xl border px-5 py-4 ${tier.badgeBgClass}`}
                >
                  <Icon aria-hidden className={`size-8 shrink-0 ${tier.colorClass}`} />
                  <div className="flex flex-col">
                    <span className={`text-lg font-semibold ${tier.colorClass}`}>
                      {tier.order}. {tier.label}
                    </span>
                    <span className="text-sm text-slate-300">{tier.subtitle}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </FadeIn>
      </section>
    </main>
  );
}
