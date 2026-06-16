#!/usr/bin/env python3
"""Reframe a clip to a target aspect by following the speaker's head.

Consumes a face track (autoframe.py) + the master video and produces a video at
the exact target dimensions. The crop window slides along one axis to keep the
face framed, using a "virtual camera operator" motion model: hold still inside a
deadzone, then ease toward the face with a capped velocity. That reads as an
intentional slow reframe instead of jittery per-frame chasing.

crop's per-frame `eval=frame` isn't available in this ffmpeg build and zoompan
can't change aspect ratio while panning, so the crop is done here in OpenCV and
raw frames are piped to ffmpeg for H.264 encode + audio mux from the master.
"""
import sys
import json
import argparse
import subprocess
import cv2
import numpy as np


def fill_gaps(vals):
    """Forward/back-fill None gaps; return None if entirely empty."""
    n = len(vals)
    out = list(vals)
    last = None
    for i in range(n):
        if out[i] is None:
            out[i] = last
        else:
            last = out[i]
    # back-fill any leading None
    nxt = None
    for i in range(n - 1, -1, -1):
        if out[i] is None:
            out[i] = nxt
        else:
            nxt = out[i]
    return out if any(v is not None for v in out) else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--track", required=True)
    ap.add_argument("--tw", type=int, required=True)
    ap.add_argument("--th", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--deadzone", type=float, default=0.10, help="fraction of crop dim the face can drift before the camera moves")
    ap.add_argument("--max-vel", type=float, default=0.45, help="max camera speed as fraction of crop dim per second")
    ap.add_argument("--ema", type=float, default=0.12, help="extra smoothing 0..1 (higher = snappier)")
    ap.add_argument("--audio-bitrate", default="192k")
    args = ap.parse_args()

    td = json.load(open(args.track))
    W, H = td["width"], td["height"]
    samples = td["track"]

    cap = cv2.VideoCapture(args.master)
    if not cap.isOpened():
        print(f"[reframe] cannot open {args.master}", file=sys.stderr)
        return 1
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    src_ar = W / H
    tgt_ar = args.tw / args.th

    # Decide crop window + which axis pans. Same-aspect source needs no pan.
    same_aspect = abs(src_ar - tgt_ar) < 0.01
    if same_aspect:
        cw, ch, axis = W, H, None
    elif src_ar > tgt_ar:
        cw, ch, axis = int(round(H * tgt_ar)), H, "x"  # source wider: pan horizontally
    else:
        cw, ch, axis = W, int(round(W / tgt_ar)), "y"  # source taller: pan vertically
    cw = min(cw, W); ch = min(ch, H)
    crop_dim = cw if axis == "x" else ch

    # Build the desired center per sample along the pan axis, then per frame.
    pos_min = crop_dim / 2
    pos_max = (W if axis == "x" else H) - crop_dim / 2
    center_default = (W if axis == "x" else H) / 2

    if axis is None:
        desired_per_frame = None
    else:
        key = "cx" if axis == "x" else "cy"
        raw = [(s["t"], s[key] if s["conf"] else None) for s in samples]
        filled = fill_gaps([v for _, v in raw])
        if filled is None:
            filled = [center_default] * len(raw)
        times = [t for t, _ in raw]
        # linear interpolate samples -> every output frame
        desired_per_frame = []
        for f in range(n_frames):
            t = f / fps
            # find bracketing samples
            if t <= times[0]:
                v = filled[0]
            elif t >= times[-1]:
                v = filled[-1]
            else:
                # binary-ish linear scan (sample count is small)
                j = 0
                while j < len(times) - 1 and times[j + 1] < t:
                    j += 1
                t0, t1 = times[j], times[j + 1]
                v0, v1 = filled[j], filled[j + 1]
                a = (t - t0) / (t1 - t0) if t1 > t0 else 0
                v = v0 + (v1 - v0) * a
            desired_per_frame.append(min(pos_max, max(pos_min, v)))

    # Virtual-camera smoothing: deadzone hold + velocity cap + EMA.
    deadzone_px = args.deadzone * crop_dim
    max_step = args.max_vel * crop_dim / fps
    positions = []
    if axis is not None:
        pos = desired_per_frame[0]
        for d in desired_per_frame:
            diff = d - pos
            if abs(diff) > deadzone_px:
                target = d - deadzone_px if diff > 0 else d + deadzone_px
                step = max(-max_step, min(max_step, target - pos))
                pos += step
            pos += (d - pos) * args.ema * 0.5  # gentle pull, keeps motion alive without jitter
            pos = min(pos_max, max(pos_min, pos))
            positions.append(pos)

    # Encode: pipe raw BGR frames to ffmpeg, mux audio from the master.
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{args.tw}x{args.th}", "-r", f"{fps}", "-i", "-",
         "-i", args.master,
         "-map", "0:v", "-map", "1:a?",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", args.audio_bitrate, "-movflags", "+faststart",
         "-shortest", args.out],
        stdin=subprocess.PIPE,
    )

    f = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if axis is None:
            x0, y0 = (W - cw) // 2, (H - ch) // 2
        elif axis == "x":
            c = positions[min(f, len(positions) - 1)]
            x0 = int(round(min(pos_max, max(pos_min, c)) - cw / 2))
            y0 = 0
        else:
            c = positions[min(f, len(positions) - 1)]
            x0 = 0
            y0 = int(round(min(pos_max, max(pos_min, c)) - ch / 2))
        x0 = max(0, min(W - cw, x0)); y0 = max(0, min(H - ch, y0))
        crop = frame[y0:y0 + ch, x0:x0 + cw]
        if crop.shape[1] != args.tw or crop.shape[0] != args.th:
            crop = cv2.resize(crop, (args.tw, args.th), interpolation=cv2.INTER_LANCZOS4)
        ff.stdin.write(np.ascontiguousarray(crop).tobytes())
        f += 1

    cap.release()
    ff.stdin.close()
    rc = ff.wait()
    axis_label = {"x": "pan-X", "y": "pan-Y", None: "scale-only"}[axis]
    print(f"[reframe] {W}x{H} -> {args.tw}x{args.th} ({axis_label}, crop {cw}x{ch}), {f} frames, rc={rc}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
