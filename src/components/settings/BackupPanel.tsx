'use client';

import type { ZoneRegistry } from '@/components/progression/zone-chain';
import { FocusableButton, ModalDialog } from '@/components/ui';
import {
  FOCUS_TRANSITION_CLASSES,
  FOCUS_VISIBLE_CLASSES,
  FOCUSED_CLASSES,
} from '@/components/ui/focus-styles';
import { useGridNavigation, useNavigation, type Direction } from '@/core/navigation';
import { parseBackupJson, useMiaStorage } from '@/core/storage';
import { cn } from '@/lib/cn';
import { Capacitor } from '@capacitor/core';
import { Copy, Download, FolderOpen, Save, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { ConfirmActions } from './ConfirmActions';
import {
  BACKUP_MESSAGES,
  describeBackupProfiles,
  describeDownload,
  getBackupFileName,
} from './labels';
import { SettingsFeedback, SettingsGroup, type SettingsFeedbackMessage } from './SettingsGroup';
import { SettingsSection } from './SettingsSection';

/** Délai avant de révoquer l'URL du Blob téléchargé : certains navigateurs le lisent après le clic. */
export const EXPORT_URL_REVOKE_DELAY_MS = 1_000;

/** Zones D-Pad du panneau, de haut en bas. */
type BackupZone = 'export' | 'file' | 'paste' | 'reset';

const BACKUP_ZONES: readonly BackupZone[] = ['export', 'file', 'paste', 'reset'];

/** Sauvegarde lue (fichier ou collage) et validée, en attente de confirmation. */
interface PendingImport {
  json: string;
  profileCount: number;
}

/** Réinitialisation : 0 fermée, 1 première confirmation, 2 confirmation finale. */
type ResetStep = 0 | 1 | 2;

/** `navigator.clipboard` manque hors contexte sécurisé (http) et dans certaines WebView. */
type ClipboardApi = Partial<Pick<Clipboard, 'writeText'>>;

const INPUT_CLASSES =
  'relative min-h-12 w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-4 text-fluid-base text-slate-50 placeholder:text-slate-400 tv:min-h-14';

/** Téléchargement Web : lien `download` sur un Blob (sans effet dans la WebView de l'APK). */
function downloadJson(json: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, EXPORT_URL_REVOKE_DELAY_MS);
}

/** Copie dans le presse-papiers (voie de l'APK et de la TV) ; `false` si l'API manque ou refuse. */
async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard as ClipboardApi | undefined;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface BackupPanelProps {
  /** Le panneau reçoit les touches (une seule zone active par écran) */
  isActive: boolean;
  /** Inscription auprès de l'écran : `enter('backup', …)` place le curseur à l'arrivée */
  register: ZoneRegistry<'backup'>['register'];
  /** Haut bloqué en haut du panneau : l'écran repasse au réglage précédent */
  onExitUp: () => void;
  /** Bas bloqué en bas du panneau : l'écran passe à la zone suivante ; absent, le curseur reste là */
  onExitDown?: () => void;
  /** Un élément du panneau reçoit le focus DOM (Tab, clic) : activer le panneau */
  onFocusZone: () => void;
  /** Retour (Échap, Retour arrière, bouton Android) */
  onBack: () => void;
  /** Réinitialisation effectuée : retour au Hub, qui recrée « Joueur 1 » */
  onReset: () => void;
}

/**
 * Section « Sauvegarde » : export (fichier sur le Web, presse-papiers partout), import (fichier ou
 * collage, confirmé avant de remplacer les profils) et réinitialisation (double confirmation).
 * L'import conserve les réglages de l'appareil (contrat FEAT-05).
 */
export function BackupPanel({
  isActive,
  register,
  onExitUp,
  onExitDown,
  onFocusZone,
  onBack,
  onReset,
}: BackupPanelProps) {
  const { exportBackup, importBackup, resetAllData } = useMiaStorage();
  const { inputMode } = useNavigation();
  // Dans l'APK, <a download> ne fait rien dans la WebView : seule la copie est proposée.
  const isNative = Capacitor.isNativePlatform();
  const exportCount = isNative ? 1 : 2;
  const copyIndex = exportCount - 1;
  const [zone, setZone] = useState<BackupZone>('export');
  const [exportFeedback, setExportFeedback] = useState<SettingsFeedbackMessage | null>(null);
  const [importFeedback, setImportFeedback] = useState<SettingsFeedbackMessage | null>(null);
  const [pasted, setPasted] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  // Même valeur, lue par « Remplacer » : la modale fermée garde ses boutons (et leurs anciennes
  // props) le temps de l'animation de sortie, un second appui ne doit pas importer deux fois.
  const pendingImportRef = useRef<PendingImport | null>(null);
  const [resetStep, setResetStep] = useState<ResetStep>(0);
  // Même doublon pour la réinitialisation, lu par « Tout effacer définitivement ».
  const resetStepRef = useRef<ResetStep>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteId = useId();

  const zoneOptions = (name: BackupZone) => ({
    isActive: isActive && zone === name,
    onBack,
    onEdge: (direction: Direction) => {
      moveFrom(name, direction);
    },
  });
  const exportZone = useGridNavigation({
    scopeId: 'settings-export',
    rows: 1,
    cols: exportCount,
    ...zoneOptions('export'),
  });
  const fileZone = useGridNavigation({
    scopeId: 'settings-import-file',
    rows: 1,
    cols: 1,
    ...zoneOptions('file'),
  });
  // Champ puis bouton « Importer » en colonne : Haut / Bas sortent d'un champ d'une ligne (FEAT-04).
  const pasteZone = useGridNavigation({
    scopeId: 'settings-import-paste',
    rows: 2,
    cols: 1,
    ...zoneOptions('paste'),
  });
  const resetZone = useGridNavigation({
    scopeId: 'settings-reset',
    rows: 1,
    cols: 1,
    ...zoneOptions('reset'),
  });

  /** Zone voisine ; le collage s'aborde par le champ en descendant, par « Importer » en remontant. */
  const moveFrom = (from: BackupZone, direction: Direction) => {
    if (direction !== 'up' && direction !== 'down') return;
    const index = BACKUP_ZONES.indexOf(from);
    const next = BACKUP_ZONES[direction === 'down' ? index + 1 : index - 1];
    if (!next) {
      if (direction === 'up') onExitUp();
      else onExitDown?.();
      return;
    }
    if (next === 'paste') pasteZone.setFocusedIndex(direction === 'down' ? 0 : 1);
    setZone(next);
  };

  // Arrivée par le bas (`last`, depuis la section « Application ») : « Tout effacer ». Toute autre
  // arrivée vient du haut (réglages au-dessus du panneau) : premier bouton d'export.
  const { setFocusedIndex: setExportIndex } = exportZone;
  useEffect(
    () =>
      register('backup', {
        enter: (entry) => {
          if (entry.kind === 'last') {
            setZone('reset');
            return;
          }
          setExportIndex(0);
          setZone('export');
        },
      }),
    [register, setExportIndex],
  );

  const focusZone = (name: BackupZone) => () => {
    onFocusZone();
    setZone(name);
  };

  const download = () => {
    const fileName = getBackupFileName();
    downloadJson(exportBackup(), fileName);
    setExportFeedback({ tone: 'success', text: describeDownload(fileName) });
  };

  const copy = async () => {
    const copied = await copyToClipboard(exportBackup());
    setExportFeedback(
      copied
        ? { tone: 'success', text: BACKUP_MESSAGES.copied }
        : { tone: 'error', text: BACKUP_MESSAGES.clipboardUnavailable },
    );
  };

  const updatePendingImport = (value: PendingImport | null) => {
    pendingImportRef.current = value;
    setPendingImport(value);
  };

  /** Valide la sauvegarde avant de demander confirmation : un fichier inutilisable est refusé aussitôt. */
  const requestImport = (json: string) => {
    const result = parseBackupJson(json);
    if (!result.ok) {
      setImportFeedback({ tone: 'error', text: result.message });
      return;
    }
    setImportFeedback(null);
    updatePendingImport({ json, profileCount: result.state.profiles.length });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Le même fichier doit pouvoir être choisi de nouveau (ex: après une annulation).
    input.value = '';
    if (!file) return;
    try {
      requestImport(await file.text());
    } catch {
      setImportFeedback({ tone: 'error', text: BACKUP_MESSAGES.fileUnreadable });
    }
  };

  const importPasted = () => {
    if (pasted.trim() === '') {
      setImportFeedback({ tone: 'error', text: BACKUP_MESSAGES.pasteEmpty });
      return;
    }
    requestImport(pasted);
  };

  const handlePasteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Au doigt, Entrée (touche « OK » du clavier virtuel) lance l'import ; au D-Pad elle reste
    // native (sur Android TV, OK sur le champ ouvre le clavier virtuel).
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || inputMode !== 'touch') return;
    event.preventDefault();
    importPasted();
  };

  /** Un seul import par confirmation : la sauvegarde en attente est consommée avant l'`await`. */
  const confirmImport = async () => {
    const pending = pendingImportRef.current;
    if (!pending) return;
    updatePendingImport(null);
    const result = await importBackup(pending.json);
    if (result.ok) {
      setPasted('');
      setImportFeedback({ tone: 'success', text: BACKUP_MESSAGES.restored });
    } else {
      setImportFeedback({ tone: 'error', text: result.message });
    }
  };

  const updateResetStep = (step: ResetStep) => {
    resetStepRef.current = step;
    setResetStep(step);
  };

  const cancelReset = () => {
    updateResetStep(0);
  };

  /**
   * Une seule réinitialisation, et un seul retour au Hub, par confirmation : l'étape est consommée
   * avant l'`await` (un second `backToHub` dépilerait l'historique au-delà du Hub).
   */
  const confirmReset = async () => {
    if (resetStepRef.current !== 2) return;
    updateResetStep(0);
    await resetAllData();
    onReset();
  };

  return (
    <SettingsSection title="Sauvegarde" icon={<Save className="size-7" />}>
      <SettingsGroup
        title="Exporter"
        description="Garde une copie des profils et de leurs étoiles, avant une réinstallation ou pour passer de la tablette à la TV."
      >
        <div className="flex flex-wrap gap-3">
          {isNative ? null : (
            <FocusableButton
              ref={exportZone.getItemRef(0)}
              isFocused={exportZone.isItemFocused(0)}
              leftIcon={<Download className="size-5" />}
              onClick={download}
              onFocus={focusZone('export')}
            >
              Télécharger le fichier
            </FocusableButton>
          )}
          <FocusableButton
            ref={exportZone.getItemRef(copyIndex)}
            isFocused={exportZone.isItemFocused(copyIndex)}
            variant={isNative ? 'primary' : 'secondary'}
            leftIcon={<Copy className="size-5" />}
            onClick={() => {
              void copy();
            }}
            onFocus={focusZone('export')}
          >
            Copier
          </FocusableButton>
        </div>
        <SettingsFeedback message={exportFeedback} />
      </SettingsGroup>

      <SettingsGroup
        title="Importer"
        description="Restaure une sauvegarde exportée : les profils actuels seront remplacés, les réglages de l’appareil conservés."
      >
        <FocusableButton
          ref={fileZone.getItemRef(0)}
          isFocused={fileZone.isItemFocused(0)}
          variant="secondary"
          className="self-start"
          leftIcon={<FolderOpen className="size-5" />}
          onClick={() => {
            fileInputRef.current?.click();
          }}
          onFocus={focusZone('file')}
        >
          Choisir un fichier
        </FocusableButton>
        {/* Sélecteur natif, masqué visuellement : le bouton ci-dessus le déclenche. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          aria-label="Fichier de sauvegarde"
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            void handleFileChange(event);
          }}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={pasteId} className="text-fluid-base font-semibold text-slate-200">
            Coller une sauvegarde
          </label>
          {/* Champ d'une ligne plutôt que textarea : au D-Pad, Haut / Bas en sortent ; les retours
              à la ligne du JSON collé sont retirés sans le casser. */}
          <input
            ref={pasteZone.getItemRef(0)}
            id={pasteId}
            type="text"
            value={pasted}
            placeholder="Contenu du fichier de sauvegarde"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            data-focused={pasteZone.isItemFocused(0) || undefined}
            className={cn(
              INPUT_CLASSES,
              FOCUS_TRANSITION_CLASSES,
              FOCUS_VISIBLE_CLASSES,
              pasteZone.isItemFocused(0) && FOCUSED_CLASSES,
            )}
            onChange={(event) => {
              setPasted(event.target.value);
            }}
            onFocus={focusZone('paste')}
            onKeyDown={handlePasteKeyDown}
          />
          <FocusableButton
            ref={pasteZone.getItemRef(1)}
            isFocused={pasteZone.isItemFocused(1)}
            variant="secondary"
            className="self-start"
            leftIcon={<Upload className="size-5" />}
            onClick={importPasted}
            onFocus={focusZone('paste')}
          >
            Importer
          </FocusableButton>
        </div>
        <SettingsFeedback message={importFeedback} />
      </SettingsGroup>

      <SettingsGroup
        title="Réinitialiser"
        description="Efface tous les profils, leurs étoiles et les réglages de cet appareil."
      >
        <FocusableButton
          ref={resetZone.getItemRef(0)}
          isFocused={resetZone.isItemFocused(0)}
          variant="danger"
          className="self-start"
          leftIcon={<Trash2 className="size-5" />}
          onClick={() => {
            updateResetStep(1);
          }}
          onFocus={focusZone('reset')}
        >
          Tout effacer
        </FocusableButton>
      </SettingsGroup>

      <ModalDialog
        isOpen={pendingImport !== null}
        title="Remplacer les profils actuels ?"
        subtitle={
          pendingImport
            ? `${describeBackupProfiles(pendingImport.profileCount)} Les profils et les étoiles de cet appareil seront remplacés, les réglages conservés. Exporte d’abord ta progression si tu veux la garder.`
            : undefined
        }
        onClose={() => {
          updatePendingImport(null);
        }}
      >
        {pendingImport ? (
          <ConfirmActions
            scopeId="settings-import-confirm"
            confirmLabel="Remplacer"
            confirmIcon={<Upload className="size-5" />}
            onCancel={() => {
              updatePendingImport(null);
            }}
            onConfirm={() => {
              void confirmImport();
            }}
          />
        ) : null}
      </ModalDialog>

      {/* Double confirmation : la seconde modale s'empile sur la première (couches FEAT-04) ;
          Annuler, Retour ou Échap à l'une ou l'autre abandonne tout. */}
      <ModalDialog
        isOpen={resetStep > 0}
        title="Réinitialiser Mia ?"
        subtitle="Tous les profils, leurs étoiles et les réglages de cet appareil seront effacés. Exporte d’abord ta progression si tu veux la garder."
        onClose={cancelReset}
      >
        <ConfirmActions
          scopeId="settings-reset-confirm"
          confirmLabel="Continuer"
          onCancel={cancelReset}
          onConfirm={() => {
            updateResetStep(2);
          }}
        />
        <ModalDialog
          isOpen={resetStep === 2}
          title="Tout effacer définitivement ?"
          onClose={cancelReset}
          className="border-rose-400"
        >
          <p className="flex items-center justify-center gap-2 text-center text-fluid-base font-semibold text-rose-300">
            <TriangleAlert aria-hidden="true" className="size-6 shrink-0" />
            Cette action est irréversible : profils, étoiles et réglages seront perdus.
          </p>
          <ConfirmActions
            scopeId="settings-reset-final"
            confirmLabel="Tout effacer définitivement"
            confirmVariant="danger"
            confirmIcon={<Trash2 className="size-5" />}
            onCancel={cancelReset}
            onConfirm={() => {
              void confirmReset();
            }}
          />
        </ModalDialog>
      </ModalDialog>
    </SettingsSection>
  );
}
