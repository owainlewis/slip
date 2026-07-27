import { z } from "zod";

export const typeOnlySlideSchema = z
  .object({
    id: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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

export const slideSchema = z.discriminatedUnion("layout", [typeOnlySlideSchema]);

export const carouselSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(120),
    slides: z.array(slideSchema).min(1).max(20)
  })
  .strict()
  .superRefine((carousel, context) => {
    const ids = new Set<string>();
    carousel.slides.forEach((slide, index) => {
      if (ids.has(slide.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate slide id "${slide.id}"`,
          path: ["slides", index, "id"]
        });
      }
      ids.add(slide.id);
    });
  });

export const workspaceConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaultTheme: z.literal("editorial")
  })
  .strict();

export type Carousel = z.infer<typeof carouselSchema>;
export type TypeOnlySlide = z.infer<typeof typeOnlySlideSchema>;

export function carouselJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(carouselSchema, {
    target: "draft-2020-12",
    io: "input"
  }) as Record<string, unknown>;
}
