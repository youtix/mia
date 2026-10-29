import { DEFAULT_PROFILE_NAME } from '@/core/storage';
import type { TvModeOverride } from '@/types/mia';

/** Route de l'écran (`src/app/settings/page.tsx`), poussée par le bouton « Réglages » du Hub. */
export const SETTINGS_PATH = '/settings';

export interface TvModeOption {
  value: TvModeOverride;
  label: string;
}

/** Options du sélecteur « Mode TV », dans l'ordre d'affichage (`auto`, la valeur par défaut, d'abord). */
export const TV_MODE_OPTIONS: readonly TvModeOption[] = [
  { value: 'auto', label: 'Automatique' },
  { value: 'always_tv', label: 'Toujours TV' },
  { value: 'always_touch', label: 'Toujours tactile' },
];

/** Aides affichées sous les réglages de l'appareil. */
export const SETTINGS_TEXTS = {
  tvModeNote:
    'Force la mise en page TV (marges, aides de la télécommande) quand la détection automatique se trompe, par exemple avec une télécommande à pointeur.',
  soundNote: 'Aucun son pour l’instant : les futurs effets sonores respecteront ce réglage.',
  contrastNote: 'Texte plus clair, bordures et anneau de focus renforcés, fonds opaques.',
} as const;

/** Messages de la sauvegarde ; ceux d'`importBackup` (déjà en français) sont affichés tels quels. */
export const BACKUP_MESSAGES = {
  copied: 'Sauvegarde copiée dans le presse-papiers.',
  clipboardUnavailable:
    'Copie impossible : le presse-papiers n’est pas disponible sur cet appareil.',
  fileUnreadable: 'Lecture du fichier impossible.',
  pasteEmpty: 'Colle d’abord le contenu d’une sauvegarde.',
  restored: 'Sauvegarde restaurée.',
} as const;

/** « Sauvegarde téléchargée : mia-sauvegarde-2026-10-29.json ». */
export function describeDownload(fileName: string): string {
  return `Sauvegarde téléchargée : ${fileName}`;
}

/** Nom du fichier exporté, `mia-sauvegarde-AAAA-MM-JJ.json`, à la date locale du jour. */
export function getBackupFileName(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = String(date.getFullYear());
  return `mia-sauvegarde-${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

const frenchPlural = new Intl.PluralRules('fr-FR');

/** Contenu de la sauvegarde à importer, ex : « Cette sauvegarde contient 3 profils. ». */
export function describeBackupProfiles(count: number): string {
  if (count === 0) {
    return `Cette sauvegarde ne contient aucun profil : un profil « ${DEFAULT_PROFILE_NAME} » sera créé.`;
  }
  const noun = frenchPlural.select(count) === 'one' ? 'profil' : 'profils';
  return `Cette sauvegarde contient ${String(count)} ${noun}.`;
}
