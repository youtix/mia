# FEAT-24 : Jeu n°4 (Attrape-Piège) — Interface, Glisser-Déposer Permissif, Télécommande, Mécanisme STOP & Échelle d'Indices

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-24`
> **Dépendances** : [FEAT-03](./FEAT-03.md), [FEAT-04](./FEAT-04.md), [FEAT-08](./FEAT-08.md), [FEAT-22](./FEAT-22.md), [FEAT-23](./FEAT-23.md)
> **Statut** : cadrée et implémentée ; les décisions prises pendant la session de cadrage sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage). Rythme et compréhension restent à éprouver avec de vrais enfants ([§6, « Non vérifié »](#6-décisions-dimplémentation-session-de-cadrage)).

---

## 1. Contexte & Objectif pour l'IA

Le moteur d'Attrape-Piège ([FEAT-23](./FEAT-23.md)) et sa voix ([FEAT-22](./FEAT-22.md)) sont prêts. L'objectif de cette **FEAT-24** est le plateau de jeu dans `src/games/bear-sort/components/`, pour des enfants de 3 à 6 ans qui ne lisent pas encore, avec une exigence simple : **aucun texte visible du début d'une étoile à sa fin**, et une double ergonomie comme tous les jeux de Mia :

1. **Au doigt (ou à la souris)** : un glisser-déposer permissif, ou toucher l'ours puis la boîte (la voie de TalkBack et du clavier).
2. **À la télécommande** : **un appui par ours**. L'ours suivant est mis en évidence automatiquement, une flèche l'envoie dans la boîte de ce côté, assez vite pour installer un réflexe.
3. **Le mécanisme STOP** : un voile, un panneau à attente forcée, l'image de la nouvelle règle, et c'est l'enfant qui repart en touchant le panneau ; la voix dit alors cette règle.
4. **Une échelle d'indices à trois échelons**, sur les rebonds d'affilée, qui finit toujours par une réussite.

**Mia exerce, elle ne soigne pas** : ces mécanismes servent le jeu, aucun effet clinique ou thérapeutique n'est revendiqué.

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── components/
│   └── ui/
│       ├── AppShell.tsx               # isTextless (FEAT-21) : titre et « Retour » réservés aux lecteurs d'écran
│       └── ModalDialog.tsx            # isTextless (FEAT-21) : titres réservés aux lecteurs d'écran
└── games/
    └── bear-sort/
        ├── labels.ts                  # Noms vocalisés : getBearLabel(), getBoxLabel(), getRuleLabel()
        ├── index.ts                   # Exporter les composants et les constantes de temps
        └── components/
            ├── BearSortBoard.tsx      # Plateau : moteur, gestes, télécommande, voix, indices, STOP, victoire
            ├── BearSortEndScreen.tsx  # Fin de partie sans texte : étoile, couronne, boutons-icônes
            ├── StopOverlay.tsx        # Voile du STOP : panneau à attente forcée, image de la règle suivante
            ├── useBearDrag.ts         # Glissement (Pointer Events), tap laissé au clic, TAP_SLOP_PX
            ├── drop-zones.ts          # findDropZone(), DROP_TOLERANCE_PX (fonction pure)
            ├── useMascotSpeech.ts     # Voix et mime de la mascotte, MIN_MIME_MS
            ├── useTransient.ts        # Valeur éphémère : ours qui remue, boîte qui pulse
            ├── art-tokens.ts          # Palettes (bleu, jaune, gris neutre, aucun rouge), halo, battement
            ├── BearFigure.tsx         # Ours dessiné, couleur ou taille estompée
            ├── BearBox.tsx            # Caisse dessinée, estompage, halo de la bonne boîte
            ├── OwlMascot.tsx          # Chouette violette : idle, talking, happy, no
            ├── RulePicture.tsx        # Image de la règle : gouttes, petit et grand ours, ours dans le signe « non »
            ├── NoBadge.tsx            # Signe « non » gris
            ├── StopSign.tsx           # Panneau rouge, lettres tracées
            ├── StarAward.tsx          # Grande étoile, couronne si elle est gagnée
            ├── GestureHand.tsx        # Main qui montre le geste à la première étoile
            └── index.ts
tests/
├── bear-sort-board.test.tsx           # Plateau : gestes, télécommande, STOP, échelle d'indices, fin de partie
└── bear-sort-art.test.tsx             # Dessins : sortes d'ours, estompage, humeurs, rouge réservé au STOP
```

---

## 3. Spécifications Fonctionnelles & UX Détaillées

> Les décisions de la session de cadrage ([§6](#6-décisions-dimplémentation-session-de-cadrage)) donnent les motivations de ces spécifications et les alternatives écartées.

### 3.1. Un écran sans texte

* **En-tête** : `AppShell` avec `isTextless` ([FEAT-21](./FEAT-21.md)) : le titre (« Étoile #N ») et « Retour » restent pour les lecteurs d'écran, le bouton Retour se réduit à son icône. Aucune aide de télécommande en pied d'écran (`footerHints` absent).
* **Pendant la partie** : aucun compteur, aucun libellé. Seules les lettres du panneau STOP sont visibles, et elles sont tracées comme un dessin (aucune police requise).
* **Fin de partie** : image seule ([§3.8](#38-fin-détoile-bearsortendscreentsx)).
* **Lecteurs d'écran** : tout reste nommé (`labels.ts`, région `role="status"`, [§3.9](#39-accessibilité)). Le Hub et la Carte des Étoiles ne changent pas.

### 3.2. Plateau (`BearSortBoard.tsx`)

`BearSortBoard({ level, controls })` : `EnrichedLevelItem<BearSortLevelConfig>` et `LevelControls<BearSortLevelConfig>` de `GameScreen`, comme `MemoryBoard` et `TrafficJamBoard`, remonté à chaque changement de niveau.

* **Disposition** (`overflow-hidden`, zéro défilement) : le guide (mascotte et image de la règle) et les boîtes occupent la zone principale ; la réserve d'ours en dessous. En portrait, le guide au-dessus des deux boîtes côte à côte ; en paysage, boîte, guide, boîte. Pendant une négation, le guide et une seule grande boîte ouverte. La case d'un ours (`--bear-slot`) vaut `13vmin` borné, et au plus `8vw` en paysage : les dix ours d'une longue série tiennent sur une rangée, et les boîtes ne bougent pas en cours de série.
* **Boîtes** (`ZoneBox`) : un bouton qui occupe toute sa case (cible large), le dessin dans le plus grand carré qui y tient, les ours déjà rangés en miniature, posés sur la face de la boîte avec un liseré blanc.
* **Ours** (`ReserveBear`) : un bouton par ours de la réserve, `touch-none` en permanence. L'ours rangé rejoint sa boîte, la boîte pulse, la mascotte saute de joie.
* **Mascotte** : bouton « Réécouter la règle » ; toucher la mascotte rejoue la règle. Humeur : `talking` quand elle parle, `no` (la tête dit non) quand elle annonce une règle « sauf », jamais quand elle la rappelle après un rebond (sa tête se lirait comme un reproche), `happy` après un ours rangé, `idle` sinon.
* **Image de la règle** (`RulePicture`) : toujours à l'écran. **Couleur** : deux gouttes de peinture, bleue et jaune. **Taille** : un petit et un grand ours gris. Dans les deux cas, dans le sens des boîtes de l'étoile (`leftBox`), y compris sur le panneau STOP : son coupé, l'image seule porte la consigne, et elle ne contredit pas les côtés que la télécommande utilise. **Sauf** : l'ours interdit dans un signe « non » neutre et gris (les ours des deux tailles pour une couleur, un ours gris pour une taille).
* **Sons** : `success` pour un ours rangé, `bounce` pour un rebond. Le dépôt qui termine une phase ne joue que `stop` ou `victory` : deux effets superposés seraient confus.

### 3.3. Au doigt (`useBearDrag.ts`, `drop-zones.ts`)

* **Glisser** : Pointer Events sur le bouton de l'ours, bouton principal seul, capture du pointeur (dans un `try` : jsdom ne l'implémente pas). À partir de `TAP_SLOP_PX` (8 px), le geste devient un glissement et l'ours suit le doigt (`transform: translate`). Un geste interrompu par le système (`pointercancel`) ramène l'ours sans dépôt.
* **Une main posée sur l'écran** : un ours à la fois, mais seul un glissement en cours refuse un autre doigt. Une main posée ailleurs, ou un doigt immobile sur un ours, ne bloque pas le jeu (`useBearDrag` n'exige plus le pointeur primaire), fréquent à cet âge. Limite : un **tap** au second doigt ne produit pas de `click` (navigateur) ; ce doigt peut glisser, mais il faut lever l'autre main pour toucher un bouton.
* **Dépôt permissif** : `findDropZone(point, zones, DROP_TOLERANCE_PX)` choisit, parmi les boîtes dont le rectangle agrandi de 40 px de chaque côté contient le point, la plus proche ; à égalité, la première. Hors de toute boîte, l'ours revient doucement à sa place et **rien n'est compté**. Un rectangle vide (boîte non mesurable, jsdom) ne compte pas.
* **Lâché sur la réserve** : même retour, même à portée d'une boîte (`isPointInRect`) : la réserve est à 8 px sous les boîtes, et un doigt qui tremble ou un ours ramené à sa place n'a rien visé. Sans cela, un glissement de 10 px sur le premier rang comptait comme un dépôt, et coûtait la couronne.
* **Toucher puis toucher** : en deçà de 8 px, le geste reste un tap, traité par le `click` du bouton (le même que celui de TalkBack et du clavier) : l'ours devient l'**ours choisi** (`aria-pressed`, anneau ambré), sans bascule, et le toucher d'une boîte l'y dépose. Il reste choisi après un rebond (sauf à l'échelon 3 sur un ours interdit, [§3.7](#37-échelle-dindices)). Toucher une boîte sans ours choisi ne fait rien à l'écran (lecteur d'écran : « Choisis d'abord un ours ») ; en mode D-Pad, elle reçoit l'ours en cours. Le clic qui suit un glissement est ignoré (`isDragClick`).

### 3.4. À la télécommande

Zone libre `useNavigationScope({ scopeId: 'bear-sort-board', … })`, avec `isFocusVisible` pour l'anneau et le focus DOM sur l'ours en cours (annonces TalkBack). L'ours en cours est le premier de la réserve ; après un ours rangé, l'ours suivant prend sa place, et après un rebond le même ours reste en évidence (sauf à l'échelon 3 sur un ours interdit, [§3.7](#37-échelle-dindices)).

| Touche | Règle de tri | Règle « sauf » | Panneau STOP | Fin de partie |
| :--- | :--- | :--- | :--- | :--- |
| `Gauche` / `Droite` | Envoie l'ours dans la boîte de ce côté | Laisse l'ours, passe au suivant | Rien | Déplace le curseur |
| `Haut` | Rien | Envoie l'ours dans la boîte ouverte | Rien | Rien |
| `Bas` | Rien | Laisse l'ours, passe au suivant | Rien | Rien |
| `OK` | Rejoue la règle | Rejoue la règle | Repart, une fois le panneau actif | Choisit l'action |
| `Retour` | Carte des Étoiles | Carte des Étoiles | Carte des Étoiles | Carte des Étoiles |

* **Un appui, un ours** : une flèche maintenue se répète (FEAT-04) ; un écouteur `keydown` en capture, posé avant le moteur D-Pad, retient `event.repeat` et le plateau ignore ces répétitions.
* **Sans texte** : en mode D-Pad, chaque boîte porte une icône de flèche (`ArrowLeft`, `ArrowRight`, `ArrowUp`), en haut de son dessin (plus bas sur une petite boîte, ancrée en bas de sa case), et la réserve une icône `SkipForward` pendant une règle « sauf ».
* **Bouton Retour** : aucune flèche n'y mène, la touche `Retour` suffit ; il reçoit sa propre zone seulement s'il a le focus DOM (Tab, clic), et `OK` le déclenche alors.

### 3.5. Voix, relances et image

* **Annonce** : au lancement d'une étoile (et à chaque nouvelle partie), `preloadClips` charge les phrases de l'étoile, puis la règle est dite ; son nom part aussi dans la région `role="status"`.
* **Rejouer** : toucher la mascotte, ou `OK`, répète la règle en vigueur. Le jeu reste jouable son coupé : l'image reste affichée et la mascotte mime la parole au moins `MIN_MIME_MS` (2 s), même quand `playClips` est résolue aussitôt.
* **Inaction** : au bout de `IDLE_NUDGE_MS` (12 s) sans geste, puis à cet intervalle, l'image de la règle pulse. Règle de tri : la règle est répétée et un ours remue. Règle « sauf » : « Il reste des ours à placer. » (`nudge-more`), et un ours permis remue à partir de la deuxième relance. C'est ce qui relance un enfant qui a laissé de côté un ours permis ([FEAT-23 §6](./FEAT-23.md#6-décisions-dimplémentation-session-de-cadrage)). Au plus `MAX_NUDGES` (3) relances d'affilée, puis silence jusqu'au prochain geste : un écran laissé allumé finit par se taire.
* **Geste de la première étoile** (`showGestureHint`) : une main (`GestureHand`) va en boucle du premier ours à sa boîte, tant qu'aucun ours n'est rangé (un rebond ne la retire pas) et qu'aucun ours n'est tenu ni choisi. Sa position est fixe : sous le dernier rang d'ours, sa paume dépasse du plateau sans y être rognée ni le faire défiler. En mode D-Pad, c'est la flèche de la bonne boîte qui pulse à la place de la main.

### 3.6. Mécanisme STOP (`StopOverlay.tsx`)

1. **Arrivée** : le dépôt qui finit la phase fige le plateau (`inert`), un voile le recouvre, avec un grand panneau STOP et l'image de la **règle suivante**. Effet `stop`, puis voix : `stop-warning`, la mise en garde seule.
2. **Attente forcée** : le panneau s'active quand **deux conditions** sont réunies : `STOP_MIN_WAIT_MS` (5 s) écoulées, **et** la voix terminée. Jusque-là, le bouton reste focalisable (`aria-disabled`, jamais `disabled`) : il garde le focus D-Pad et le lecteur d'écran le trouve, mais rien ne se passe.
3. **Panneau actif** : il pulse doucement. Toucher le panneau, ou `OK`, lance la phase suivante, et la voix dit alors la nouvelle règle.
4. **Relance** : tant qu'il n'est pas touché, « Appuie sur le panneau pour continuer. » (`stop-go`) revient toutes les `STOP_NUDGE_MS` (6 s), au plus `MAX_NUDGES` (3) fois. Le panneau reste actif et continue de pulser.

### 3.7. Échelle d'indices

Elle suit `getHintLevel` ([FEAT-23 §3.4](./FEAT-23.md#34-échelle-dindices)) : les rebonds d'affilée, remis à zéro par un ours rangé. Chaque rebond joue `bounce`, fait pulser l'image de la règle et remuer l'ours (sauf le dernier cas du tableau).

| Rebonds d'affilée | Règle de tri | Règle « sauf » | Voix |
| :--- | :--- | :--- | :--- |
| **1** | Rien de plus | Rien de plus | La règle, précédée de « Oh, ton cerveau a voulu te piéger. » si c'est une erreur d'ancienne règle |
| **2** | L'ancien critère s'estompe : les couleurs passent au gris pendant un tri par taille ; les tailles s'égalisent pendant un tri par couleur (ours et boîtes) | Les ours interdits reçoivent un signe « non » gris (`NoBadge`) | « Regarde bien. », puis la règle |
| **3 et plus** | La bonne boîte s'éclaire d'un halo vert pâle et l'ours visé remue | Pour un ours permis, de même. Pour un ours interdit, la boîte ouverte s'éclaire et la main passe à un ours **permis**, le seul qui remue : le curseur D-Pad et l'ours choisi, s'il y en a un, se déplacent sur lui | « Essaie ici. » |

L'ours visé est l'ours tenu, sinon l'ours choisi, sinon celui du dernier rebond : le halo suit l'ours que l'enfant vient de prendre. Le signe « non » et l'estompage restent à partir du 2ᵉ rebond, jusqu'au prochain ours rangé. Sur un ours interdit, la main doit passer à un ours permis : `Haut`, ou le toucher de la boîte éclairée, referait sinon rebondir le même ours, et l'échelle n'aboutirait jamais à une réussite.

### 3.8. Fin d'étoile (`BearSortEndScreen.tsx`)

* **Victoire** : dans le gestionnaire du dépôt gagnant, jamais dans un effet (StrictMode) : `victory`, puis « Bravo ! Tu as gagné une étoile. » et, sans aucun rebond, « Et une couronne, c'est parfait ! » ; `controls.recordVictory({ moves, timeSeconds, isPerfect })` une seule fois (`timeSeconds` par `performance.now()`). Le temps n'est montré nulle part.
* **Écran de fin** : `END_SCREEN_DELAY_MS` (900 ms) après la victoire, pour laisser voir le dernier ours rangé. `ModalDialog` avec `isTextless`, sans `onClose` (ni ✕, ni fond ; `Retour` mène à la Carte des Étoiles). Une grande étoile (`StarAward`), la couronne si elle est gagnée ou déjà acquise, et trois grands boutons-icônes : étoile suivante (absente après la dernière), rejouer, carte. Zone D-Pad déclarée dans la modale, curseur sur la première action.
* **Couronne manquée** : jamais évoquée. Sans couronne, l'étoile prend toute la place : rien ne laisse deviner un manque. Ni coups ni erreurs à l'écran.
* **Rejouer** : nouvel ordre des ours, règle annoncée de nouveau, chronomètre remis à zéro.

### 3.9. Accessibilité

* **Noms vocalisés** (`labels.ts`) : ours « Petit ours bleu », boîtes « Petite boîte bleue » et « Boîte ouverte », règles « Ranger par couleur », « Ranger par taille », « Tous les ours, sauf un petit ours bleu ». La couleur et la taille sont toujours nommées, car ce sont elles que l'on trie. Autres noms : « Réécouter la règle », « Réserve d'ours », « Panneau stop : continuer », « Étoile suivante », « Rejouer », « Carte des étoiles ».
* **Annonces** (`role="status"`) : chaque règle dite à voix haute, « Stop ! » suivi de la nouvelle règle, « Essaie ici : … » à l'échelon 3 (avec le nom de l'ours permis qui prend la main), « Choisis d'abord un ours ».
* **Clavier et TalkBack** : Tab atteint chaque ours et chaque boîte ; Entrée ou Espace déclenche le clic natif (`keepNativeActivation` ne laisse pas la touche au moteur D-Pad, qui y verrait un OK). Parcours : choisir un ours, puis une boîte.
* **Animations** : `MotionConfig reducedMotion="user"` et variantes `motion-safe:` ; un ours qui ne peut plus remuer est désigné par un liseré.

### 3.10. Constantes de temps et de distance

Exportées par `components/index.ts` et par le barrel `@/games/bear-sort`.

| Constante | Valeur | Rôle |
| :--- | :---: | :--- |
| `STOP_MIN_WAIT_MS` | 5 000 ms | Attente imposée du panneau STOP, même si la voix est déjà finie. |
| `STOP_NUDGE_MS` | 6 000 ms | Intervalle de relance d'un panneau actif et pas touché. |
| `IDLE_NUDGE_MS` | 12 000 ms | Inaction avant une relance, puis intervalle entre les relances. |
| `MAX_NUDGES` | 3 | Relances d'affilée sans aucun geste, à l'inaction comme au panneau STOP. |
| `MIN_MIME_MS` | 2 000 ms | Durée minimale du mime de la mascotte, même son coupé. |
| `END_SCREEN_DELAY_MS` | 900 ms | Entre le dernier ours rangé et l'écran de fin. |
| `DROP_TOLERANCE_PX` | 40 px | Marge autour d'une boîte où un dépôt compte encore, hors de la réserve. |
| `TAP_SLOP_PX` | 8 px | En deçà, le geste reste un tap. |

---

## 4. Points d'attention

* **La mise en garde tient dans les 5 s du STOP** : `stop-warning` dure 4,70 s (voir [FEAT-22 §3.5](./FEAT-22.md#35-voix-de-la-mascotte)). Comme le panneau attend aussi la fin de la voix, un clip plus long remplacé plus tard prolongerait l'attente. La nouvelle règle n'est dite qu'au redémarrage : l'enfant peut déjà déplacer un ours pendant cette phrase, à observer lors de l'essai avec un enfant.
* **Sons et victoire dans les gestionnaires** : ils partent des gestionnaires et des minuteurs, jamais d'un `setState` ni d'un effet rejoué sous `StrictMode`. L'annonce d'une étoile passe par un `setTimeout(…, 0)` : l'effet rejoué ne parle qu'une fois, et après le son coupé par le faux démontage de `useGameAudio`. `useGameAudio` est appelé en premier : le réglage Son est appliqué avant la première voix.
* **`playClips` résolue n'est pas « voix entendue »** : son coupé, la promesse est résolue aussitôt, d'où le minimum de 5 s du STOP et le mime de 2 s ([FEAT-22 §4](./FEAT-22.md#4-points-dattention)).
* **Un dépôt calculé hors de `setGame`** : `placeBear` appelle `dropBear` sur l'état courant et compare les références (`next === game` : action ignorée), pour que sons et voix ne soient pas rejoués.
* **Toucher juste après un dépôt lancé** : dans Chromium, un doigt levé en pleine vitesse fait perdre son `click` au toucher suivant pendant environ 1 s (jusqu'à 2 s après plusieurs glissements très rapides, simulés), avec ou sans modale. L'enfant retouche, sans pénalité. Ni un glissement (Pointer Events), ni un doigt posé avant de se lever ne sont concernés. Rien n'a été changé pour cela : à observer sur un vrai écran.
* **Geste terminé par une ref** : `pointerup` peut arriver avant le rendu du dernier `pointermove` ; `useBearDrag` suit le geste dans une ref, et ne se fie à `held` que pour le rendu. `detail > 0` distingue le clic d'un pointeur de celui du clavier ou d'un lecteur d'écran (`isDragClick`).
* **Clavier et moteur D-Pad** : `getFocusedElement` et `ownsElement` couvrent les ours et le panneau STOP. Sur un ours, `keepNativeActivation` ne s'applique que hors du mode D-Pad : au D-Pad, `OK` rejoue la règle au lieu de choisir l'ours.
* **Réserve remontée à chaque partie** (`key={round}`) : les refs `bearElements` se réinscrivent, et les ours d'une nouvelle partie réutilisent les mêmes `uid`.
* **Aucun utilitaire dans `globals.css`** : les images clés des dessins sont hissées dans le `<head>` par `<style href precedence>` (React 19), classes Tailwind arbitraires et styles calculés ailleurs.
* **Couleurs réservées** : aucun rouge hors de `StopSign.tsx`, y compris dans le signe « non » (gris) et le halo (vert pâle). Ours et boîtes prennent leurs couleurs dans `art-tokens.ts`.

---

## 5. Critères d'Acceptation (Definition of Done)

- [x] Aucun texte visible du début d'une étoile à son écran de fin ; les noms restent accessibles aux lecteurs d'écran.
- [x] Une étoile se joue au doigt (glisser-déposer permissif, ou toucher puis toucher) et à la télécommande (un appui par ours, flèche maintenue sans effet), sans aucun défilement.
- [x] Le panneau STOP ne s'active qu'après 5 s **et** la fin de la voix ; il repart au toucher ou par `OK`, et la voix relance l'enfant qui ne répond pas.
- [x] Échelle d'indices à trois échelons sur les rebonds d'affilée, y compris pendant une règle « sauf ».
- [x] L'image de la règle reste à l'écran et le jeu reste jouable avec le réglage Son coupé.
- [x] Une étoile finie rapporte l'étoile, une étoile sans rebond la couronne ; `recordVictory` n'est appelé qu'une fois ; une couronne manquée n'est jamais montrée.
- [x] `tests/bear-sort-board.test.tsx` couvre les gestes, la télécommande, le STOP, l'échelle d'indices et la fin de partie.
- [ ] Recette avec un vrai enfant, sur un vrai Android TV et dans l'APK (voir [§6](#6-décisions-dimplémentation-session-de-cadrage), « Non vérifié »).
- [x] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `validate:levels`, `test:coverage`, `build`) passe sans aucune erreur.
- [x] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(bear-sort): add board with permissive drag, one-press remote, stop sign and hint ladder`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avec le propriétaire au fil de trois séries de questions, avec leurs motivations et les alternatives écartées. Les arbitrages de Claude pendant l'implémentation sont signalés comme tels, pour relecture par le propriétaire ; les lignes purement techniques sont des choix d'implémentation.

| Sujet | Décision |
| :--- | :--- |
| **Télécommande** | **Un appui par ours.** L'ours suivant est mis en évidence automatiquement et une flèche l'envoie dans la boîte de ce côté : le même format à deux choix que les versions informatisées du test, assez rapide pour installer un réflexe. Pendant une négation, `Haut` envoie l'ours et les autres flèches le laissent. Écartés : un **prendre-et-poser à la Traffic Jam** (environ quatre appuis par ours) ; un jeu **tactile seulement** (casse le pilier selon lequel chaque jeu se joue à la télécommande). |
| **Échelle d'indices** | **Une échelle douce à trois échelons pour l'enfant bloqué.** Premier rebond : l'image de la règle pulse et la mascotte répète la règle (précédée de « Oh, ton cerveau a voulu te piéger. » pour une erreur d'ancienne règle). Deuxième d'affilée : l'ancien critère s'estompe (ou signe « non » gris sur les ours interdits d'une négation). Troisième : la bonne boîte s'éclaire. Elle finit toujours par une réussite, et c'est un cas courant : beaucoup d'enfants de 3 ans continuent de trier selon la première règle, même quand la nouvelle est répétée. Écartés : le **même rappel à chaque fois** (avec deux boîtes, l'enfant peut simplement essayer l'autre et finir sans avoir compris la règle) ; une **démonstration par la mascotte** (retire la main à l'enfant, interrompt). |
| **Image de la règle, voix à la demande** | **Image de la règle toujours à l'écran, voix rejouée à la demande** (toucher la mascotte, ou `OK`) : gouttes de peinture pour la couleur, petit et grand ours pour la taille, ours interdit dans un signe « non » gris et neutre pour la négation. Le jeu reste jouable son coupé, puisque le réglage Son coupe voix et effets, et l'effort reste sur l'inhibition plutôt que sur la mémoire. Écartés : une **image à l'annonce seulement** (charge de mémoire, plus rien pour se repérer son coupé) ; une **voix qui ignore le réglage Son** (trahit la promesse du réglage). |
| **Aucun texte visible** | **Aucun texte visible du début d'une étoile à son écran de fin.** Aucun compteur pendant la partie, écran de fin en images (grande étoile, couronne si elle est gagnée ; suivante, rejouer, carte en icônes). Le Hub et la Carte des Étoiles ne changent pas : un jeune enfant peut avoir besoin d'un adulte pour démarrer. Les noms pour lecteurs d'écran restent. Écartés : le **plateau seulement** (un enfant d'âge préscolaire ne lit pas l'écran de fin, et celui-ci rapporte les erreurs) ; une **Carte des Étoiles propre à ce jeu** (dédouble un écran partagé, et le Hub resterait écrit). |
| **Panneau STOP** | **Attente forcée, puis l'enfant touche le panneau (ou `OK`)** : environ cinq secondes, pendant que la voix met en garde et que l'image de la nouvelle règle apparaît ; la voix dit la règle quand le jeu repart. Repartir devient un acte délibéré ; la mascotte relance l'enfant qui ne répond pas. Écartés : une **simple minuterie** (passive, l'enfant peut manquer le changement) ; une **minuterie qui raccourcit puis disparaît en haut de la carte** (va contre le brief d'origine, où un STOP précède toujours un changement). |
| **Négation à l'écran** | Une seule grande boîte ouverte, en gris neutre (`GREY_PALETTE`). L'ours interdit rebondit, l'ours permis laissé de côté garde la manche ouverte jusqu'à la relance de la mascotte (`nudge-more`). À l'échelon 3, un ours interdit n'a pas de bonne boîte : la boîte ouverte s'éclaire et la main passe à un ours permis, pour que l'échelle finisse quand même par une réussite. Décision et alternatives : [FEAT-23 §6](./FEAT-23.md#6-décisions-dimplémentation-session-de-cadrage). |
| **Mascotte** *(arbitrage de Claude, à relire)* | **Une chouette violette** : le violet ne se confond ni avec le bleu, ni avec le jaune, ni avec le rouge, tous trois porteurs de sens dans le jeu. |
| **Tolérance et tap-tap** *(arbitrage de Claude, à relire)* | **Dépôt permissif de 40 px** (`DROP_TOLERANCE_PX`) : un jeune enfant vise large, et un ours lâché tout près de sa boîte ne doit pas lui revenir sans raison. **Toucher puis toucher** pour TalkBack et le clavier : le glisser ne leur est pas accessible, et ce parcours sert aussi à l'enfant qui ne maîtrise pas encore le geste. Aucune pénalité : lâché hors de toute boîte, ou sur la réserve, un ours n'est pas compté. |
| **Revue indépendante** *(arbitrages de Claude, à relire)* | Suite à une revue du jeu joué dans Chromium : **image de la règle dans le sens des boîtes** (rien ne prouve qu'un enfant la lit comme un plan, mais la contredire n'apporte rien) ; **relances limitées à 3 d'affilée** (le cadrage demande une relance, pas une voix sans fin sur un écran laissé allumé) ; **une main posée ne bloque plus le jeu** (Traffic Jam garde le pointeur primaire : à revoir si le cas s'y présente) ; **aucun plateau monté derrière le choix du joueur**, pour tous les jeux (`GameScreen` : la carte s'y affiche, le niveau s'ouvre après le choix). |
| **Couleurs** | Bleu et jaune pour le tri, gris neutre pour tout ce qui est « non » ou estompé, vert très pâle pour le halo, rouge seulement sur le panneau STOP : décision et motivation dans [FEAT-25 §6](./FEAT-25.md#6-décisions-dimplémentation-session-de-cadrage). |
| **Dessins** | SVG inline, dans le même esprit que le reste de l'application : aucun fichier image, net en 4K sur TV. `BearSvg` et `NoSignShape` sont partagés avec l'image de la règle ; `art-tokens.ts` centralise les couleurs des ours et des boîtes. |
| **Voix pendant la partie** | Une nouvelle parole remplace la précédente (`playClips`), un ours rangé n'interrompt pas la voix. `useMascotSpeech` associe voix et mime par un jeton : une parole ancienne ne peut pas clore une parole récente. |
| **Tests** | `tests/bear-sort-board.test.tsx` (nouveau) : `findDropZone`, `isPointInRect` ; écran (tout est nommé, **aucun texte visible** dans la page, boîte ouverte, clips préchargés, annonce unique sous `StrictMode`, règle rejouée, image dans le sens des boîtes) ; tap (sélection, dépôt, rebond, boîte sans ours, petit déplacement, clic natif au clavier) ; glisser (suivi, dépôt à moins de 40 px, rebond, hors boîte, lâché sur la réserve, `pointercancel`, clic après un glissement, main posée, second doigt, glissement jamais relâché, capture qui échoue) ; échelle d'indices (trois échelons, piège ou simple maladresse, halo qui suit l'ours, règle « sauf », main qui passe à un ours permis) ; inaction (trois relances au plus) ; STOP (plateau gelé, 5 s même si la voix a fini, voix plus longue, tap, `OK`, relance toutes les 6 s, trois au plus, `StrictMode`) ; fin d'une règle « sauf » ; télécommande (ours en cours, un appui par ours, flèches d'une règle « sauf », `OK`, `Retour`, flèches sans texte, réveil après le tactile, bouton Retour atteint au Tab) ; fin de partie (victoire enregistrée une fois, couronne gagnée, déjà acquise ou manquée sans en parler, boutons-icônes, télécommande, rejouer) ; geste (main, nouvelle mesure à la rotation, flèche au D-Pad) ; humeur de la mascotte. `tests/bear-sort-art.test.tsx` (nouveau) : dessins (quatre sortes d'ours, estompage, halo, humeurs, image de chaque règle), réduction des animations, images clés hissées une seule fois, **rouge réservé au panneau STOP**. Le rendu réel (mise en page, zéro défilement) n'est pas couvert : jsdom ne mesure rien. |
| **Non vérifié** | **Personne n'a joué avec un vrai enfant ni écouté la voix avec lui** : rythme et compréhension restent à éprouver, notamment l'attente du STOP, la longueur des séances, l'échelle d'indices et la capacité d'un enfant de 3 ans à gérer « sauf un petit ours bleu ». **Aucune partie sur un vrai Android TV ni dans l'APK** (ni JDK ni SDK Android en local, seule la CI compile l'APK) : lisibilité des flèches à 3 mètres, rythme d'un appui par ours et TalkBack à vérifier sur l'appareil, avec FEAT-15. **Doigt réel** : le toucher n'a été exercé que dans Chromium (évènements tactiles du protocole DevTools), pas sur un écran réel. |
| **Git** | Commit prévu à l'intégration : `feat(bear-sort): add board with permissive drag, one-press remote, stop sign and hint ladder`. |
