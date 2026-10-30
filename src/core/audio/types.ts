/** Effets sonores synthétisés (FEAT-22) : aucun fichier, aucune licence à suivre. */
export type SoundEffect = 'success' | 'bounce' | 'stop' | 'victory';

/**
 * Lecture du son des jeux. Le réglage « Son » de l'appareil (`DeviceSettings.soundEnabled`) coupe
 * tout : voix et effets. Un jeu doit donc rester jouable sans aucun son.
 */
export interface AudioService {
  /**
   * Applique le réglage « Son » ; le couper interrompt la voix en cours et libère la sortie audio. Un
   * écran de jeu qui disparaît coupe le son de la même façon : le suivant réapplique le réglage.
   */
  setEnabled: (enabled: boolean) => void;
  /**
   * Charge des clips à l'avance (chemins relatifs à la racine de l'export, sans `basePath`) ; ne fait
   * rien quand le son est coupé.
   */
  preloadClips: (paths: readonly string[]) => Promise<void>;
  /**
   * Joue des clips l'un après l'autre, en remplaçant la séquence en cours. La promesse est résolue
   * à la fin de la séquence, à son interruption, ou aussitôt quand il n'y a rien à jouer (son coupé,
   * API absente, page masquée). Avant le premier geste de l'utilisateur, le navigateur peut bloquer
   * le son : la promesse est alors résolue aussitôt et la séquence part au premier geste, si rien ne
   * l'a remplacée entre-temps. Un clip illisible, ou trop long à charger, est sauté.
   */
  playClips: (paths: readonly string[]) => Promise<void>;
  /** Interrompt la voix en cours ou en attente du premier geste */
  stopClips: () => void;
  /** Joue un effet par-dessus la voix ; sans effet si le son est coupé ou encore bloqué */
  playEffect: (effect: SoundEffect) => void;
}

/** Temps d'une suite sonore (FEAT-21) : un coup de cloche ou de tambour. */
export type SoundBeat = 'bell' | 'drum';

/** Récompense sonore (FEAT-21) : un défi réussi (`round`) ou une étoile gagnée (`star`). */
export type JingleKind = 'round' | 'star';
