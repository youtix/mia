import { NoBadge } from '@/games/bear-sort/components/NoBadge';
import { OwlMascot, type MascotMood } from '@/games/bear-sort/components/OwlMascot';
import { StopSign } from '@/games/bear-sort/components/StopSign';
import { cn } from '@/lib/cn';
import type { Scene } from '../run';
import { isImageId } from '../subjects';
import type { GoNoGoLevelConfig, SubjectId } from '../types';
import {
  ART_STYLE_ID,
  ART_STYLE_PRECEDENCE,
  AWNING_BLUE,
  AWNING_CREAM,
  GO_NO_GO_KEYFRAMES,
  HILL_BACK,
  HILL_FRONT,
  HILL_OUTLINE,
  SKY_BOTTOM,
  SKY_TOP,
  WINDOW_INSIDE,
  WOOD,
  WOOD_DARK,
} from './art-tokens';
import { CatPuppet, FoxPuppet } from './art/puppets';
import { ImageArt } from './ImageArt';

export interface StageProps {
  config: Pick<GoNoGoLevelConfig, 'rule' | 'hideouts'>;
  scene: Scene;
  mascot: { isVisible: boolean; mood: MascotMood };
  className?: string;
}

/** Animation d'un personnage ou d'une image selon le moment : la classe sert aux animations réduites. */
interface FigureAnimation {
  className: string;
  animation: string;
}

/**
 * Animation de la silhouette selon le moment (FEAT-28 §3.1, §6) : l'entrée est la même pour toutes les
 * apparitions, jamais un mouvement qui trahirait la réponse. Attrapée : la chouette replonge, une image
 * s'envole. Ratée : elle s'en va doucement. Piège touché : rien de drôle, elle reste là. Laissé passer :
 * le gag (le renard boude, l'image qui ne vole pas tente de s'envoler, l'oiseau se fige sous le STOP).
 */
function getFigureAnimation(scene: Scene, isPuppet: boolean): FigureAnimation {
  switch (scene.moment) {
    case 'entering':
      return {
        className: 'gng-rise',
        animation: `gng-rise ${scene.isSlow ? '600ms' : '250ms'} ease-out both`,
      };
    case 'caught':
      return isPuppet
        ? { className: 'gng-hoot', animation: 'gng-hoot 400ms ease-in both' }
        : { className: 'gng-fly-away', animation: 'gng-fly-away 400ms ease-in both' };
    case 'missed':
      return isPuppet
        ? { className: 'gng-sink', animation: 'gng-sink 600ms ease-in both' }
        : { className: 'gng-fly-away', animation: 'gng-fly-away 600ms ease-in both' };
    case 'trapped':
      return { className: '', animation: 'none' };
    case 'passed':
      if (scene.kind === 'stop') {
        return { className: 'gng-statue', animation: 'gng-statue 900ms ease-in-out both' };
      }
      return isPuppet
        ? { className: 'gng-sulk', animation: 'gng-sulk 900ms ease-in-out both' }
        : { className: 'gng-try-fly', animation: 'gng-try-fly 900ms ease-in-out both' };
  }
}

/** Étincelles de la chouette qui replonge (règle 1) : six éclats qui partent du personnage. */
const SPARKS = [
  { dx: '-62%', dy: '-48%' },
  { dx: '0%', dy: '-72%' },
  { dx: '62%', dy: '-48%' },
  { dx: '-74%', dy: '6%' },
  { dx: '74%', dy: '6%' },
  { dx: '0%', dy: '-34%' },
] as const;

function Sparks() {
  return (
    <span aria-hidden="true" data-sparks="true" className="pointer-events-none absolute inset-0">
      {SPARKS.map(({ dx, dy }) => (
        <span
          key={`${dx}-${dy}`}
          className="gng-spark absolute top-1/2 left-1/2 size-[12%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200"
          style={
            {
              '--gng-dx': dx,
              '--gng-dy': dy,
              animation: 'gng-spark 500ms ease-out both',
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Le personnage ou l'image sur scène, sans cadre : le castelet ou la colline le place. */
function FigureArt({ subject, scene }: { subject: SubjectId; scene: Scene }) {
  if (isImageId(subject)) return <ImageArt image={subject} />;
  if (subject === 'owl') {
    // Les ailes battent en attendant ; elle saute de joie quand elle est attrapée.
    let mood: MascotMood = 'idle';
    if (scene.moment === 'entering') mood = 'flap';
    else if (scene.moment === 'caught') mood = 'happy';
    return <OwlMascot mood={mood} />;
  }
  let expression: 'neutral' | 'wink' | 'sulk' = 'neutral';
  if (scene.moment === 'trapped') expression = 'wink';
  else if (scene.moment === 'passed') expression = 'sulk';
  return subject === 'fox' ? (
    <FoxPuppet expression={expression} />
  ) : (
    <CatPuppet expression={expression} />
  );
}

/**
 * Ce qui est sur la scène, animé selon le moment ; remonté à chaque entrée (`scene.key`) pour que
 * l'animation d'entrée reparte. Les marques de l'aide (signe « non ») et le gel du STOP tardif se
 * posent par-dessus.
 */
function Figure({ scene, subject }: { scene: Scene; subject: SubjectId }) {
  const isPuppet = !isImageId(subject);
  const { className, animation } = getFigureAnimation(scene, isPuppet);
  const isSignaling = isPuppet && subject !== 'owl' && scene.moment === 'entering';

  return (
    <div
      key={scene.key}
      data-figure={subject}
      data-kind={scene.kind}
      data-moment={scene.moment}
      className={cn('relative size-full', className, isSignaling && 'gng-signal')}
      style={{ animation }}
    >
      <FigureArt subject={subject} scene={scene} />
      {isPuppet && subject === 'owl' && scene.moment === 'caught' ? <Sparks /> : null}
      {scene.hasNoBadge ? (
        <span data-no-badge="true" className="pointer-events-none absolute inset-0">
          <NoBadge className="size-full" />
        </span>
      ) : null}
      {scene.kind === 'stop' && scene.moment === 'passed' ? (
        // Le gel : un voile de givre qui apparaît puis s'efface (opacité seule).
        <span
          aria-hidden="true"
          data-ice="true"
          className="pointer-events-none absolute inset-[8%] rounded-[40%] bg-sky-100"
          style={{ animation: 'gng-ice 900ms ease-in-out both' }}
        />
      ) : null}
    </div>
  );
}

/**
 * Le castelet de la règle 1 : un petit théâtre de marionnettes, auvent rayé bleu et crème, une ou trois
 * cachettes d'où surgit le personnage. Le personnage sort de sa fenêtre par le bas et en est rogné.
 */
function Castelet({ hideouts, scene }: { hideouts: GoNoGoLevelConfig['hideouts']; scene: Scene }) {
  const windows = hideouts === 3 ? [0, 1, 2] : [0];
  return (
    <div data-castelet="true" className="absolute inset-[5%_5%_4%] flex flex-col">
      <div
        className="h-[15%] shrink-0 rounded-t-2xl border-b-[0.4rem]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${AWNING_BLUE} 0 12.5%, ${AWNING_CREAM} 12.5% 25%)`,
          borderColor: WOOD_DARK,
        }}
      />
      <div
        className="flex min-h-0 flex-1 gap-[4%] px-[4%] pt-[3%]"
        style={{ backgroundColor: WOOD }}
      >
        {windows.map((index) => (
          <div
            key={index}
            data-hideout={index}
            className="@container-size relative min-w-0 flex-1 overflow-hidden rounded-t-[35%] border-[0.35rem]"
            style={{ backgroundColor: WINDOW_INSIDE, borderColor: WOOD_DARK }}
          >
            {scene.subject !== null && scene.hideout === index ? (
              <div className="absolute bottom-0 left-1/2 size-[min(100cqw,96cqh)] -translate-x-1/2">
                <Figure scene={scene} subject={scene.subject} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="h-[7%] shrink-0 rounded-b-xl" style={{ backgroundColor: WOOD_DARK }} />
    </div>
  );
}

/**
 * Place de l'image sur les collines : la même pour toutes, le bas caché derrière la crête. Une vache
 * y reste debout derrière la colline au lieu de flotter dans le ciel, un avion vole au ras d'elle.
 */
const HILL_FIGURE_CLASSES =
  'absolute bottom-[9%] left-1/2 size-[min(58cqw,62cqh)] -translate-x-1/2';

/** Les collines des règles 2 et 3 : l'image surgit toujours de derrière elles, de la même façon. */
function Hills({ scene }: { scene: Scene }) {
  return (
    <div data-hills="true" className="absolute inset-0">
      <div
        aria-hidden="true"
        className="absolute top-[6%] right-[8%] size-[14cqmin] rounded-full bg-amber-200"
      />
      {scene.subject !== null ? (
        <div className={HILL_FIGURE_CLASSES}>
          <Figure scene={scene} subject={scene.subject} />
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="absolute -bottom-[36%] -left-[16%] h-[60%] w-[74%] rounded-[50%] border-[0.3rem]"
        style={{ backgroundColor: HILL_BACK, borderColor: HILL_OUTLINE }}
      />
      <div
        aria-hidden="true"
        className="absolute -right-[20%] -bottom-[42%] h-[62%] w-[88%] rounded-[50%] border-[0.3rem]"
        style={{ backgroundColor: HILL_FRONT, borderColor: HILL_OUTLINE }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[11%]"
        style={{ backgroundColor: HILL_FRONT }}
      />
      {scene.hasStop ? (
        // Le panneau STOP surgit sur l'image, par-dessus les collines : en haut à droite, assez grand
        // pour se voir à trois mètres, assez petit pour que l'oiseau figé reste visible dessous.
        <div data-stop-sign="true" className={cn(HILL_FIGURE_CLASSES, 'z-20')}>
          <div
            className="gng-stop-pop absolute -top-[10%] -right-[6%] w-[56%]"
            style={{ animation: 'gng-stop-pop 220ms ease-out both' }}
          >
            <StopSign />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * La scène (FEAT-28 §4, §8.1) : le castelet à la règle 1, les collines aux règles 2 et 3, le panneau
 * STOP qui surgit sur l'apparition au palier 5, et la mascotte dans son coin (cachée à la règle 1
 * pendant le défilement : une seconde chouette à l'écran serait elle-même un signal). Entièrement
 * décorative : aucune annonce par apparition, elle arriverait après la fenêtre.
 */
export function Stage({ config, scene, mascot, className }: StageProps) {
  return (
    <div
      aria-hidden="true"
      data-stage={config.rule}
      data-moment={scene.moment}
      data-subject={scene.subject ?? undefined}
      className={cn('@container-size relative size-full overflow-hidden rounded-3xl', className)}
      style={{ backgroundImage: `linear-gradient(${SKY_TOP}, ${SKY_BOTTOM})` }}
    >
      <style href={ART_STYLE_ID} precedence={ART_STYLE_PRECEDENCE}>
        {GO_NO_GO_KEYFRAMES}
      </style>
      {config.rule === 'owl-says' ? (
        <Castelet hideouts={config.hideouts} scene={scene} />
      ) : (
        <Hills scene={scene} />
      )}
      {mascot.isVisible ? (
        <div
          data-mascot="true"
          data-mood={mascot.mood}
          className="absolute bottom-[3%] left-[3%] z-30 size-[clamp(3.5rem,26cqmin,9rem)]"
        >
          <OwlMascot mood={mascot.mood} />
        </div>
      ) : null}
    </div>
  );
}
