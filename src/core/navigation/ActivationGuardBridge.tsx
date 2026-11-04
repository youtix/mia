'use client';

import { useEffect } from 'react';
import { installActivationGuard } from './activation-guard';

/** Garde d'activation de l'application (FEAT-04 §5). Monté une fois dans le layout racine ; ne rend rien. */
export function ActivationGuardBridge(): null {
  useEffect(() => installActivationGuard(), []);
  return null;
}
