#!/usr/bin/env python3
"""Transcribe a video/audio file to word-level timestamps with faster-whisper.

Usage: python3 transcribe.py <input> <out.json> [model]
Output JSON: { "duration": float, "language": str, "words": [{word,start,end,prob}] }

Model auto-downloads from HuggingFace on first run (httpx, not curl/wget).
Runs on CPU int8 — fine for a GPU-less box, slower than GPU but accurate.
"""
import json
import sys
from faster_whisper import WhisperModel


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: transcribe.py <input> <out.json> [model]", file=sys.stderr)
        sys.exit(2)

    src = sys.argv[1]
    out = sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else "small.en"

    print(f"[transcribe] loading model {model_name} (cpu/int8)...", file=sys.stderr)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    print(f"[transcribe] transcribing {src} ...", file=sys.stderr)
    segments, info = model.transcribe(
        src,
        word_timestamps=True,
        # VAD trims long non-speech so word timings hug actual speech.
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        beam_size=5,
    )

    words = []
    for seg in segments:
        if not seg.words:
            continue
        for w in seg.words:
            token = w.word.strip()
            if not token:
                continue
            words.append(
                {
                    "word": token,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "prob": round(float(w.probability), 3),
                }
            )

    payload = {
        "duration": round(float(info.duration), 3),
        "language": info.language,
        "words": words,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[transcribe] wrote {len(words)} words -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
