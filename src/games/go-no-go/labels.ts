import type { GoNoGoLevelConfig, SubjectId } from './types';

/**
 * Libellés de Pas si vite ! (FEAT-28 §8.3), réservés aux lecteurs d'écran et à `validate:levels` : le
 * jeu n'affiche aucun texte. TypeScript pur, sans React. Un jeu de vitesse visuel reste peu adapté à
 * TalkBack : aucune annonce par apparition, elle arriverait après la fenêtre.
 */

const SUBJECT_LABELS: Readonly<Record<SubjectId, string>> = {
  owl: 'La chouette',
  fox: 'Le renard',
  cat: 'Le chat gris',
  pigeon: 'Un pigeon',
  plane: 'Un avion',
  helicopter: 'Un hélicoptère',
  butterfly: 'Un papillon',
  bee: 'Une abeille',
  rocket: 'Une fusée',
  cow: 'Une vache',
  pig: 'Un cochon',
  dog: 'Un chien',
  fish: 'Un poisson',
  snail: 'Un escargot',
  turtle: 'Une tortue',
  car: 'Une voiture',
  train: 'Un train',
  boat: 'Un bateau',
  chair: 'Une chaise',
  house: 'Une maison',
  tree: 'Un arbre',
};

/** Nom d'un personnage ou d'une image, avec son article (« Une vache »). */
export function getSubjectLabel(subject: SubjectId): string {
  return SUBJECT_LABELS[subject];
}

/** Règle de l'étoile en quelques mots (résumé de `validate:levels`, titre de la scène). */
export function getRuleTitle({ rule, hasLure, traps }: GoNoGoLevelConfig): string {
  switch (rule) {
    case 'owl-says':
      return 'La chouette a dit';
    case 'flies':
      return hasLure ? 'Ça vole ? et le leurre de la chouette' : 'Ça vole ?';
    case 'late-stop':
      return traps > 0 ? 'Ça vole ? et STOP tardif' : 'STOP tardif';
  }
}

/** Consigne de l'étoile, annoncée aux lecteurs d'écran au début de la partie et à chaque reprise. */
export function getRuleSentence({ rule, hasLure, traps }: GoNoGoLevelConfig): string {
  switch (rule) {
    case 'owl-says':
      return 'Tape quand c’est la chouette.';
    case 'flies':
      return hasLure
        ? 'Tape seulement si ça vole, même quand la chouette bat des ailes.'
        : 'Tape seulement si ça vole.';
    case 'late-stop':
      return traps > 0
        ? 'Tape seulement si ça vole, sauf si le panneau STOP arrive.'
        : 'Tape, sauf si le panneau STOP arrive.';
  }
}

/** Le buzzer, seul bouton du jeu (nom lu par TalkBack). */
export const BUZZER_LABEL = 'Taper';

/** Annonces du jeu pour les lecteurs d'écran (`role="status"`). */
export const ANNOUNCEMENTS = {
  /** Défilement en pause (inaction, page masquée) : un appui le relance */
  paused: 'Pause. Tape sur le buzzer pour continuer.',
  /** Introduction de la première étoile d'une règle : démo, puis essais */
  demo: 'La chouette montre comment faire.',
  /** Quatre essais guidés : rien n'y est compté */
  trials: 'Quelques essais pour s’entraîner : rien n’est compté.',
  /** Fin des essais : l'étoile commence */
  starting: 'C’est parti !',
} as const;

/** Nom accessible de la guirlande de progression, sans chiffre affiché. */
export function formatGarlandLabel(cleared: number, appearances: number): string {
  return `${String(cleared)} sur ${String(appearances)} réussies`;
}

/** Nom accessible de la mascotte quand on peut la toucher pour réécouter la règle (pendant une pause). */
export const MASCOT_LABEL = 'Réécouter la règle';
