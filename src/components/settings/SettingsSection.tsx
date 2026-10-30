'use client';

import { cn } from '@/lib/cn';
import { useId, type ReactNode, type Ref } from 'react';

export interface SettingsSectionProps {
  ref?: Ref<HTMLElement>;
  title: string;
  /** Icône décorative du titre */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Carte d'une section de l'écran Réglages (« Appareil », « Sauvegarde ») : région nommée par son
 * titre. Fond opaque en contraste élevé (`contrast:`).
 */
export function SettingsSection({ ref, title, icon, children, className }: SettingsSectionProps) {
  const titleId = useId();

  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-5 rounded-3xl border-2 border-slate-700 bg-slate-800/60 p-5 md:p-6 contrast:bg-slate-800',
        className,
      )}
    >
      <h2 id={titleId} className="flex items-center gap-3 text-fluid-xl font-bold">
        {icon ? (
          <span aria-hidden="true" className="inline-flex shrink-0 text-sky-300">
            {icon}
          </span>
        ) : null}
        {title}
      </h2>
      {children}
    </section>
  );
}
