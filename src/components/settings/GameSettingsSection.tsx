'use client';

// Modules directs, pas les barrels `profile` et `progression` : le JS de la route reste léger.
import { AvatarBadge } from '@/components/profile/AvatarBadge';
import { GAME_ICONS } from '@/components/progression/game-icons';
import { FocusableButton } from '@/components/ui';
import type { UseGridNavigationResult } from '@/core/navigation';
import { updateMemorySettings, useMiaStorage } from '@/core/storage';
import { cn } from '@/lib/cn';
import type { MemoryGameSettings, TimeFactor, UserProfile } from '@/types/mia';
import { Check, CircleX, Eye, Gamepad2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import {
  describeProfileSettings,
  formatTimeFactor,
  GAME_SETTINGS_TEXTS,
  TIME_FACTOR_OPTIONS,
} from './labels';
import { SettingsSection } from './SettingsSection';

/**
 * Zone D-Pad d'un sélecteur de temps, déclarée par l'écran (qui enchaîne ses zones et place le
 * curseur à l'arrivée) : `ref` et anneau de focus de chaque option.
 */
export type SettingsOptionZone = Pick<UseGridNavigationResult, 'getItemRef' | 'isItemFocused'>;

export interface GameSettingsSectionProps {
  /** Profil actif : ses réglages sont affichés et modifiés (jamais ceux d'un autre profil) */
  profile: UserProfile;
  /** Zone « Temps de mémorisation » (1 × 4) */
  previewZone: SettingsOptionZone;
  /** Zone « Temps d’affichage des erreurs » (1 × 4) */
  mismatchZone: SettingsOptionZone;
  /** Une option de « Temps de mémorisation » reçoit le focus DOM (Tab, clic) : activer sa zone */
  onFocusPreview: () => void;
  /** Idem pour « Temps d’affichage des erreurs » */
  onFocusMismatch: () => void;
}

/**
 * Section « Jeux » (FEAT-19) : réglages de jeu du profil actif, qui le suivent d'un appareil à
 * l'autre avec sa sauvegarde, à la différence des réglages de l'appareil. Pour Memory, deux
 * facteurs de temps (aperçu des cartes, affichage d'une erreur) ; étoiles et couronnes n'en
 * dépendent pas.
 */
export function GameSettingsSection({
  profile,
  previewZone,
  mismatchZone,
  onFocusPreview,
  onFocusMismatch,
}: GameSettingsSectionProps) {
  const { updateState } = useMiaStorage();
  const memoryTitleId = useId();
  const { Icon: MemoryIcon, badgeClass } = GAME_ICONS.memory;
  const { previewFactor, mismatchFactor } = profile.gameSettings.memory;

  /** Écrit les réglages du profil affiché ; sans changement, rien n'est écrit (`updateMemorySettings`). */
  const updateMemory = (partial: Partial<MemoryGameSettings>) => {
    void updateState((prev) => updateMemorySettings(prev, profile.id, partial));
  };

  return (
    <SettingsSection title="Jeux" icon={<Gamepad2 className="size-7" />}>
      {/* Avatar décoratif : le prénom affiché à côté suffit (comme le bouton du profil du Hub). */}
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-fluid-lg font-semibold">
          <AvatarBadge avatarId={profile.avatarId} size="sm" />
          {describeProfileSettings(profile.name)}
        </p>
        <p className="text-fluid-sm text-slate-300">{GAME_SETTINGS_TEXTS.profileNote}</p>
      </div>

      <div role="group" aria-labelledby={memoryTitleId} className="flex flex-col gap-4">
        <h3 id={memoryTitleId} className="flex items-center gap-3 text-fluid-lg font-bold">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-950',
              badgeClass,
            )}
          >
            <MemoryIcon className="size-5" />
          </span>
          {GAME_SETTINGS_TEXTS.memoryTitle}
        </h3>

        <TimeFactorGroup
          label={GAME_SETTINGS_TEXTS.previewLabel}
          note={GAME_SETTINGS_TEXTS.previewNote}
          icon={<Eye aria-hidden="true" className="size-5 shrink-0" />}
          value={previewFactor}
          zone={previewZone}
          onChange={(factor) => {
            updateMemory({ previewFactor: factor });
          }}
          onFocus={onFocusPreview}
        />

        <TimeFactorGroup
          label={GAME_SETTINGS_TEXTS.mismatchLabel}
          note={GAME_SETTINGS_TEXTS.mismatchNote}
          icon={<CircleX aria-hidden="true" className="size-5 shrink-0" />}
          value={mismatchFactor}
          zone={mismatchZone}
          onChange={(factor) => {
            updateMemory({ mismatchFactor: factor });
          }}
          onFocus={onFocusMismatch}
        />
      </div>
    </SettingsSection>
  );
}

interface TimeFactorGroupProps {
  label: string;
  /** Explication sous le libellé, liée par `aria-describedby` */
  note: string;
  icon: ReactNode;
  value: TimeFactor;
  zone: SettingsOptionZone;
  onChange: (factor: TimeFactor) => void;
  onFocus: () => void;
}

/**
 * Sélecteur d'un facteur de temps, même patron que le mode TV : `radiogroup` de `FocusableButton
 * role="radio"`, l'option en vigueur pleine avec une coche. La zone (1 × 4) garde son curseur
 * après un choix, qui reste donc sur l'option choisie. 2 colonnes sur smartphone, 4 dès `sm:`
 * (le viewport TV de 960 px les affiche côte à côte).
 */
function TimeFactorGroup({
  label,
  note,
  icon,
  value,
  zone,
  onChange,
  onFocus,
}: TimeFactorGroupProps) {
  const labelId = useId();
  const noteId = useId();

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={noteId}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <p id={labelId} className="flex items-center gap-2 text-fluid-lg font-semibold">
          {icon}
          {label}
        </p>
        <p id={noteId} className="text-fluid-sm text-slate-300">
          {note}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        {TIME_FACTOR_OPTIONS.map((option, index) => {
          const isChosen = option.value === value;
          return (
            <FocusableButton
              key={option.value}
              ref={zone.getItemRef(index)}
              isFocused={zone.isItemFocused(index)}
              role="radio"
              aria-checked={isChosen}
              variant={isChosen ? 'primary' : 'secondary'}
              className="w-full"
              // Coche : indice non coloré de l'option en vigueur ; invisible sinon, pour que
              // le libellé ne bouge pas quand le choix change.
              leftIcon={
                <Check className={cn('size-5', !isChosen && 'invisible')} strokeWidth={3} />
              }
              onClick={() => {
                onChange(option.value);
              }}
              onFocus={onFocus}
            >
              {/* Libellé puis facteur, sur deux lignes ; l'espace entre les deux sépare le nom
                  accessible (« Long × 1,5 »). Couleur explicite plutôt qu'une opacité : sur le
                  fond plein de l'option en vigueur, le petit texte garde un contraste AA. */}
              <span className="flex flex-col items-center leading-tight">
                {option.label}{' '}
                <span
                  className={cn(
                    'text-fluid-xs font-normal whitespace-nowrap',
                    isChosen ? 'text-slate-800' : 'text-slate-300',
                  )}
                >
                  {formatTimeFactor(option.value)}
                </span>
              </span>
            </FocusableButton>
          );
        })}
      </div>
    </div>
  );
}
