import type { SoundEffect } from '@/core/audio/types';
import type { AppearanceKind, GoNoGoLevelConfig, SubjectId, VoiceMood } from './types';
import { getLureClipId, getRuleClipPaths, getVoiceClipPath } from './voice-script';

/**
 * Introduction à la première étoile de chaque règle (FEAT-28 §9) : « on apprend le STOP en le faisant,
 * pas en l'écoutant ». La démo est un petit film en images, sans texte, que le plateau joue étape par
 * étape : la chouette montre la règle, se fait piéger elle-même, puis met en garde. Rien n'y est compté.
 */

/** Moment de la scène que la démo impose, comme le font les issues d'une vraie apparition. */
export type DemoMoment = 'entering' | 'caught' | 'trapped' | 'passed';

/** Main fantôme : elle tape sur le buzzer, ou part vers lui et se fige en l'air quand le STOP surgit. */
export type DemoHand = 'none' | 'tap' | 'freeze';

export type DemoAction =
  /** Un personnage ou une image entre, lentement */
  | { do: 'enter'; subject: SubjectId; kind: AppearanceKind }
  | { do: 'moment'; moment: DemoMoment }
  | { do: 'stop' }
  | { do: 'clear' }
  | { do: 'hand'; hand: DemoHand }
  /** Le buzzer s'enfonce, sans rien compter : la main fantôme ou la chouette tape */
  | { do: 'press' }
  | { do: 'effect'; effect: SoundEffect }
  /** La mascotte apparaît (règle 1 : elle se tient près du buzzer) ou disparaît */
  | { do: 'mascot'; isVisible: boolean; mood: 'idle' | 'happy' | 'flap' }
  /** La chouette parle : l'étape dure autant que la voix, et au moins `minMs` (son coupé) */
  | { do: 'say'; clips: readonly string[]; minMs: number; mood?: VoiceMood }
  | { do: 'wait'; ms: number };

/** Une main fantôme qui tape, une chouette qui rit : durées minimales du film, son coupé. */
export const DEMO_SAY_MS = 2000;
export const DEMO_WARNING_MS = 5000;
const SHORT_WAIT_MS = 600;
const HAND_WAIT_MS = 1000;

const SIGNAL: DemoAction = { do: 'effect', effect: 'signal' };

function say(
  clip: Parameters<typeof getVoiceClipPath>[0],
  minMs: number,
  mood?: VoiceMood,
): DemoAction {
  return { do: 'say', clips: [getVoiceClipPath(clip)], minMs, mood };
}

/** Image d'une cible et d'un piège de la démo, selon la règle. */
function getDemoSubjects(config: GoNoGoLevelConfig): { target: SubjectId; trap: SubjectId } {
  if (config.rule === 'owl-says') return { target: 'owl', trap: 'fox' };
  return { target: 'plane', trap: 'cow' };
}

/** « Bravo ! » : la cible est attrapée par la main fantôme. */
function showTheRule(config: GoNoGoLevelConfig, target: SubjectId): DemoAction[] {
  return [
    { do: 'enter', subject: target, kind: 'target' },
    ...(config.rule === 'owl-says' ? [SIGNAL] : []),
    { do: 'wait', ms: SHORT_WAIT_MS },
    { do: 'say', clips: getRuleClipPaths(config), minMs: DEMO_SAY_MS },
    { do: 'hand', hand: 'tap' },
    { do: 'wait', ms: HAND_WAIT_MS },
    { do: 'hand', hand: 'none' },
    { do: 'press' },
    { do: 'moment', moment: 'caught' },
    { do: 'effect', effect: 'success' },
    { do: 'mascot', isVisible: config.rule !== 'owl-says', mood: 'happy' },
    say('demo-bravo', DEMO_SAY_MS - SHORT_WAIT_MS),
    { do: 'clear' },
    { do: 'wait', ms: SHORT_WAIT_MS },
  ];
}

/** La chouette se laisse piéger : elle tape par réflexe, s'en rend compte, et rit d'elle-même. */
function getTrapped(config: GoNoGoLevelConfig, trap: SubjectId): DemoAction[] {
  return [
    { do: 'mascot', isVisible: true, mood: 'idle' },
    { do: 'enter', subject: trap, kind: 'trap' },
    ...(config.rule === 'owl-says' ? [SIGNAL] : []),
    { do: 'wait', ms: HAND_WAIT_MS },
    { do: 'press' },
    { do: 'moment', moment: 'trapped' },
    { do: 'effect', effect: 'oops' },
    say('demo-oops', DEMO_SAY_MS),
    { do: 'clear' },
    { do: 'wait', ms: SHORT_WAIT_MS },
  ];
}

/** STOP tardif : la main fantôme part vers le buzzer et se fige en l'air quand le panneau surgit. */
function getFrozenByTheStop(): DemoAction[] {
  return [
    { do: 'mascot', isVisible: true, mood: 'idle' },
    { do: 'enter', subject: 'pigeon', kind: 'stop' },
    { do: 'hand', hand: 'freeze' },
    { do: 'wait', ms: HAND_WAIT_MS },
    { do: 'stop' },
    { do: 'wait', ms: SHORT_WAIT_MS },
    { do: 'moment', moment: 'passed' },
    { do: 'effect', effect: 'gag' },
    say('demo-oops', DEMO_SAY_MS),
    { do: 'hand', hand: 'none' },
    { do: 'clear' },
    { do: 'wait', ms: SHORT_WAIT_MS },
  ];
}

/** La mise en garde, dite en entier. */
function getWarning(): DemoAction[] {
  return [{ do: 'mascot', isVisible: true, mood: 'idle' }, say('demo-warning', DEMO_WARNING_MS)];
}

/**
 * Démo courte du palier 4 (⭐ 13) : la chouette annonce son piège, bat des ailes et dit « Vache vole ! »
 * devant une vache, qui n'est pas une cible. La main fantôme reste en place : c'est elle qui se retient.
 */
function getLureDemo(): DemoAction[] {
  return [
    { do: 'mascot', isVisible: true, mood: 'flap' },
    say('rule-lure', DEMO_SAY_MS, 'flap'),
    { do: 'mascot', isVisible: true, mood: 'idle' },
    { do: 'wait', ms: SHORT_WAIT_MS },
    { do: 'enter', subject: 'cow', kind: 'trap' },
    { do: 'mascot', isVisible: true, mood: 'flap' },
    {
      do: 'say',
      clips: [getVoiceClipPath(getLureClipId('cow'))],
      minMs: DEMO_SAY_MS,
      mood: 'flap',
    },
    { do: 'mascot', isVisible: true, mood: 'idle' },
    { do: 'moment', moment: 'passed' },
    { do: 'effect', effect: 'gag' },
    { do: 'wait', ms: HAND_WAIT_MS * 2 },
    { do: 'clear' },
    { do: 'wait', ms: SHORT_WAIT_MS },
  ];
}

/**
 * Film de la démo d'une étoile, du premier plan à la mise en garde ; les essais guidés suivent. Règle 1
 * et règle 2 : la chouette montre la règle puis se fait piéger. Règle 3 : la main se fige en l'air quand
 * le STOP surgit. Démo courte du leurre : la chouette annonce son piège et en montre un exemple.
 */
export function getDemoScript(config: GoNoGoLevelConfig): readonly DemoAction[] {
  if (config.intro === 'lure') return getLureDemo();
  const { target, trap } = getDemoSubjects(config);
  if (config.rule === 'late-stop') {
    return [...showTheRule(config, 'pigeon'), ...getFrozenByTheStop(), ...getWarning()];
  }
  return [...showTheRule(config, target), ...getTrapped(config, trap), ...getWarning()];
}

/** Chemins des phrases de la démo, à charger avant son début. */
export function getDemoClipPaths(config: GoNoGoLevelConfig): string[] {
  const paths = new Set<string>();
  for (const action of getDemoScript(config)) {
    if (action.do === 'say') for (const clip of action.clips) paths.add(clip);
  }
  return [...paths];
}
