// @vitest-environment node
import { isPrecacheable } from '@/core/pwa/precache';
import { GO_NO_GO_CATALOG } from '@/games/go-no-go/catalog';
import {
  ANNOUNCEMENTS,
  BUZZER_LABEL,
  formatGarlandLabel,
  getRuleSentence,
  getRuleTitle,
} from '@/games/go-no-go/labels';
import {
  DECOY_IDS,
  FLYING_IMAGES,
  GROUNDED_IMAGES,
  IMAGE_IDS,
  isFlyingImage,
  isImageId,
} from '@/games/go-no-go/subjects';
import {
  getLureClipId,
  getRuleClipIds,
  getRuleClipPaths,
  getStarClipPaths,
  getVoiceClipPath,
  GO_NO_GO_CLIP_IDS,
  SHARED_CLIPS,
  VOICE_SCRIPT,
  type GoNoGoClipId,
} from '@/games/go-no-go/voice-script';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = join(process.cwd(), 'public');

const OWL = (() => {
  const first = GO_NO_GO_CATALOG[0];
  if (!first) throw new Error('catalogue vide');
  return first.config;
})();

describe('Images et personnages (FEAT-28 §4)', () => {
  it('compte six images qui volent et douze qui ne volent pas, toutes différentes', () => {
    expect(FLYING_IMAGES).toEqual(['pigeon', 'plane', 'helicopter', 'butterfly', 'bee', 'rocket']);
    expect(GROUNDED_IMAGES).toEqual([
      'cow',
      'pig',
      'dog',
      'fish',
      'snail',
      'turtle',
      'car',
      'train',
      'boat',
      'chair',
      'house',
      'tree',
    ]);
    expect(IMAGE_IDS).toHaveLength(18);
    expect(new Set(IMAGE_IDS).size).toBe(18);
  });

  it('exclut les cas discutables du catalogue', () => {
    for (const excluded of [
      'cloud',
      'balloon',
      'kite',
      'hen',
      'penguin',
      'ostrich',
      'bat',
      'duck',
    ]) {
      expect(isImageId(excluded)).toBe(false);
    }
  });

  it('reconnaît ce qui vole et ce qui ne vole pas', () => {
    for (const image of FLYING_IMAGES) expect(isFlyingImage(image)).toBe(true);
    for (const image of GROUNDED_IMAGES) expect(isFlyingImage(image)).toBe(false);
    expect(isFlyingImage('owl')).toBe(false);
  });

  it('la chouette est la cible du castelet, le renard puis le chat gris ses imposteurs', () => {
    expect(DECOY_IDS).toEqual(['fox', 'cat']);
    expect(isImageId('fox')).toBe(false);
    expect(isImageId('cow')).toBe(true);
    expect(isImageId('owl')).toBe(false);
  });
});

describe('Libellés pour les lecteurs d’écran', () => {
  it('résume la règle de chaque étoile, avec et sans leurre ni STOP tardif', () => {
    const titles = new Set(GO_NO_GO_CATALOG.map((entry) => getRuleTitle(entry.config)));
    expect(titles).toEqual(
      new Set([
        'La chouette a dit',
        'Ça vole ?',
        'Ça vole ? et le leurre de la chouette',
        'STOP tardif',
        'Ça vole ? et STOP tardif',
      ]),
    );
  });

  it('dit la consigne de chaque étoile en une phrase', () => {
    const sentences = new Set(GO_NO_GO_CATALOG.map((entry) => getRuleSentence(entry.config)));
    expect(sentences).toEqual(
      new Set([
        'Tape quand c’est la chouette.',
        'Tape seulement si ça vole.',
        'Tape seulement si ça vole, même quand la chouette bat des ailes.',
        'Tape, sauf si le panneau STOP arrive.',
        'Tape seulement si ça vole, sauf si le panneau STOP arrive.',
      ]),
    );
  });

  it('nomme le buzzer « Taper » et annonce la pause, la démo, les essais et le départ', () => {
    expect(BUZZER_LABEL).toBe('Taper');
    expect(Object.values(ANNOUNCEMENTS).every((text) => text.length > 0)).toBe(true);
    expect(ANNOUNCEMENTS.paused).toContain('Pause');
  });

  it('décrit la guirlande sans la montrer en chiffres', () => {
    expect(formatGarlandLabel(3, 12)).toBe('3 sur 12 réussies');
  });
});

describe('Phrases de la mascotte (FEAT-28 §9, §11.2)', () => {
  /** Les phrases nouvelles, telles que la spécification les écrit (ponctuation de l'oral près). */
  const EXPECTED: Record<string, string> = {
    'rule-owl-says': "Tape quand c'est moi !",
    'rule-flies': 'Tape seulement si ça vole !',
    'rule-late-stop': 'Tape, sauf si le STOP arrive !',
    'rule-lure': 'Attention, je vais essayer de te piéger !',
    'demo-bravo': 'Bravo !',
    'demo-oops': 'Oups, même moi, mon cerveau est allé trop vite !',
    'demo-warning':
      'Ton cerveau va vouloir taper très vite pour tout attraper. Attention, il risque de te tendre un piège ! Prépare-toi à faire STOP.',
  };

  it('écrit les phrases de la spécification', () => {
    for (const [id, text] of Object.entries(EXPECTED)) {
      expect(VOICE_SCRIPT[id as keyof typeof VOICE_SCRIPT]).toBe(text);
    }
  });

  it('dit « taper », jamais « cliquer », le mot des enfants au doigt comme à la télécommande', () => {
    expect(Object.values(VOICE_SCRIPT).join(' ').toLowerCase()).not.toContain('clique');
    expect(VOICE_SCRIPT['demo-warning']).toContain('taper');
  });

  it('a une phrase « … vole ! » pour chacune des 18 images, et pour elles seules', () => {
    const lures = GO_NO_GO_CLIP_IDS.filter((id) => id.startsWith('lure-'));
    expect(new Set(lures)).toEqual(new Set(IMAGE_IDS.map((image) => getLureClipId(image))));
    for (const image of IMAGE_IDS) {
      expect(VOICE_SCRIPT[getLureClipId(image)]).toMatch(/^[A-ZÉ][a-zéè]+ vole !$/);
    }
    expect(VOICE_SCRIPT['lure-cow']).toBe('Vache vole !');
    expect(VOICE_SCRIPT['lure-plane']).toBe('Avion vole !');
  });

  it('compte 25 phrases nouvelles, aux identifiants sans doublon', () => {
    expect(GO_NO_GO_CLIP_IDS).toHaveLength(7 + 18);
    expect(new Set(GO_NO_GO_CLIP_IDS).size).toBe(GO_NO_GO_CLIP_IDS.length);
  });

  it('range les clips là où le pré-cache hors-ligne les prend', () => {
    for (const id of GO_NO_GO_CLIP_IDS) {
      expect(getVoiceClipPath(id)).toBe(`audio/go-no-go/${id}.mp3`);
      expect(isPrecacheable(getVoiceClipPath(id))).toBe(true);
    }
  });

  it('choisit la phrase de rappel de chaque règle, celle du leurre au palier 4, les deux règles mêlées aux étoiles 19 et 20', () => {
    const ids = GO_NO_GO_CATALOG.map((entry) => getRuleClipIds(entry.config).join('+'));
    expect(ids.slice(0, 8).every((id) => id === 'rule-owl-says')).toBe(true);
    expect(ids.slice(8, 12).every((id) => id === 'rule-flies')).toBe(true);
    expect(ids.slice(12, 16).every((id) => id === 'rule-lure')).toBe(true);
    expect(ids.slice(16, 18).every((id) => id === 'rule-late-stop')).toBe(true);
    // « Ça vole ? » et le STOP tardif mêlés : la voix seule dit les deux règles, comme la phrase des
    // lecteurs d'écran.
    expect(ids.slice(18)).toEqual(['rule-flies+rule-late-stop', 'rule-flies+rule-late-stop']);
    expect(getRuleClipPaths(OWL)).toEqual([getVoiceClipPath('rule-owl-says')]);
  });

  it('donne les clips qu’une étoile peut jouer : la phrase de rappel d’abord, puis l’erreur, l’indice, la victoire', () => {
    const paths = getStarClipPaths(OWL, ['owl', 'fox', 'owl']);
    expect(paths).toEqual([
      getVoiceClipPath('rule-owl-says'),
      SHARED_CLIPS.trapped,
      SHARED_CLIPS.lookCarefully,
      SHARED_CLIPS.starWon,
      SHARED_CLIPS.crownWon,
    ]);
  });

  it('ajoute au palier 4 le « … vole ! » de chaque image de la file, une fois chacun', () => {
    const lure = GO_NO_GO_CATALOG.find((entry) => entry.config.hasLure)?.config;
    if (!lure) throw new Error('aucune étoile à leurre');
    const paths = getStarClipPaths(lure, ['cow', 'plane', 'cow', 'owl']);
    expect(paths).toContain(getVoiceClipPath('lure-cow'));
    expect(paths).toContain(getVoiceClipPath('lure-plane'));
    expect(paths.filter((path) => path === getVoiceClipPath('lure-cow'))).toHaveLength(1);
    expect(paths[0]).toBe(getVoiceClipPath('rule-lure'));
    // Un personnage du castelet n'a pas de « … vole ! ».
    expect(paths.some((path) => path.includes('lure-owl'))).toBe(false);
    // Hors du palier 4, aucune image n'est annoncée.
    expect(getStarClipPaths(OWL, ['cow']).some((path) => path.includes('lure-'))).toBe(false);
  });

  it('reprend telles quelles quatre phrases d’Attrape-Piège, dont les fichiers existent', () => {
    expect(SHARED_CLIPS).toEqual({
      trapped: 'audio/bear-sort/bounce-trap.mp3',
      lookCarefully: 'audio/bear-sort/hint-look.mp3',
      starWon: 'audio/bear-sort/star-won.mp3',
      crownWon: 'audio/bear-sort/crown-won.mp3',
    });
    for (const path of Object.values(SHARED_CLIPS)) {
      expect(existsSync(join(PUBLIC_DIR, path))).toBe(true);
      expect(isPrecacheable(path)).toBe(true);
    }
  });
});

describe('Clips générés', () => {
  const MANIFEST_PATH = join(process.cwd(), 'src/games/go-no-go/voice-manifest.json');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    voice: string;
    speakerId: number;
    lengthScale: number;
    clips: Record<string, { text: string; seconds: number }>;
  };
  const generated = Object.keys(manifest.clips);

  it('nomme la voix d’Attrape-Piège : même modèle, même locuteur, même ralentissement', () => {
    expect(manifest).toMatchObject({ voice: 'fr_FR-mls-medium', speakerId: 55, lengthScale: 1.2 });
  });

  it('a généré chaque phrase du script : une phrase ajoutée sans clip serait mimée en silence', () => {
    expect([...generated].sort()).toEqual([...GO_NO_GO_CLIP_IDS].sort());
  });

  it('ne liste que des phrases du script, avec leur texte à jour (clip périmé signalé)', () => {
    for (const id of generated) {
      expect(GO_NO_GO_CLIP_IDS).toContain(id);
      expect(manifest.clips[id]?.text).toBe(VOICE_SCRIPT[id as keyof typeof VOICE_SCRIPT]);
    }
  });

  it('a un vrai fichier MP3 par clip listé, et aucun fichier sans phrase', () => {
    for (const id of generated) {
      const content = readFileSync(join(PUBLIC_DIR, getVoiceClipPath(id as GoNoGoClipId)));
      expect(content.length).toBeGreaterThan(1024);
    }
    const dir = join(PUBLIC_DIR, 'audio/go-no-go');
    const files = existsSync(dir) ? readdirSync(dir).sort() : [];
    expect(files).toEqual(generated.map((id) => `${id}.mp3`).sort());
  });

  it('tient la mise en garde dans une durée raisonnable une fois générée, et chaque « … vole ! » dans la fenêtre du palier 4', () => {
    for (const id of generated) {
      const { seconds } = manifest.clips[id] ?? { seconds: 0 };
      expect(seconds).toBeGreaterThan(0.5);
      if (id === 'demo-warning') expect(seconds).toBeLessThan(14);
      // Le « … vole ! » doit tenir dans la fenêtre la plus courte du palier 4 (1,1 s), pause finale de 0,25 s en plus.
      else if (id.startsWith('lure-')) expect(seconds).toBeLessThanOrEqual(1.1 + 0.25);
      else expect(seconds).toBeLessThan(6);
    }
  });
});
