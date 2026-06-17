// AUTO-GENERATED from public/rate-limiting.transcript.json — the real Suno track timings.
// 'src' marks which engine owns the section: remotion=precise CS graphics, higgsfield=generative cinematic, hybrid=both.

export type RLSection = { name: string; beat: string; src: 'remotion'|'higgsfield'|'hybrid'; startSec: number; endSec: number; from: number; durationInFrames: number };
export type RLWord = { word: string; start: number; end: number };

export const FPS = 30;
export const SONG_SECONDS = 122.2;
export const DURATION_IN_FRAMES = 3666;

export const SECTIONS: RLSection[] = [
  {
    "name": "intro",
    "beat": "Title + ambient",
    "src": "higgsfield",
    "startSec": 0.0,
    "endSec": 9.68,
    "from": 0,
    "durationInFrames": 290
  },
  {
    "name": "request",
    "beat": "Client sends a request, answer comes back. The server has a cap: 100/min.",
    "src": "remotion",
    "startSec": 9.68,
    "endSec": 21.06,
    "from": 290,
    "durationInFrames": 341
  },
  {
    "name": "bucket",
    "beat": "TOKEN BUCKET: tokens fill drop-by-drop, each request takes one, refills slow and steady, ask too fast and it falls.",
    "src": "remotion",
    "startSec": 21.06,
    "endSec": 32.38,
    "from": 632,
    "durationInFrames": 340
  },
  {
    "name": "overload",
    "beat": "Push past the cap and the system runs hot: it slows, drops, gives fire.",
    "src": "remotion",
    "startSec": 32.38,
    "endSec": 37.06,
    "from": 971,
    "durationInFrames": 140
  },
  {
    "name": "rejected",
    "beat": "429 Too Many Requests. Slow down, Retry-After, try again.",
    "src": "remotion",
    "startSec": 37.06,
    "endSec": 43.0,
    "from": 1112,
    "durationInFrames": 178
  },
  {
    "name": "why",
    "beat": "The cap isn't punishment, it guards the line so it's there when you need it.",
    "src": "remotion",
    "startSec": 43.0,
    "endSec": 49.22,
    "from": 1290,
    "durationInFrames": 187
  },
  {
    "name": "break",
    "beat": "Instrumental: server straining under load.",
    "src": "higgsfield",
    "startSec": 49.22,
    "endSec": 58.16,
    "from": 1477,
    "durationInFrames": 268
  },
  {
    "name": "youAreServer",
    "beat": "What if YOU are the machine? You have a bucket too. Sleep refills it.",
    "src": "hybrid",
    "startSec": 58.16,
    "endSec": 70.0,
    "from": 1745,
    "durationInFrames": 355
  },
  {
    "name": "burnout",
    "beat": "A downed server can't answer the calls that matter; loved ones sit in the queue.",
    "src": "hybrid",
    "startSec": 70.0,
    "endSec": 80.56,
    "from": 2100,
    "durationInFrames": 317
  },
  {
    "name": "chorus",
    "beat": "Too many requests. A limit keeps it alive. Both meanings land.",
    "src": "remotion",
    "startSec": 80.56,
    "endSec": 92.32,
    "from": 2417,
    "durationInFrames": 353
  },
  {
    "name": "outro",
    "beat": "Set your limit, let the bucket refill. The one who says 'not right now' is still standing.",
    "src": "hybrid",
    "startSec": 93.0,
    "endSec": 102.12,
    "from": 2790,
    "durationInFrames": 274
  },
  {
    "name": "tail",
    "beat": "Instrumental outro + brand card.",
    "src": "higgsfield",
    "startSec": 102.12,
    "endSec": 122.2,
    "from": 3064,
    "durationInFrames": 602
  }
];

export const WORDS: RLWord[] = [{"word": "Every", "start": 9.68, "end": 10.16}, {"word": "screen", "start": 10.16, "end": 10.64}, {"word": "that", "start": 10.64, "end": 10.88}, {"word": "you", "start": 10.88, "end": 11.02}, {"word": "touch", "start": 11.02, "end": 11.3}, {"word": "is", "start": 11.3, "end": 11.58}, {"word": "a", "start": 11.58, "end": 11.74}, {"word": "question", "start": 11.74, "end": 12.02}, {"word": "to", "start": 12.02, "end": 12.2}, {"word": "call", "start": 12.2, "end": 12.48}, {"word": "You", "start": 12.48, "end": 12.7}, {"word": "send", "start": 12.7, "end": 12.98}, {"word": "out", "start": 12.98, "end": 13.28}, {"word": "a", "start": 13.28, "end": 13.44}, {"word": "request", "start": 13.44, "end": 13.78}, {"word": "and", "start": 13.78, "end": 14.28}, {"word": "an", "start": 14.28, "end": 14.44}, {"word": "answer", "start": 14.44, "end": 14.64}, {"word": "comes", "start": 14.64, "end": 14.96}, {"word": "back", "start": 14.96, "end": 15.38}, {"word": "But", "start": 15.38, "end": 15.58}, {"word": "the", "start": 15.58, "end": 15.76}, {"word": "server", "start": 15.76, "end": 15.98}, {"word": "has", "start": 15.98, "end": 16.28}, {"word": "a", "start": 16.28, "end": 16.46}, {"word": "cap,", "start": 16.46, "end": 16.7}, {"word": "say", "start": 16.8, "end": 16.96}, {"word": "a", "start": 16.96, "end": 17.14}, {"word": "hundred", "start": 17.14, "end": 17.42}, {"word": "a", "start": 17.42, "end": 17.64}, {"word": "minute", "start": 17.64, "end": 17.92}, {"word": "A", "start": 17.92, "end": 18.46}, {"word": "budget", "start": 18.46, "end": 18.74}, {"word": "it", "start": 18.74, "end": 18.96}, {"word": "can", "start": 18.96, "end": 19.06}, {"word": "spend", "start": 19.06, "end": 19.42}, {"word": "and", "start": 19.42, "end": 19.64}, {"word": "there's", "start": 19.64, "end": 19.88}, {"word": "only", "start": 19.88, "end": 20.04}, {"word": "so", "start": 20.04, "end": 20.3}, {"word": "much", "start": 20.3, "end": 20.5}, {"word": "in", "start": 20.5, "end": 20.78}, {"word": "it", "start": 20.78, "end": 21.06}, {"word": "A", "start": 21.06, "end": 21.22}, {"word": "picture,", "start": 21.22, "end": 21.42}, {"word": "a", "start": 21.74, "end": 21.8}, {"word": "bucket", "start": 21.8, "end": 22.06}, {"word": "of", "start": 22.06, "end": 22.4}, {"word": "tokens", "start": 22.4, "end": 22.8}, {"word": "filling", "start": 22.8, "end": 23.04}, {"word": "up,", "start": 23.04, "end": 23.4}, {"word": "drop", "start": 23.4, "end": 23.58}, {"word": "by", "start": 23.58, "end": 23.84}, {"word": "drop", "start": 23.84, "end": 24.1}, {"word": "Each", "start": 24.1, "end": 24.34}, {"word": "request", "start": 24.34, "end": 24.68}, {"word": "takes", "start": 24.68, "end": 24.94}, {"word": "one", "start": 24.94, "end": 25.22}, {"word": "out", "start": 25.22, "end": 25.46}, {"word": "when", "start": 25.46, "end": 25.7}, {"word": "it's", "start": 25.7, "end": 25.96}, {"word": "empty,", "start": 25.96, "end": 26.14}, {"word": "you", "start": 26.14, "end": 26.42}, {"word": "stop", "start": 26.42, "end": 26.78}, {"word": "It", "start": 26.78, "end": 27.06}, {"word": "refills", "start": 27.06, "end": 27.5}, {"word": "at", "start": 27.5, "end": 27.74}, {"word": "its", "start": 27.74, "end": 27.9}, {"word": "pace,", "start": 27.9, "end": 28.12}, {"word": "slow", "start": 28.24, "end": 28.4}, {"word": "and", "start": 28.4, "end": 28.52}, {"word": "steady,", "start": 28.52, "end": 28.8}, {"word": "that's", "start": 28.92, "end": 29.3}, {"word": "all", "start": 29.3, "end": 29.54}, {"word": "Ask", "start": 29.54, "end": 29.78}, {"word": "faster", "start": 29.78, "end": 30.24}, {"word": "than", "start": 30.24, "end": 30.44}, {"word": "it", "start": 30.44, "end": 30.58}, {"word": "feels", "start": 30.58, "end": 30.94}, {"word": "and", "start": 30.94, "end": 31.12}, {"word": "your", "start": 31.12, "end": 31.24}, {"word": "next", "start": 31.24, "end": 31.48}, {"word": "request", "start": 31.48, "end": 31.8}, {"word": "will", "start": 31.8, "end": 32.02}, {"word": "fall", "start": 32.02, "end": 32.38}, {"word": "Push", "start": 32.38, "end": 32.56}, {"word": "past", "start": 32.56, "end": 32.92}, {"word": "what", "start": 32.92, "end": 33.16}, {"word": "it", "start": 33.16, "end": 33.3}, {"word": "holds", "start": 33.3, "end": 33.68}, {"word": "and", "start": 33.68, "end": 33.84}, {"word": "the", "start": 33.84, "end": 33.98}, {"word": "system", "start": 33.98, "end": 34.3}, {"word": "runs", "start": 34.3, "end": 34.6}, {"word": "hot", "start": 34.6, "end": 35.0}, {"word": "It", "start": 35.0, "end": 35.16}, {"word": "slows", "start": 35.16, "end": 35.56}, {"word": "and", "start": 35.56, "end": 35.86}, {"word": "it", "start": 35.86, "end": 36.04}, {"word": "drops", "start": 36.04, "end": 36.3}, {"word": "and", "start": 36.3, "end": 36.52}, {"word": "it", "start": 36.52, "end": 36.7}, {"word": "gives", "start": 36.7, "end": 36.94}, {"word": "it", "start": 36.94, "end": 37.06}, {"word": "fire", "start": 37.06, "end": 37.06}, {"word": "Or", "start": 37.06, "end": 37.18}, {"word": "a", "start": 37.18, "end": 37.34}, {"word": "four", "start": 37.34, "end": 37.52}, {"word": "to", "start": 37.52, "end": 37.84}, {"word": "nine,", "start": 37.84, "end": 38.46}, {"word": "too", "start": 38.74, "end": 39.38}, {"word": "many", "start": 39.38, "end": 39.82}, {"word": "requests", "start": 39.82, "end": 40.22}, {"word": "Slow", "start": 40.22, "end": 40.56}, {"word": "down,", "start": 40.56, "end": 40.94}, {"word": "set", "start": 41.08, "end": 41.18}, {"word": "the", "start": 41.18, "end": 41.36}, {"word": "server,", "start": 41.36, "end": 41.64}, {"word": "try", "start": 41.78, "end": 41.92}, {"word": "again,", "start": 41.92, "end": 42.34}, {"word": "take", "start": 42.36, "end": 42.58}, {"word": "a", "start": 42.58, "end": 42.78}, {"word": "rest", "start": 42.78, "end": 43.0}, {"word": "The", "start": 43.0, "end": 43.34}, {"word": "cap's", "start": 43.34, "end": 43.66}, {"word": "not", "start": 43.66, "end": 43.86}, {"word": "to", "start": 43.86, "end": 44.06}, {"word": "punish,", "start": 44.06, "end": 44.36}, {"word": "it's", "start": 44.36, "end": 44.62}, {"word": "guarding", "start": 44.62, "end": 45.0}, {"word": "the", "start": 45.0, "end": 45.42}, {"word": "line", "start": 45.42, "end": 45.66}, {"word": "So", "start": 45.66, "end": 45.88}, {"word": "it's", "start": 45.88, "end": 46.06}, {"word": "there", "start": 46.06, "end": 46.4}, {"word": "when", "start": 46.4, "end": 46.6}, {"word": "you", "start": 46.6, "end": 46.78}, {"word": "need", "start": 46.78, "end": 47.0}, {"word": "it,", "start": 47.0, "end": 47.16}, {"word": "a", "start": 47.3, "end": 47.3}, {"word": "limit", "start": 47.3, "end": 47.46}, {"word": "keeps", "start": 47.46, "end": 48.02}, {"word": "it", "start": 48.02, "end": 48.5}, {"word": "alive", "start": 48.5, "end": 49.22}, {"word": "Now", "start": 58.16, "end": 58.64}, {"word": "what", "start": 58.64, "end": 59.12}, {"word": "if", "start": 59.12, "end": 59.32}, {"word": "it's", "start": 59.32, "end": 59.58}, {"word": "you,", "start": 59.58, "end": 59.86}, {"word": "what", "start": 60.0, "end": 60.12}, {"word": "if", "start": 60.12, "end": 60.3}, {"word": "you're", "start": 60.3, "end": 60.5}, {"word": "the", "start": 60.5, "end": 60.64}, {"word": "machine", "start": 60.64, "end": 61.16}, {"word": "You've", "start": 61.16, "end": 61.68}, {"word": "got", "start": 61.68, "end": 61.8}, {"word": "a", "start": 61.8, "end": 62.0}, {"word": "bucket", "start": 62.0, "end": 62.12}, {"word": "too", "start": 62.12, "end": 62.56}, {"word": "and", "start": 62.56, "end": 62.84}, {"word": "it", "start": 62.84, "end": 62.98}, {"word": "empties", "start": 62.98, "end": 63.28}, {"word": "through", "start": 63.28, "end": 63.46}, {"word": "the", "start": 63.46, "end": 63.64}, {"word": "day", "start": 63.64, "end": 63.94}, {"word": "Sleep", "start": 63.94, "end": 64.3}, {"word": "is", "start": 64.3, "end": 64.62}, {"word": "what", "start": 64.62, "end": 64.8}, {"word": "refills", "start": 64.8, "end": 65.3}, {"word": "it,", "start": 65.3, "end": 65.56}, {"word": "rest", "start": 65.6, "end": 65.72}, {"word": "is", "start": 65.72, "end": 65.98}, {"word": "how", "start": 65.98, "end": 66.2}, {"word": "you", "start": 66.2, "end": 66.38}, {"word": "reset", "start": 66.38, "end": 66.78}, {"word": "But", "start": 66.78, "end": 66.98}, {"word": "they", "start": 66.98, "end": 67.16}, {"word": "told", "start": 67.16, "end": 67.3}, {"word": "you", "start": 67.3, "end": 67.5}, {"word": "you're", "start": 67.5, "end": 67.72}, {"word": "strong", "start": 67.72, "end": 67.94}, {"word": "so", "start": 67.94, "end": 68.16}, {"word": "you", "start": 68.16, "end": 68.36}, {"word": "run", "start": 68.36, "end": 68.6}, {"word": "on", "start": 68.6, "end": 68.94}, {"word": "empty", "start": 68.94, "end": 69.36}, {"word": "instead", "start": 69.36, "end": 70.0}, {"word": "The", "start": 70.0, "end": 70.34}, {"word": "server", "start": 70.34, "end": 70.6}, {"word": "that's", "start": 70.6, "end": 71.0}, {"word": "down", "start": 71.0, "end": 71.3}, {"word": "can't", "start": 71.3, "end": 71.68}, {"word": "answer", "start": 71.68, "end": 72.04}, {"word": "at", "start": 72.04, "end": 72.3}, {"word": "all", "start": 72.3, "end": 72.58}, {"word": "Not", "start": 72.58, "end": 72.78}, {"word": "the", "start": 72.78, "end": 73.02}, {"word": "people", "start": 73.02, "end": 73.28}, {"word": "who", "start": 73.28, "end": 73.6}, {"word": "matter,", "start": 73.6, "end": 73.96}, {"word": "not", "start": 74.14, "end": 74.22}, {"word": "the", "start": 74.22, "end": 74.4}, {"word": "most", "start": 74.4, "end": 74.58}, {"word": "urgent", "start": 74.58, "end": 74.88}, {"word": "call", "start": 74.88, "end": 75.24}, {"word": "And", "start": 75.24, "end": 75.44}, {"word": "when", "start": 75.44, "end": 75.58}, {"word": "the", "start": 75.58, "end": 75.76}, {"word": "loud", "start": 75.76, "end": 76.02}, {"word": "ones", "start": 76.02, "end": 76.32}, {"word": "drain", "start": 76.32, "end": 76.62}, {"word": "you,", "start": 76.62, "end": 76.86}, {"word": "the", "start": 76.94, "end": 77.06}, {"word": "ones", "start": 77.06, "end": 77.3}, {"word": "that", "start": 77.3, "end": 77.54}, {"word": "you", "start": 77.54, "end": 77.76}, {"word": "love", "start": 77.76, "end": 78.02}, {"word": "Just", "start": 78.02, "end": 78.3}, {"word": "sit", "start": 78.3, "end": 78.64}, {"word": "in", "start": 78.64, "end": 78.92}, {"word": "the", "start": 78.92, "end": 79.08}, {"word": "queue", "start": 79.08, "end": 79.34}, {"word": "and", "start": 79.34, "end": 79.6}, {"word": "they", "start": 79.6, "end": 79.74}, {"word": "never", "start": 79.74, "end": 80.1}, {"word": "answer", "start": 80.1, "end": 80.56}, {"word": "Too", "start": 80.56, "end": 81.0}, {"word": "many", "start": 81.0, "end": 82.86}, {"word": "requests,", "start": 82.86, "end": 83.38}, {"word": "slow", "start": 83.44, "end": 83.72}, {"word": "down,", "start": 83.72, "end": 84.12}, {"word": "set", "start": 84.22, "end": 84.3}, {"word": "the", "start": 84.3, "end": 84.48}, {"word": "server,", "start": 84.48, "end": 84.74}, {"word": "try", "start": 84.92, "end": 85.06}, {"word": "again,", "start": 85.06, "end": 85.48}, {"word": "take", "start": 85.5, "end": 85.7}, {"word": "a", "start": 85.7, "end": 85.88}, {"word": "rest", "start": 85.88, "end": 86.16}, {"word": "The", "start": 86.16, "end": 86.46}, {"word": "cap's", "start": 86.46, "end": 86.8}, {"word": "not", "start": 86.8, "end": 86.98}, {"word": "to", "start": 86.98, "end": 87.2}, {"word": "punish,", "start": 87.2, "end": 87.56}, {"word": "it's", "start": 87.66, "end": 88.14}, {"word": "guarding", "start": 88.14, "end": 88.14}, {"word": "the", "start": 88.14, "end": 88.56}, {"word": "line", "start": 88.56, "end": 88.8}, {"word": "So", "start": 88.8, "end": 89.02}, {"word": "it's", "start": 89.02, "end": 89.22}, {"word": "there", "start": 89.22, "end": 89.5}, {"word": "when", "start": 89.5, "end": 89.72}, {"word": "you", "start": 89.72, "end": 89.88}, {"word": "need", "start": 89.88, "end": 90.14}, {"word": "it,", "start": 90.14, "end": 90.32}, {"word": "a", "start": 90.44, "end": 90.46}, {"word": "limit", "start": 90.46, "end": 90.6}, {"word": "keeps", "start": 90.6, "end": 91.12}, {"word": "it", "start": 91.12, "end": 91.62}, {"word": "alive", "start": 91.62, "end": 92.32}, {"word": "So", "start": 93.0, "end": 93.52}, {"word": "set", "start": 93.52, "end": 93.74}, {"word": "your", "start": 93.74, "end": 93.86}, {"word": "limit,", "start": 93.86, "end": 94.2}, {"word": "let", "start": 94.24, "end": 95.38}, {"word": "the", "start": 95.38, "end": 95.52}, {"word": "bucket", "start": 95.52, "end": 95.72}, {"word": "refill", "start": 95.72, "end": 96.16}, {"word": "The", "start": 96.78, "end": 97.3}, {"word": "one", "start": 97.3, "end": 97.44}, {"word": "who", "start": 97.44, "end": 97.58}, {"word": "says", "start": 97.58, "end": 97.74}, {"word": "not", "start": 97.74, "end": 97.98}, {"word": "right", "start": 97.98, "end": 98.18}, {"word": "now", "start": 98.18, "end": 98.54}, {"word": "is", "start": 98.54, "end": 98.96}, {"word": "the", "start": 98.96, "end": 99.06}, {"word": "one", "start": 99.06, "end": 99.22}, {"word": "still", "start": 99.22, "end": 99.48}, {"word": "standing,", "start": 99.48, "end": 99.9}, {"word": "still", "start": 100.24, "end": 100.52}, {"word": "running,", "start": 100.52, "end": 100.96}, {"word": "next", "start": 101.04, "end": 101.82}, {"word": "year", "start": 101.82, "end": 102.12}, {"word": "Ooh,", "start": 120.78, "end": 122.18}, {"word": "ooh,", "start": 122.18, "end": 122.18}, {"word": "ooh,", "start": 122.18, "end": 122.18}, {"word": "ooh,", "start": 122.18, "end": 122.18}, {"word": "ooh,", "start": 122.18, "end": 122.18}, {"word": "ooh,", "start": 122.18, "end": 122.18}, {"word": "ooh,", "start": 122.18, "end": 122.18}, {"word": "ooh", "start": 122.18, "end": 122.18}];
