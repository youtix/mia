/** Avatars des profils familiaux (FEAT-06). */
export type AvatarId = 'fox' | 'owl' | 'robot' | 'rocket' | 'cat' | 'crown' | 'star' | 'brain';

export interface AvatarMeta {
  id: AvatarId;
  /** Nom vocalisé et affiché dans le choix de l'avatar */
  label: string;
  /** Fond clair du cercle : l'icône `slate-950` y reste très contrastée (WCAG AA) */
  bgClass: string;
}

/**
 * Données seules : les icônes sont associées dans `src/components/profile/avatar-icons.tsx`,
 * comme `DIFFICULTY_TIERS` et ses icônes. Table exhaustive : chaque `AvatarId` est décrit.
 */
const AVATAR_CATALOG: Readonly<Record<AvatarId, Omit<AvatarMeta, 'id'>>> = {
  fox: { label: 'Renard rusé', bgClass: 'bg-orange-400' },
  owl: { label: 'Chouette sage', bgClass: 'bg-violet-400' },
  robot: { label: 'Robot logique', bgClass: 'bg-cyan-300' },
  rocket: { label: 'Fusée spatiale', bgClass: 'bg-blue-400' },
  cat: { label: 'Chat agile', bgClass: 'bg-emerald-400' },
  crown: { label: 'Couronne royale', bgClass: 'bg-amber-300' },
  star: { label: 'Étoile filante', bgClass: 'bg-pink-400' },
  brain: { label: 'Super Cerveau', bgClass: 'bg-indigo-400' },
};

/** Les 8 avatars, dans l'ordre d'affichage du choix de l'avatar. */
export const AVATARS: readonly AvatarMeta[] = Object.entries(AVATAR_CATALOG).map(([id, meta]) => ({
  id: id as AvatarId,
  ...meta,
}));

/** Avatar du profil créé par défaut (« Joueur 1 »). */
export const DEFAULT_AVATAR_ID: AvatarId = 'fox';

/** Prénoms et rôles proposés en un clic : évitent le clavier virtuel de la TV. */
export const QUICK_PROFILE_NAMES: readonly string[] = [
  'Mia',
  'Joueur 1',
  'Joueur 2',
  'Parents',
  'Enfants',
  'Invité',
];

export function isAvatarId(value: string): value is AvatarId {
  return Object.hasOwn(AVATAR_CATALOG, value);
}

/** Avatar du catalogue, `null` si inconnu (sauvegarde d'une version plus récente, par exemple). */
export function getAvatar(avatarId: string): AvatarMeta | null {
  return AVATARS.find((avatar) => avatar.id === avatarId) ?? null;
}
