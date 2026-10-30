'use client';

import { useZoneController, type ZoneRegistry } from '@/components/progression/zone-chain';
import { FocusableButton, ModalDialog } from '@/components/ui';
import { useGridNavigation } from '@/core/navigation';
import {
  appUpdate,
  getAppVersion,
  repairApp,
  type AppUpdateCheckResult,
  type AppUpdateStatus,
} from '@/core/pwa';
import { AppWindow, CircleArrowUp, RefreshCw, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import { ConfirmActions } from './ConfirmActions';
import { APPLICATION_TEXTS, describeAppUpdate, describeAppVersion } from './labels';
import { SettingsFeedback, SettingsGroup, type SettingsFeedbackMessage } from './SettingsGroup';
import { SettingsSection } from './SettingsSection';

export interface ApplicationSectionProps {
  /** Section entière, que l'écran fait défiler quand aucun bouton n'y attire le curseur */
  ref?: Ref<HTMLElement>;
  /** État de la mise à jour, lu par l'écran : `unsupported` retire les boutons et leur zone D-Pad */
  status: AppUpdateStatus;
  /** Les boutons reçoivent les touches (une seule zone active par écran) */
  isActive: boolean;
  /** Inscription auprès de l'écran : `enter('application', …)` place le curseur à l'arrivée */
  register: ZoneRegistry<'application'>['register'];
  /** Haut bloqué sur le premier bouton : l'écran repasse à la sauvegarde */
  onExitUp: () => void;
  /** Un bouton reçoit le focus DOM (Tab, clic) : activer la zone */
  onFocusZone: () => void;
  /** Retour (Échap, Retour arrière, bouton Android) */
  onBack: () => void;
}

/**
 * Section « Application » (FEAT-20) : numéro de version et, avec un service worker, recherche de
 * mise à jour et réparation. Dans l'APK et en développement, le numéro de version reste seul.
 */
export function ApplicationSection({ ref, status, ...actionsProps }: ApplicationSectionProps) {
  return (
    <SettingsSection
      ref={ref}
      title={APPLICATION_TEXTS.title}
      icon={<AppWindow className="size-7" />}
    >
      <p className="text-fluid-base text-slate-200">{describeAppVersion(getAppVersion())}</p>
      {status === 'unsupported' ? null : <ApplicationActions status={status} {...actionsProps} />}
    </SettingsSection>
  );
}

/** Mise à jour et réparation, zone D-Pad comprise : composant monté seulement avec un worker. */
function ApplicationActions({
  status,
  isActive,
  register,
  onExitUp,
  onFocusZone,
  onBack,
}: Omit<ApplicationSectionProps, 'ref'>) {
  const actions = useGridNavigation({
    scopeId: 'settings-application',
    rows: 2,
    cols: 1,
    isActive,
    onBack,
    onEdge: (direction) => {
      if (direction === 'up') onExitUp();
    },
  });
  useZoneController(register, 'application', { count: 2, cols: 1 }, actions.setFocusedIndex);

  // Au D-Pad, le curseur montre tout le groupe de son bouton : la ligne d'état est dessous, et aucune
  // touche ne fait défiler plus bas que le dernier bouton. Après le défilement propre au bouton.
  const updateGroupRef = useRef<HTMLDivElement>(null);
  const repairGroupRef = useRef<HTMLDivElement>(null);
  const { focusedIndex } = actions;
  const isCursorShown = actions.isItemFocused(focusedIndex);
  useEffect(() => {
    if (!isCursorShown) return;
    const group = focusedIndex === 0 ? updateGroupRef : repairGroupRef;
    group.current?.scrollIntoView({ block: 'nearest' });
  }, [isCursorShown, focusedIndex]);

  const [lastCheck, setLastCheck] = useState<AppUpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  // Même valeur, lue par le bouton : il ne peut pas être `disabled` sans perdre le focus D-Pad, et
  // ignore donc lui-même les appuis pendant une recherche.
  const isCheckingRef = useRef(false);
  const [isRepairDialogOpen, setIsRepairDialogOpen] = useState(false);
  // Même doublon, lu par « Réparer » : la modale fermée garde ses boutons (et leurs anciennes
  // props) le temps de l'animation de sortie, un second appui ne doit pas réparer deux fois.
  const isRepairDialogOpenRef = useRef(false);
  const isRepairingRef = useRef(false);
  const [repairFeedback, setRepairFeedback] = useState<SettingsFeedbackMessage | null>(null);
  const isReady = status === 'ready';

  // Une version prête clôt la dernière recherche (état ajusté pendant le rendu, sans effet) : sinon
  // le bref retour à `idle` avant le rechargement, une fois la mise à jour acceptée (ici ou dans un
  // autre onglet), afficherait de nouveau son issue, « téléchargement échoué » pour un `found`.
  if (isReady && lastCheck !== null) setLastCheck(null);

  const updateIsChecking = (value: boolean) => {
    isCheckingRef.current = value;
    setIsChecking(value);
  };

  const checkForUpdate = async () => {
    if (isCheckingRef.current) return;
    updateIsChecking(true);
    const result = await appUpdate.check();
    updateIsChecking(false);
    setLastCheck(result);
  };

  const updateRepairDialog = (isOpen: boolean) => {
    isRepairDialogOpenRef.current = isOpen;
    setIsRepairDialogOpen(isOpen);
  };

  const requestRepair = () => {
    if (!isRepairingRef.current) updateRepairDialog(true);
  };

  const cancelRepair = () => {
    updateRepairDialog(false);
  };

  /**
   * Une seule réparation par confirmation : la demande est consommée avant l'`await`. La garde
   * reste posée après `reloading`, jusqu'à ce que le rechargement emporte la page ; `unreachable`
   * n'a rien supprimé, le joueur peut réessayer.
   */
  const confirmRepair = async () => {
    if (!isRepairDialogOpenRef.current) return;
    updateRepairDialog(false);
    isRepairingRef.current = true;
    setRepairFeedback(null);
    const result = await repairApp();
    if (result === 'unreachable') {
      isRepairingRef.current = false;
      setRepairFeedback({ tone: 'error', text: APPLICATION_TEXTS.repairUnreachable });
    }
  };

  return (
    <>
      <SettingsGroup
        ref={updateGroupRef}
        title={APPLICATION_TEXTS.updateTitle}
        description={APPLICATION_TEXTS.updateDescription}
      >
        {/* Un seul bouton, dont le rôle suit l'état : le focus D-Pad reste dessus quand il change. */}
        <FocusableButton
          ref={actions.getItemRef(0)}
          isFocused={actions.isItemFocused(0)}
          variant={isReady ? 'primary' : 'secondary'}
          className="self-start"
          leftIcon={
            isReady ? <CircleArrowUp className="size-5" /> : <RefreshCw className="size-5" />
          }
          onClick={() => {
            if (isReady) appUpdate.apply();
            else void checkForUpdate();
          }}
          onFocus={onFocusZone}
        >
          {isReady ? APPLICATION_TEXTS.applyAction : APPLICATION_TEXTS.checkAction}
        </FocusableButton>
        <SettingsFeedback message={describeAppUpdate(status, lastCheck, isChecking)} />
      </SettingsGroup>

      <SettingsGroup
        ref={repairGroupRef}
        title={APPLICATION_TEXTS.repairTitle}
        description={APPLICATION_TEXTS.repairDescription}
      >
        <FocusableButton
          ref={actions.getItemRef(1)}
          isFocused={actions.isItemFocused(1)}
          variant="secondary"
          className="self-start"
          leftIcon={<Wrench className="size-5" />}
          onClick={requestRepair}
          onFocus={onFocusZone}
        >
          {APPLICATION_TEXTS.repairAction}
        </FocusableButton>
        <SettingsFeedback message={repairFeedback} />
      </SettingsGroup>

      <ModalDialog
        isOpen={isRepairDialogOpen}
        title={APPLICATION_TEXTS.repairDialogTitle}
        subtitle={APPLICATION_TEXTS.repairDialogSubtitle}
        onClose={cancelRepair}
      >
        <ConfirmActions
          scopeId="settings-repair-confirm"
          confirmLabel={APPLICATION_TEXTS.repairConfirm}
          confirmIcon={<Wrench className="size-5" />}
          onCancel={cancelRepair}
          onConfirm={() => {
            void confirmRepair();
          }}
        />
      </ModalDialog>
    </>
  );
}
