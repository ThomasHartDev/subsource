/**
 * Shared Inter font loader for Remotion compositions.
 *
 * loadFont() calls delayRender internally so Remotion waits for the font
 * before rasterising the first frame — no fallback-face flash on render.
 * Only latin subset at weights 600/700/800 to keep cold-render time low.
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadInter("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});

// Montserrat is the creator-caption standard (bold geometric, reads great on any
// background). Loaded as the branded subtitle face — see CAPTION_BRAND in
// TalkingHead.tsx.
const { fontFamily: captionFontFamily } = loadMontserrat("normal", {
  weights: ["700", "800"],
  subsets: ["latin"],
});

export { fontFamily, captionFontFamily };
