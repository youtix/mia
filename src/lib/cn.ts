import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Tailles de police fluides déclarées dans le bloc `@theme` de `src/app/globals.css`. */
export const FLUID_TEXT_SIZES = [
  'fluid-xs',
  'fluid-sm',
  'fluid-base',
  'fluid-lg',
  'fluid-xl',
  'fluid-2xl',
  'fluid-3xl',
] as const;

// Sans cette déclaration, tailwind-merge prend `text-fluid-lg` pour une couleur de texte
// et supprime la couleur `text-*` qui la précède (ou l'inverse).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...FLUID_TEXT_SIZES],
    },
  },
});

/** Combine des classes conditionnelles (clsx) puis résout les conflits Tailwind (tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
