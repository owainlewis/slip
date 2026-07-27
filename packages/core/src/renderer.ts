import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import satori from "satori";
import type { TypeOnlySlide } from "./schema.js";

const require = createRequire(import.meta.url);
let fontsPromise: Promise<{ serif: ArrayBuffer; sans: ArrayBuffer }> | undefined;

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

export async function renderSlideSvg(slide: TypeOnlySlide): Promise<string> {
  const fonts = await loadFonts();
  const centered = slide.options.align === "center";
  return satori(
    {
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
                      props: {
                        style: {
                          fontFamily: "Inter",
                          fontSize: 24,
                          letterSpacing: "0.16em",
                          color: "#9a4f3d",
                          marginBottom: 58
                        },
                        children: slide.content.eyebrow.toUpperCase()
                      }
                    }
                  : null,
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Source Serif 4",
                      fontSize: 92,
                      fontWeight: 700,
                      lineHeight: 1.02,
                      letterSpacing: "-0.035em",
                      maxWidth: 888
                    },
                    children: slide.content.headline
                  }
                },
                slide.content.body
                  ? {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Inter",
                          fontSize: 34,
                          lineHeight: 1.42,
                          maxWidth: 800,
                          marginTop: 54,
                          color: "#44423d"
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
                width: "100%",
                display: "flex",
                justifyContent: centered ? "center" : "space-between",
                borderTop: "2px solid #c6bfb3",
                paddingTop: 24,
                fontFamily: "Inter",
                fontSize: 22,
                letterSpacing: "0.08em",
                color: "#6b665e"
              },
              children: centered ? "SLIP" : ["SLIP", slide.id.toUpperCase()]
            }
          }
        ]
      }
    } as any,
    {
      width: 1080,
      height: 1350,
      fonts: [
        { name: "Source Serif 4", data: fonts.serif, weight: 700, style: "normal" },
        { name: "Inter", data: fonts.sans, weight: 400, style: "normal" }
      ]
    }
  );
}
