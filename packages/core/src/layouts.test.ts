import { describe, expect, it } from "vitest";
import { carouselJsonSchema, carouselSchema } from "./schema.js";

function carouselWith(slide: unknown) {
  return {
    schemaVersion: 1,
    id: "example",
    title: "Example",
    slides: [slide]
  };
}

describe("layout contracts", () => {
  it("applies photographic defaults and rejects fields from another layout", () => {
    const split = carouselSchema.parse(carouselWith({
      id: "split",
      layout: "photo_split",
      content: { headline: "A split" },
      image: { src: "../../assets/portrait.jpg" }
    }));
    expect(split.slides[0]).toMatchObject({
      image: { position: [0.5, 0.5], zoom: 1 },
      options: {
        side: "left",
        tone: "paper",
        emphasisStyle: "italic"
      }
    });

    const band = carouselSchema.safeParse(carouselWith({
      id: "band",
      layout: "photo_band",
      content: { headline: "A band", body: "not allowed" },
      image: { src: "../../assets/landscape.jpg" }
    }));
    expect(band.success).toBe(false);
    if (!band.success) expect(band.error.issues[0]?.path).toEqual(["slides", 0, "content"]);
  });

  it("enforces copy, emphasis, option, focal-position, and zoom boundaries", () => {
    expect(carouselSchema.safeParse(carouselWith({
      id: "split",
      layout: "photo_split",
      content: { headline: "x".repeat(81) },
      image: { src: "photo.jpg" },
      options: { side: "middle" }
    })).success).toBe(false);

    expect(carouselSchema.safeParse(carouselWith({
      id: "band",
      layout: "photo_band",
      content: { headline: "Valid" },
      image: { src: "photo.jpg", position: [0, 1], zoom: 3 }
    })).success).toBe(true);

    expect(carouselSchema.safeParse(carouselWith({
      id: "band",
      layout: "photo_band",
      content: { headline: "Valid" },
      image: { src: "photo.jpg", position: [-0.01, 1.01], zoom: 3.01 }
    })).success).toBe(false);

    const invalidEmphasis = carouselSchema.safeParse(carouselWith({
      id: "statement",
      layout: "type_only",
      content: {
        headline: "Deliberate line\nbreaks remain",
        emphasis: "missing phrase"
      },
      options: { tone: "ink", emphasisStyle: "mark" }
    }));
    expect(invalidEmphasis.success).toBe(false);
    if (!invalidEmphasis.success) {
      expect(invalidEmphasis.error.issues[0]).toMatchObject({
        path: ["slides", 0, "content", "emphasis"],
        message: "emphasis must exactly match text in headline"
      });
    }
  });

  it("generates editor schema for the discriminated contracts and enums", () => {
    const schema = JSON.stringify(carouselJsonSchema());
    expect(schema).toContain('"const":"type_only"');
    expect(schema).toContain('"const":"photo_split"');
    expect(schema).toContain('"const":"photo_band"');
    expect(schema).toContain('"enum":["left","right"]');
    expect(schema).toContain('"enum":["left","center"]');
    expect(schema).toContain('"enum":["paper","ink"]');
    expect(schema).toContain('"enum":["italic","mark"]');
    expect(schema).toContain('"minimum":0');
    expect(schema).toContain('"maximum":3');
  });
});
