// Turn word-level timestamps into a cut plan: keep-segments in the original
// timeline (silence + filler removed) plus caption words remapped to the new
// trimmed timeline. Pure functions so the cut logic is testable in isolation.

export type Word = { word: string; start: number; end: number; prob: number };
export type Segment = { start: number; end: number };
export type CaptionWord = { word: string; start: number; end: number };

export type EditOptions = {
  silenceThreshold: number; // gap (s) between kept words above which we cut
  // Asymmetric breathing room kept around each speech run. More on the tail:
  // tight tail padding clips plosives/breath, the #1 auto-cut quality bug.
  padStart: number;
  padEnd: number;
  removeFiller: boolean;
  fillerWords: string[];
  minSegment: number; // drop kept segments shorter than this (s)
};

export const DEFAULT_OPTIONS: EditOptions = {
  silenceThreshold: 0.6,
  padStart: 0.1,
  padEnd: 0.18,
  removeFiller: true,
  // Conservative set: these are almost never real words. Deliberately excludes
  // "like", "so", "you know" — too many false positives as real speech.
  fillerWords: ["um", "umm", "uh", "uhh", "uhm", "er", "err", "erm", "ah", "ahh", "hmm", "mhm", "mm"],
  minSegment: 0.2,
};

export type EditList = {
  segments: Segment[];
  captions: CaptionWord[];
  originalDuration: number;
  trimmedDuration: number;
  removedFillerCount: number;
};

const normalize = (w: string): string =>
  w
    .toLowerCase()
    .replace(/[^a-z']/g, "")
    .trim();

export function computeEditList(
  words: Word[],
  duration: number,
  opts: EditOptions = DEFAULT_OPTIONS,
): EditList {
  const fillerSet = new Set(opts.fillerWords.map(normalize));
  const sorted = [...words].sort((a, b) => a.start - b.start);

  const isFiller = (w: Word): boolean => opts.removeFiller && fillerSet.has(normalize(w.word));

  // 1. Group kept words into runs. A run breaks on a long gap or a removed
  //    filler word (so the filler's audio is dropped, not kept).
  type Run = { start: number; end: number; words: Word[] };
  const runs: Run[] = [];
  let cur: Run | null = null;
  let prevKept: Word | null = null;
  let removedFillerCount = 0;

  for (const w of sorted) {
    if (isFiller(w)) {
      removedFillerCount++;
      if (cur) {
        runs.push(cur);
        cur = null;
        prevKept = null;
      }
      continue;
    }
    if (cur && prevKept && w.start - prevKept.end <= opts.silenceThreshold) {
      cur.words.push(w);
      cur.end = w.end;
    } else {
      if (cur) runs.push(cur);
      cur = { start: w.start, end: w.end, words: [w] };
    }
    prevKept = w;
  }
  if (cur) runs.push(cur);

  if (runs.length === 0) {
    // No speech detected — keep the whole thing rather than produce nothing.
    return {
      segments: [{ start: 0, end: duration }],
      captions: sorted.map((w) => ({ word: w.word, start: w.start, end: w.end })),
      originalDuration: duration,
      trimmedDuration: duration,
      removedFillerCount,
    };
  }

  // 2. Pad each run, clamp to media bounds, then merge any that overlap after
  //    padding so we don't emit sub-frame micro-cuts.
  const padded: Segment[] = runs.map((r) => ({
    start: Math.max(0, r.start - opts.padStart),
    end: Math.min(duration, r.end + opts.padEnd),
  }));

  const merged: Segment[] = [];
  for (const seg of padded) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end + 0.04) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }

  // 3. Drop segments too short to be worth a cut.
  const segments = merged.filter((s) => s.end - s.start >= opts.minSegment);
  const finalSegments = segments.length > 0 ? segments : merged;

  // 4. Remap kept words to the trimmed timeline.
  const captions: CaptionWord[] = [];
  let offset = 0;
  const kept = sorted.filter((w) => !isFiller(w));
  for (const seg of finalSegments) {
    const segDur = seg.end - seg.start;
    for (const w of kept) {
      if (w.start >= seg.start - 0.001 && w.end <= seg.end + 0.001) {
        captions.push({
          word: w.word,
          start: +(offset + (w.start - seg.start)).toFixed(3),
          end: +(offset + (w.end - seg.start)).toFixed(3),
        });
      }
    }
    offset += segDur;
  }

  return {
    segments: finalSegments,
    captions,
    originalDuration: duration,
    trimmedDuration: +offset.toFixed(3),
    removedFillerCount,
  };
}
