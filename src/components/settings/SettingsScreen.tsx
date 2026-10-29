'use client';

// Modules directs, pas le barrel de la progression : le JS de la route se limite à cet écran.
import { useGameNavigation } from '@/components/progression/routes';
import { WaitingScreen } from '@/components/progression/WaitingScreen';
import { useZoneRegistry } from '@/components/progression/zone-chain';
import { AppShell, DEFAULT_REMOTE_HINTS, FadeIn, FocusableButton } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import { DEFAULT_MEMORY_GAME_SETTINGS, useMiaStorage } from '@/core/storage';
import { cn } from '@/lib/cn';
import type { TimeFactor } from '@/types/mia';
import { Check, Contrast, Smartphone, Tv, Volume2, VolumeX } from 'lucide-react';
import { useId, useState, type ReactNode, type Ref } from 'react';
import { BackupPanel } from './BackupPanel';
import { GameSettingsSection } from './GameSettingsSection';
import { SETTINGS_TEXTS, TIME_FACTOR_OPTIONS, TV_MODE_OPTIONS } from './labels';
import { SettingsSection } from './SettingsSection';

/**
 * Zones D-Pad de l'écran, de haut en bas : Retour, chaque réglage de l'appareil, les deux
 * sélecteurs de temps de Memory (section « Jeux », présente avec un profil actif), la sauvegarde.
 */
type SettingsZone =
  'header' | 'tv' | 'sound' | 'contrast' | 'memoryPreview' | 'memoryMismatch' | 'backup';

/** Position d'un facteur dans les sélecteurs de temps (options dans l'ordre de `TIME_FACTORS`). */
function indexOfTimeFactor(factor: TimeFactor): number {
  return Math.max(
    TIME_FACTOR_OPTIONS.findIndex((option) => option.value === factor),
    0,
  );
}

/**
 * Écran Réglages & Sauvegarde (FEAT-18) : réglages de l'appareil (mode TV, son, contraste élevé),
 * réglages de jeu du profil actif (FEAT-19) et sauvegarde (export, import, réinitialisation), au
 * doigt comme à la télécommande ; Retour ramène au Hub. Tant que la sauvegarde n'est pas chargée,
 * un écran d'attente le remplace.
 */
export function SettingsScreen() {
  const { isLoaded } = useMiaStorage();
  return isLoaded ? <SettingsContent /> : <WaitingScreen title="Réglages" />;
}

function SettingsContent() {
  const { state, activeProfile, updateSettings } = useMiaStorage();
  const { backToHub } = useGameNavigation();
  const { tvModeOverride, soundEnabled, highContrastMode } = state.settings;
  const chosenTvIndex = Math.max(
    TV_MODE_OPTIONS.findIndex((option) => option.value === tvModeOverride),
    0,
  );
  // Sans profil actif (sauvegarde importée sans profil, profil supprimé), la section « Jeux » et
  // ses zones sont absentes : Contraste et Sauvegarde se suivent directement.
  const memorySettings = activeProfile?.gameSettings.memory ?? DEFAULT_MEMORY_GAME_SETTINGS;
  const chosenPreviewIndex = indexOfTimeFactor(memorySettings.previewFactor);
  const chosenMismatchIndex = indexOfTimeFactor(memorySettings.mismatchFactor);
  // Curseur initial : le mode TV en vigueur (premier réglage de l'écran).
  const [activeZone, setActiveZone] = useState<SettingsZone>('tv');
  // Le profil actif peut disparaître pendant que le curseur est sur un sélecteur de temps (import
  // d'une sauvegarde sans profil actif sans passer par le focus DOM, profil supprimé par un autre
  // onglet) : la section « Jeux » se démonte et la zone active retombe sur Contraste, la dernière
  // au-dessus de la sauvegarde. Dérivée au rendu plutôt que corrigée après coup par un effet.
  const isGameZone = activeZone === 'memoryPreview' || activeZone === 'memoryMismatch';
  const zone: SettingsZone = !activeProfile && isGameZone ? 'contrast' : activeZone;
  const zones = useZoneRegistry<'backup'>();
  const tvLabelId = useId();
  const tvNoteId = useId();
  const soundNoteId = useId();
  const contrastNoteId = useId();

  const header = useGridNavigation({
    scopeId: 'settings-header',
    rows: 1,
    cols: 1,
    isActive: zone === 'header',
    onBack: backToHub,
    onEdge: (direction) => {
      if (direction === 'down') enterTvMode();
    },
  });
  const tvMode = useGridNavigation({
    scopeId: 'settings-tv-mode',
    rows: 1,
    cols: TV_MODE_OPTIONS.length,
    initialIndex: chosenTvIndex,
    isActive: zone === 'tv',
    onBack: backToHub,
    onEdge: (direction) => {
      if (direction === 'up') setActiveZone('header');
      else if (direction === 'down') setActiveZone('sound');
    },
  });
  const sound = useGridNavigation({
    scopeId: 'settings-sound',
    rows: 1,
    cols: 1,
    isActive: zone === 'sound',
    onBack: backToHub,
    onEdge: (direction) => {
      if (direction === 'up') enterTvMode();
      else if (direction === 'down') setActiveZone('contrast');
    },
  });
  const contrast = useGridNavigation({
    scopeId: 'settings-contrast',
    rows: 1,
    cols: 1,
    isActive: zone === 'contrast',
    onBack: backToHub,
    onEdge: (direction) => {
      if (direction === 'up') setActiveZone('sound');
      else if (direction === 'down') {
        if (activeProfile) enterMemoryPreview();
        else enterBackup();
      }
    },
  });
  const memoryPreview = useGridNavigation({
    scopeId: 'settings-memory-preview',
    rows: 1,
    cols: TIME_FACTOR_OPTIONS.length,
    initialIndex: chosenPreviewIndex,
    isActive: zone === 'memoryPreview',
    onBack: backToHub,
    onEdge: (direction) => {
      if (direction === 'up') setActiveZone('contrast');
      else if (direction === 'down') enterMemoryMismatch();
    },
  });
  const memoryMismatch = useGridNavigation({
    scopeId: 'settings-memory-mismatch',
    rows: 1,
    cols: TIME_FACTOR_OPTIONS.length,
    initialIndex: chosenMismatchIndex,
    isActive: zone === 'memoryMismatch',
    onBack: backToHub,
    onEdge: (direction) => {
      if (direction === 'up') enterMemoryPreview();
      else if (direction === 'down') enterBackup();
    },
  });

  /** Arrivée dans le sélecteur du mode TV, par le haut ou par le bas : sur l'option en vigueur. */
  const enterTvMode = () => {
    tvMode.setFocusedIndex(chosenTvIndex);
    setActiveZone('tv');
  };

  /** Arrivée dans un sélecteur de temps de Memory, par le haut ou par le bas : sur l'option choisie. */
  const enterMemoryPreview = () => {
    memoryPreview.setFocusedIndex(chosenPreviewIndex);
    setActiveZone('memoryPreview');
  };
  const enterMemoryMismatch = () => {
    memoryMismatch.setFocusedIndex(chosenMismatchIndex);
    setActiveZone('memoryMismatch');
  };

  /** Arrivée dans la sauvegarde, par le haut : sur son premier bouton (curseur posé par le panneau). */
  const enterBackup = () => {
    zones.enter('backup', { kind: 'first' });
    setActiveZone('backup');
  };

  const focusZone = (zone: SettingsZone) => () => {
    setActiveZone(zone);
  };

  return (
    <AppShell
      title="Réglages"
      onBack={backToHub}
      isBackFocused={header.isItemFocused(0)}
      backButtonRef={header.getItemRef(0)}
      onBackFocus={focusZone('header')}
      footerHints={DEFAULT_REMOTE_HINTS}
    >
      <FadeIn className="mx-auto flex w-full max-w-3xl flex-col gap-5 md:gap-6 tv:max-w-4xl">
        <SettingsSection title="Appareil" icon={<Smartphone className="size-7" />}>
          <div
            role="radiogroup"
            aria-labelledby={tvLabelId}
            aria-describedby={tvNoteId}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <p id={tvLabelId} className="flex items-center gap-2 text-fluid-lg font-semibold">
                <Tv aria-hidden="true" className="size-5 shrink-0" />
                Mode TV
              </p>
              <p id={tvNoteId} className="text-fluid-sm text-slate-300">
                {SETTINGS_TEXTS.tvModeNote}
              </p>
            </div>
            {/* Effet immédiat (data-tv) : la mise en page change, le curseur reste sur l'option. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-3">
              {TV_MODE_OPTIONS.map((option, index) => {
                const isChosen = option.value === tvModeOverride;
                return (
                  <FocusableButton
                    key={option.value}
                    ref={tvMode.getItemRef(index)}
                    isFocused={tvMode.isItemFocused(index)}
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
                      void updateSettings({ tvModeOverride: option.value });
                    }}
                    onFocus={focusZone('tv')}
                  >
                    {option.label}
                  </FocusableButton>
                );
              })}
            </div>
          </div>

          <SettingSwitch
            ref={sound.getItemRef(0)}
            isFocused={sound.isItemFocused(0)}
            label="Son"
            note={SETTINGS_TEXTS.soundNote}
            noteId={soundNoteId}
            icon={soundEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            checked={soundEnabled}
            onToggle={() => {
              void updateSettings({ soundEnabled: !soundEnabled });
            }}
            onFocus={focusZone('sound')}
          />

          <SettingSwitch
            ref={contrast.getItemRef(0)}
            isFocused={contrast.isItemFocused(0)}
            label="Contraste élevé"
            note={SETTINGS_TEXTS.contrastNote}
            noteId={contrastNoteId}
            icon={<Contrast className="size-5" />}
            checked={highContrastMode}
            onToggle={() => {
              void updateSettings({ highContrastMode: !highContrastMode });
            }}
            onFocus={focusZone('contrast')}
          />
        </SettingsSection>

        {activeProfile ? (
          <GameSettingsSection
            profile={activeProfile}
            previewZone={memoryPreview}
            mismatchZone={memoryMismatch}
            onFocusPreview={focusZone('memoryPreview')}
            onFocusMismatch={focusZone('memoryMismatch')}
          />
        ) : null}

        <BackupPanel
          isActive={zone === 'backup'}
          register={zones.register}
          onExitUp={activeProfile ? enterMemoryMismatch : focusZone('contrast')}
          onFocusZone={focusZone('backup')}
          onBack={backToHub}
          onReset={backToHub}
        />
      </FadeIn>
    </AppShell>
  );
}

interface SettingSwitchProps {
  ref: Ref<HTMLButtonElement>;
  isFocused: boolean;
  label: string;
  /** Explication sous l'interrupteur, liée par `aria-describedby` */
  note: string;
  noteId: string;
  icon: ReactNode;
  checked: boolean;
  onToggle: () => void;
  onFocus: () => void;
}

/** Interrupteur (`role="switch"`) : un tap ou OK le bascule, l'état est annoncé par `aria-checked`. */
function SettingSwitch({
  ref,
  isFocused,
  label,
  note,
  noteId,
  icon,
  checked,
  onToggle,
  onFocus,
}: SettingSwitchProps) {
  return (
    <div className="flex flex-col gap-1">
      <FocusableButton
        ref={ref}
        isFocused={isFocused}
        role="switch"
        aria-checked={checked}
        aria-describedby={noteId}
        variant="secondary"
        className="w-full justify-between gap-4 px-4 text-fluid-lg"
        leftIcon={icon}
        onClick={onToggle}
        onFocus={onFocus}
      >
        <span className="flex-1 text-left">{label}</span>
        <SwitchTrack checked={checked} />
      </FocusableButton>
      <p id={noteId} className="px-1 text-fluid-sm text-slate-300">
        {note}
      </p>
    </div>
  );
}

/** Glissière décorative : position du bouton et coche en plus de la couleur (daltonisme). */
function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 motion-safe:transition-colors',
        checked ? 'border-emerald-300 bg-emerald-400' : 'border-slate-500 bg-slate-700',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 flex size-5 items-center justify-center rounded-full bg-slate-50 text-slate-950 motion-safe:transition-transform',
          checked && 'translate-x-5',
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    </span>
  );
}
