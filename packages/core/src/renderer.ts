import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import satori from "satori";
import { SlipError } from "./errors.js";
import { renderSlideImage } from "./image.js";
import type {
  LayoutId,
  PhotoBandSlide,
  PhotoFullSlide,
  PhotoSplitSlide,
  Slide,
  TypeOnlySlide
} from "./layouts.js";
import type { Brand } from "./schema.js";

const require = createRequire(import.meta.url);
let fontsPromise: Promise<{
  display: ArrayBuffer;
  displayItalic: ArrayBuffer;
  displayMedium: ArrayBuffer;
  sans: ArrayBuffer;
  sansSemibold: ArrayBuffer;
}> | undefined;

type Element = {
  type: string;
  key?: string;
  props: {
    style?: Record<string, unknown>;
    children?: unknown;
    [key: string]: unknown;
  };
};

type EmphasisStyle = "italic" | "mark";

export interface RenderContext {
  carouselFile: string;
  workspace: string;
  slideIndex?: number;
  slideCount?: number;
  brand?: Brand;
  /** Headline size for this slide, from `planHeadlineSizes`. Fits per slide when absent. */
  headlineSize?: number;
}

const DISPLAY = "Newsreader";
const FRAME = { width: 1080, height: 1350 } as const;
const MARGIN = 66;
const FURNITURE_TOP = 74;
const FURNITURE_BOTTOM = 76;

/**
 * Monochrome by design. The reference language carries no accent hue: emphasis is
 * carried by the italic, and hierarchy by size and tracking alone.
 */
const palettes = {
  paper: {
    background: "#efede8",
    ink: "#12110f",
    muted: "#6b6862",
    rule: "#12110f"
  },
  ink: {
    background: "#0c0c0b",
    ink: "#f4f2ed",
    muted: "#8e8a82",
    rule: "#f4f2ed"
  }
} as const;

const OVER_IMAGE = { ink: "#ffffff", muted: "#d9d5cd" } as const;

async function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(require.resolve("@fontsource/newsreader/files/newsreader-latin-400-normal.woff")),
    readFile(require.resolve("@fontsource/newsreader/files/newsreader-latin-400-italic.woff")),
    readFile(require.resolve("@fontsource/newsreader/files/newsreader-latin-500-normal.woff")),
    readFile(require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff")),
    readFile(require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff"))
  ]).then(([display, displayItalic, displayMedium, sans, sansSemibold]) => ({
    display: display.buffer.slice(display.byteOffset, display.byteOffset + display.byteLength),
    displayItalic: displayItalic.buffer.slice(
      displayItalic.byteOffset,
      displayItalic.byteOffset + displayItalic.byteLength
    ),
    displayMedium: displayMedium.buffer.slice(
      displayMedium.byteOffset,
      displayMedium.byteOffset + displayMedium.byteLength
    ),
    sans: sans.buffer.slice(sans.byteOffset, sans.byteOffset + sans.byteLength),
    sansSemibold: sansSemibold.buffer.slice(
      sansSemibold.byteOffset,
      sansSemibold.byteOffset + sansSemibold.byteLength
    )
  }));
  return fontsPromise;
}

/* -------------------------------------------------------------------------- */
/* Headline fitting                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Advance widths in em, read from the shipped Newsreader faces. Where the roman
 * and italic differ the wider of the two is used, so a headline cannot outgrow
 * its box when part of it is set in the italic.
 *
 * Regenerate with `node scripts/glyph-widths.mjs` after a font upgrade.
 */
const GLYPH_WIDTHS: ReadonlyArray<readonly [number, string]> = [
  [0.199, "'"], [0.23, "."], [0.233, " "], [0.235, "‘"], [0.237, "’"], [0.238, ","],
  [0.252, "|"], [0.256, ":j"], [0.269, ";l"], [0.27, "!"], [0.285, "()i"], [0.322, "{}"],
  [0.329, "["], [0.33, "]"], [0.339, "I"], [0.342, "t"], [0.345, "f"], [0.353, "\"-"],
  [0.384, "s"], [0.396, "r"], [0.401, "\\"], [0.406, "/"], [0.41, "_“"], [0.412, "”"],
  [0.431, "z"], [0.435, "*"], [0.437, "c"], [0.446, "J"], [0.447, "?"], [0.462, "e"],
  [0.494, "a"], [0.495, "g"], [0.5, "`"], [0.507, "x"], [0.516, "+<=>^~"], [0.52, "–"],
  [0.523, "y"], [0.526, "o"], [0.527, "v"], [0.536, "u"], [0.54, "k"], [0.544, "q"],
  [0.546, "b"], [0.554, "S"], [0.556, "d"], [0.561, "h"], [0.564, "p"], [0.567, "#$012345689"],
  [0.573, "n"], [0.592, "F"], [0.603, "L"], [0.609, "P"], [0.633, "Z"], [0.639, "E"],
  [0.641, "…"], [0.643, "B"], [0.645, "R"], [0.65, "7"], [0.67, "T"], [0.683, "Y"],
  [0.685, "—"], [0.692, "V"], [0.705, "C"], [0.711, "A"], [0.717, "&"], [0.719, "X"],
  [0.73, "K"], [0.743, "w"], [0.751, "G"], [0.763, "D"], [0.767, "U"], [0.77, "N"],
  [0.776, "OQ"], [0.8, "H"], [0.807, "%"], [0.832, "m"], [0.909, "@"], [0.967, "W"],
  [0.979, "M"]
];

const GLYPH_WIDTH = new Map<string, number>(
  GLYPH_WIDTHS.flatMap(([width, characters]) => [...characters].map((character) => [character, width] as const))
);

/** Widest glyph in the table; the fallback for anything outside it. */
const FALLBACK_WIDTH = 0.979;

/**
 * Tracking applied to headlines, in em.
 *
 * Light type on a dark ground optically blooms and reads heavier and tighter
 * than the same setting on paper. Dark slides therefore get looser tracking, so
 * that a deck mixing both tones looks like one typeface at one size rather than
 * two slightly different ones.
 */
const HEADLINE_TRACKING = { paper: -0.015, ink: -0.009 } as const;

/**
 * Measurement always assumes the loosest tracking, so a line fitted on paper can
 * never overflow when the same copy is set on ink.
 */
const MEASURED_TRACKING = HEADLINE_TRACKING.ink;

/** Width of a headline string in em units at font size 1, including tracking. */
export function measureHeadlineLine(text: string): number {
  return measure(text);
}

/** Width of a string in em units at font size 1. */
function measure(text: string): number {
  let width = 0;
  for (const character of text) {
    width += (GLYPH_WIDTH.get(character) ?? FALLBACK_WIDTH) + MEASURED_TRACKING;
  }
  return Math.max(width, 0);
}

function longestWord(lines: string[]): number {
  return Math.max(
    ...lines.flatMap((line) => line.split(/\s+/).filter(Boolean).map(measure)),
    0
  );
}

/** Rendered line count for one authored line once the box forces wrapping. */
function wrappedLines(line: string, fontSize: number, maxWidth: number): number {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let count = 1;
  let used = 0;
  for (const word of words) {
    const width = measure(word) * fontSize;
    const spacing = used === 0 ? 0 : measure(" ") * fontSize;
    if (used + spacing + width > maxWidth && used > 0) {
      count += 1;
      used = width;
    } else {
      used += spacing + width;
    }
  }
  return count;
}

/**
 * Largest size at which the headline fills, but does not exceed, its box.
 *
 * Authored newlines are the rag. The first choice is always the size at which
 * every authored line fits on one rendered line, because that is what the
 * writer asked for; re-wrapping a hand-set line produces the two-word orphans
 * that make a deck look automatic. Wrapping is only allowed as a fallback when
 * holding the rag would push the type below its minimum size.
 *
 * Sizes step in 2px so small copy edits do not shift the size of visually
 * identical slides.
 */
export function fitHeadlineSize(
  lines: string[],
  box: { width: number; height: number },
  lineHeight: number,
  bounds: { min: number; max: number }
): number {
  // Widths come from the font itself, so only a hairline of slack is needed
  // against kerning and the rounding satori applies.
  const widest = Math.max(...lines.map(measure), 0);
  const byWidth = widest > 0 ? (box.width * 0.995) / widest : bounds.max;
  const byHeight = box.height / (lines.length * lineHeight);
  const held = Math.min(byWidth, byHeight, bounds.max);
  if (held >= bounds.min) return Math.floor(held / 2) * 2;

  const wordCap = longestWord(lines) > 0 ? (box.width * 0.98) / longestWord(lines) : bounds.max;
  for (let size = bounds.max; size > bounds.min; size -= 2) {
    if (size > wordCap) continue;
    const rendered = lines.reduce((total, line) => total + wrappedLines(line, size, box.width), 0);
    if (rendered * lineHeight * size <= box.height) return size;
  }
  return bounds.min;
}

/** Leading for every headline, tight enough to read as one block of type. */
const HEADLINE_LINE_HEIGHT = 0.9;

interface HeadlineFrame {
  box: { width: number; height: number };
  bounds: { min: number; max: number };
}

/**
 * The space a layout gives its headline. Kept in one place so the size planner
 * and the renderer can never disagree about how much room there is.
 */
function headlineFrame(slide: Slide): HeadlineFrame {
  switch (slide.layout) {
    case "type_only": {
      const available = FRAME.height - (FURNITURE_TOP + 90) - (FURNITURE_BOTTOM + 126);
      const reserved = (slide.content.eyebrow ? 72 : 0) + (slide.content.body ? 150 : 0);
      return {
        box: { width: FRAME.width - MARGIN * 2, height: available - reserved },
        bounds: { min: 54, max: 140 }
      };
    }
    case "photo_full":
      return {
        box: { width: FRAME.width - MARGIN * 2, height: slide.content.body ? 470 : 620 },
        bounds: { min: 52, max: 116 }
      };
    case "photo_split":
      return {
        box: { width: 525 - 116, height: slide.content.body ? 460 : 720 },
        bounds: { min: 40, max: 82 }
      };
    case "photo_band":
      return {
        box: { width: slide.content.caption ? 500 : 742, height: 380 },
        bounds: { min: 40, max: 80 }
      };
  }
}

/**
 * One headline size per layout, for the whole carousel.
 *
 * Fitting each slide on its own maximises every frame individually but makes the
 * set look accidental: a three-line slide lands far larger than a five-line one
 * and the reader sees the type jump on every swipe. Taking the smallest fitted
 * size across the slides that share a layout means the deck reads as one object,
 * and short slides simply carry more white space, which is what a designed set
 * does.
 *
 * Returns a size keyed by slide id; pass it back through `RenderContext`.
 */
export function planHeadlineSizes(slides: Slide[]): Record<string, number> {
  const fitted = slides.map((slide) => ({
    slide,
    size: fitHeadlineSize(
      slide.content.headline.split("\n"),
      headlineFrame(slide).box,
      HEADLINE_LINE_HEIGHT,
      headlineFrame(slide).bounds
    )
  }));

  const smallestByLayout = new Map<LayoutId, number>();
  for (const { slide, size } of fitted) {
    smallestByLayout.set(slide.layout, Math.min(smallestByLayout.get(slide.layout) ?? size, size));
  }

  return Object.fromEntries(
    fitted.map(({ slide }) => [slide.id, smallestByLayout.get(slide.layout)!])
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A fine, low-amplitude grain. Deliberately far below the previous speckle: at
 * this size the paper reads as a surface rather than as visible noise.
 */
function paperGrain(): Element {
  const flecks = Array.from({ length: 140 }, (_, index) => ({
    type: "circle",
    key: `grain-${index}`,
    props: {
      cx: (index * 383 + (index % 7) * 71) % FRAME.width,
      cy: (index * 617 + (index % 11) * 43) % FRAME.height,
      r: index % 6 === 0 ? 0.7 : 0.45,
      fill: "#6b6862",
      opacity: index % 3 === 0 ? 0.5 : 0.3
    }
  }));

  return {
    type: "svg",
    key: "paper-grain",
    props: {
      width: FRAME.width,
      height: FRAME.height,
      viewBox: `0 0 ${FRAME.width} ${FRAME.height}`,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
      style: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.07,
        pointerEvents: "none"
      },
      children: flecks
    }
  };
}

/**
 * Two-line wordmark: an italic display line above letterspaced display capitals,
 * as in the reference sets. A single line renders as the capitals alone.
 */
function wordmark(brand: Brand | undefined, colour: string): Element | null {
  if (!brand?.wordmark) return null;
  const lines = brand.wordmark.split("\n");
  const [first, second] = lines.length === 2 ? lines : [undefined, lines[0]!];
  return {
    type: "div",
    key: "wordmark",
    props: {
      "data-field": "brand.wordmark",
      "data-wordmark": brand.wordmark,
      style: {
        position: "absolute",
        top: FURNITURE_TOP,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: colour,
        fontFamily: DISPLAY
      },
      children: [
        first
          ? {
              type: "div",
              key: "wordmark-script",
              props: {
                style: {
                  fontSize: 30,
                  fontStyle: "italic",
                  lineHeight: 1,
                  marginBottom: 2
                },
                children: first
              }
            }
          : null,
        {
          type: "div",
          key: "wordmark-capitals",
          props: {
            style: {
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "0.04em"
            },
            children: second!.toUpperCase()
          }
        }
      ]
    }
  };
}

/**
 * Bottom-centre furniture. The signature takes the position when configured;
 * the folio is the fallback so the two never compete for the same spot.
 */
function footer(
  brand: Brand | undefined,
  context: RenderContext | undefined,
  colour: string
): Element | null {
  const folioValue =
    context?.slideIndex !== undefined && context.slideCount !== undefined
      ? `${String(context.slideIndex + 1).padStart(2, "0")} / ${String(context.slideCount).padStart(2, "0")}`
      : undefined;
  const signature = brand?.signature;
  if (!signature && !folioValue) return null;

  return {
    type: "div",
    key: "footer",
    props: {
      style: {
        position: "absolute",
        bottom: FURNITURE_BOTTOM,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center"
      },
      children: signature
        ? {
            type: "div",
            key: "signature",
            props: {
              "data-field": "brand.signature",
              style: {
                fontFamily: "Inter",
                fontSize: 17,
                fontWeight: 400,
                letterSpacing: "0.34em",
                paddingLeft: "0.34em",
                color: colour
              },
              children: signature.toUpperCase()
            }
          }
        : {
            type: "div",
            key: "folio",
            props: {
              "data-folio": true,
              "data-folio-value": folioValue,
              style: {
                fontFamily: "Inter",
                fontSize: 16,
                fontWeight: 400,
                letterSpacing: "0.24em",
                paddingLeft: "0.24em",
                color: colour
              },
              children: folioValue
            }
          }
    }
  };
}

/**
 * Sits directly above the headline, on the same left edge.
 *
 * A number is set in the display face at a size that reads at thumbnail scale
 * without becoming a second focal point. A word is set as small letterspaced
 * capitals. Both stay attached to the type block: a numeral floating alone in
 * the upper margin becomes decoration competing with the headline rather than a
 * label belonging to it.
 */
function eyebrow(text: string | undefined, colour: string, marginBottom: number): Element | null {
  if (!text) return null;
  const numeric = /^\d{1,2}$/.test(text);
  return {
    type: "div",
    key: "field:content.eyebrow",
    props: {
      "data-field": "content.eyebrow",
      style: numeric
        ? {
            fontFamily: DISPLAY,
            fontSize: 42,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: "0.02em",
            color: colour,
            marginBottom: marginBottom - 6,
            display: "flex"
          }
        : {
            fontFamily: "Inter",
            fontSize: 21,
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: "0.24em",
            paddingLeft: "0.24em",
            color: colour,
            marginBottom,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          },
      children: numeric ? text.padStart(2, "0") : text.toUpperCase()
    }
  };
}

function supportingCopy(
  field: "content.body" | "content.caption",
  text: string | undefined,
  options: { colour: string; maxWidth: number; marginTop: number; fontSize?: number; align?: string }
): Element | null {
  if (!text) return null;
  return {
    type: "div",
    key: `field:${field}`,
    props: {
      "data-field": field,
      style: {
        fontFamily: "Inter",
        fontSize: options.fontSize ?? 28,
        lineHeight: 1.5,
        maxWidth: options.maxWidth,
        marginTop: options.marginTop,
        color: options.colour,
        textAlign: options.align ?? "left",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      },
      children: text
    }
  };
}

/**
 * Emphasis is monochrome. `italic` sets the phrase in the display italic;
 * `mark` underlines it with a hairline rule in the same ink.
 */
function headlineLineChildren(
  line: string,
  emphasis: string | undefined,
  emphasisStyle: EmphasisStyle,
  colours: { ink: string; rule: string }
): unknown {
  if (!emphasis) return line;
  const index = line.indexOf(emphasis);
  if (index < 0) return line;
  const remainder = line.slice(index + emphasis.length);
  const punctuation = remainder.match(/^[,.;:!?…]+/)?.[0] ?? "";
  const emphasisCss = emphasisStyle === "mark"
    ? {
        color: colours.ink,
        textDecorationLine: "underline",
        textDecorationStyle: "solid",
        textDecorationColor: colours.rule
      }
    : { fontStyle: "italic", color: colours.ink };
  return [
    line.slice(0, index),
    {
      type: "span",
      key: "headline-emphasis",
      props: {
        "data-emphasis": emphasisStyle,
        style: emphasisCss,
        children: `${emphasis}${punctuation}`
      }
    },
    remainder.slice(punctuation.length)
  ];
}

function headline(
  content: { headline: string; emphasis?: string },
  emphasisStyle: EmphasisStyle,
  colours: { ink: string; rule: string },
  frame: HeadlineFrame,
  align: "left" | "center",
  fixedSize?: number,
  tracking: number = HEADLINE_TRACKING.paper
): Element {
  const lines = content.headline.split("\n");
  const lineHeight = HEADLINE_LINE_HEIGHT;
  const box = frame.box;
  const fontSize = fixedSize ?? fitHeadlineSize(lines, box, lineHeight, frame.bounds);
  let emphasisRendered = false;
  return {
    type: "div",
    key: "field:content.headline",
    props: {
      "data-field": "content.headline",
      "data-headline-size": fontSize,
      style: {
        display: "flex",
        flexDirection: "column",
        fontFamily: DISPLAY,
        fontWeight: 400,
        fontSize,
        lineHeight,
        letterSpacing: `${tracking}em`,
        width: box.width,
        textAlign: align,
        wordBreak: "break-word"
      },
      children: lines.map((line, index) => {
        const lineEmphasis = !emphasisRendered && content.emphasis && line.includes(content.emphasis)
          ? content.emphasis
          : undefined;
        if (lineEmphasis) emphasisRendered = true;
        return {
          type: "div",
          key: `headline-line-${index}`,
          props: {
            "data-headline-line": index + 1,
            style: {
              width: "100%",
              display: "flex",
              flexWrap: "wrap",
              whiteSpace: "pre-wrap",
              justifyContent: align === "center" ? "center" : "flex-start"
            },
            children: headlineLineChildren(line, lineEmphasis, emphasisStyle, colours)
          }
        };
      })
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Layouts                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Type is anchored to a common baseline near the foot of the frame rather than
 * centred in it. Every slide in a deck then shares one horizon, white space
 * collects above it as a deliberate shape, and the upper margin is free for the
 * numeral. Centring the block instead leaves symmetric gaps top and bottom,
 * which reads as absence rather than intent.
 */
function typeOnly(slide: TypeOnlySlide, context?: RenderContext): Element {
  const { align, tone, emphasisStyle } = slide.options;
  const centered = align === "center";
  const palette = palettes[tone];
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: centered ? "center" : "flex-start",
        overflow: "hidden",
        padding: `${FURNITURE_TOP + 90}px ${MARGIN}px ${FURNITURE_BOTTOM + 126}px`,
        background: palette.background,
        color: palette.ink,
        textAlign: centered ? "center" : "left"
      },
      children: [
        tone === "paper" ? paperGrain() : null,
        {
          type: "div",
          props: {
            style: {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: centered ? "center" : "flex-start",
              width: "100%"
            },
            children: [
              eyebrow(slide.content.eyebrow, palette.muted, 38),
              headline(
                slide.content,
                emphasisStyle,
                { ink: palette.ink, rule: palette.rule },
                headlineFrame(slide),
                align,
                context?.headlineSize,
                HEADLINE_TRACKING[tone]
              ),
              supportingCopy("content.body", slide.content.body, {
                colour: palette.muted,
                maxWidth: centered ? 720 : 640,
                marginTop: 44,
                align: centered ? "center" : "left"
              })
            ]
          }
        },
        wordmark(context?.brand, palette.ink),
        footer(context?.brand, context, palette.ink)
      ]
    }
  };
}

/**
 * Full-bleed photograph under a bottom-weighted scrim, with the headline set
 * over the lower half. This is the composition the reference sets use for every
 * photographic slide.
 */
function photoFull(slide: PhotoFullSlide, image: string, context: RenderContext): Element {
  const { emphasisStyle } = slide.options;

  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        overflow: "hidden",
        padding: `0 ${MARGIN}px ${FURNITURE_BOTTOM + 96}px`,
        background: palettes.ink.background,
        color: OVER_IMAGE.ink
      },
      children: [
        {
          type: "img",
          props: {
            src: image,
            width: FRAME.width,
            height: FRAME.height,
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: FRAME.width,
              height: FRAME.height,
              objectFit: "fill"
            }
          }
        },
        {
          type: "div",
          key: "scrim",
          props: {
            style: {
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(180deg, rgba(8,8,7,0.58) 0%, rgba(8,8,7,0.26) 24%, rgba(8,8,7,0.66) 56%, rgba(8,8,7,0.86) 78%, rgba(8,8,7,0.94) 100%)"
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%"
            },
            children: [
              headline(
                slide.content,
                emphasisStyle,
                { ink: OVER_IMAGE.ink, rule: OVER_IMAGE.ink },
                headlineFrame(slide),
                "center",
                context.headlineSize,
                HEADLINE_TRACKING.ink
              ),
              supportingCopy("content.body", slide.content.body, {
                colour: OVER_IMAGE.muted,
                maxWidth: 720,
                marginTop: 38,
                align: "center"
              })
            ]
          }
        },
        wordmark(context.brand, OVER_IMAGE.ink),
        footer(context.brand, context, OVER_IMAGE.ink)
      ]
    }
  };
}

function photoSplit(slide: PhotoSplitSlide, image: string, context: RenderContext): Element {
  const { side, tone, emphasisStyle } = slide.options;
  const palette = palettes[tone];
  const photographLeft = side === "left" ? 0 : 378;
  const surfaceLeft = side === "left" ? 493 : 62;
  const surfaceWidth = 525;
  const contentWidth = surfaceWidth - 116;
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        overflow: "hidden",
        background: palette.background,
        color: palette.ink
      },
      children: [
        {
          type: "img",
          props: {
            src: image,
            width: 702,
            height: 1350,
            style: {
              position: "absolute",
              left: photographLeft,
              top: 0,
              width: 702,
              height: 1350,
              objectFit: "fill"
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: surfaceLeft,
              top: 126,
              width: surfaceWidth,
              height: 1098,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
              padding: "68px 58px 48px",
              background: palette.background
            },
            children: [
              tone === "paper" ? paperGrain() : null,
              {
                type: "div",
                props: {
                  style: {
                    position: "relative",
                    display: "flex",
                    flexDirection: "column"
                  },
                  children: [
                    headline(
                      slide.content,
                      emphasisStyle,
                      { ink: palette.ink, rule: palette.rule },
                      headlineFrame(slide),
                      "left",
                      context.headlineSize
                    ),
                    supportingCopy("content.body", slide.content.body, {
                      colour: palette.muted,
                      maxWidth: contentWidth,
                      marginTop: 38,
                      fontSize: 23
                    })
                  ]
                }
              },
              {
                type: "div",
                props: {
                  style: { position: "relative", display: "flex" },
                  children: context.brand?.signature
                    ? {
                        type: "div",
                        key: "signature",
                        props: {
                          "data-field": "brand.signature",
                          style: {
                            fontFamily: "Inter",
                            fontSize: 14,
                            letterSpacing: "0.3em",
                            paddingLeft: "0.3em",
                            color: palette.muted
                          },
                          children: context.brand.signature.toUpperCase()
                        }
                      }
                    : folioInline(context, palette.muted)
                }
              }
            ]
          }
        }
      ]
    }
  };
}

function photoBand(slide: PhotoBandSlide, image: string, context: RenderContext): Element {
  const { tone, emphasisStyle } = slide.options;
  const palette = palettes[tone];
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        overflow: "hidden",
        background: palette.background,
        color: palette.ink
      },
      children: [
        {
          type: "img",
          props: {
            src: image,
            width: 1080,
            height: 820,
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: 1080,
              height: 820,
              objectFit: "fill"
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 654,
              right: 68,
              width: 862,
              height: 594,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: "58px 60px 50px",
              background: palette.background
            },
            children: [
              tone === "paper" ? paperGrain() : null,
              {
                type: "div",
                props: {
                  style: {
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    width: "100%"
                  },
                  children: [
                    headline(
                      slide.content,
                      emphasisStyle,
                      { ink: palette.ink, rule: palette.rule },
                      headlineFrame(slide),
                      "left",
                      context.headlineSize
                    ),
                    supportingCopy("content.caption", slide.content.caption, {
                      colour: palette.muted,
                      maxWidth: 210,
                      marginTop: 6,
                      fontSize: 21
                    })
                  ]
                }
              }
            ]
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: 68,
              bottom: 48,
              display: "flex"
            },
            children: context.brand?.signature
              ? {
                  type: "div",
                  key: "signature",
                  props: {
                    "data-field": "brand.signature",
                    style: {
                      fontFamily: "Inter",
                      fontSize: 14,
                      letterSpacing: "0.3em",
                      paddingLeft: "0.3em",
                      color: palette.muted
                    },
                    children: context.brand.signature.toUpperCase()
                  }
                }
              : folioInline(context, palette.muted)
          }
        }
      ]
    }
  };
}

function folioInline(context: RenderContext | undefined, colour: string): Element | null {
  if (context?.slideIndex === undefined || context.slideCount === undefined) return null;
  const value = `${String(context.slideIndex + 1).padStart(2, "0")} / ${String(
    context.slideCount
  ).padStart(2, "0")}`;
  return {
    type: "div",
    key: "folio",
    props: {
      "data-folio": true,
      "data-folio-value": value,
      style: {
        fontFamily: "Inter",
        fontSize: 15,
        letterSpacing: "0.22em",
        paddingLeft: "0.22em",
        color: colour
      },
      children: value
    }
  };
}

const renderers = {
  type_only: async (slide: TypeOnlySlide, context?: RenderContext) => typeOnly(slide, context),
  photo_full: async (slide: PhotoFullSlide, context: RenderContext) =>
    photoFull(
      slide,
      await renderSlideImage(slide, context.carouselFile, context.workspace),
      context
    ),
  photo_split: async (slide: PhotoSplitSlide, context: RenderContext) =>
    photoSplit(
      slide,
      await renderSlideImage(slide, context.carouselFile, context.workspace),
      context
    ),
  photo_band: async (slide: PhotoBandSlide, context: RenderContext) =>
    photoBand(
      slide,
      await renderSlideImage(slide, context.carouselFile, context.workspace),
      context
    )
} satisfies Record<LayoutId, (slide: never, context: never) => Promise<Element>>;

function scopeSvgIds(svg: string, slideId: string): string {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
  return ids.reduce((scoped, id) => {
    const replacement = `slip-${slideId}-${id}`;
    return scoped
      .replaceAll(`id="${id}"`, `id="${replacement}"`)
      .replaceAll(`url(#${id})`, `url(#${replacement})`)
      .replaceAll(`href="#${id}"`, `href="#${replacement}"`);
  }, svg);
}

function annotateSvg(svg: string, slide: Slide, context?: RenderContext): string {
  const attributes = [
    `data-headline-lines="${slide.content.headline.split("\n").length}"`,
    slide.content.emphasis ? `data-emphasis-style="${slide.options.emphasisStyle}"` : undefined,
    context?.slideIndex !== undefined && context.slideCount !== undefined
      ? `data-folio-value="${String(context.slideIndex + 1).padStart(2, "0")} / ${String(
          context.slideCount
        ).padStart(2, "0")}"`
      : undefined
  ].filter(Boolean).join(" ");
  return svg.replace("<svg ", `<svg ${attributes} `);
}

export async function renderSlideSvg(slide: Slide, context?: RenderContext): Promise<string> {
  if (slide.layout !== "type_only" && !context) {
    throw new Error(`rendering ${slide.layout} requires carousel file and workspace context`);
  }
  const fonts = await loadFonts();
  const renderer = renderers[slide.layout] as (
    slide: Slide,
    context: RenderContext | undefined
  ) => Promise<Element>;
  const element = await renderer(slide, context);
  const fields: Array<{ field: string; top: number; height: number }> = [];
  const svg = await satori(element as never, {
    width: FRAME.width,
    height: FRAME.height,
    fonts: [
      { name: DISPLAY, data: fonts.display, weight: 400, style: "normal" },
      { name: DISPLAY, data: fonts.displayItalic, weight: 400, style: "italic" },
      { name: DISPLAY, data: fonts.displayMedium, weight: 500, style: "normal" },
      { name: "Inter", data: fonts.sans, weight: 400, style: "normal" },
      { name: "Inter", data: fonts.sansSemibold, weight: 600, style: "normal" }
    ],
    onNodeDetected(node) {
      if (typeof node.key === "string" && node.key.startsWith("field:")) {
        fields.push({ field: node.key.slice("field:".length), top: node.top, height: node.height });
      }
    }
  });
  const safeBottom = {
    type_only: 1204,
    photo_full: 1204,
    photo_split: 1128,
    photo_band: 1168
  } satisfies Record<LayoutId, number>;
  const overflow = fields
    .filter((field) => field.field.startsWith("content."))
    .find((field) => field.top + field.height > safeBottom[slide.layout] + 0.5);
  if (overflow) {
    const prefix = context?.slideIndex === undefined ? "$" : `$.slides[${context.slideIndex}]`;
    throw new SlipError(
      `text overflow in ${overflow.field}`,
      context?.carouselFile,
      `${prefix}.${overflow.field}`
    );
  }
  return scopeSvgIds(annotateSvg(svg, slide, context), slide.id);
}
