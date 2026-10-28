import {
  addProfile,
  AVATARS,
  canAddProfile,
  checkProfileName,
  countProfileStars,
  createDefaultSaveState,
  createProfileId,
  DEFAULT_AVATAR_ID,
  DEFAULT_PROFILE_NAME,
  deleteProfile,
  ensureDefaultProfile,
  getAvailableQuickNames,
  getAvatar,
  getProfileNameKey,
  isAvatarId,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILES,
  needsProfileChoice,
  normalizeProfileName,
  parseSaveStateReport,
  PROFILE_LIMIT_MESSAGE,
  PROFILE_NAME_ERROR_MESSAGES,
  QUICK_PROFILE_NAMES,
  setActiveProfile,
  suggestAvatarId,
  type AvatarId,
  type NewProfileOptions,
} from '@/core/storage';
import type { LevelCompletion, MiaSaveState, UserProfile } from '@/types/mia';
import { afterEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-28T09:00:00.000Z');
const CREATED_AT = '2026-10-01T09:00:00.000Z';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function level(levelId: string, completed = true): LevelCompletion {
  return {
    levelId,
    completed,
    isPerfect: false,
    bestMoves: 12,
    bestTimeSeconds: 30,
    timesPlayed: 1,
    completedAt: CREATED_AT,
  };
}

function progress(...levels: LevelCompletion[]) {
  return {
    gameId: 'memory' as const,
    levels: Object.fromEntries(levels.map((entry) => [entry.levelId, entry])),
    lastPlayedLevelId: levels.at(-1)?.levelId ?? null,
  };
}

function profile(id: string, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id,
    name: `Profil ${id}`,
    avatarId: 'owl',
    createdAt: CREATED_AT,
    gamesProgress: {},
    ...overrides,
  };
}

/** Profil créé par `addProfile` avec les options `{ id, now: NOW }`. */
function created(id: string, name: string, avatarId: AvatarId): UserProfile {
  return { id, name, avatarId, createdAt: NOW.toISOString(), gamesProgress: {} };
}

function saveWith(
  profiles: UserProfile[],
  activeProfileId: string | null = profiles[0]?.id ?? null,
): MiaSaveState {
  return { ...createDefaultSaveState(), activeProfileId, profiles };
}

/** Gel profond : en mode strict, toute mutation de l'état reçu lèverait une `TypeError`. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Catalogue d’avatars', () => {
  it('propose les 8 avatars de la spécification, dans l’ordre, aux couleurs distinctes', () => {
    expect(AVATARS.map((avatar) => [avatar.id, avatar.label])).toEqual([
      ['fox', 'Renard rusé'],
      ['owl', 'Chouette sage'],
      ['robot', 'Robot logique'],
      ['rocket', 'Fusée spatiale'],
      ['cat', 'Chat agile'],
      ['crown', 'Couronne royale'],
      ['star', 'Étoile filante'],
      ['brain', 'Super Cerveau'],
    ]);
    expect(new Set(AVATARS.map((avatar) => avatar.bgClass)).size).toBe(AVATARS.length);
    expect(DEFAULT_AVATAR_ID).toBe('fox');
  });

  it('reconnaît les avatars du catalogue, jamais une clé héritée', () => {
    expect(isAvatarId('robot')).toBe(true);
    expect(getAvatar('robot')).toEqual({
      id: 'robot',
      label: 'Robot logique',
      bgClass: 'bg-cyan-300',
    });

    for (const unknown of ['dragon', '', 'toString', '__proto__']) {
      expect(isAvatarId(unknown)).toBe(false);
      expect(getAvatar(unknown)).toBeNull();
    }
  });

  it('propose les prénoms rapides de la spécification', () => {
    expect(QUICK_PROFILE_NAMES).toEqual([
      'Mia',
      'Joueur 1',
      'Joueur 2',
      'Parents',
      'Enfants',
      'Invité',
    ]);
  });
});

describe('Prénoms', () => {
  it('normalise les espaces, insécables compris', () => {
    expect(normalizeProfileName('  Léo  ')).toBe('Léo');
    expect(normalizeProfileName('Mamie\u00a0 \t Jo')).toBe('Mamie Jo');
    expect(normalizeProfileName(' \n ')).toBe('');
  });

  it('compare les prénoms sans tenir compte de la casse ni des accents', () => {
    expect(getProfileNameKey(' MÍA ')).toBe('mia');
    expect(getProfileNameKey('Invité')).toBe(getProfileNameKey('invite'));
    expect(getProfileNameKey('Zoé')).not.toBe(getProfileNameKey('Zoe Jo'));
  });

  it('accepte un prénom normalisé de 1 à 20 caractères, emoji compris', () => {
    expect(checkProfileName([], '  Grand-mère  Josiane ')).toEqual({
      ok: true,
      name: 'Grand-mère Josiane',
    });
    expect(MAX_PROFILE_NAME_LENGTH).toBe(20);
    // 20 emoji : 20 caractères, mais 40 unités UTF-16.
    expect(checkProfileName([], '🦊'.repeat(20))).toMatchObject({ ok: true });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['a'.repeat(21), 'too_long'],
    ['mía', 'duplicate'],
    [' MIA ', 'duplicate'],
  ] as const)('refuse « %s » (%s) avec un message prêt à afficher', (name, reason) => {
    expect(checkProfileName([profile('p1', { name: 'Mia' })], name)).toEqual({
      ok: false,
      reason,
      message: PROFILE_NAME_ERROR_MESSAGES[reason],
    });
  });
});

describe('ensureDefaultProfile', () => {
  it('crée « Joueur 1 » (renard), actif, quand l’appareil n’a aucun profil', () => {
    const state = deepFreeze(createDefaultSaveState());

    const next = ensureDefaultProfile(state, { id: 'p1', now: NOW });

    expect(DEFAULT_PROFILE_NAME).toBe('Joueur 1');
    expect(next).toEqual({
      ...state,
      activeProfileId: 'p1',
      profiles: [created('p1', 'Joueur 1', 'fox')],
    });
    expect(next.settings).toBe(state.settings);
  });

  it('tire par défaut un UUID v4 et la date du jour', () => {
    vi.useFakeTimers({ now: NOW });

    const [defaultProfile] = ensureDefaultProfile(createDefaultSaveState()).profiles;

    expect(defaultProfile?.id).toMatch(UUID_V4);
    expect(defaultProfile?.createdAt).toBe(NOW.toISOString());
  });

  it('ne touche à rien dès qu’un profil existe, même sans profil actif', () => {
    const withActive = saveWith([profile('p1')]);
    const withoutActive = saveWith([profile('p1')], null);

    expect(ensureDefaultProfile(withActive)).toBe(withActive);
    expect(ensureDefaultProfile(withoutActive)).toBe(withoutActive);
  });
});

describe('addProfile', () => {
  it('ajoute le profil, prénom normalisé, et le rend actif sans modifier l’état reçu', () => {
    const state = deepFreeze(saveWith([profile('p1', { name: 'Mia' })]));

    const next = addProfile(state, '  Léo  ', 'cat', { id: 'p2', now: NOW });

    expect(next.profiles).toEqual([state.profiles[0], created('p2', 'Léo', 'cat')]);
    expect(next.activeProfileId).toBe('p2');
    expect(next.settings).toBe(state.settings);
  });

  it('tire un identifiant aléatoire absent de la sauvegarde, même après une collision', () => {
    // 16 octets nuls : premier UUID v4 tiré, déjà pris par un profil.
    const taken = '00000000-0000-4000-8000-000000000000';
    const getRandomValues = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementationOnce((array) => array);

    const id = createProfileId([profile(taken)]);

    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(id).toMatch(UUID_V4);
    expect(id).not.toBe(taken);
  });

  it.each<[string, string, string, NewProfileOptions]>([
    ['un prénom vide', '  ', 'cat', {}],
    ['un prénom trop long', 'a'.repeat(21), 'cat', {}],
    ['un prénom déjà pris', 'MIA', 'cat', {}],
    ['un avatar inconnu', 'Léo', 'dragon', {}],
    ['un identifiant imposé vide', 'Léo', 'cat', { id: '' }],
    ['un identifiant imposé déjà pris', 'Léo', 'cat', { id: 'p1' }],
  ])('refuse %s sans rien modifier', (_case, name, avatarId, options) => {
    const state = saveWith([profile('p1', { name: 'Mia' })]);

    expect(addProfile(state, name, avatarId, options)).toBe(state);
  });

  it('plafonne l’appareil à 8 profils', () => {
    const profiles = Array.from({ length: MAX_PROFILES }, (_, index) =>
      profile(`p${String(index)}`),
    );
    const full = saveWith(profiles);
    const almostFull = saveWith(profiles.slice(1));

    expect(MAX_PROFILES).toBe(8);
    expect(canAddProfile(full)).toBe(false);
    expect(addProfile(full, 'Léo', 'cat')).toBe(full);
    expect(canAddProfile(almostFull)).toBe(true);
    expect(addProfile(almostFull, 'Léo', 'cat').profiles).toHaveLength(MAX_PROFILES);
    expect(PROFILE_LIMIT_MESSAGE).toContain('8 profils au maximum');
  });

  it('produit des profils relus sans perte au chargement (FEAT-05)', () => {
    const state = addProfile(ensureDefaultProfile(createDefaultSaveState()), 'Zoé', 'star');

    const report = parseSaveStateReport(JSON.stringify(state));

    expect(report.issues).toEqual([]);
    expect(report.state).toEqual(state);
  });
});

describe('setActiveProfile', () => {
  const state = deepFreeze(saveWith([profile('p1'), profile('p2')]));

  it('change de profil actif', () => {
    expect(setActiveProfile(state, 'p2')).toEqual({ ...state, activeProfileId: 'p2' });
  });

  it('ignore un profil introuvable ou déjà actif', () => {
    expect(setActiveProfile(state, 'inconnu')).toBe(state);
    expect(setActiveProfile(state, 'p1')).toBe(state);
  });
});

describe('deleteProfile', () => {
  const state = deepFreeze(saveWith([profile('p1'), profile('p2'), profile('p3')], 'p2'));

  it('supprime un profil inactif sans changer le profil actif', () => {
    const next = deleteProfile(state, 'p3');

    expect(next.profiles.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(next.activeProfileId).toBe('p2');
  });

  it('donne la main au premier profil restant quand le profil actif est supprimé', () => {
    const next = deleteProfile(state, 'p2');

    expect(next.profiles.map((entry) => entry.id)).toEqual(['p1', 'p3']);
    expect(next.activeProfileId).toBe('p1');
  });

  it('laisse le choix du joueur ouvert quand aucun profil n’était actif', () => {
    const next = deleteProfile({ ...state, activeProfileId: null }, 'p1');

    expect(next.activeProfileId).toBeNull();
  });

  it('remplace le dernier profil par un « Joueur 1 » vide', () => {
    const last = saveWith([profile('p1', { name: 'Mia', gamesProgress: { memory: progress() } })]);

    expect(deleteProfile(last, 'p1', { id: 'p9', now: NOW })).toEqual({
      ...last,
      activeProfileId: 'p9',
      profiles: [created('p9', 'Joueur 1', 'fox')],
    });
  });

  it('ignore un profil introuvable', () => {
    expect(deleteProfile(state, 'inconnu')).toBe(state);
  });
});

describe('Aides du sélecteur de profil', () => {
  it('compte les étoiles d’un profil, tous jeux confondus', () => {
    const player = profile('p1', {
      gamesProgress: {
        memory: progress(level('mem-001'), level('mem-002'), level('mem-003', false)),
        'traffic-jam': { ...progress(level('tj-001')), gameId: 'traffic-jam' },
      },
    });

    expect(countProfileStars(player)).toBe(3);
    expect(countProfileStars(profile('p2'))).toBe(0);
  });

  it('demande de choisir le joueur quand des profils existent sans profil actif', () => {
    expect(needsProfileChoice(createDefaultSaveState())).toBe(false);
    expect(needsProfileChoice(saveWith([profile('p1')]))).toBe(false);
    expect(needsProfileChoice(saveWith([profile('p1')], null))).toBe(true);
    expect(needsProfileChoice(saveWith([profile('p1')], 'disparu'))).toBe(true);
  });

  it('ne propose plus les prénoms rapides déjà pris', () => {
    const profiles = [profile('p1', { name: 'Joueur 1' }), profile('p2', { name: 'invite' })];

    expect(getAvailableQuickNames(profiles)).toEqual(['Mia', 'Joueur 2', 'Parents', 'Enfants']);
    expect(getAvailableQuickNames([])).toEqual(QUICK_PROFILE_NAMES);
  });

  it('propose le premier avatar libre, le renard quand tous sont pris', () => {
    const withAvatars = (...ids: string[]) =>
      ids.map((avatarId, index) => profile(`p${String(index)}`, { avatarId }));

    expect(suggestAvatarId([])).toBe('fox');
    expect(suggestAvatarId(withAvatars('fox', 'owl', 'dragon'))).toBe('robot');
    expect(suggestAvatarId(withAvatars(...AVATARS.map((avatar) => avatar.id)))).toBe('fox');
  });
});
