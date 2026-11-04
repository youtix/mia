import { isPrecacheable } from '@/core/pwa/precache';
import { STOP_MIN_WAIT_MS } from '@/games/bear-sort';
import manifest from '@/games/bear-sort/voice-manifest.json';
import {
  BEAR_SORT_CLIP_IDS,
  VOICE_SCRIPT,
  getVoiceClipPath,
  type BearSortClipId,
} from '@/games/bear-sort/voice-script';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = join(process.cwd(), 'public');

/** Débit des clips (FEAT-22 §3.5) : donne la durée d'un fichier d'après sa taille, sans le décoder. */
const CLIP_BYTES_PER_SECOND = 64_000 / 8;

/**
 * Secondes qu'un fichier compte en plus de celles du manifeste : les 50 ms de délai de l'encodeur et la
 * fin de sa dernière trame (26 ms), à l'arrondi du manifeste près.
 */
const ENCODER_EXTRA_SECONDS = { min: 0.04, max: 0.09 };

/**
 * Empreinte (SHA-256, 16 premiers chiffres) des clips écoutés et retenus par le propriétaire : deux
 * clips de même durée échangés, ou un fichier remplacé par erreur, ne se voient nulle part ailleurs.
 * Un clip régénéré ou réenregistré exprès : reporter ici sa nouvelle empreinte, après l'avoir écouté.
 */
const CLIP_FINGERPRINTS: Readonly<Record<BearSortClipId, string>> = {
  'bounce-trap': '893eef64594ac352',
  'crown-won': '688d3b8d9a474a92',
  'hint-here': 'ba4685d91c91263a',
  'hint-look': 'f879d4ac43059f15',
  'nudge-more': '69b9e9ac18e6fcee',
  'rule-color': 'd5ce7ba82bcadec8',
  'rule-except-big': 'b01308fe93c972f1',
  'rule-except-big-blue': 'fd60e8b86e6da1b3',
  'rule-except-big-yellow': '0972408d3a8c5187',
  'rule-except-blue': 'b8bcbbf0ead62d14',
  'rule-except-small': '8376291a1403f17c',
  'rule-except-small-blue': '473db7b25c945893',
  'rule-except-small-yellow': '0504edfdf1d5263b',
  'rule-except-yellow': '38564b3baba05a80',
  'rule-size': '3ee75906f9ebc93a',
  'star-won': 'f82409087f41f210',
  'stop-go': 'c5c23c750e96d2f0',
  'stop-warning': 'cea20751bbf50cf1',
};

/** Un MP3 commence par une étiquette ID3 ou par un mot de synchronisation de trame (11 bits à 1). */
function isMp3(content: Buffer): boolean {
  const [first = 0, second = 0] = content;
  return content.subarray(0, 3).toString('latin1') === 'ID3' || (first === 0xff && second >= 0xe0);
}

describe('Clips de la voix de la mascotte (FEAT-22)', () => {
  it.each(BEAR_SORT_CLIP_IDS)('fournit un vrai MP3 pour la phrase « %s »', (id) => {
    const path = join(PUBLIC_DIR, getVoiceClipPath(id));
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path);
    expect(isMp3(content)).toBe(true);
    // Moins de 1 Ko : un clip vide ou tronqué, jamais une phrase entière.
    expect(content.length).toBeGreaterThan(1024);
  });

  it.each(BEAR_SORT_CLIP_IDS)('garde le fichier de « %s » à la durée du manifeste', (id) => {
    const fileSeconds =
      statSync(join(PUBLIC_DIR, getVoiceClipPath(id))).size / CLIP_BYTES_PER_SECOND;
    const extraSeconds = fileSeconds - manifest.clips[id].seconds;
    expect(extraSeconds).toBeGreaterThan(ENCODER_EXTRA_SECONDS.min);
    expect(extraSeconds).toBeLessThan(ENCODER_EXTRA_SECONDS.max);
  });

  it.each(BEAR_SORT_CLIP_IDS)('garde le fichier écouté pour la phrase « %s »', (id) => {
    const content = readFileSync(join(PUBLIC_DIR, getVoiceClipPath(id)));
    const fingerprint = createHash('sha256').update(content).digest('hex').slice(0, 16);
    expect(fingerprint).toBe(CLIP_FINGERPRINTS[id]);
  });

  it('ne livre aucun fichier sans phrase', () => {
    const files = readdirSync(join(PUBLIC_DIR, 'audio/bear-sort')).sort();
    expect(files).toEqual(BEAR_SORT_CLIP_IDS.map((id) => `${id}.mp3`).sort());
  });

  it('signale un clip périmé : le texte généré doit être celui du script', () => {
    const generated = Object.fromEntries(
      Object.entries(manifest.clips).map(([id, clip]) => [id, clip.text]),
    );
    expect(generated).toEqual(VOICE_SCRIPT);
  });

  it('garde des phrases courtes pour de jeunes enfants', () => {
    for (const clip of Object.values(manifest.clips)) {
      expect(clip.seconds).toBeGreaterThan(0.5);
      expect(clip.seconds).toBeLessThan(6);
    }
  });

  it("tient la mise en garde dans l'attente du panneau STOP", () => {
    // Le panneau attend aussi la fin de la voix : un clip plus long allongerait l'attente voulue.
    expect(manifest.clips['stop-warning'].seconds * 1000).toBeLessThanOrEqual(STOP_MIN_WAIT_MS);
  });

  it('range les clips là où le pré-cache hors-ligne les prend', () => {
    for (const id of BEAR_SORT_CLIP_IDS) expect(isPrecacheable(getVoiceClipPath(id))).toBe(true);
  });
});
