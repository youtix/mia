'use client';

import { useAndroidBackExit, useGridNavigation } from '@/core/navigation';
import { reloadToHub, repairApp, useAppUpdateStatus } from '@/core/pwa';
import { Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FocusableButton } from './FocusableButton';

/** Textes de l'écran d'erreur global (FEAT-20). */
export const CRASH_SCREEN_TEXTS = {
  title: 'Mia a rencontré un problème',
  note: 'Tes profils et tes étoiles ne sont pas touchés. Recharge Mia pour retrouver tes jeux.',
  reload: 'Recharger',
  repair: 'Réparer l’application',
  repairNote:
    'Si le problème revient, répare l’application : Mia retélécharge ses fichiers. Une connexion est nécessaire.',
  repairUnreachable: 'Réparation impossible : pas de connexion. Réessaie une fois connecté.',
} as const;

/**
 * Écran d'erreur global (FEAT-20), affiché par `global-error` à la place du layout racine : aucune
 * dépendance à la sauvegarde. « Recharger » repart du Hub et suffit le plus souvent ; « Réparer »
 * n'est proposé que là où un service worker existe (ni dans l'APK, ni en développement).
 */
export function CrashScreen() {
  useAndroidBackExit();
  const canRepair = useAppUpdateStatus() !== 'unsupported';
  const [isRepairRefused, setIsRepairRefused] = useState(false);
  // Verrou plutôt que `disabled` : un bouton désactivé ne peut pas garder le focus du D-Pad.
  const isRepairingRef = useRef(false);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const actions = useGridNavigation({ scopeId: 'crash-actions', rows: 1, cols: canRepair ? 2 : 1 });

  // Le moteur ne pose le focus DOM qu'en mode D-Pad ; en mode tactile, le premier appui ne ferait
  // que révéler le curseur. Or le mode TV peut manquer ici : React retire de <html> ses attributs
  // (`data-tv`) quand `global-error` remplace le layout. Avec le focus DOM, ce premier appui agit.
  useEffect(() => {
    buttonsRef.current?.querySelector('button')?.focus();
  }, []);

  /** Une seule réparation à la fois ; le verrou reste posé tant que la page se recharge. */
  const repair = async () => {
    if (isRepairingRef.current) return;
    isRepairingRef.current = true;
    setIsRepairRefused(false);
    if ((await repairApp()) === 'unreachable') {
      isRepairingRef.current = false;
      setIsRepairRefused(true);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 tv-safe-container text-center">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-fluid-2xl font-bold">{CRASH_SCREEN_TEXTS.title}</h1>
        <p className="text-fluid-base text-slate-300">{CRASH_SCREEN_TEXTS.note}</p>
      </div>
      <div ref={buttonsRef} className="flex flex-wrap justify-center gap-3">
        <FocusableButton
          ref={actions.getItemRef(0)}
          isFocused={actions.isItemFocused(0)}
          size="lg"
          onClick={reloadToHub}
        >
          {CRASH_SCREEN_TEXTS.reload}
        </FocusableButton>
        {canRepair ? (
          <FocusableButton
            ref={actions.getItemRef(1)}
            isFocused={actions.isItemFocused(1)}
            variant="secondary"
            size="lg"
            leftIcon={<Wrench className="size-5" />}
            onClick={() => {
              void repair();
            }}
          >
            {CRASH_SCREEN_TEXTS.repair}
          </FocusableButton>
        ) : null}
      </div>
      {canRepair ? (
        <div className="flex max-w-2xl flex-col gap-2 text-fluid-sm">
          <p className="text-slate-300">{CRASH_SCREEN_TEXTS.repairNote}</p>
          {/* Ligne réservée : les boutons ne sautent pas quand le message apparaît. */}
          <div className="min-h-6 font-semibold text-rose-300">
            {isRepairRefused ? <p role="alert">{CRASH_SCREEN_TEXTS.repairUnreachable}</p> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
