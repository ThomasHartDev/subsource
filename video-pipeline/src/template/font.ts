/**
 * Shared Inter font loader for Remotion compositions.
 *
 * loadFont() calls delayRender internally so Remotion waits for the font
 * before rasterising the first frame — no fallback-face flash on render.
 * Only latin subset at weights 600/700/800 to keep cold-render time low.
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

const { fontFamily } = loadInter("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});

// Playfair Display — high-contrast editorial serif, the branded subtitle face
// (prestige look). The outline in CAPTION_BRAND thickens its thin strokes so it
// stays legible over video. See CAPTION_BRAND in TalkingHead.tsx.
const { fontFamily: captionFontFamily } = loadPlayfair("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
});

export { fontFamily, captionFontFamily };
