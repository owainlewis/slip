import { describe, expect, it } from "vitest";
import { renderSlideSvg } from "./renderer.js";

describe("type_only renderer", () => {
  it("uses the production 1080 by 1350 SVG renderer with bundled fonts", async () => {
    const svg = await renderSlideSvg({
      id: "cover",
      layout: "type_only",
      content: { eyebrow: "Test", headline: "A rendered headline", body: "Rendered body copy." },
      options: { align: "center" }
    });
    expect(svg).toContain('<svg width="1080" height="1350"');
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="#f5f0e7"');
  });
});
