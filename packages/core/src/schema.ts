import { z } from "zod";
import { slideSchema } from "./layouts.js";

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

export const brandSchema = z
  .object({
    wordmark: z
      .string()
      .min(1)
      .max(40)
      .refine((value) => value.split("\n").length <= 2, {
        message: "wordmark must be one or two lines"
      })
      .optional(),
    signature: z
      .string()
      .min(1)
      .max(60)
      .refine((value) => !value.includes("\n"), { message: "signature must be a single line" })
      .optional()
  })
  .strict();

export const workspaceConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaultTheme: z.literal("editorial"),
    brand: brandSchema.optional()
  })
  .strict();

export type Carousel = z.infer<typeof carouselSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

export function carouselJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(carouselSchema, {
    target: "draft-2020-12",
    io: "input"
  }) as Record<string, unknown>;
}
