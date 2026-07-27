import { isAbsolute } from "node:path";
import { z } from "zod";

const slideIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const toneSchema = z.enum(["paper", "ink"]).default("paper");
const emphasisStyleSchema = z.enum(["italic", "mark"]).default("italic");
const emphasisSchema = z
  .string()
  .min(1)
  .max(48)
  .refine((value) => !value.includes("\n") && !value.includes("\r"), {
    message: "emphasis must be a single-line phrase"
  })
  .optional();

function requireHeadlineEmphasis(
  content: { headline: string; emphasis?: string },
  context: z.RefinementCtx
): void {
  if (content.emphasis && !content.headline.includes(content.emphasis)) {
    context.addIssue({
      code: "custom",
      message: "emphasis must exactly match text in headline",
      path: ["emphasis"]
    });
  }
}

export const imageSchema = z
  .object({
    src: z
      .string()
      .min(1)
      .refine((value) => !isAbsolute(value), "image path must be relative to carousel.yaml"),
    position: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
    zoom: z.number().min(1).max(3).default(1)
  })
  .strict();

export const typeOnlySlideSchema = z
  .object({
    id: slideIdSchema,
    layout: z.literal("type_only"),
    content: z
      .object({
        headline: z.string().min(1).max(100),
        emphasis: emphasisSchema,
        body: z.string().min(1).max(260).optional(),
        eyebrow: z.string().min(1).max(40).optional()
      })
      .strict()
      .superRefine(requireHeadlineEmphasis),
    options: z
      .object({
        align: z.enum(["left", "center"]).default("left"),
        tone: toneSchema,
        emphasisStyle: emphasisStyleSchema
      })
      .strict()
      .default({ align: "left", tone: "paper", emphasisStyle: "italic" })
  })
  .strict();

export const photoSplitSlideSchema = z
  .object({
    id: slideIdSchema,
    layout: z.literal("photo_split"),
    content: z
      .object({
        headline: z.string().min(1).max(80),
        emphasis: emphasisSchema,
        body: z.string().min(1).max(220).optional()
      })
      .strict()
      .superRefine(requireHeadlineEmphasis),
    image: imageSchema,
    options: z
      .object({
        side: z.enum(["left", "right"]).default("left"),
        tone: toneSchema,
        emphasisStyle: emphasisStyleSchema
      })
      .strict()
      .default({ side: "left", tone: "paper", emphasisStyle: "italic" })
  })
  .strict();

export const photoBandSlideSchema = z
  .object({
    id: slideIdSchema,
    layout: z.literal("photo_band"),
    content: z
      .object({
        headline: z.string().min(1).max(80),
        emphasis: emphasisSchema,
        caption: z.string().min(1).max(120).optional()
      })
      .strict()
      .superRefine(requireHeadlineEmphasis),
    image: imageSchema,
    options: z
      .object({
        tone: toneSchema,
        emphasisStyle: emphasisStyleSchema
      })
      .strict()
      .default({ tone: "paper", emphasisStyle: "italic" })
  })
  .strict();

export const layoutDefinitions = [
  {
    id: "type_only",
    summary: "Oversized editorial typography on a tactile paper or ink canvas.",
    schema: typeOnlySlideSchema,
    fields: [
      "content.headline  required, 1–100 characters",
      "content.emphasis optional exact phrase from headline, 1–48 characters",
      "content.body      optional, 1–260 characters",
      "content.eyebrow   optional, 1–40 characters",
      "options.align     left | center (default: left)",
      "options.tone      paper | ink (default: paper)",
      "options.emphasisStyle italic | mark (default: italic)",
      "image             not allowed"
    ],
    example: `- id: argument
  layout: type_only
  content:
    eyebrow: THE SHIFT
    headline: |-
      Code is no longer
      the scarce part
    emphasis: scarce
    body: Judgment, context, and distribution are harder to reproduce.
  options:
    align: left
    tone: ink
    emphasisStyle: italic`
  },
  {
    id: "photo_split",
    summary: "A full-height photograph and overlapping opaque editorial surface.",
    schema: photoSplitSlideSchema,
    fields: [
      "content.headline  required, 1–80 characters",
      "content.emphasis optional exact phrase from headline, 1–48 characters",
      "content.body      optional, 1–220 characters",
      "image.src         required, path relative to carousel.yaml",
      "image.position    [x, y], each 0–1 inclusive (default: [0.5, 0.5])",
      "image.zoom        1–3 (default: 1)",
      "options.side      left | right (default: left)",
      "options.tone      paper | ink (default: paper)",
      "options.emphasisStyle italic | mark (default: italic)"
    ],
    example: `- id: portrait
  layout: photo_split
  content:
    headline: Make the subject part of the argument
    emphasis: subject
    body: The text remains on an opaque theme-colour region.
  image:
    src: ../../assets/portrait.jpg
    position: [0.62, 0.44]
    zoom: 1.2
  options:
    side: left
    tone: paper
    emphasisStyle: italic`
  },
  {
    id: "photo_band",
    summary: "A wide photographic crop composed with an inset opaque text surface.",
    schema: photoBandSlideSchema,
    fields: [
      "content.headline  required, 1–80 characters",
      "content.emphasis optional exact phrase from headline, 1–48 characters",
      "content.caption   optional, 1–120 characters",
      "image.src         required, path relative to carousel.yaml",
      "image.position    [x, y], each 0–1 inclusive (default: [0.5, 0.5])",
      "image.zoom        1–3 (default: 1)",
      "options.tone      paper | ink (default: paper)",
      "options.emphasisStyle italic | mark (default: italic)"
    ],
    example: `- id: cover
  layout: photo_band
  content:
    headline: Software is becoming disposable
    emphasis: disposable
    caption: The value is moving somewhere else.
  image:
    src: ../../assets/landscape.jpg
    position: [0.62, 0.44]
    zoom: 1.2
  options:
    tone: paper
    emphasisStyle: mark`
  }
] as const;

export const slideSchema = z.discriminatedUnion("layout", [
  layoutDefinitions[0].schema,
  layoutDefinitions[1].schema,
  layoutDefinitions[2].schema
]);

export type Slide = z.infer<typeof slideSchema>;
export type TypeOnlySlide = z.infer<typeof typeOnlySlideSchema>;
export type PhotoSplitSlide = z.infer<typeof photoSplitSlideSchema>;
export type PhotoBandSlide = z.infer<typeof photoBandSlideSchema>;
export type PhotoSlide = PhotoSplitSlide | PhotoBandSlide;
export type LayoutId = Slide["layout"];

export function listLayouts(): string {
  return layoutDefinitions.map((layout) => `${layout.id}\t${layout.summary}`).join("\n");
}

export function describeLayout(id: string): string | undefined {
  const layout = layoutDefinitions.find((candidate) => candidate.id === id);
  if (!layout) return undefined;
  return [
    `${layout.id} — ${layout.summary}`,
    "",
    "Fields",
    ...layout.fields.map((field) => `  ${field}`),
    "",
    "Example",
    layout.example
  ].join("\n");
}
