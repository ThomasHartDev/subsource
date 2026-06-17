/**
 * Shared Inter font loader for Remotion compositions.
 *
 * loadFont() calls delayRender internally so Remotion waits for the font
 * before rasterising the first frame — no fallback-face flash on render.
 * Only latin subset at weights 600/700/800 to keep cold-render time low.
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

const { fontFamily } = loadInter("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});

// Poppins — clean geometric-humanist sans, the creator-caption standard (matches
// the @emonthebrain reference). Medium weight + a soft shadow, NOT a heavy black
// outline, is what reads polished instead of childish. See CAPTION_BRAND.
const { fontFamily: captionFontFamily } = loadPoppins("normal", {
  weights: ["500", "600"],
  subsets: ["latin"],
});

export { fontFamily, captionFontFamily };
