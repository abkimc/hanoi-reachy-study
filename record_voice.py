"""Regenerate the bundled Reachy voice lines with the local Kokoro model."""
from pathlib import Path
import sys
import wave

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root.parent / "reachy-studio"))
from interaction import MODELS, KOKORO_VOICE, kokoro_phonemes

output = root / "media" / "voice"
output.mkdir(exist_ok=True)
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(MODELS / "kokoro-v1.0.onnx"), sess_options=options,
                               providers=["CPUExecutionProvider"])
voice = Kokoro.from_session(session, str(MODELS / "voices-v1.0.bin"))

def record(name, text):
    phonemes = kokoro_phonemes(text, voice.tokenizer)
    samples, rate = voice.create(phonemes, voice=KOKORO_VOICE, speed=.94, is_phonemes=True, trim=False)
    with wave.open(str(output / (name + ".wav")), "wb") as stream:
        stream.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        stream.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())

for name, text in {
    "friendly": "Let's take it one move at a time.",
    "size": "Larger rings must stay below smaller rings.",
    "goal": "Stack every ring on peg three to finish.",
    "top": "Only the top ring of each peg can move.",
}.items():
    record(name, text)

for disk, color in enumerate(("orange", "coral", "teal", "purple", "yellow")):
    for source in range(1, 4):
        for target in range(1, 4):
            if source != target:
                record(f"move-{disk}-{source}-{target}",
                       f"Pick up the {color} ring from peg {source}. Place it on peg {target}.")
print(f"Recorded {len(list(output.glob('*.wav')))} Kokoro voice lines.")
