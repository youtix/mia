import type { AppUpdateCheckResult, AppUpdateStatus } from '@/core/pwa';
import { DEFAULT_PROFILE_NAME } from '@/core/storage';
import { TIME_FACTORS, type GameId, type TimeFactor, type TvModeOverride } from '@/types/mia';
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
    'Voix et sons des jeux. Son coupé, les cloches et tambours de Suites Logiques s’affichent en images. Voix générée avec le modèle Piper « MLS » (corpus Multilingual LibriSpeech : Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel Synnaeve, Ronan Collobert), puis modifiée : coupée et ralentie. Licence CC BY 4.0 : https://creativecommons.org/licenses/by/4.0/',
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
    'Multiplie l’aperçu de 5 s qui montre les cartes au début de chaque étoile : « Court » le ramène à 2,5 s, « Très long » le double.',
  mismatchLabel: 'Temps d’affichage des erreurs',
  mismatchNote:
    'Multiplie le temps pendant lequel deux cartes différentes restent visibles avant de se cacher.',
} as const;

/** Début d'un prénom qui appelle « d’ » : voyelle, h muet, y devant une consonne (Yves, pas Yann). */
const ELIDING_NAME_START = /^(?:[aeiouh]|y[^aeiou])/i;

/**
 * « Réglages de Léo », « Réglages d’Alice » : en tête de la section « Jeux », le profil dont les
 * réglages sont affichés. Lettre lue sans son accent (décomposition NFD : « É » → « E » + accent).
 */
export function describeProfileSettings(name: string): string {
  const preposition = ELIDING_NAME_START.test(name.normalize('NFD')) ? 'd’' : 'de ';
  return `Réglages ${preposition}${name}`;
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
  /** Fichier en partie invalide : annoncé dans la confirmation, avant de remplacer les profils */
  partialFile:
    'Une partie de ce fichier est illisible : des profils ou des étoiles peuvent manquer.',
  restored: 'Sauvegarde restaurée.',
  restoredPartially:
    'Sauvegarde restaurée, mais une partie du fichier était illisible : des profils ou des étoiles peuvent manquer.',
} as const;

/**
 * « Téléchargement lancé : mia-sauvegarde-2026-10-29.json. … ». La page ne sait pas si le navigateur a
 * enregistré le fichier (certains le refusent en silence) : elle ne l'affirme pas, et donne l'autre voie.
 */
export function describeDownload(fileName: string): string {
  return `Téléchargement lancé : ${fileName}. Si aucun fichier n’apparaît, utilise « Copier ».`;
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
    'Revérifie les fichiers de Mia et retélécharge ceux qui sont abîmés, si l’application se comporte mal. Les profils, les étoiles et les réglages sont conservés. Une connexion est nécessaire.',
  repairAction: 'Réparer l’application',
  repairDialogTitle: 'Réparer Mia ?',
  repairDialogSubtitle:
    'Mia va revérifier ses fichiers, retélécharger ceux qui sont abîmés, puis redémarrer. Les profils, les étoiles et les réglages sont conservés.',
  repairConfirm: 'Réparer',
  repairRunning: 'Réparation en cours…',
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

/**
 * Nom affiché de chaque jeu, identique à `GAME_REGISTRY[id].title` (un test le vérifie). Le registre
 * n'est pas importé ici, pour la même raison que `GAME_SETTINGS_TEXTS.memoryTitle` : table exhaustive
 * sur `GameId`, le compilateur signale un jeu ajouté sans nom.
 */
export const GAME_TITLES: Readonly<Record<GameId, string>> = {
  memory: 'Memory',
  'traffic-jam': 'Traffic Jam',
  patterns: 'Suites Logiques',
  'bear-sort': 'Attrape-Piège',
  'logic-grid': 'Chacun sa Place',
  'go-no-go': 'Pas si vite !',
};

/** Jeux de la section « Progression », dans l'ordre du Hub (celui de `GAME_REGISTRY`, testé). */
export const GAME_RESET_ORDER: readonly GameId[] = [
  'memory',
  'traffic-jam',
  'patterns',
  'bear-sort',
  'logic-grid',
  'go-no-go',
];

/** Textes fixes de la section « Progression » : remise à zéro d'un jeu pour le profil actif. */
export const GAME_RESET_TEXTS = {
  title: 'Progression',
  groupTitle: 'Remettre un jeu à zéro',
  continueAction: 'Continuer',
  finalAction: 'Effacer définitivement',
} as const;

/** « 1 étoile », « 12 étoiles », « 0 couronne » : le singulier vaut pour 0 et 1 en français. */
function countLabel(count: number, singular: string, plural: string): string {
  return `${String(count)} ${frenchPlural.select(count) === 'one' ? singular : plural}`;
}

/** Ce qu'un jeu compte pour le profil : « Aucune étoile », « 12 étoiles · 3 couronnes ». */
export function describeGameStars(stars: number, crowns: number): string {
  if (stars === 0) return 'Aucune étoile';
  return `${countLabel(stars, 'étoile', 'étoiles')} · ${countLabel(crowns, 'couronne', 'couronnes')}`;
}

/** Explication de la section : le profil concerné, et ce qui ne bouge pas. */
export function describeGameResetNote(profileName: string): string {
  return `Choisis un jeu : ses étoiles et couronnes sont effacées pour ${profileName}. Les autres jeux, les réglages et les autres profils ne changent pas.`;
}

/** Nom accessible d'un bouton de jeu : « Remettre Memory à zéro ». */
export function describeGameResetAction(title: string): string {
  return `Remettre ${title} à zéro`;
}

/** Première confirmation : « Remettre Memory à zéro ? ». */
export function describeGameResetTitle(title: string): string {
  return `Remettre ${title} à zéro ?`;
}

/** Contenu de la première confirmation : ce qui sera effacé, et pour qui. */
export function describeGameResetSubtitle(
  title: string,
  stars: number,
  crowns: number,
  profileName: string,
): string {
  return `${countLabel(stars, 'étoile', 'étoiles')} et ${countLabel(crowns, 'couronne', 'couronnes')} de ${title} seront effacées pour ${profileName}, ainsi que ses meilleurs coups et temps. Les autres jeux et les réglages restent. Exporte d’abord ta progression si tu veux la garder.`;
}

/** Seconde confirmation, en rouge : « Remettre Memory à zéro définitivement ? ». */
export function describeGameResetFinalTitle(title: string): string {
  return `Remettre ${title} à zéro définitivement ?`;
}

/** Avertissement de la seconde confirmation : la remise à zéro ne se défait pas. */
export function describeGameResetWarning(title: string, profileName: string): string {
  return `Cette action est irréversible : les étoiles et couronnes de ${title} seront perdues pour ${profileName}.`;
}

/** Retour après une remise à zéro réussie. */
export function describeGameResetDone(title: string, profileName: string): string {
  return `${title} est remis à zéro pour ${profileName}.`;
}

/** Jeu sans étoile : rien à effacer, aucune confirmation proposée. */
export function describeGameResetNothing(title: string): string {
  return `${title} n’a encore aucune étoile : rien à remettre à zéro.`;
}
