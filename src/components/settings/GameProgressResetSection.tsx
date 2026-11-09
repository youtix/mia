'use client';

import { FocusableButton, ModalDialog } from '@/components/ui';
import { CONFIRM_GUARD_MS } from '@/core/navigation';
import { resetGameProgress, useMiaStorage } from '@/core/storage';
import type { GameId, GameProgress, UserProfile } from '@/types/mia';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import { ConfirmActions } from './ConfirmActions';
import type { SettingsOptionZone } from './GameSettingsSection';
import {
  describeGameResetAction,
  describeGameResetDone,
  describeGameResetFinalTitle,
  describeGameResetNote,
  describeGameResetNothing,
  describeGameResetSubtitle,
  describeGameResetTitle,
  describeGameResetWarning,
  describeGameStars,
  GAME_RESET_ORDER,
  GAME_RESET_TEXTS,
  GAME_TITLES,
} from './labels';
import { SettingsFeedback, SettingsGroup, type SettingsFeedbackMessage } from './SettingsGroup';
import { SettingsSection } from './SettingsSection';

/** Une remise à zéro en cours : le jeu visé, son décompte à la demande, son étape. */
interface ResetFlow {
  gameId: GameId;
  stars: number;
  crowns: number;
  /** 1 : « Remettre … à zéro ? » ; 2 : la seconde confirmation, en rouge */
  step: 1 | 2;
  /** Faux pendant l'animation de sortie : le contenu reste affiché le temps de la sortie */
  isOpen: boolean;
}

export interface GameProgressResetSectionProps {
  /** Profil actif : sa progression est celle qui se remet à zéro (jamais celle d'un autre profil) */
  profile: UserProfile;
  /** Zone D-Pad de la grille : un bouton par jeu, dans l'ordre de `GAME_RESET_ORDER` */
  zone: SettingsOptionZone;
  /** Un bouton reçoit le focus DOM (Tab, clic) : activer la zone */
  onFocus: () => void;
}

/** Étoiles et couronnes d'un jeu ; une couronne est une étoile gagnée sans faute (`isPerfect`). */
function countGameStars(progress: GameProgress | undefined): { stars: number; crowns: number } {
  const levels = Object.values(progress?.levels ?? {});
  return {
    stars: levels.filter((level) => level.completed).length,
    crowns: levels.filter((level) => level.completed && level.isPerfect).length,
  };
}

/**
 * Section « Progression » : remet à zéro les étoiles et couronnes d'un jeu, pour le profil actif, par
 * deux confirmations (la seconde en rouge, « irréversible »), comme « Tout effacer ». Un jeu sans
 * étoile n'ouvre rien : la section le dit.
 */
export function GameProgressResetSection({
  profile,
  zone,
  onFocus,
}: GameProgressResetSectionProps) {
  const { updateState } = useMiaStorage();
  const [flow, setFlow] = useState<ResetFlow | null>(null);
  // Même valeur, lue par les boutons : une modale fermée garde ses anciens gestionnaires le temps de
  // sa sortie, un second appui ne doit pas remettre à zéro deux fois.
  const flowRef = useRef<ResetFlow | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedbackMessage | null>(null);

  const updateFlow = (next: ResetFlow | null) => {
    flowRef.current = next;
    setFlow(next);
  };

  const requestReset = (gameId: GameId) => {
    const { stars, crowns } = countGameStars(profile.gamesProgress[gameId]);
    if (stars === 0) {
      setFeedback({ tone: 'info', text: describeGameResetNothing(GAME_TITLES[gameId]) });
      return;
    }
    setFeedback(null);
    updateFlow({ gameId, stars, crowns, step: 1, isOpen: true });
  };

  const continueReset = () => {
    const current = flowRef.current;
    if (current?.isOpen && current.step === 1) updateFlow({ ...current, step: 2 });
  };

  const cancelReset = () => {
    const current = flowRef.current;
    if (current) updateFlow({ ...current, isOpen: false });
  };

  const confirmReset = () => {
    const current = flowRef.current;
    if (current?.isOpen !== true || current.step !== 2) return;
    updateFlow({ ...current, isOpen: false });
    void updateState((prev) => resetGameProgress(prev, profile.id, current.gameId));
    setFeedback({
      tone: 'success',
      text: describeGameResetDone(GAME_TITLES[current.gameId], profile.name),
    });
  };

  // Titre et décompte viennent de la dernière demande : ils restent affichés pendant la sortie.
  const gameTitle = flow ? GAME_TITLES[flow.gameId] : null;
  const isOpen = flow?.isOpen === true;

  return (
    <SettingsSection title={GAME_RESET_TEXTS.title} icon={<RotateCcw className="size-7" />}>
      <SettingsGroup
        title={GAME_RESET_TEXTS.groupTitle}
        description={describeGameResetNote(profile.name)}
      >
        {/* Une rangée sur TV, un bouton par jeu, deux colonnes en étroit : la zone D-Pad suit
            (SettingsScreen). Le nombre de colonnes vient de la même liste que la zone, pour qu'un jeu
            ajouté ne passe pas à la ligne sous le premier. */}
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--reset-cols),minmax(0,1fr))] md:gap-3"
          style={{ '--reset-cols': GAME_RESET_ORDER.length } as CSSProperties}
        >
          {GAME_RESET_ORDER.map((gameId, index) => {
            const { stars, crowns } = countGameStars(profile.gamesProgress[gameId]);
            return (
              <FocusableButton
                key={gameId}
                ref={zone.getItemRef(index)}
                isFocused={zone.isItemFocused(index)}
                aria-label={describeGameResetAction(GAME_TITLES[gameId])}
                variant="secondary"
                className="w-full px-3"
                onClick={() => {
                  requestReset(gameId);
                }}
                onFocus={onFocus}
              >
                {/* Titre puis décompte, sur deux lignes : même patron que les options de temps. Lignes
                    équilibrées : à six colonnes, « Pas si vite ! » ne laisse pas son « ! » seul. */}
                <span className="flex flex-col items-center leading-tight text-balance">
                  {GAME_TITLES[gameId]}
                  <span className="text-fluid-xs font-normal text-slate-300">
                    {describeGameStars(stars, crowns)}
                  </span>
                </span>
              </FocusableButton>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsFeedback message={feedback} />

      <ModalDialog
        isOpen={isOpen}
        inputGuardMs={CONFIRM_GUARD_MS}
        title={gameTitle ? describeGameResetTitle(gameTitle) : ''}
        subtitle={
          flow && gameTitle
            ? describeGameResetSubtitle(gameTitle, flow.stars, flow.crowns, profile.name)
            : undefined
        }
        onClose={cancelReset}
      >
        <ConfirmActions
          scopeId="settings-game-reset-confirm"
          confirmLabel={GAME_RESET_TEXTS.continueAction}
          onCancel={cancelReset}
          onConfirm={continueReset}
        />
        {/* Double confirmation : la seconde s'empile sur la première (couches FEAT-04) ; Annuler, Retour
            ou Échap à l'une ou l'autre abandonne tout. */}
        <ModalDialog
          isOpen={flow?.isOpen === true && flow.step === 2}
          inputGuardMs={CONFIRM_GUARD_MS}
          title={gameTitle ? describeGameResetFinalTitle(gameTitle) : ''}
          onClose={cancelReset}
          className="border-rose-400"
        >
          <p className="flex items-center justify-center gap-2 text-center text-fluid-base font-semibold text-rose-300">
            <TriangleAlert aria-hidden="true" className="size-6 shrink-0" />
            {gameTitle ? describeGameResetWarning(gameTitle, profile.name) : null}
          </p>
          <ConfirmActions
            scopeId="settings-game-reset-final"
            confirmLabel={GAME_RESET_TEXTS.finalAction}
            confirmVariant="danger"
            confirmIcon={<RotateCcw className="size-5" />}
            onCancel={cancelReset}
            onConfirm={confirmReset}
          />
        </ModalDialog>
      </ModalDialog>
    </SettingsSection>
  );
}
