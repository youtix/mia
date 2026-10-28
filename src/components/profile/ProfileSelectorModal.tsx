'use client';

import { FocusableButton, FocusableCard, ModalDialog, StarBadge } from '@/components/ui';
import { useGridColumns, useGridNavigation, useNavigation } from '@/core/navigation';
import {
  canAddProfile,
  countProfileStars,
  deleteProfile,
  PROFILE_LIMIT_MESSAGE,
  setActiveProfile,
  useMiaStorage,
} from '@/core/storage';
import type { UserProfile } from '@/types/mia';
import { Check, Plus, Trash2, UserCog } from 'lucide-react';
import { useId, useState } from 'react';
import { AvatarBadge } from './AvatarBadge';
import { DeleteProfileModal } from './DeleteProfileModal';
import { NewProfileModal } from './NewProfileModal';

export interface ProfileSelectorModalProps {
  isOpen: boolean;
  /**
   * Fermeture sans changer de joueur (Échap, Retour, ✕, fond), appelée aussi après un choix ou une
   * création. Absent : choix imposé (`useProfileGate().mustChooseProfile`), ni ✕ ni Échap ; la
   * modale se ferme quand le parent repasse `isOpen` à `false`.
   */
  onClose?: () => void;
}

/** `choose` : changer de joueur ; `manage` : sélectionner le profil à supprimer. */
type SelectorMode = 'choose' | 'manage';

const MODE_TEXTS: Record<SelectorMode, { title: string; subtitle: string }> = {
  choose: { title: 'Qui joue aujourd’hui ?', subtitle: 'Chaque joueur suit ses propres étoiles.' },
  manage: { title: 'Gérer les profils', subtitle: 'Sélectionner le profil à supprimer.' },
};

/**
 * « Qui joue aujourd'hui ? » : grille des profils (avatar, prénom, étoiles), création rapide et
 * suppression, au doigt comme à la télécommande. À monter sous `StorageProvider` et
 * `NavigationProvider`, une fois la sauvegarde chargée.
 */
export function ProfileSelectorModal({ isOpen, onClose }: ProfileSelectorModalProps) {
  const [mode, setMode] = useState<SelectorMode>('choose');
  const [wasOpen, setWasOpen] = useState(isOpen);
  // Chaque ouverture repart du choix du joueur (état ajusté pendant le rendu, sans effet).
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setMode('choose');
  }
  const isManaging = mode === 'manage';
  const { title, subtitle } = MODE_TEXTS[mode];

  return (
    <ModalDialog
      isOpen={isOpen}
      title={title}
      subtitle={subtitle}
      // En mode gestion, Retour, Échap, ✕ et le fond reviennent au choix du joueur.
      onClose={
        isManaging
          ? () => {
              setMode('choose');
            }
          : onClose
      }
      className="max-w-2xl tv:max-w-4xl"
    >
      <ProfileChooser isManaging={isManaging} onModeChange={setMode} onClose={onClose} />
    </ModalDialog>
  );
}

/** Zones D-Pad de la modale : la grille des profils, puis le bouton de gestion. */
type ChooserZone = 'cards' | 'footer';

interface ProfileChooserProps {
  isManaging: boolean;
  onModeChange: (mode: SelectorMode) => void;
  onClose?: () => void;
}

/** Contenu de la modale : ses zones D-Pad s'empilent au-dessus de l'écran (FEAT-04 §5). */
function ProfileChooser({ isManaging, onModeChange, onClose }: ProfileChooserProps) {
  const { state, updateState } = useMiaStorage();
  const { inputMode } = useNavigation();
  const { profiles, activeProfileId } = state;
  const canAdd = canAddProfile(state);
  const showNewCard = canAdd && !isManaging;
  const cardCount = profiles.length + (showNewCard ? 1 : 0);
  const [zone, setZone] = useState<ChooserZone>('cards');
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<UserProfile | null>(null);
  const [gridRef, cols] = useGridColumns<HTMLDivElement>(2);
  const footerId = useId();

  const cards = useGridNavigation({
    scopeId: 'profile-cards',
    rows: Math.ceil(cardCount / cols),
    cols,
    totalItems: cardCount,
    initialIndex: Math.max(
      profiles.findIndex((profile) => profile.id === activeProfileId),
      0,
    ),
    isActive: zone === 'cards',
    onEdge: (direction) => {
      if (direction === 'down') setZone('footer');
    },
  });
  const footer = useGridNavigation({
    scopeId: 'profile-footer',
    rows: 1,
    cols: 1,
    isActive: zone === 'footer',
    onEdge: (direction) => {
      if (direction === 'up') setZone('cards');
    },
  });

  const chooseProfile = (profileId: string) => {
    void updateState((prev) => setActiveProfile(prev, profileId));
    onClose?.();
  };

  const confirmDeletion = (profileId: string) => {
    void updateState((prev) => deleteProfile(prev, profileId));
    setPendingDeletion(null);
    // La carte supprimée ne peut plus recevoir le focus rendu par la confirmation : au doigt, il
    // passe à « Terminé » plutôt qu'à <body> (au D-Pad, le curseur de la grille le reprend).
    if (inputMode === 'touch') document.getElementById(footerId)?.focus();
  };

  return (
    <>
      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 md:gap-4"
      >
        {profiles.map((profile, index) => (
          <FocusableCard
            key={profile.id}
            ref={cards.getItemRef(index)}
            isFocused={cards.isItemFocused(index)}
            isActive={profile.id === activeProfileId}
            className="items-center p-3 text-center md:p-4"
            onSelect={() => {
              if (isManaging) setPendingDeletion(profile);
              else chooseProfile(profile.id);
            }}
            onFocus={() => {
              setZone('cards');
            }}
          >
            <AvatarBadge avatarId={profile.avatarId} size="lg" />
            {/* Espaces : séparateurs du nom accessible (« Supprimer Mia 2 étoiles »), sans effet
                dans le flex. */}
            {isManaging ? (
              <>
                <span className="sr-only">Supprimer</span>{' '}
              </>
            ) : null}
            <span className="w-full truncate text-fluid-lg font-semibold">{profile.name}</span>{' '}
            <StarBadge earned={countProfileStars(profile)} size="sm" />
            {isManaging ? (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-rose-400 text-slate-950"
              >
                <Trash2 className="size-4" />
              </span>
            ) : null}
          </FocusableCard>
        ))}
        {showNewCard ? (
          <FocusableCard
            ref={cards.getItemRef(profiles.length)}
            isFocused={cards.isItemFocused(profiles.length)}
            className="items-center justify-center border-dashed p-3 text-center md:p-4"
            onSelect={() => {
              setIsCreating(true);
            }}
            onFocus={() => {
              setZone('cards');
            }}
          >
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-slate-500 text-slate-300"
            >
              <Plus className="size-8" />
            </span>
            <span className="text-fluid-lg font-semibold">Nouveau joueur</span>
          </FocusableCard>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-3">
        {!canAdd && !isManaging ? (
          <p className="text-center text-fluid-sm text-slate-300">{PROFILE_LIMIT_MESSAGE}</p>
        ) : null}
        <FocusableButton
          ref={footer.getItemRef(0)}
          id={footerId}
          isFocused={footer.isItemFocused(0)}
          variant={isManaging ? 'primary' : 'secondary'}
          leftIcon={isManaging ? <Check className="size-5" /> : <UserCog className="size-5" />}
          onClick={() => {
            onModeChange(isManaging ? 'choose' : 'manage');
          }}
          onFocus={() => {
            setZone('footer');
          }}
        >
          {isManaging ? 'Terminé' : 'Gérer les profils'}
        </FocusableButton>
      </div>

      <NewProfileModal
        isOpen={isCreating}
        onClose={() => {
          setIsCreating(false);
        }}
        onCreated={() => {
          setIsCreating(false);
          onClose?.();
        }}
      />
      <DeleteProfileModal
        profile={pendingDeletion}
        isLastProfile={profiles.length === 1}
        onCancel={() => {
          setPendingDeletion(null);
        }}
        onConfirm={confirmDeletion}
      />
    </>
  );
}
