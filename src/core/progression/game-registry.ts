import { BEAR_SORT_CATALOG } from '@/games/bear-sort/catalog';
import { MEMORY_CATALOG } from '@/games/memory/catalog';
import { PATTERNS_CATALOG } from '@/games/patterns/catalog';
import { TRAFFIC_JAM_CATALOG } from '@/games/traffic-jam/catalog';
import type { GameId, UserProfile } from '@/types/mia';
import { getGameProgressSummary } from './progression-engine';
import type { GameManifest, ProfileProgressSummary } from './types';

/** Registre exhaustif : le compilateur exige une entrée par `GameId`, d'`id` égal à sa clé. */
export type GameRegistry = { readonly [K in GameId]: GameManifest & { readonly id: K } };

/**
 * Registre central des jeux, dans l'ordre d'affichage du Hub. Données seules : les icônes sont
 * associées dans `components/`. FEAT-11 (Memory), FEAT-14 (Traffic Jam), FEAT-21 (Suites Logiques) et
 * FEAT-25 (Attrape-Piège) y branchent leur catalogue ; un niveau publié n'en est jamais retiré (`countProfileStars` divergerait).
 */
export const GAME_REGISTRY: GameRegistry = {
  memory: {
    id: 'memory',
    title: 'Memory',
    skill: 'Mémoire visuelle & spatiale',
    path: '/memory',
    catalog: MEMORY_CATALOG,
  },
  'traffic-jam': {
    id: 'traffic-jam',
    title: 'Traffic Jam',
    skill: 'Planification & Logique séquentielle',
    path: '/traffic-jam',
    catalog: TRAFFIC_JAM_CATALOG,
  },
  patterns: {
    id: 'patterns',
    title: 'Suites Logiques',
    skill: 'Raisonnement & Logique sérielle · dès 4 ans',
    path: '/patterns',
    catalog: PATTERNS_CATALOG,
  },
  'bear-sort': {
    id: 'bear-sort',
    title: 'Attrape-Piège',
    skill: 'Flexibilité mentale & Inhibition',
    path: '/bear-sort',
    catalog: BEAR_SORT_CATALOG,
  },
};

/** Les jeux, dans l'ordre d'affichage du Hub. */
export const GAMES: readonly GameManifest[] = Object.values(GAME_REGISTRY);

/**
 * Progression d'un profil sur tous les jeux (compteur du Hub et carte de chaque jeu). Seuls les
 * niveaux des catalogues comptent : sans niveau inconnu dans la sauvegarde, le total est égal à
 * `countProfileStars`. `games` est injectable (tests).
 */
export function getProfileProgressSummary(
  profile: UserProfile | null,
  games: readonly GameManifest[] = GAMES,
): ProfileProgressSummary {
  const summaries = games.map((game) => getGameProgressSummary(game.id, game.catalog, profile));
  return {
    earnedStars: summaries.reduce((total, summary) => total + summary.earnedStars, 0),
    totalStars: summaries.reduce((total, summary) => total + summary.totalStars, 0),
    perfectCount: summaries.reduce((total, summary) => total + summary.perfectCount, 0),
    games: summaries,
  };
}
