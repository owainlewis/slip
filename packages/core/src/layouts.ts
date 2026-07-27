import { isAbsolute } from "node:path";
import { z } from "zod";

const slideIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

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
        body: z.string().min(1).max(260).optional(),
        eyebrow: z.string().min(1).max(40).optional()
      })
      .strict(),
    options: z
      .object({
        align: z.enum(["left", "center"]).default("left")
      })
      .strict()
      .default({ align: "left" })
  })
  .strict();

export const photoSplitSlideSchema = z
  .object({
    id: slideIdSchema,
    layout: z.literal("photo_split"),
    content: z
      .object({
        headline: z.string().min(1).max(80),
        body: z.string().min(1).max(220).optional()
      })
      .strict(),
    image: imageSchema,
    options: z
      .object({
        side: z.enum(["left", "right"]).default("left")
      })
      .strict()
      .default({ side: "left" })
  })
  .strict();

export const photoBandSlideSchema = z
  .object({
    id: slideIdSchema,
    layout: z.literal("photo_band"),
    content: z
      .object({
        headline: z.string().min(1).max(80),
        caption: z.string().min(1).max(120).optional()
      })
      .strict(),
    image: imageSchema
  })
  .strict();

export const layoutDefinitions = [
  {
    id: "type_only",
    summary: "Editorial typography on a solid warm-white canvas.",
    schema: typeOnlySlideSchema,
    fields: [
      "content.headline  required, 1–100 characters",
      "content.body      optional, 1–260 characters",
      "content.eyebrow   optional, 1–40 characters",
      "options.align     left | center (default: left)",
      "image             not allowed"
    ],
    example: `- id: argument
  layout: type_only
  content:
    eyebrow: THE SHIFT
    headline: Code is no longer the scarce part
    body: Judgment, context, and distribution are harder to reproduce.
  options:
    align: left`
  },
  {
    id: "photo_split",
    summary: "Photography and opaque text in a fixed 50/50 split.",
    schema: photoSplitSlideSchema,
    fields: [
      "content.headline  required, 1–80 characters",
      "content.body      optional, 1–220 characters",
      "image.src         required, path relative to carousel.yaml",
      "image.position    [x, y], each 0–1 inclusive (default: [0.5, 0.5])",
      "image.zoom        1–3 (default: 1)",
      "options.side      left | right (default: left)"
    ],
    example: `- id: portrait
  layout: photo_split
  content:
    headline: Make the subject part of the argument
    body: The text remains on an opaque theme-colour region.
  image:
    src: ../../assets/portrait.jpg
    position: [0.62, 0.44]
    zoom: 1.2
  options:
    side: left`
  },
  {
    id: "photo_band",
    summary: "Photography in the upper 62% with an opaque lower text band.",
    schema: photoBandSlideSchema,
    fields: [
      "content.headline  required, 1–80 characters",
      "content.caption   optional, 1–120 characters",
      "image.src         required, path relative to carousel.yaml",
      "image.position    [x, y], each 0–1 inclusive (default: [0.5, 0.5])",
      "image.zoom        1–3 (default: 1)",
      "options           not allowed"
    ],
    example: `- id: cover
  layout: photo_band
  content:
    headline: Software is becoming disposable
    caption: The value is moving somewhere else.
  image:
    src: ../../assets/landscape.jpg
    position: [0.62, 0.44]
    zoom: 1.2`
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
