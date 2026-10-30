'use client';

import { useId, type ReactNode, type Ref } from 'react';

export interface SettingsGroupProps {
  ref?: Ref<HTMLDivElement>;
  title: string;
  description: string;
  children: ReactNode;
}

/** Sous-partie d'une section (« Exporter », « Réinitialiser », « Réparer ») : groupe nommé et décrit. */
export function SettingsGroup({ ref, title, description, children }: SettingsGroupProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-fluid-lg font-semibold">
          {title}
        </h3>
        <p id={descriptionId} className="text-fluid-sm text-slate-300">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

export interface SettingsFeedbackMessage {
  /** `success` : action réussie ; `info` : action en cours ; `error` : action refusée ou échouée */
  tone: 'success' | 'info' | 'error';
  text: string;
}

export interface SettingsFeedbackProps {
  message: SettingsFeedbackMessage | null;
}

/**
 * Confirmation ou action en cours (`role="status"`, région persistante pour être annoncée) ou
 * erreur (`role="alert"`), sur une ligne réservée : la mise en page ne saute pas quand un message
 * apparaît.
 */
export function SettingsFeedback({ message }: SettingsFeedbackProps) {
  return (
    <div className="min-h-6 text-fluid-sm font-semibold">
      <p role="status" className={message?.tone === 'info' ? 'text-slate-300' : 'text-emerald-300'}>
        {message && message.tone !== 'error' ? message.text : null}
      </p>
      {message?.tone === 'error' ? (
        <p role="alert" className="text-rose-300">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
