import type { AppUpdateCheckResult, AppUpdateStatus } from '@/core/pwa';
import { DEFAULT_PROFILE_NAME } from '@/core/storage';
import { TIME_FACTORS, type TimeFactor, type TvModeOverride } from '@/types/mia';
import type { SettingsFeedbackMessage } from './SettingsGroup';

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
  soundNote:
    'Voix et sons des jeux. Son coupé, les cloches et tambours de Suites Logiques s’affichent en images. Voix de synthèse Piper « MLS » (corpus Multilingual LibriSpeech, CC BY 4.0).',
  contrastNote: 'Texte plus clair, bordures et anneau de focus renforcés, fonds opaques.',
} as const;

/** Textes de la section « Jeux » (FEAT-19) : réglages de jeu propres au profil actif. */
export const GAME_SETTINGS_TEXTS = {
  profileNote: 'Ces réglages suivent le joueur : chaque profil a les siens.',
  /**
   * Nom affiché du jeu, identique à `GAME_REGISTRY.memory.title`. Le registre n'est pas importé :
   * il embarquerait les catalogues de tous les jeux dans le JS de la route (voir `SettingsScreen`).
   */
  memoryTitle: 'Memory',
  previewLabel: 'Temps de mémorisation',
  previewNote:
    'Multiplie l’aperçu des cartes au début d’une étoile : « Très long » le double. Les étoiles sans aperçu n’en gagnent pas.',
  mismatchLabel: 'Temps d’affichage des erreurs',
  mismatchNote:
    'Multiplie le temps pendant lequel deux cartes différentes restent visibles avant de se cacher.',
} as const;

/** « Réglages de Léo » : en tête de la section « Jeux », le profil dont les réglages sont affichés. */
export function describeProfileSettings(name: string): string {
  return `Réglages de ${name}`;
}

export interface TimeFactorOption {
  value: TimeFactor;
  label: string;
}

/** Libellé de chaque facteur de temps : table exhaustive, le compilateur signale un pas oublié. */
const TIME_FACTOR_LABELS: Readonly<Record<TimeFactor, string>> = {
  0.5: 'Court',
  1: 'Normal',
  1.5: 'Long',
  2: 'Très long',
};

/**
 * Options des sélecteurs de temps de Memory (mémorisation, affichage des erreurs), dans l'ordre de
 * `TIME_FACTORS` (du plus court au plus long) : le curseur D-Pad suit cet ordre.
 */
export const TIME_FACTOR_OPTIONS: readonly TimeFactorOption[] = TIME_FACTORS.map((value) => ({
  value,
  label: TIME_FACTOR_LABELS[value],
}));

/** Facteur affiché sous le libellé de l'option, à la française : « × 0,5 », « × 1 », « × 1,5 », « × 2 ». */
export function formatTimeFactor(factor: TimeFactor): string {
  return `× ${String(factor).replace('.', ',')}`;
}

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

/** Textes de la section « Application » (FEAT-20) : mises à jour et réparation. */
export const APPLICATION_TEXTS = {
  title: 'Application',
  updateTitle: 'Mises à jour',
  updateDescription:
    'Mia cherche les nouvelles versions toute seule. Tu peux aussi lancer une recherche maintenant.',
  checkAction: 'Rechercher une mise à jour',
  applyAction: 'Mettre à jour',
  updateReady: 'Une nouvelle version est prête. Tes profils et tes étoiles sont conservés.',
  updateDownloading: 'Téléchargement de la nouvelle version…',
  checkRunning: 'Recherche en cours…',
  upToDate: 'Mia est à jour.',
  checkUnreachable: 'Recherche impossible : vérifie ta connexion.',
  downloadFailed: 'Le téléchargement a échoué. Réessaie plus tard.',
  repairTitle: 'Réparer',
  repairDescription:
    'Retélécharge tous les fichiers de Mia si l’application se comporte mal. Les profils, les étoiles et les réglages sont conservés. Une connexion est nécessaire.',
  repairAction: 'Réparer l’application',
  repairDialogTitle: 'Réparer Mia ?',
  repairDialogSubtitle:
    'Mia va retélécharger ses fichiers depuis Internet, puis redémarrer. Les profils, les étoiles et les réglages sont conservés.',
  repairConfirm: 'Réparer',
  repairUnreachable: 'Réparation impossible : pas de connexion. Réessaie une fois connecté.',
} as const;

/** « Version 0.12.0 ». */
export function describeAppVersion(version: string): string {
  return `Version ${version}`;
}

/**
 * Ligne d'état des mises à jour : ce qui se passe maintenant (version prête, téléchargement,
 * recherche) l'emporte sur l'issue de la dernière recherche. `found` alors que l'état est retombé :
 * le téléchargement a pris fin sans laisser de version prête.
 */
export function describeAppUpdate(
  status: AppUpdateStatus,
  lastCheck: AppUpdateCheckResult | null,
  isChecking: boolean,
): SettingsFeedbackMessage | null {
  if (status === 'ready') return { tone: 'success', text: APPLICATION_TEXTS.updateReady };
  if (status === 'downloading') return { tone: 'info', text: APPLICATION_TEXTS.updateDownloading };
  if (isChecking) return { tone: 'info', text: APPLICATION_TEXTS.checkRunning };
  switch (lastCheck) {
    case 'up-to-date':
      return { tone: 'success', text: APPLICATION_TEXTS.upToDate };
    case 'unreachable':
      return { tone: 'error', text: APPLICATION_TEXTS.checkUnreachable };
    case 'found':
      return { tone: 'error', text: APPLICATION_TEXTS.downloadFailed };
    case null:
      return null;
  }
}
