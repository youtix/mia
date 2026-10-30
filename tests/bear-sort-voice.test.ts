import { isPrecacheable } from '@/core/pwa/precache';
import { STOP_MIN_WAIT_MS } from '@/games/bear-sort';
import manifest from '@/games/bear-sort/voice-manifest.json';
import { BEAR_SORT_CLIP_IDS, VOICE_SCRIPT, getVoiceClipPath } from '@/games/bear-sort/voice-script';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = join(process.cwd(), 'public');

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
