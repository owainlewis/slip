import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import satori from "satori";
import { SlipError } from "./errors.js";
import { renderSlideImage } from "./image.js";
import type {
  LayoutId,
  PhotoBandSlide,
  PhotoSplitSlide,
  Slide,
  TypeOnlySlide
} from "./layouts.js";

const require = createRequire(import.meta.url);
let fontsPromise: Promise<{
  serif: ArrayBuffer;
  serifItalic: ArrayBuffer;
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

type Tone = "paper" | "ink";
type EmphasisStyle = "italic" | "mark";

export interface RenderContext {
  carouselFile: string;
  workspace: string;
  slideIndex?: number;
  slideCount?: number;
}

const palettes = {
  paper: {
    background: "#f2f0ea",
    ink: "#11110f",
    muted: "#575650",
    accent: "#11110f",
    marked: "#11110f",
    markedInk: "#11110f"
  },
  ink: {
    background: "#0d0d0c",
    ink: "#f4f2ed",
    muted: "#c7c5bf",
    accent: "#f4f2ed",
    marked: "#f4f2ed",
    markedInk: "#0d0d0c"
  }
} as const;

async function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(require.resolve("@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff")),
    readFile(require.resolve("@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff")),
    readFile(require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff")),
    readFile(require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff"))
  ]).then(([serif, serifItalic, sans, sansSemibold]) => ({
    serif: serif.buffer.slice(serif.byteOffset, serif.byteOffset + serif.byteLength),
    serifItalic: serifItalic.buffer.slice(
      serifItalic.byteOffset,
      serifItalic.byteOffset + serifItalic.byteLength
    ),
    sans: sans.buffer.slice(sans.byteOffset, sans.byteOffset + sans.byteLength),
    sansSemibold: sansSemibold.buffer.slice(
      sansSemibold.byteOffset,
      sansSemibold.byteOffset + sansSemibold.byteLength
    )
  }));
  return fontsPromise;
}

function paperTexture(): Element {
  const flecks = Array.from({ length: 96 }, (_, index) => ({
    type: "circle",
    key: `fleck-${index}`,
    props: {
      cx: (index * 383 + (index % 7) * 71) % 1080,
      cy: (index * 617 + (index % 11) * 43) % 1350,
      r: index % 5 === 0 ? 1.4 : 0.8,
      fill: "#756f64",
      opacity: index % 3 === 0 ? 0.55 : 0.32
    }
  }));
  const fibres = Array.from({ length: 18 }, (_, index) => {
    const x = (index * 479 + 83) % 1040;
    const y = (index * 733 + 127) % 1320;
    return {
      type: "path",
      key: `fibre-${index}`,
      props: {
        d: `M ${x} ${y} l ${6 + (index % 4) * 3} ${index % 2 === 0 ? 1 : -1}`,
        fill: "none",
        stroke: "#756f64",
        strokeWidth: 0.7,
        opacity: 0.28
      }
    };
  });

  return {
    type: "svg",
    key: "paper-texture",
    props: {
      width: 1080,
      height: 1350,
      viewBox: "0 0 1080 1350",
      preserveAspectRatio: "none",
      "aria-hidden": "true",
      style: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.16,
        pointerEvents: "none"
      },
      children: [...flecks, ...fibres]
    }
  };
}

function folio(context: RenderContext | undefined, tone: Tone): Element | null {
  if (context?.slideIndex === undefined || context.slideCount === undefined) return null;
  const palette = palettes[tone];
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
        fontSize: 18,
        fontWeight: 600,
        letterSpacing: "0.12em",
        color: palette.muted
      },
      children: value
    }
  };
}

function headlineLineChildren(
  line: string,
  emphasis: string | undefined,
  emphasisStyle: EmphasisStyle,
  tone: Tone
): unknown {
  if (!emphasis) return line;
  const index = line.indexOf(emphasis);
  if (index < 0) return line;
  const palette = palettes[tone];
  const remainder = line.slice(index + emphasis.length);
  const punctuation = remainder.match(/^[,.;:!?…]+/)?.[0] ?? "";
  const emphasisCss = emphasisStyle === "mark"
    ? {
        color: palette.ink,
        textDecorationLine: "underline",
        textDecorationStyle: "solid",
        textDecorationColor: palette.marked,
        textDecorationThickness: "1px",
        textUnderlineOffset: "0.08em"
      }
    : {
        fontStyle: "italic",
        color: palette.ink
      };
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
  tone: Tone,
  emphasisStyle: EmphasisStyle,
  style: Record<string, unknown>
): Element {
  let emphasisRendered = false;
  const textAlign = style.textAlign;
  const justifyContent = textAlign === "center"
    ? "center"
    : textAlign === "right"
      ? "flex-end"
      : "flex-start";
  return {
    type: "div",
    key: "field:content.headline",
    props: {
      "data-field": "content.headline",
      style: {
        display: "flex",
        flexDirection: "column",
        fontFamily: "Source Serif 4",
        fontWeight: 400,
        wordBreak: "break-word",
        ...style
      },
      children: content.headline.split("\n").map((line, index) => {
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
              justifyContent
            },
            children: headlineLineChildren(line, lineEmphasis, emphasisStyle, tone)
          }
        };
      })
    }
  };
}

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
        justifyContent: "center",
        alignItems: centered ? "center" : "flex-start",
        overflow: "hidden",
        padding: centered ? "150px 92px 164px" : "146px 96px 164px",
        background: palette.background,
        color: palette.ink,
        textAlign: centered ? "center" : "left"
      },
      children: [
        paperTexture(),
        {
          type: "div",
          props: {
            style: {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: centered ? "center" : "flex-start",
              width: "100%",
              maxWidth: centered ? 884 : 860
            },
            children: [
              slide.content.eyebrow
                ? {
                    type: "div",
                    key: "field:content.eyebrow",
                    props: {
                      "data-field": "content.eyebrow",
                      style: {
                        fontFamily: "Inter",
                        fontSize: 17,
                        fontWeight: 400,
                        lineHeight: 1.2,
                        letterSpacing: "0.24em",
                        color: palette.muted,
                        marginBottom: 64,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word"
                      },
                      children: slide.content.eyebrow.toUpperCase()
                    }
                  }
                : null,
              headline(slide.content, tone, emphasisStyle, {
                fontSize: centered ? 88 : 86,
                lineHeight: 0.98,
                letterSpacing: "-0.035em",
                maxWidth: centered ? 884 : 860,
                textAlign: centered ? "center" : "left"
              }),
              slide.content.body
                ? {
                    type: "div",
                    key: "field:content.body",
                    props: {
                      "data-field": "content.body",
                      style: {
                        fontFamily: "Inter",
                        fontSize: 27,
                        lineHeight: 1.5,
                        maxWidth: centered ? 780 : 700,
                        marginTop: 58,
                        color: palette.muted,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word"
                      },
                      children: slide.content.body
                    }
                  }
                : null
            ]
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              bottom: 56,
              display: "flex",
              justifyContent: centered ? "center" : "flex-end",
              ...(centered ? { left: 0, right: 0 } : { right: 96 })
            },
            children: folio(context, tone)
          }
        }
      ]
    }
  };
}

function photoSplit(slide: PhotoSplitSlide, image: string, context: RenderContext): Element {
  const { side, tone, emphasisStyle } = slide.options;
  const palette = palettes[tone];
  const alignRight = side === "left";
  const overlay = tone === "ink"
    ? { background: "#000000", opacity: 0.25 }
    : { background: palette.background, opacity: 0.78 };
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
            height: 1350,
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: 1080,
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
              left: 0,
              top: 0,
              width: 1080,
              height: 1350,
              ...overlay
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: alignRight ? "flex-end" : "flex-start",
              overflow: "hidden",
              padding: "146px 86px 168px",
              color: palette.ink,
              textAlign: alignRight ? "right" : "left"
            },
            children: {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: alignRight ? "flex-end" : "flex-start",
                  width: 820
                },
                children: [
                  headline(slide.content, tone, emphasisStyle, {
                    width: 820,
                    fontSize: 84,
                    lineHeight: 0.98,
                    letterSpacing: "-0.038em",
                    textAlign: alignRight ? "right" : "left"
                  }),
                  slide.content.body
                    ? {
                        type: "div",
                        key: "field:content.body",
                        props: {
                          "data-field": "content.body",
                          style: {
                            width: 650,
                            marginTop: 52,
                            fontFamily: "Inter",
                            fontSize: 27,
                            lineHeight: 1.5,
                            color: palette.ink,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word"
                          },
                          children: slide.content.body
                        }
                      }
                    : null
                ]
              }
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 56,
              display: "flex",
              justifyContent: "center"
            },
            children: folio(context, tone)
          }
        }
      ]
    }
  };
}

function photoBand(slide: PhotoBandSlide, image: string, context: RenderContext): Element {
  const { tone, emphasisStyle } = slide.options;
  const palette = palettes[tone];
  const overlay = tone === "ink"
    ? { background: "#000000", opacity: 0.32 }
    : { background: palette.background, opacity: 0.78 };
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
            height: 1350,
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: 1080,
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
              left: 0,
              top: 0,
              width: 1080,
              height: 1350,
              ...overlay
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
              padding: "146px 88px 168px",
              color: palette.ink,
              textAlign: "center"
            },
            children: {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 870
                },
                children: [
                  headline(slide.content, tone, emphasisStyle, {
                    width: 870,
                    fontSize: 84,
                    lineHeight: 0.98,
                    letterSpacing: "-0.038em",
                    textAlign: "center"
                  }),
                  slide.content.caption
                    ? {
                        type: "div",
                        key: "field:content.caption",
                        props: {
                          "data-field": "content.caption",
                          style: {
                            width: 700,
                            marginTop: 52,
                            fontFamily: "Inter",
                            fontSize: 27,
                            lineHeight: 1.5,
                            color: palette.ink,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word"
                          },
                          children: slide.content.caption
                        }
                      }
                    : null
                ]
              }
            }
          }
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 56,
              display: "flex",
              justifyContent: "center"
            },
            children: folio(context, tone)
          }
        }
      ]
    }
  };
}

const renderers = {
  type_only: async (slide: TypeOnlySlide, context?: RenderContext) => typeOnly(slide, context),
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
  const headlineAlign = slide.layout === "type_only"
    ? slide.options.align
    : slide.layout === "photo_split"
      ? slide.options.side === "left" ? "right" : "left"
      : "center";
  const attributes = [
    `data-headline-lines="${slide.content.headline.split("\n").length}"`,
    `data-headline-align="${headlineAlign}"`,
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
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Source Serif 4", data: fonts.serif, weight: 400, style: "normal" },
      { name: "Source Serif 4", data: fonts.serifItalic, weight: 400, style: "italic" },
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
    type_only: 1200,
    photo_split: 1128,
    photo_band: 1168
  } satisfies Record<LayoutId, number>;
  const overflow = fields.find((field) => field.top + field.height > safeBottom[slide.layout] + 0.5);
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
