/** Recharge la page. Isolé pour être simulé dans les tests : jsdom n'implémente pas la navigation. */
export function reloadPage(): void {
  window.location.reload();
}

/**
 * Recharge Mia sur le Hub, à la place de la page courante : un plantage propre à une route ne revient
 * pas, et Retour n'y ramène pas. Sans barre d'adresse (PWA installée), ce serait sinon sans issue.
 */
export function reloadToHub(): void {
  window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`);
}
