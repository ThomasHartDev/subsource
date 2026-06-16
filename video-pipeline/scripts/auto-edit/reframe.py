#!/usr/bin/env python3
"""Reframe a clip to a target aspect, following the speaker's head + adding
subtle push-in / pull-out zoom motion so the edit has energy.

Consumes a face track (autoframe.py) + the master video and produces a video at
the exact target dimensions. The crop window:
  - slides to keep the face framed (virtual-camera model: hold inside a deadzone,
    then ease toward the face with a capped velocity), and
  - scales over time with a zoom envelope (gentle push at each cut to hide the
    edit, varied pulls back out, plus a slow creep so it's never frozen).

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

# Varied zoom targets cycled across cuts: a mix of wide (≈1.0) and tight (≈1.1)
# so the motion reads as deliberate push-ins and pull-outs, not a constant creep.
ZOOM_PATTERN = [1.00, 1.08, 1.03, 1.11, 1.05, 1.09, 1.02, 1.07]


def fill_gaps(vals):
    """Forward/back-fill None gaps; return None if entirely empty."""
    out = list(vals)
    last = None
    for i in range(len(out)):
        if out[i] is None:
            out[i] = last
        else:
            last = out[i]
    nxt = None
    for i in range(len(out) - 1, -1, -1):
        if out[i] is None:
            out[i] = nxt
        else:
            nxt = out[i]
    return out if any(v is not None for v in out) else None


def interp_per_frame(samples, key, n_frames, fps, default):
    """Linear-interpolate a gap-filled sample series to every output frame."""
    raw = [(s["t"], s[key] if s["conf"] else None) for s in samples]
    filled = fill_gaps([v for _, v in raw])
    if filled is None:
        filled = [default] * len(raw)
    times = [t for t, _ in raw]
    out = []
    for f in range(n_frames):
        t = f / fps
        if t <= times[0]:
            out.append(filled[0])
        elif t >= times[-1]:
            out.append(filled[-1])
        else:
            j = 0
            while j < len(times) - 1 and times[j + 1] < t:
                j += 1
            t0, t1 = times[j], times[j + 1]
            a = (t - t0) / (t1 - t0) if t1 > t0 else 0
            out.append(filled[j] + (filled[j + 1] - filled[j]) * a)
    return out


def smooth(desired, dim, fps, deadzone_frac, max_vel_frac, ema):
    """Virtual-camera smoothing: deadzone hold + velocity cap + gentle EMA pull."""
    deadzone_px = deadzone_frac * dim
    max_step = max_vel_frac * dim / fps
    pos = desired[0]
    out = []
    for d in desired:
        diff = d - pos
        if abs(diff) > deadzone_px:
            target = d - deadzone_px if diff > 0 else d + deadzone_px
            pos += max(-max_step, min(max_step, target - pos))
        pos += (d - pos) * ema * 0.5
        out.append(pos)
    return out


def build_zoom(n_frames, fps, cuts, zmax):
    """Per-frame zoom factor. Beats at cut points (plus auto-beats every ~4s so
    long takes still move); each beat eases to the next pattern value, then holds
    with a slow creep. A push that lands right on a cut disguises the edit."""
    dur = n_frames / fps
    auto = [i * 4.0 for i in range(int(dur / 4) + 1)]
    merged = sorted(set([0.0] + [c for c in (cuts or []) if c > 0.2] + auto))
    beats = []
    for b in merged:
        if not beats or b - beats[-1] >= 1.2:  # dedupe near-coincident beats
            beats.append(b)
    targets = [min(zmax, ZOOM_PATTERN[i % len(ZOOM_PATTERN)]) for i in range(len(beats))]

    z = []
    for f in range(n_frames):
        t = f / fps
        bi = 0
        while bi < len(beats) - 1 and beats[bi + 1] <= t:
            bi += 1
        t0 = beats[bi]
        z_to = targets[bi]
        z_from = targets[bi - 1] if bi > 0 else 1.0
        interval = (beats[bi + 1] - t0) if bi < len(beats) - 1 else max(1.0, dur - t0)
        ease_dur = min(1.1, max(0.5, interval * 0.4))
        dt = t - t0
        if dt < ease_dur:
            a = dt / ease_dur
            a = a * a * (3 - 2 * a)  # smoothstep
            zz = z_from + (z_to - z_from) * a
        else:
            zz = z_to + 0.004 * (dt - ease_dur)  # gentle creep during the hold
        z.append(min(zmax + 0.03, max(1.0, zz)))
    return z


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
    ap.add_argument("--zoom-max", type=float, default=1.10, help="tightest push-in (1.0 disables zoom)")
    ap.add_argument("--cuts", default="", help="comma-separated cut times (trimmed timeline) to anchor zoom beats")
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
    same_aspect = abs(src_ar - tgt_ar) < 0.01
    if same_aspect:
        cw, ch, axis = W, H, "scale"
    elif src_ar > tgt_ar:
        cw, ch, axis = int(round(H * tgt_ar)), H, "pan-X"
    else:
        cw, ch, axis = W, int(round(W / tgt_ar)), "pan-Y"
    cw = min(cw, W); ch = min(ch, H)

    # Track both axes; zoom opens room on the otherwise-fixed axis too.
    sm_cx = smooth(interp_per_frame(samples, "cx", n_frames, fps, W / 2), cw, fps, args.deadzone, args.max_vel, args.ema)
    sm_cy = smooth(interp_per_frame(samples, "cy", n_frames, fps, H / 2), ch, fps, args.deadzone, args.max_vel, args.ema)

    cuts = [float(c) for c in args.cuts.split(",") if c.strip()] if args.cuts else []
    zoom = build_zoom(n_frames, fps, cuts, args.zoom_max) if args.zoom_max > 1.001 else [1.0] * n_frames

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
    zmax_seen = 1.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        i = min(f, n_frames - 1)
        z = zoom[i] if i < len(zoom) else 1.0
        zmax_seen = max(zmax_seen, z)
        win_w = min(W, max(16, int(round(cw / z)) & ~1))
        win_h = min(H, max(16, int(round(ch / z)) & ~1))
        x0 = max(0, min(W - win_w, int(round(sm_cx[i] - win_w / 2))))
        y0 = max(0, min(H - win_h, int(round(sm_cy[i] - win_h / 2))))
        crop = frame[y0:y0 + win_h, x0:x0 + win_w]
        if crop.shape[1] != args.tw or crop.shape[0] != args.th:
            crop = cv2.resize(crop, (args.tw, args.th), interpolation=cv2.INTER_LANCZOS4)
        ff.stdin.write(np.ascontiguousarray(crop).tobytes())
        f += 1

    cap.release()
    ff.stdin.close()
    rc = ff.wait()
    print(f"[reframe] {W}x{H} -> {args.tw}x{args.th} ({axis}, base crop {cw}x{ch}, "
          f"zoom<={zmax_seen:.2f}), {f} frames, rc={rc}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
