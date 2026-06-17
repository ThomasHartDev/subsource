#!/usr/bin/env python3
"""Face-track a clip and emit a per-sample face-center track as JSON.

Used by the auto-edit reframe step so the crop can follow the speaker's head
instead of assuming they're centered. Lightweight on purpose: OpenCV Haar
cascades (bundled, no model download) sampled at a few fps. Detection gaps
(head turns, occlusion) are left as conf=0 and bridged later by the smoother.
"""
import sys
import json
import argparse
import cv2


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--fps", type=float, default=6.0, help="samples per second")
    ap.add_argument("--detect-width", type=int, default=480, help="downscale width for detection speed")
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        print(f"[autoframe] cannot open {args.input}", file=sys.stderr)
        return 1

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, int(round(src_fps / args.fps)))

    cascade_dir = cv2.data.haarcascades
    frontal = cv2.CascadeClassifier(cascade_dir + "haarcascade_frontalface_default.xml")
    profile = cv2.CascadeClassifier(cascade_dir + "haarcascade_profileface.xml")

    # Downscale for detection; map face coords back to source pixels.
    scale = args.detect_width / W if W > args.detect_width else 1.0
    det_h = int(round(H * scale))
    min_face = max(40, int(det_h * 0.12))

    track = []
    idx = 0
    detected = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            t = idx / src_fps
            small = cv2.resize(frame, (args.detect_width, det_h)) if scale != 1.0 else frame
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            faces = frontal.detectMultiScale(gray, 1.1, 6, minSize=(min_face, min_face))
            if len(faces) == 0:
                faces = profile.detectMultiScale(gray, 1.1, 5, minSize=(min_face, min_face))
            if len(faces) == 0:
                # Mirror for the other profile direction.
                faces = profile.detectMultiScale(cv2.flip(gray, 1), 1.1, 5, minSize=(min_face, min_face))
                faces = [(args.detect_width - x - w, y, w, h) for (x, y, w, h) in faces]
            if len(faces) > 0:
                # Largest face wins (the speaker, not a background bystander).
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
                cx = (x + w / 2) / scale
                cy = (y + h / 2) / scale
                track.append({"t": round(t, 3), "cx": round(cx, 1), "cy": round(cy, 1),
                              "w": round(w / scale, 1), "h": round(h / scale, 1), "conf": 1})
                detected += 1
            else:
                track.append({"t": round(t, 3), "cx": None, "cy": None, "w": 0, "h": 0, "conf": 0})
        idx += 1

    cap.release()
    out = {"width": W, "height": H, "src_fps": src_fps, "n_frames": n_frames,
           "samples": len(track), "detected": detected, "track": track}
    with open(args.output, "w") as f:
        json.dump(out, f)
    print(f"[autoframe] {W}x{H} {len(track)} samples, {detected} with a face "
          f"({100*detected//max(1,len(track))}%) -> {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
