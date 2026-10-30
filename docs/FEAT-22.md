# FEAT-22 : Socle Audio (Service, Voix de la Mascotte, Effets Sonores & Réglage Son)

> **Document parent** : [SPECIFICATION.md](./SPECIFICATION.md)
> **ID Feature** : `FEAT-22`
> **Dépendances** : [FEAT-05](./FEAT-05.md), [FEAT-17](./FEAT-17.md), [FEAT-18](./FEAT-18.md)
> **Statut** : cadrée et implémentée ; les décisions prises pendant la session de cadrage sont consignées au [§6](#6-décisions-dimplémentation-session-de-cadrage).

---

## 1. Contexte & Objectif pour l'IA

Jusqu'ici, Mia était muette : [FEAT-18](./FEAT-18.md) avait gardé un interrupteur « Son » sans effet, comme contrat pour plus tard. Attrape-Piège ([FEAT-23](./FEAT-23.md) à [FEAT-25](./FEAT-25.md)) change la donne : il s'adresse à des enfants de 3 à 6 ans qui ne lisent pas encore, et c'est la voix de sa mascotte qui énonce les règles.

L'objectif de cette **FEAT-22** est le socle audio des jeux, au-dessus de la Web Audio API, sans aucune dépendance ajoutée à l'application :
1. **Un service audio sans React** (`src/core/audio/`) : une seule `AudioContext` pour toute l'application, débloquée au premier geste, qui joue des séquences de clips et des effets.
2. **La voix de la mascotte** : 18 phrases en français, préenregistrées et livrées avec l'application, générées avec la voix de synthèse Piper « MLS » (CC BY 4.0) et remplaçables par de vrais enregistrements sans toucher au jeu.
3. **Des effets sonores synthétisés** : 4 effets, sans aucun fichier.
4. **Un réglage « Son » qui agit enfin** : couper le son coupe la voix et les effets, partout.

Le service et les effets sont génériques ; seules les phrases sont propres à Attrape-Piège (`src/games/bear-sort/`).

---

## 2. Fichiers à Créer / Modifier

```text
src/
├── core/
│   └── audio/
│       ├── types.ts                   # SoundEffect, AudioService
│       ├── audio-service.ts           # createAudioService(), getAudioService(), resolveAudioUrl(), effets
│       ├── useGameAudio.ts            # Hook d'un écran de jeu : suit le réglage Son, se tait au démontage
│       └── index.ts                   # Barrel
├── games/
│   └── bear-sort/
│       ├── voice-script.json          # Texte de chaque phrase : la source de vérité, lue aussi par le générateur
│       ├── voice-script.ts            # BearSortClipId, VOICE_SCRIPT, getVoiceClipPath(), getRuleClipId()
│       └── voice-manifest.json        # Généré : voix, locuteur, ralentissement, texte et durée de chaque clip
└── components/
    └── settings/
        └── labels.ts                  # SETTINGS_TEXTS.soundNote : effet du réglage et attribution de la voix
public/
└── audio/
    └── bear-sort/                     # 18 clips MP3 versionnés, un par phrase ({id}.mp3)
scripts/
└── generate-voice-clips.py            # Outil de développement : script → MP3 + manifeste (Piper, lameenc)
tests/
├── audio-service.test.ts              # Service audio (contexte et fichiers simulés)
├── use-game-audio.test.tsx            # Hook : réglage Son, ordre des effets, démontage
└── bear-sort-voice.test.ts            # Clips : vrais MP3, aucun orphelin, texte à jour, durées, pré-cache
docs/
├── FEAT-22.md                         # Ce document
├── SPECIFICATION.md                   # §2 (stack), §5 (graphe), §6 (liste), §7.3 (guide d'extension)
└── FEAT-17.md, FEAT-18.md             # Renvois : clips pré-cachés, effet et note du réglage Son
README.md                              # Fonctionnalités, stack, crédits et licence de la voix
```

---

## 3. Spécifications

> Les décisions de la session de cadrage ([§6](#6-décisions-dimplémentation-session-de-cadrage)) donnent les motivations de ces spécifications et les alternatives écartées.

### 3.1. Contrat du service (`src/core/audio/types.ts`)

```typescript
/** Effets sonores synthétisés : aucun fichier, aucune licence à suivre. */
export type SoundEffect = 'success' | 'bounce' | 'stop' | 'victory';

export interface AudioService {
  /**
   * Applique le réglage « Son » ; le couper interrompt la voix en cours et libère la sortie audio. Un
   * écran de jeu qui disparaît coupe le son de la même façon : le suivant réapplique le réglage.
   */
  setEnabled: (enabled: boolean) => void;
  /**
   * Charge des clips à l'avance (chemins relatifs à la racine de l'export, sans `basePath`) ; ne fait
   * rien quand le son est coupé.
   */
  preloadClips: (paths: readonly string[]) => Promise<void>;
  /** Joue des clips l'un après l'autre, en remplaçant la séquence en cours */
  playClips: (paths: readonly string[]) => Promise<void>;
  /** Interrompt la voix en cours ou en attente du premier geste */
  stopClips: () => void;
  /** Joue un effet par-dessus la voix ; sans effet si le son est coupé ou encore bloqué */
  playEffect: (effect: SoundEffect) => void;
}
```

La promesse de `playClips` est résolue à la fin de la séquence, à son interruption, ou **aussitôt** quand il n'y a rien à jouer (son coupé, API absente, page masquée, liste vide). Avant le premier geste de l'utilisateur, le navigateur peut bloquer le son : la promesse est alors résolue aussitôt et la séquence part au premier geste, si rien ne l'a remplacée entre-temps. Un clip illisible, ou pas chargé au bout de 4 s (`CLIP_LOAD_TIMEOUT_MS`), est sauté : un jeu qui attend la fin de la voix, comme le panneau STOP, ne reste jamais bloqué.

### 3.2. Service (`src/core/audio/audio-service.ts`)

* **Une seule instance** : `getAudioService()` renvoie le service de l'application (le navigateur limite le nombre de contextes audio) ; `createAudioService({ createContext, fetchClip })` permet de les simuler en test.
* **Contexte paresseux** : l'`AudioContext` est créée au premier usage. Sans l'API, ou si son constructeur lève (trop de contextes, aucune sortie audio sur le boîtier TV), le service reste muet et le jeu reste jouable.
* **Déblocage** : écouteurs `pointerdown`, `pointerup`, `touchend` et `keydown` sur `window` (`capture`, `passive`) ; à chacun de ces gestes tant que le contexte dort et que le son est activé, `resume()`, puis la séquence en attente part. Au doigt, `pointerdown` n'active pas la page (seuls `pointerup` et `touchend` le font), d'où les quatre évènements. `playClips` n'attend `resume()` que 150 ms (`RESUME_TIMEOUT_MS`) : sans geste préalable, sa promesse peut ne jamais se résoudre. Un contexte qui démarre seul après ce délai lance aussi la séquence en attente (`onstatechange`) : aucun geste de plus n'est nécessaire.
* **Sortie audio libérée** : `setEnabled(false)` interrompt la voix et suspend le contexte (batterie, sortie HDMI ou Bluetooth) ; son coupé, rien ne crée ni ne réveille le contexte (`preloadClips`, geste, retour au premier plan). `state` peut encore dire `running` juste après `suspend()` : la voix suivante appelle donc `resume()` quand même (`isSuspendRequested`), sinon elle partirait sur un contexte en train de se suspendre.
* **Séquences** : `playClips` commence par invalider la séquence en cours (un numéro incrémenté, y compris par `stopClips` et `setEnabled(false)`) ; chaque étape revérifie ce numéro : une ancienne séquence ne reprend jamais la main. Un arrêt résout la promesse sans attendre le chargement du clip en cours, qui finira quand même dans le cache.
* **Fichiers** : `fetch` puis `decodeAudioData`, tampons gardés en mémoire par chemin ; un échec n'est pas retenu, le clip sera réessayé au prochain appel. Un chargement sans réponse après 4 s (`CLIP_LOAD_TIMEOUT_MS`) fait sauter le clip, sans l'annuler : s'il aboutit, le tampon reste en cache. `resolveAudioUrl(path)` préfixe `NEXT_PUBLIC_BASE_PATH`, lu à l'appel.
* **Fin d'un clip** : `onended`, doublé d'une minuterie de secours (durée du clip + 500 ms, `CLIP_END_MARGIN_MS`) : certains WebView perdent l'évènement.
* **Arrière-plan** : `visibilitychange` ; page masquée → voix interrompue et promesse résolue, contexte suspendu ; page visible → contexte repris, si le son est activé. La voix interrompue ne reprend pas : le jeu n'attend pas un clip que personne n'entend. Une séquence demandée pendant que la page est masquée est résolue aussitôt, sans réveiller le contexte : l'application ne parle pas dans le vide.

### 3.3. Hook (`src/core/audio/useGameAudio.ts`)

`useGameAudio(): AudioService` : lit `useMiaStorage().state.settings.soundEnabled`, appelle `setEnabled` à chaque changement, et `setEnabled(false)` au démontage (voix interrompue, sortie audio libérée jusqu'au prochain écran de jeu). À appeler **avant** les effets React qui jouent un son : ses propres effets passent les premiers, le réglage est donc appliqué avant la première voix.

### 3.4. Effets sonores (`EFFECTS` dans `audio-service.ts`)

Oscillateur + enveloppe de gain (attaque de 15 ms, crête à 0,18, extinction exponentielle) : doux et brefs, le rebond ne doit surtout pas sonner comme une sanction.

| `SoundEffect` | Usage dans Attrape-Piège | Notes |
| :--- | :--- | :--- |
| `success` | Ours rangé | Sinus 659 Hz (120 ms), puis 880 Hz à + 90 ms (200 ms) |
| `bounce` | Rebond | Sinus glissant de 300 à 170 Hz (240 ms) |
| `stop` | Panneau STOP | Triangle 523 Hz (180 ms), puis 392 Hz à + 200 ms (300 ms) |
| `victory` | Étoile gagnée | Sinus 523, 659 et 784 Hz (140 ms chacun, toutes les 120 ms), puis 1 047 Hz (320 ms) |

### 3.5. Voix de la mascotte

* **Source de vérité** : `voice-script.json`, `{ identifiant: texte }`. `BearSortClipId` est dérivé de ses clés : le compilateur refuse un clip inconnu. Le fichier d'un clip est `audio/bear-sort/{id}.mp3` (`getVoiceClipPath`) ; `getRuleClipId(rule)` donne la phrase d'une règle.
* **Identifiants stables** : remplacer `public/audio/bear-sort/{id}.mp3` par un vrai enregistrement ne change rien au jeu.

| Identifiant | Texte | Durée | Usage dans le jeu ([FEAT-24](./FEAT-24.md)) |
| :--- | :--- | :---: | :--- |
| `rule-color` | Les ours bleus dans la boîte bleue, les ours jaunes dans la boîte jaune. | 5,52 s | Annonce et rappel de la règle |
| `rule-size` | Les petits ours dans la petite boîte, les grands ours dans la grande boîte. | 5,53 s | Annonce et rappel de la règle |
| `rule-except-blue` | Place ici n'importe quel ours, sauf un ours bleu. | 4,49 s | Annonce et rappel de la règle |
| `rule-except-yellow` | Place ici n'importe quel ours, sauf un ours jaune. | 4,67 s | Annonce et rappel de la règle |
| `rule-except-small` | Place ici n'importe quel ours, sauf un petit ours. | 4,83 s | Annonce et rappel de la règle |
| `rule-except-big` | Place ici n'importe quel ours, sauf un grand ours. | 4,56 s | Annonce et rappel de la règle |
| `rule-except-small-blue` | Place ici n'importe quel ours, sauf un petit ours bleu. | 5,23 s | Annonce et rappel de la règle |
| `rule-except-small-yellow` | Place ici n'importe quel ours, sauf un petit ours jaune. | 5,36 s | Annonce et rappel de la règle |
| `rule-except-big-blue` | Place ici n'importe quel ours, sauf un grand ours bleu. | 4,86 s | Annonce et rappel de la règle |
| `rule-except-big-yellow` | Place ici n'importe quel ours, sauf un grand ours jaune. | 5,02 s | Annonce et rappel de la règle |
| `stop-warning` | Stop ! Attention, ton cerveau risque de te tendre un piège. | 4,70 s | Panneau STOP, avant la nouvelle règle |
| `stop-go` | Appuie sur le panneau pour continuer. | 2,44 s | Relance d'un panneau actif et pas touché |
| `bounce-trap` | Oh, ton cerveau a voulu te piéger. | 2,79 s | Premier rebond d'affilée, si c'est une erreur d'ancienne règle, avant la règle |
| `hint-look` | Regarde bien. | 1,43 s | Deuxième rebond d'affilée, avant la règle |
| `hint-here` | Essaie ici. | 1,31 s | Troisième rebond d'affilée et suivants |
| `nudge-more` | Il reste des ours à placer. | 2,18 s | Relance pendant une règle « sauf » |
| `star-won` | Bravo ! Tu as gagné une étoile. | 2,60 s | Étoile gagnée |
| `crown-won` | Et une couronne, c'est parfait ! | 2,56 s | Étoile gagnée sans aucun rebond, après `star-won` |

* **Génération** (`scripts/generate-voice-clips.py`, outil de développement, jamais lancé par le build, la CI ni F-Droid) : voix `fr_FR-mls-medium`, locuteur 55 sur 125 (`SPEAKER_ID`), `LENGTH_SCALE = 1.2` (plus lent que la voix d'origine), sans bruit aléatoire (`noise_scale` et `noise_w_scale` à 0 : le même script redonne les mêmes fichiers), MP3 mono à 64 kbit/s (`lameenc`, qualité 2). Le script supprime les MP3 sans phrase et réécrit `voice-manifest.json`. Ni Piper ni le modèle ne sont livrés avec l'application.
* **Amorce** : ce modèle a appris sur de longues phrases de livres audio. Dite seule, une phrase courte ressort hachée et traînante : avec le locuteur 55, « Il reste des ours à placer. » dure 4,73 s. Chaque phrase est donc dite après une amorce fixe (`LEAD_IN`), terminée par la marque brute `[[.]]` qui force un vrai silence, et le script coupe à la fin de ce silence (2,18 s pour la même phrase, pause finale comprise). Il le repère grâce aux temps de phonèmes du modèle, d'où `piper-tts[alignment]`. Un locuteur qui ne marque aucun silence fait échouer le script.
* **Son parasite** : devant une consonne en tête de phrase, le modèle laisse échapper un son voisé, comme le « e » de « e-place ». Le script le coupe aussi, là où son niveau a chuté de 10 dB (`STRAY_SOUND_BEFORE`), puis applique un fondu d'entrée de 10 ms. Ce son se fond dans /l/, /m/ et /n/ : il n'y a alors rien à couper.
* **Pause finale** : 250 ms de silence suivent chaque phrase, la dernière du clip comprise (`SENTENCE_PAUSE_SECONDS`). Le jeu enchaîne certains clips, comme un indice et la règle, ou `star-won` et `crown-won` : sans elle, deux phrases ne seraient séparées que de 200 ms au plus.

```sh
pip install "piper-tts[alignment]" lameenc
# fr_FR-mls-medium.onnx et son .onnx.json, téléchargés depuis la page du modèle (§3.7)
python scripts/generate-voice-clips.py --model chemin/vers/fr_FR-mls-medium.onnx
```

* **Garde-fous** (`tests/bear-sort-voice.test.ts`) : chaque phrase a un vrai MP3 de plus de 1 Ko, aucun fichier sans phrase, texte du manifeste égal au script (clip périmé signalé), durée de chaque clip entre 0,5 et 6 s, `stop-warning` pas plus long que l'attente du panneau STOP (`STOP_MIN_WAIT_MS`).

### 3.6. Réglage Son et hors-ligne

* **Réglage** : `DeviceSettings.soundEnabled` ([FEAT-05](./FEAT-05.md), interrupteur de [FEAT-18](./FEAT-18.md)) coupe tout : voix et effets. Note de l'interrupteur (`SETTINGS_TEXTS.soundNote`) : « Voix de la mascotte et effets sonores des jeux. Voix de synthèse Piper « MLS » (corpus Multilingual LibriSpeech, CC BY 4.0). » Un jeu doit donc rester jouable sans aucun son ([FEAT-24](./FEAT-24.md)).
* **PWA** : `next build` copie `public/audio/` dans `out/`, et le service worker les pré-cache comme n'importe quel fichier de l'export ([FEAT-17](./FEAT-17.md)) ; `fetch` passe par lui hors-ligne. 18 fichiers, 570 Ko.
* **APK** : `out/` est embarqué tel quel par Capacitor et servi depuis `https://localhost` ([FEAT-15](./FEAT-15.md)) : les clips sont locaux.

### 3.7. Crédits et licence de la voix

Voix distribuée sous **Creative Commons Attribution 4.0 International (CC BY 4.0)**. L'attribution figure dans la note du réglage Son, dans [`README.md`](../README.md#crédits-de-la-voix) et dans `metadata/fr-FR/full_description.txt`.

* **Corpus** : *MLS: A Large-Scale Multilingual Dataset for Speech Research* (Multilingual LibriSpeech), Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel Synnaeve, Ronan Collobert, 2020 ([arXiv:2012.03411](https://arxiv.org/abs/2012.03411), [OpenSLR 94](https://www.openslr.org/94/)), CC BY 4.0, tiré de livres audio de LibriVox.
* **Modèle** : [`fr_FR-mls-medium`](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/mls/medium), dont la fiche indique CC-BY 4.0 et « Trained from scratch ».
* **Moteur** : [Piper](https://github.com/OHF-Voice/piper1-gpl), GPL-3.0, outil de développement non livré avec l'application.
* **Modifications** : synthèse des phrases du script par un seul locuteur du modèle, à la suite d'une amorce ensuite coupée, ralentissement, encodage en MP3.

---

## 4. Points d'attention

* **Pourquoi pas la voix « Siwis »** : la première version des clips utilisait `fr_FR-siwis-medium`. Sa fiche indique CC-BY 4.0, mais aussi « Finetuned from U.S. English lessac voice (medium quality) », et le corpus de cette voix américaine (Blizzard 2013 Lessac) a une [licence](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html) qui limite l'usage à la recherche et exclut tout usage commercial. Comme le projet n'admet que CC0 et CC BY pour cette voix ([§6](#6-décisions-dimplémentation-session-de-cadrage)), elle a été remplacée sans toucher au jeu, grâce aux identifiants stables.
* **Ce qui reste à relire sur la voix « MLS »** : que le modèle soit entraîné de zéro, sans autre voix pour point de départ, repose sur sa seule fiche. Le corpus OpenSLR 94 est sous CC BY 4.0 et vient de livres audio de LibriVox, qui présente ses enregistrements comme étant dans le domaine public aux États-Unis, sans le garantir ailleurs ; la page consultée ne dit rien de la synthèse ni de l'entraînement. Ces textes ne tranchent pas le statut d'un modèle entraîné ni de ses sorties, et cette feature non plus : à relire avant une publication sur F-Droid.
* **`playClips` résolue ne veut pas dire « voix entendue »** : son coupé, API absente ou navigateur encore bloqué, la promesse est résolue aussitôt. Un jeu qui attend la fin de la voix doit donc aussi prévoir un délai propre ([FEAT-24](./FEAT-24.md)).
* **Un effet n'est jamais mis en attente** : contrairement à la voix, un effet demandé tant que le contexte dort est simplement perdu.
* **Service partagé** : `setEnabled` et `stopClips` valent pour toute l'application. Le démontage d'un écran coupe donc le son de tous, et l'écran suivant réapplique le réglage ; un seul écran de jeu est monté à la fois. Hors de ces écrans, le service reste coupé : un futur son du Hub devrait passer lui aussi par `useGameAudio`.
* **Voix plus sourde que la précédente** : le modèle n'a presque aucune énergie au-dessus de 8 kHz (−82 dB au-dessus de 8,5 kHz, contre −13 dB pour « Siwis »), ce qui correspond à un corpus distribué à 16 kHz. À écouter sur les haut-parleurs d'une tablette et d'une télévision.
* **Changer de locuteur ou de phrase** : les coupes dépendent de l'audio généré. Après un changement, regarder le début de chaque clip touché : l'amorce ne doit pas s'entendre et la première consonne doit rester entière. Le test sur les 5 s du STOP et celui sur les 6 s bornent les durées, pas ces coupes.
* **Poids du pré-cache** : les clips ajoutent 570 Ko à l'installation de la PWA ([FEAT-17 §6](./FEAT-17.md#6-décisions-dimplémentation-session-de-cadrage)). Le mono à 64 kbit/s garde chaque phrase sous 45 Ko, et le test « aucun fichier sans phrase » évite de livrer un clip oublié.
* **Texte modifié sans régénération** : les types n'y voient rien, seul le test du manifeste le signale. Un clip enregistré à la main garde son entrée dans `voice-manifest.json` (texte identique ; durée à corriger à la main si elle change, le test la borne à 6 s).
* **Tests** : jsdom n'a pas d'`AudioContext` : le service y est muet, sans erreur. Injecter un faux contexte (`createContext`) pour vérifier une lecture.

---

## 5. Critères d'Acceptation (Definition of Done)

- [x] Un seul contexte audio pour l'application, débloqué au premier geste ; la voix bloquée avant ce geste part ensuite, si rien ne l'a remplacée.
- [x] Couper le réglage Son coupe la voix en cours et tous les effets ; le réglage persiste comme les autres réglages de l'appareil (`DeviceSettings`).
- [x] Les 18 phrases existent en MP3 dans `public/audio/bear-sort/`, leur texte correspond au script (`tests/bear-sort-voice.test.ts`) et aucun fichier n'est orphelin.
- [x] Les clips sont dans le pré-cache de la PWA : `isPrecacheable` les accepte, et aucun réglage du service worker n'a été nécessaire.
- [x] La voix est créditée et sa licence indiquée dans l'application (note du réglage Son), le `README.md` et les métadonnées F-Droid.
- [x] Aucune dépendance npm ajoutée (`package.json` inchangé).
- [ ] Recette sur un vrai Android TV et dans l'APK ; écoute de la voix avec un enfant (voir [§6](#6-décisions-dimplémentation-session-de-cadrage), « Non vérifié »).
- [x] `npm run validate:all` (`format:check`, `lint`, `typecheck`, `validate:levels`, `test:coverage`, `build`) passe sans aucune erreur.
- [x] Si un commit est créé, il respecte le format **Conventional Commits** (`feat(core): add audio service, mascot voice and sound effects`).

---

## 6. Décisions d'implémentation (session de cadrage)

Décisions prises avec le propriétaire au fil de trois séries de questions, avec leurs motivations et les alternatives écartées. Les arbitrages de Claude pendant l'implémentation sont signalés comme tels, pour relecture par le propriétaire ; les lignes purement techniques sont des choix d'implémentation.

| Sujet | Décision |
| :--- | :--- |
| **Voix** | **Voix française préenregistrée, livrée avec l'application, générée avec la voix `fr_FR-mls-medium` de Piper** (CC BY 4.0, corpus Multilingual LibriSpeech), ralentie pour de jeunes enfants et encodée en MP3 par `scripts/generate-voice-clips.py`. Clips dans `public/audio/bear-sort/`, remplaçables par de vrais enregistrements sans changer le jeu : leurs identifiants sont stables. Écartés : **`fr_FR-siwis-medium`**, la voix des premiers clips, pour la raison donnée au [§4](#4-points-dattention) ; la **synthèse vocale de l'appareil** (peu fiable dans la WebView d'Android, un boîtier TV peut n'avoir aucune voix française : un enfant qui ne lit pas resterait sans consigne) ; **enregistrer une vraie voix maintenant** (la plus chaleureuse, mais il faut une pièce calme, réenregistrer à chaque changement de texte et un accord de licence libre ; reste possible plus tard) ; **Chatterbox** (plus lourd, ajoute un filigrane à chaque fichier). |
| **Licences admises** | **CC0 ou CC BY seulement.** F-Droid signale les médias `NC` et `ND` comme « Non-Free », et comme cette voix porte les règles, elle est traitée comme fonctionnelle. Écartés pour cette raison : la **licence Pixabay** ; la **voix `tom` de Piper** (AGPL et conditions séparées pour la voix). Voir les points de licence au [§4](#4-points-dattention). |
| **Locuteur** *(choix du propriétaire, à l'écoute)* | **Le locuteur 55, choisi à l'oreille par le propriétaire, entre un échantillon des 18 phrases par le 55 et un autre par le 4.** Le modèle compte 125 locuteurs : 49 présélectionnés sur le bruit de fond, les aigus et la hauteur de voix, dont 16 marquent un vrai silence après l'amorce. 8 de ces 16 ont été comparés sur les 18 phrases, par alignement dynamique avec les mêmes phrases dites par « Siwis » : chaque clip doit retrouver sa phrase, ce qui approche l'intelligibilité sans remplacer une écoute. Sur ces seules mesures, Claude proposait le 4 : il retrouve les 18 phrases, va plus vite (62,0 s contre 70,1 s) et ne marque pas plus de 230 ms de silence dans une règle, contre 455 ms pour le 55, plus clair dans les aigus. Le 55 en retrouve 17 : `rule-except-big` tombe à égalité avec `rule-except-small` (1,885 contre 1,883), et retrouve bien « grand » sur la fin de la phrase seule. Écarté aussi : le 22, dont la mise en garde dépasse les 5 s du STOP. Pour en essayer un autre : changer `SPEAKER_ID` et relancer le script. |
| **Amorce et coupes** *(arbitrage de Claude)* | **Une amorce dite avant chaque phrase puis coupée, et le son parasite retiré ([§3.5](#35-voix-de-la-mascotte)).** Avec le locuteur 55, le même test retrouve 13 phrases sur 18 sans amorce, 17 sur 18 avec ; le script dure 70,1 s au lieu de 77,1 s (60,4 s avec « Siwis »). Écartés : **régler le rythme phrase par phrase** (durées corrigées, mais spectrogrammes toujours aussi plats) ; **d'autres marques de silence** (plusieurs points ajoutent eux-mêmes des sons parasites, sans espace le silence disparaît). |
| **Effets** | **Synthétisés par la Web Audio API, sans aucun fichier** : l'application n'a pas d'autre audio, donc rien à gérer ni à créditer. Quatre effets (`success`, `bounce`, `stop`, `victory`), doux et brefs. |
| **Lecture** | **Une seule `AudioContext` pour la voix et les effets, clips décodés par `decodeAudioData`.** Elle se débloque au premier geste puis joue sans autre geste, ce qu'un élément `<audio>` ne garantit pas sur iOS. Les fichiers passent par `fetch`, donc par le service worker hors-ligne. Aucune bibliothèque audio : le besoin tient en quelques appels à la Web Audio API. |
| **Réglage Son** | **Il coupe tout : voix et effets**, jamais l'un sans l'autre. Écarté : une **voix qui ignorerait le réglage** parce qu'elle porte la règle (trahit la promesse du réglage). C'est l'image de la règle, toujours à l'écran, qui garde le jeu jouable son coupé ([FEAT-24](./FEAT-24.md)). |
| **Texte de la voix** *(arbitrage de Claude, à relire)* | La formulation française de `voice-script.json` a été écrite par Claude : tutoiement de Mia, phrases courtes, de 1 à 5 s environ. « Oh, ton cerveau… » s'écrit avec une virgule : dit comme une phrase à part, « Oh ! » ressortait faible et morcelé. À relire : voir « Non vérifié ». |
| **Ralentissement et encodage** | `LENGTH_SCALE = 1.2`, mono, 64 kbit/s pour une voix à 22 050 Hz : de 11 à 45 Ko par phrase, 570 Ko en tout. |
| **Manifeste** | `src/games/bear-sort/voice-manifest.json` plutôt que dans `public/` : il n'a pas à être livré, seuls les tests le lisent. Il retient le texte et la durée de chaque clip généré, pour signaler un clip périmé sans décoder d'audio en test. |
| **Attribution** | Dans la note du réglage Son (texte du [§3.6](#36-réglage-son-et-hors-ligne)), le `README.md` et la description F-Droid : l'attribution exigée par CC BY est visible sans quitter l'application. |
| **Tests** | `tests/audio-service.test.ts` (contexte et fichiers simulés) : ordre des clips, remplacement et arrêt d'une séquence, réglage Son (sortie audio libérée, voix suivante pendant une suspension), son bloqué avant le premier geste (les quatre évènements, une seule relance, `resume()` qui échoue ou ne répond jamais, contexte qui démarre seul), arrière-plan, clips illisibles sautés puis retentés, chargement sans réponse, minuterie de secours, notes et enveloppe de chaque effet, préchargement, absence d'`AudioContext`, `resolveAudioUrl`. `tests/use-game-audio.test.tsx` : réglage Son appliqué au montage et avant la première voix, son coupé au démontage et rendu à l'écran suivant. `tests/bear-sort-voice.test.ts` : [§3.5](#35-voix-de-la-mascotte), mise en garde du STOP et pré-cache compris. `tests/settings-screen.test.tsx` : la note de l'interrupteur reste liée à `SETTINGS_TEXTS.soundNote`. |
| **Non vérifié** | **Aucun essai de la voix avec un enfant** : le propriétaire a écouté les 18 phrases et choisi le locuteur à l'oreille, mais intelligibilité, rythme et chaleur restent à éprouver avec un vrai enfant. Aucune lecture sur un **vrai Android TV ni dans l'APK** (ni JDK ni SDK Android en local, seule la CI compile l'APK) : `decodeAudioData` sur les MP3 et le déblocage au premier appui de télécommande sont à vérifier sur l'appareil, avec FEAT-15. |
| **Git** | Commit prévu à l'intégration : `feat(core): add audio service, mascot voice and sound effects`. |
