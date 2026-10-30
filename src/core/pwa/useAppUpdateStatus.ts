'use client';

import { appUpdate, type AppUpdateStatus } from '@/core/pwa/appUpdate';
import { useSyncExternalStore } from 'react';

const getServerStatus = (): AppUpdateStatus => 'unsupported';

/** État de la mise à jour (FEAT-20) ; `unsupported` au pré-rendu statique, sans service worker. */
export function useAppUpdateStatus(): AppUpdateStatus {
  return useSyncExternalStore(appUpdate.subscribe, appUpdate.getStatus, getServerStatus);
}
