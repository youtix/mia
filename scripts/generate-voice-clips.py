#!/usr/bin/env python3
"""Génère les phrases de la mascotte d'Attrape-Piège (FEAT-22) avec la voix Piper « MLS ».

Lit `src/games/bear-sort/voice-script.json`, écrit un MP3 par phrase dans
`public/audio/bear-sort/` et `src/games/bear-sort/voice-manifest.json`, que les tests comparent au
texte pour signaler un clip périmé. Un outil de développement : ni Piper ni le modèle ne sont livrés
avec l'application, seuls les MP3 le sont. Un clip enregistré par une vraie voix peut remplacer un
fichier du même nom sans rien changer au jeu.

Prérequis :
    pip install "piper-tts[alignment]" lameenc
    Le modèle `fr_FR-mls-medium.onnx` et son `.onnx.json`, téléchargés depuis
    https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/mls/medium
    (CC BY 4.0, corpus Multilingual LibriSpeech : https://www.openslr.org/94/)

Usage :
    python scripts/generate-voice-clips.py --model chemin/vers/fr_FR-mls-medium.onnx
"""

import argparse
import json
import re
from pathlib import Path

import lameenc
import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = ROOT / "src/games/bear-sort/voice-script.json"
MANIFEST_PATH = ROOT / "src/games/bear-sort/voice-manifest.json"
OUTPUT_DIR = ROOT / "public/audio/bear-sort"

VOICE_NAME = "fr_FR-mls-medium"

# Un des 125 locuteurs du modèle : le choix est expliqué en FEAT-22 §6.
SPEAKER_ID = 55

# Plus lent que la voix d'origine (1 = vitesse du modèle) : elle s'adresse à des enfants de 3 à 6 ans.
LENGTH_SCALE = 1.2

# Le modèle a appris sur de longues phrases de livres audio : seule, une phrase courte ressort hachée et
# traînante. Chacune est donc dite après cette amorce, puis coupée. La marque brute `[[.]]` force un vrai
# silence juste avant la phrase, là où passe la coupe.
LEAD_IN = "Les ours bleus dans la boîte bleue, les ours jaunes dans la boîte jaune, [[.]] "

# Silence : 50 dB sous la crête, mesuré par tranches de 5 ms.
SILENCE_DB = -50
SILENCE_FRAME_SECONDS = 0.005

# Les temps de phonèmes du modèle retardent sur le son : ils bornent les recherches ci-dessous, sans plus.
AFTER_FIRST_PHONEME_SECONDS = 0.02

# Marge gardée avant le premier son, pour ne pas en couper l'attaque.
LEAD_SECONDS = 0.03

# Avant une consonne en tête de phrase, le modèle laisse échapper un son voisé parasite, comme le « e » de
# « e-place ». Il finit avant le phonème, là où son niveau a chuté de 10 dB. Pas de /l/, /m/ ni /n/ ici : ce
# son s'y fond dans la consonne, il n'y a rien à couper.
STRAY_SOUND_BEFORE = set("ptkbdgfsʃvzʒʁ")
STRAY_SOUND_DROP_DB = 10

# Fondu d'entrée : coupée juste après le son parasite, une phrase ne commence pas sur un clic.
FADE_IN_SECONDS = 0.01

# Après chaque phrase, la dernière comprise : le jeu enchaîne certains clips, comme un indice et la règle.
SENTENCE_PAUSE_SECONDS = 0.25

# Mono à 64 kbit/s : largement assez pour une voix à 22 050 Hz, quelques dizaines de Ko par phrase.
MP3_BIT_RATE = 64
MP3_QUALITY = 2


def frame_levels(audio: np.ndarray, frame: int) -> np.ndarray:
    """Renvoie le niveau de chaque tranche de `frame` échantillons de `audio`."""
    count = len(audio) // frame
    return np.sqrt((audio[: count * frame].reshape(count, frame) ** 2).mean(axis=1))


def end_of_longest_silence(audio: np.ndarray, start: int, end: int, sample_rate: int) -> int:
    """Renvoie la fin du plus long silence de `audio[start:end]`, en échantillons."""
    frame = int(SILENCE_FRAME_SECONDS * sample_rate)
    silent = frame_levels(audio[start:end], frame) < np.abs(audio).max() * 10 ** (SILENCE_DB / 20)
    runs = np.flatnonzero(np.diff(np.concatenate(([0], silent.astype(int), [0])))).reshape(-1, 2)
    if len(runs) == 0:
        raise ValueError("aucun silence entre l'amorce et la phrase")
    _, last = max(runs, key=lambda run: run[1] - run[0])
    return start + last * frame


def end_of_stray_sound(audio: np.ndarray, start: int, end: int, sample_rate: int) -> int:
    """Renvoie la fin du son parasite qui ouvre `audio[start:end]`, ou `start` si son niveau ne chute pas."""
    frame = int(SILENCE_FRAME_SECONDS * sample_rate)
    levels = frame_levels(audio[start:end], frame)
    peak = int(levels.argmax())
    fallen = np.flatnonzero(levels[peak:] < levels[peak] * 10 ** (-STRAY_SOUND_DROP_DB / 20))
    return start + (peak + int(fallen[0])) * frame if len(fallen) > 0 else start


def synthesize_sentence(voice: PiperVoice, sentence: str) -> tuple[np.ndarray, int]:
    """Renvoie l'audio d'une phrase, sans l'amorce dite avant elle, et sa fréquence d'échantillonnage."""
    # Aucun bruit aléatoire : le même script redonne les mêmes fichiers, et une phrase corrigée ne
    # réécrit pas les autres. La crête est réglée sur le clip entier, pas sur l'amorce.
    config = SynthesisConfig(
        speaker_id=SPEAKER_ID,
        length_scale=LENGTH_SCALE,
        noise_scale=0,
        noise_w_scale=0,
        normalize_audio=False,
    )
    [chunk] = voice.synthesize(LEAD_IN + sentence, config, include_alignments=True)
    mark = chunk.phonemes.index(".")
    comma = mark - chunk.phonemes[mark::-1].index(",")
    first_phoneme = mark + 2
    sample_rate = chunk.sample_rate

    # Chaque phonème est suivi d'un séparateur, et les deux premiers identifiants ouvrent la phrase.
    def phoneme_start(index: int) -> int:
        return int(chunk.phoneme_id_samples[: 2 + 2 * index].sum())

    start = end_of_longest_silence(
        chunk.audio_float_array,
        phoneme_start(comma),
        phoneme_start(first_phoneme) + int(AFTER_FIRST_PHONEME_SECONDS * sample_rate),
        sample_rate,
    ) - int(LEAD_SECONDS * sample_rate)
    if chunk.phonemes[first_phoneme] in STRAY_SOUND_BEFORE:
        start = end_of_stray_sound(chunk.audio_float_array, start, phoneme_start(first_phoneme), sample_rate)
    audio = chunk.audio_float_array[start:].copy()
    fade = int(FADE_IN_SECONDS * sample_rate)
    audio[:fade] *= np.linspace(0, 1, fade)
    return audio, sample_rate


def synthesize(voice: PiperVoice, text: str) -> tuple[bytes, int]:
    """Renvoie le PCM 16 bits mono du clip et sa fréquence d'échantillonnage."""
    parts: list[np.ndarray] = []
    sample_rate = 0
    for sentence in re.findall(r"[^.!?]+[.!?]", text):
        audio, sample_rate = synthesize_sentence(voice, sentence.strip())
        parts += [audio, np.zeros(int(SENTENCE_PAUSE_SECONDS * sample_rate), dtype=audio.dtype)]
    clip = np.concatenate(parts)
    return (clip / np.abs(clip).max() * 32767).astype(np.int16).tobytes(), sample_rate


def encode_mp3(pcm: bytes, sample_rate: int) -> bytes:
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(MP3_BIT_RATE)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(MP3_QUALITY)
    encoder.silence()
    return bytes(encoder.encode(pcm)) + bytes(encoder.flush())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", required=True, type=Path, help="fichier .onnx de la voix MLS")
    args = parser.parse_args()
    # Le manifeste et les crédits nomment cette voix : un autre modèle les rendrait faux sans rien dire.
    if args.model.stem != VOICE_NAME:
        parser.error(f"modèle attendu : {VOICE_NAME}.onnx")

    script: dict[str, str] = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    voice = PiperVoice.load(args.model, include_alignments=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for stale in OUTPUT_DIR.glob("*.mp3"):
        if stale.stem not in script:
            stale.unlink()

    clips = {}
    for clip_id, text in script.items():
        pcm, sample_rate = synthesize(voice, text)
        (OUTPUT_DIR / f"{clip_id}.mp3").write_bytes(encode_mp3(pcm, sample_rate))
        # 2 octets par échantillon : PCM 16 bits mono.
        seconds = round(len(pcm) / 2 / sample_rate, 2)
        clips[clip_id] = {"text": text, "seconds": seconds}
        print(f"{clip_id}: {seconds} s")

    manifest = {"voice": VOICE_NAME, "speakerId": SPEAKER_ID, "lengthScale": LENGTH_SCALE, "clips": clips}
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
