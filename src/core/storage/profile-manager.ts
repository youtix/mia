import type { MemoryGameSettings, MiaSaveState, UserProfile } from '@/types/mia';
import {
  AVATARS,
  DEFAULT_AVATAR_ID,
  isAvatarId,
  QUICK_PROFILE_NAMES,
  type AvatarId,
} from './avatars';
import { createDefaultGameSettings } from './default-state';

/**
 * Gestion des profils familiaux (FEAT-06) : fonctions sans effet de bord sur `state`, à appliquer
 * par `updateState` (`useMiaStorage`). Une demande invalide renvoie `state` lui-même : `updateState`
 * n'écrit alors rien.
 */

/** Profil créé automatiquement quand l'appareil n'en a aucun. */
export const DEFAULT_PROFILE_NAME = 'Joueur 1';

/** Profils au plus par appareil : la grille « Qui joue aujourd'hui ? » reste lisible sur une TV. */
export const MAX_PROFILES = 8;

/** Message affiché quand `MAX_PROFILES` est atteint. */
export const PROFILE_LIMIT_MESSAGE = `${String(MAX_PROFILES)} profils au maximum : en supprimer un pour créer un nouveau joueur.`;

/** Longueur maximale d'un prénom, en caractères (points de code, un emoji simple compte pour 1). */
export const MAX_PROFILE_NAME_LENGTH = 20;

export type ProfileNameError = 'empty' | 'too_long' | 'duplicate';

export const PROFILE_NAME_ERROR_MESSAGES: Readonly<Record<ProfileNameError, string>> = {
  empty: 'Prénom manquant : en écrire un ou choisir un prénom rapide.',
  too_long: `Prénom trop long : ${String(MAX_PROFILE_NAME_LENGTH)} caractères au maximum.`,
  duplicate: 'Ce prénom est déjà utilisé par un autre profil.',
};

/** Résultat de `checkProfileName` : prénom normalisé, ou raison du refus et message à afficher. */
export type ProfileNameCheck =
  { ok: true; name: string } | { ok: false; reason: ProfileNameError; message: string };

export interface NewProfileOptions {
  /** Identifiant imposé (tests) ; défaut : UUID v4 aléatoire, unique dans la sauvegarde */
  id?: string;
  /** Date de création (tests) ; défaut : maintenant */
  now?: Date;
}

/** Diacritiques séparés par la décomposition NFD (« é » → « e » + accent aigu combinant). */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Espaces de début et de fin retirés, espaces intérieurs (insécables compris) réduits à un seul. */
export function normalizeProfileName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Clé de comparaison des prénoms : casse et accents ignorés (« mia » = « Mía »). */
export function getProfileNameKey(name: string): string {
  return normalizeProfileName(name).normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

function nameFailure(reason: ProfileNameError): ProfileNameCheck {
  return { ok: false, reason, message: PROFILE_NAME_ERROR_MESSAGES[reason] };
}

/** Prénom d'un nouveau profil : non vide, au plus `MAX_PROFILE_NAME_LENGTH` caractères, unique. */
export function checkProfileName(profiles: readonly UserProfile[], name: string): ProfileNameCheck {
  const normalized = normalizeProfileName(name);
  if (normalized === '') return nameFailure('empty');
  if (Array.from(normalized).length > MAX_PROFILE_NAME_LENGTH) return nameFailure('too_long');
  const key = getProfileNameKey(normalized);
  if (profiles.some((profile) => getProfileNameKey(profile.name) === key)) {
    return nameFailure('duplicate');
  }
  return { ok: true, name: normalized };
}

export function canAddProfile(state: MiaSaveState): boolean {
  return state.profiles.length < MAX_PROFILES;
}

/** Prénoms rapides encore libres (un prénom déjà pris n'est plus proposé). */
export function getAvailableQuickNames(profiles: readonly UserProfile[]): string[] {
  const taken = new Set(profiles.map((profile) => getProfileNameKey(profile.name)));
  return QUICK_PROFILE_NAMES.filter((name) => !taken.has(getProfileNameKey(name)));
}

/** Avatar proposé pour un nouveau profil : le premier qu'aucun profil n'utilise encore. */
export function suggestAvatarId(profiles: readonly UserProfile[]): AvatarId {
  const used = new Set(profiles.map((profile) => profile.avatarId));
  return AVATARS.find((avatar) => !used.has(avatar.id))?.id ?? DEFAULT_AVATAR_ID;
}

/**
 * Étoiles gagnées par un profil, tous jeux confondus : niveaux réussis de la sauvegarde, sans
 * catalogue (FEAT-07). Égal au décompte du catalogue tant qu'aucun niveau publié n'en est retiré.
 */
export function countProfileStars(profile: UserProfile): number {
  let stars = 0;
  for (const progress of Object.values(profile.gamesProgress)) {
    for (const level of Object.values(progress.levels)) {
      if (level.completed) stars += 1;
    }
  }
  return stars;
}

/** Des profils existent mais aucun n'est actif : l'interface doit faire choisir le joueur. */
export function needsProfileChoice(state: MiaSaveState): boolean {
  return (
    state.profiles.length > 0 &&
    !state.profiles.some((profile) => profile.id === state.activeProfileId)
  );
}

/**
 * UUID v4 tiré de `crypto.getRandomValues` : contrairement à `crypto.randomUUID`, disponible hors
 * contexte sécurisé (PWA testée sur une TV en `http://` sur le réseau local).
 */
function randomUuid(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  // Version 4 (13e chiffre) et variante RFC 4122 (17e chiffre : 8, 9, a ou b).
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** Identifiant aléatoire absent de `profiles` (retiré une nouvelle fois en cas de collision). */
export function createProfileId(profiles: readonly UserProfile[]): string {
  const taken = new Set(profiles.map((profile) => profile.id));
  let id = randomUuid();
  while (taken.has(id)) id = randomUuid();
  return id;
}

/**
 * Ajoute un profil et le rend actif. Inchangé si le nombre maximal de profils est atteint, si
 * l'avatar est inconnu, si le prénom est refusé (`checkProfileName`) ou si l'identifiant imposé
 * est vide ou déjà pris.
 */
export function addProfile(
  state: MiaSaveState,
  name: string,
  avatarId: string,
  options: NewProfileOptions = {},
): MiaSaveState {
  if (!canAddProfile(state) || !isAvatarId(avatarId)) return state;
  const check = checkProfileName(state.profiles, name);
  if (!check.ok) return state;
  const id = options.id ?? createProfileId(state.profiles);
  if (id === '' || state.profiles.some((profile) => profile.id === id)) return state;

  const profile: UserProfile = {
    id,
    name: check.name,
    avatarId,
    createdAt: (options.now ?? new Date()).toISOString(),
    gamesProgress: {},
    gameSettings: createDefaultGameSettings(),
  };
  return { ...state, activeProfileId: id, profiles: [...state.profiles, profile] };
}

/** Sans aucun profil, crée « Joueur 1 » (renard) et le rend actif ; sinon, inchangé. */
export function ensureDefaultProfile(
  state: MiaSaveState,
  options: NewProfileOptions = {},
): MiaSaveState {
  if (state.profiles.length > 0) return state;
  return addProfile(state, DEFAULT_PROFILE_NAME, DEFAULT_AVATAR_ID, options);
}

/** Rend actif un profil existant ; inchangé s'il est introuvable ou déjà actif. */
export function setActiveProfile(state: MiaSaveState, profileId: string): MiaSaveState {
  if (state.activeProfileId === profileId) return state;
  if (!state.profiles.some((profile) => profile.id === profileId)) return state;
  return { ...state, activeProfileId: profileId };
}

/**
 * Supprime un profil et sa progression. Le profil actif supprimé laisse la place au premier profil
 * restant ; le dernier profil supprimé est remplacé par un « Joueur 1 » vide (`ensureDefaultProfile`).
 * Inchangé si le profil est introuvable.
 */
export function deleteProfile(
  state: MiaSaveState,
  profileId: string,
  options: NewProfileOptions = {},
): MiaSaveState {
  const profiles = state.profiles.filter((profile) => profile.id !== profileId);
  if (profiles.length === state.profiles.length) return state;
  const activeProfileId =
    state.activeProfileId === profileId ? (profiles[0]?.id ?? null) : state.activeProfileId;
  return ensureDefaultProfile({ ...state, activeProfileId, profiles }, options);
}

/**
 * Modifie les réglages de Memory d'un profil (FEAT-19) ; les champs absents de `partial` sont
 * conservés. Inchangé si le profil est introuvable ou si aucune valeur ne change.
 */
export function updateMemorySettings(
  state: MiaSaveState,
  profileId: string,
  partial: Partial<MemoryGameSettings>,
): MiaSaveState {
  const profile = state.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) return state;
  const current = profile.gameSettings.memory;
  const memory: MemoryGameSettings = {
    previewFactor: partial.previewFactor ?? current.previewFactor,
    mismatchFactor: partial.mismatchFactor ?? current.mismatchFactor,
  };
  if (
    memory.previewFactor === current.previewFactor &&
    memory.mismatchFactor === current.mismatchFactor
  ) {
    return state;
  }
  const updated: UserProfile = { ...profile, gameSettings: { ...profile.gameSettings, memory } };
  return {
    ...state,
    profiles: state.profiles.map((candidate) => (candidate.id === profileId ? updated : candidate)),
  };
}
