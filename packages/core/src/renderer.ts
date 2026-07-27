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
let fontsPromise: Promise<{ serif: ArrayBuffer; sans: ArrayBuffer }> | undefined;

type Element = {
  type: string;
  key?: string;
  props: {
    style?: Record<string, unknown>;
    children?: unknown;
    [key: string]: unknown;
  };
};

export interface RenderContext {
  carouselFile: string;
  workspace: string;
  slideIndex?: number;
}

async function loadFonts(): Promise<{ serif: ArrayBuffer; sans: ArrayBuffer }> {
  fontsPromise ??= Promise.all([
    readFile(require.resolve("@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff")),
    readFile(require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff"))
  ]).then(([serif, sans]) => ({
    serif: serif.buffer.slice(serif.byteOffset, serif.byteOffset + serif.byteLength),
    sans: sans.buffer.slice(sans.byteOffset, sans.byteOffset + sans.byteLength)
  }));
  return fontsPromise;
}

function footer(centered = false): Element {
  return {
    type: "div",
    key: "footer",
    props: {
      "data-footer": true,
      style: {
        width: "100%",
        display: "flex",
        justifyContent: centered ? "center" : "flex-start",
        borderTop: "2px solid #c6bfb3",
        paddingTop: 24,
        fontFamily: "Inter",
        fontSize: 22,
        letterSpacing: "0.08em",
        color: "#6b665e"
      },
      children: "SLIP"
    }
  };
}

function typeOnly(slide: TypeOnlySlide): Element {
  const centered = slide.options.align === "center";
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "108px 96px 92px",
        background: "#f5f0e7",
        color: "#171714",
        textAlign: centered ? "center" : "left",
        alignItems: centered ? "center" : "flex-start"
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: centered ? "center" : "flex-start",
              width: "100%"
            },
            children: [
              slide.content.eyebrow
                ? {
                    type: "div",
                    key: "field:content.eyebrow",
                    props: {
                      style: {
                        fontFamily: "Inter",
                        fontSize: 24,
                        letterSpacing: "0.16em",
                        color: "#9a4f3d",
                        marginBottom: 58,
                        wordBreak: "break-word"
                      },
                      "data-field": "content.eyebrow",
                      children: slide.content.eyebrow.toUpperCase()
                    }
                  }
                : null,
              {
                type: "div",
                key: "field:content.headline",
                props: {
                  style: {
                    fontFamily: "Source Serif 4",
                    fontSize: 92,
                    fontWeight: 700,
                    lineHeight: 1.02,
                    letterSpacing: "-0.035em",
                    maxWidth: 888,
                    wordBreak: "break-word"
                  },
                  "data-field": "content.headline",
                  children: slide.content.headline
                }
              },
              slide.content.body
                ? {
                    type: "div",
                    key: "field:content.body",
                    props: {
                      style: {
                        fontFamily: "Inter",
                        fontSize: 30,
                        lineHeight: 1.42,
                        maxWidth: 800,
                        marginTop: 46,
                        color: "#44423d",
                        wordBreak: "break-word"
                      },
                      "data-field": "content.body",
                      children: slide.content.body
                    }
                  }
                : null
            ]
          }
        },
        footer(centered)
      ]
    }
  };
}

function photoSplit(slide: PhotoSplitSlide, image: string): Element {
  const photograph: Element = {
    type: "img",
    props: {
      src: image,
      width: 540,
      height: 1350,
      style: { width: 540, height: 1350, objectFit: "fill" }
    }
  };
  const copy: Element = {
    type: "div",
    props: {
      style: {
        width: 540,
        height: 1350,
        padding: "88px 64px 72px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f5f0e7",
        color: "#171714"
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column" },
            children: [
              {
                type: "div",
                key: "field:content.headline",
                props: {
                  style: {
                    fontFamily: "Source Serif 4",
                    fontSize: 66,
                    fontWeight: 700,
                    lineHeight: 1.02,
                    letterSpacing: "-0.035em",
                    wordBreak: "break-word"
                  },
                  "data-field": "content.headline",
                  children: slide.content.headline
                }
              },
              slide.content.body
                  ? {
                    type: "div",
                    key: "field:content.body",
                    props: {
                      style: {
                        fontFamily: "Inter",
                        fontSize: 28,
                        lineHeight: 1.42,
                        marginTop: 42,
                        color: "#44423d",
                        wordBreak: "break-word"
                      },
                      "data-field": "content.body",
                      children: slide.content.body
                    }
                  }
                : null
            ]
          }
        },
        footer()
      ]
    }
  };
  return {
    type: "div",
    props: {
      style: { width: "100%", height: "100%", display: "flex", flexDirection: "row" },
      children: slide.options.side === "left" ? [photograph, copy] : [copy, photograph]
    }
  };
}

function photoBand(slide: PhotoBandSlide, image: string): Element {
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#f5f0e7",
        color: "#171714"
      },
      children: [
        {
          type: "img",
          props: {
            src: image,
            width: 1080,
            height: 837,
            style: { width: 1080, height: 837, objectFit: "fill" }
          }
        },
        {
          type: "div",
          props: {
            style: {
              width: 1080,
              height: 513,
              padding: "56px 84px 50px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background: "#f5f0e7"
            },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "flex-start", width: "100%" },
                  children: [
                    {
                      type: "div",
                      key: "field:content.headline",
                      props: {
                        style: {
                          width: slide.content.caption ? 560 : 860,
                          fontFamily: "Source Serif 4",
                          fontSize: 64,
                          fontWeight: 700,
                          lineHeight: 1,
                          letterSpacing: "-0.035em",
                          wordBreak: "break-word"
                        },
                        "data-field": "content.headline",
                        children: slide.content.headline
                      }
                    },
                    slide.content.caption
                      ? {
                          type: "div",
                          key: "field:content.caption",
                          props: {
                            style: {
                              width: 310,
                              marginLeft: "auto",
                              paddingTop: 8,
                              fontFamily: "Inter",
                              fontSize: 24,
                              lineHeight: 1.4,
                              color: "#44423d",
                              wordBreak: "break-word"
                            },
                            "data-field": "content.caption",
                            children: slide.content.caption
                          }
                        }
                      : null
                  ]
                }
              },
              footer()
            ]
          }
        }
      ]
    }
  };
}

const renderers = {
  type_only: async (slide: TypeOnlySlide) => typeOnly(slide),
  photo_split: async (slide: PhotoSplitSlide, context: RenderContext) =>
    photoSplit(slide, await renderSlideImage(slide, context.carouselFile, context.workspace)),
  photo_band: async (slide: PhotoBandSlide, context: RenderContext) =>
    photoBand(slide, await renderSlideImage(slide, context.carouselFile, context.workspace))
} satisfies Record<LayoutId, (slide: never, context: RenderContext) => Promise<Element>>;

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
      { name: "Source Serif 4", data: fonts.serif, weight: 700, style: "normal" },
      { name: "Inter", data: fonts.sans, weight: 400, style: "normal" }
    ],
    onNodeDetected(node) {
      if (typeof node.key === "string" && node.key.startsWith("field:")) {
        fields.push({ field: node.key.slice("field:".length), top: node.top, height: node.height });
      }
    }
  });
  const safeBottom = {
    type_only: 1205,
    photo_split: 1225,
    photo_band: 1247
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
  return scopeSvgIds(svg, slide.id);
}
