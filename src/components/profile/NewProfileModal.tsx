'use client';

import { FocusableButton, ModalDialog } from '@/components/ui';
import {
  FOCUS_TRANSITION_CLASSES,
  FOCUS_VISIBLE_CLASSES,
  FOCUSED_CLASSES,
} from '@/components/ui/focus-styles';
import { useGridColumns, useGridNavigation, useNavigation } from '@/core/navigation';
import {
  addProfile,
  AVATARS,
  canAddProfile,
  checkProfileName,
  getAvailableQuickNames,
  getProfileNameKey,
  MAX_PROFILE_NAME_LENGTH,
  PROFILE_LIMIT_MESSAGE,
  suggestAvatarId,
  useMiaStorage,
  type AvatarId,
} from '@/core/storage';
import { cn } from '@/lib/cn';
import { Check, UserPlus } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { AvatarBadge } from './AvatarBadge';

export interface NewProfileModalProps {
  isOpen: boolean;
  /** Abandon : Annuler, Retour, Échap, ✕ ou fond */
  onClose: () => void;
  /** Profil créé et rendu actif */
  onCreated: () => void;
}

/** Formulaire de création rapide, couche imbriquée au-dessus du choix du joueur. */
export function NewProfileModal({ isOpen, onClose, onCreated }: NewProfileModalProps) {
  return (
    <ModalDialog
      isOpen={isOpen}
      title="Nouveau joueur"
      onClose={onClose}
      className="max-w-2xl tv:max-w-3xl"
    >
      <NewProfileForm onCancel={onClose} onCreated={onCreated} />
    </ModalDialog>
  );
}

/** Zones D-Pad du formulaire, de haut en bas. */
type FormZone = 'name' | 'quick' | 'avatars' | 'actions';

interface NewProfileFormProps {
  onCancel: () => void;
  onCreated: () => void;
}

const LEGEND_CLASSES = 'mb-2 text-fluid-base font-semibold text-slate-200';

/**
 * Prénom (champ libre ou prénom rapide en un clic), avatar, puis Créer. Le champ est en haut et le
 * curseur part du premier prénom rapide : au D-Pad, on ne traverse jamais le champ par mégarde (sur
 * Android TV, y placer le focus peut ouvrir le clavier virtuel).
 */
function NewProfileForm({ onCancel, onCreated }: NewProfileFormProps) {
  const { state, updateState } = useMiaStorage();
  const { inputMode } = useNavigation();
  const quickNames = getAvailableQuickNames(state.profiles);
  const hasQuickNames = quickNames.length > 0;
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<AvatarId>(() => suggestAvatarId(state.profiles));
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<FormZone>(hasQuickNames ? 'quick' : 'name');
  const nameId = useId();
  const errorId = useId();
  const createId = useId();
  const [quickGridRef, quickCols] = useGridColumns<HTMLDivElement>(2);
  const [avatarGridRef, avatarCols] = useGridColumns<HTMLDivElement>(4);
  const nameKey = getProfileNameKey(name);

  const nameField = useGridNavigation({
    scopeId: 'new-profile-name',
    rows: 1,
    cols: 1,
    isActive: zone === 'name',
    onEdge: (direction) => {
      if (direction === 'down') setZone(hasQuickNames ? 'quick' : 'avatars');
    },
  });
  const quick = useGridNavigation({
    scopeId: 'new-profile-quick-names',
    rows: Math.ceil(quickNames.length / quickCols),
    cols: quickCols,
    totalItems: quickNames.length,
    isActive: zone === 'quick',
    onEdge: (direction) => {
      if (direction === 'up') setZone('name');
      else if (direction === 'down') setZone('avatars');
    },
  });
  const avatars = useGridNavigation({
    scopeId: 'new-profile-avatars',
    rows: Math.ceil(AVATARS.length / avatarCols),
    cols: avatarCols,
    totalItems: AVATARS.length,
    initialIndex: AVATARS.findIndex((avatar) => avatar.id === avatarId),
    isActive: zone === 'avatars',
    onEdge: (direction) => {
      if (direction === 'up') setZone(hasQuickNames ? 'quick' : 'name');
      else if (direction === 'down') setZone('actions');
    },
  });
  const actions = useGridNavigation({
    scopeId: 'new-profile-actions',
    rows: 1,
    cols: 2,
    initialIndex: 1,
    isActive: zone === 'actions',
    onEdge: (direction) => {
      if (direction === 'up') setZone('avatars');
    },
  });

  const changeName = (value: string) => {
    setName(value);
    setError(null);
  };

  const create = () => {
    if (!canAddProfile(state)) {
      setError(PROFILE_LIMIT_MESSAGE);
      return;
    }
    const check = checkProfileName(state.profiles, name);
    if (!check.ok) {
      setError(check.message);
      setZone(check.reason === 'empty' && hasQuickNames ? 'quick' : 'name');
      return;
    }
    void updateState((prev) => addProfile(prev, check.name, avatarId));
    onCreated();
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Au doigt ou à la souris, Entrée (touche « OK » du clavier virtuel) passe au bouton Créer et
    // referme le clavier. Au D-Pad, elle reste native : sur Android TV, elle ouvre le clavier.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || inputMode !== 'touch') return;
    event.preventDefault();
    setZone('actions');
    document.getElementById(createId)?.focus();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-fluid-base font-semibold text-slate-200">
          Prénom
        </label>
        <input
          ref={nameField.getItemRef(0)}
          id={nameId}
          type="text"
          value={name}
          placeholder="Écrire un prénom"
          maxLength={MAX_PROFILE_NAME_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-focused={nameField.isItemFocused(0) || undefined}
          className={cn(
            'relative min-h-12 w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-4 text-fluid-lg text-slate-50 placeholder:text-slate-400 tv:min-h-14',
            FOCUS_TRANSITION_CLASSES,
            FOCUS_VISIBLE_CLASSES,
            error && 'border-rose-400',
            nameField.isItemFocused(0) && FOCUSED_CLASSES,
          )}
          onChange={(event) => {
            changeName(event.target.value);
          }}
          onFocus={() => {
            setZone('name');
          }}
          onKeyDown={handleNameKeyDown}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-fluid-sm font-semibold text-rose-300">
            {error}
          </p>
        ) : null}
      </div>

      {hasQuickNames ? (
        <fieldset className="min-w-0">
          <legend className={LEGEND_CLASSES}>Prénoms rapides</legend>
          <div
            ref={quickGridRef}
            className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 md:gap-3"
          >
            {quickNames.map((quickName, index) => {
              const isChosen = getProfileNameKey(quickName) === nameKey;
              return (
                <FocusableButton
                  key={quickName}
                  ref={quick.getItemRef(index)}
                  isFocused={quick.isItemFocused(index)}
                  variant={isChosen ? 'primary' : 'secondary'}
                  aria-pressed={isChosen}
                  onClick={() => {
                    changeName(quickName);
                    // Étape suivante au D-Pad : l'avatar (déjà proposé), puis Bas → Créer.
                    setZone('avatars');
                  }}
                  onFocus={() => {
                    setZone('quick');
                  }}
                >
                  {quickName}
                </FocusableButton>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="min-w-0">
        <legend className={LEGEND_CLASSES}>Avatar</legend>
        <div ref={avatarGridRef} className="grid grid-cols-4 gap-2 md:grid-cols-8 md:gap-3">
          {AVATARS.map((avatar, index) => {
            const isChosen = avatar.id === avatarId;
            return (
              <FocusableButton
                key={avatar.id}
                ref={avatars.getItemRef(index)}
                isFocused={avatars.isItemFocused(index)}
                variant="ghost"
                aria-label={avatar.label}
                aria-pressed={isChosen}
                className={cn(
                  'h-auto rounded-2xl border-2 border-transparent p-1.5 md:p-2',
                  isChosen && 'border-emerald-400 bg-emerald-950/40 hover:bg-emerald-950/60',
                )}
                onClick={() => {
                  setAvatarId(avatar.id);
                }}
                onFocus={() => {
                  setZone('avatars');
                }}
              >
                <AvatarBadge avatarId={avatar.id} size="md" />
                {isChosen ? (
                  // Indice non coloré du choix (daltonisme), comme l'état actif de FocusableCard.
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full bg-emerald-400 text-slate-950"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                ) : null}
              </FocusableButton>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-3">
        <FocusableButton
          ref={actions.getItemRef(0)}
          isFocused={actions.isItemFocused(0)}
          variant="secondary"
          size="lg"
          onClick={onCancel}
          onFocus={() => {
            setZone('actions');
          }}
        >
          Annuler
        </FocusableButton>
        <FocusableButton
          ref={actions.getItemRef(1)}
          id={createId}
          isFocused={actions.isItemFocused(1)}
          size="lg"
          leftIcon={<UserPlus className="size-5" />}
          onClick={create}
          onFocus={() => {
            setZone('actions');
          }}
        >
          Créer
        </FocusableButton>
      </div>
    </div>
  );
}
