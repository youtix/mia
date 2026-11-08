import { cn } from '@/lib/cn';
import { formatGarlandLabel } from '../labels';
import { PEARL_LIT } from './art-tokens';

export interface GarlandProps {
  /** Une perle par apparition prévue */
  total: number;
  /** Perles allumées : les apparitions réussies, y compris après une remise */
  cleared: number;
  className?: string;
}

/**
 * Guirlande de progression, sans chiffre (FEAT-28 §3.3) : une perle par apparition prévue, qui
 * s'allume quand une apparition est réussie. L'enfant voit la fin approcher, ce qui aide à tenir
 * l'attention. Une perle allumée est un disque doré plein, une perle éteinte un simple contour : l'état
 * se lit aussi sans la couleur.
 */
export function Garland({ total, cleared, className }: GarlandProps) {
  return (
    <div
      role="img"
      aria-label={formatGarlandLabel(cleared, total)}
      className={cn(
        'flex min-h-5 shrink-0 flex-wrap items-center justify-center gap-[clamp(0.2rem,1vmin,0.5rem)]',
        className,
      )}
    >
      {Array.from({ length: total }, (_, index) => {
        const isLit = index < cleared;
        return (
          // Clé liée à l'état : la perle gonfle d'un coup quand elle s'allume.
          <span
            key={`${String(index)}-${isLit ? 'lit' : 'dark'}`}
            data-pearl={isLit ? 'lit' : 'dark'}
            className={cn(
              'size-[clamp(0.6rem,2.3vmin,1.15rem)] shrink-0 rounded-full border-2',
              isLit ? 'border-amber-600' : 'border-slate-500 bg-transparent',
            )}
            style={
              isLit
                ? { backgroundColor: PEARL_LIT, animation: 'gng-pearl .4s ease-out both' }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
