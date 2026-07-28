# Declarative Carousel Studio MVP

## What and why

Build a local-first tool that turns a small YAML document into an
art-directed social carousel. The user edits source files in their normal text
editor and sees a live, read-only browser preview. The same renderer exports
Instagram PNGs and a LinkedIn PDF.

The MVP proves one product claim: a constrained declarative format and a few
strong layouts make high-quality carousels fast to produce.

## Requirements

- Run locally from one workspace directory.
- Treat YAML carousel documents and local image files as the source of truth.
- Provide a browser project index and read-only live preview.
- Reload the preview when a source document or referenced image changes.
- Validate documents against a generated JSON Schema.
- Provide layout discovery and field help through the CLI.
- Provide one fixed editorial theme and three registered layouts.
- Use geometry that guarantees text appears on an opaque background.
- Support direct relative image paths, normalized focal position, and zoom.
- Export ordered 1080 × 1350 sRGB PNG files for Instagram.
- Export one flattened 4:5 PDF for a LinkedIn document post.
- Use the same validated document model and renderer for preview and export.
- Bind the local server to loopback and expose no filesystem write API.

## Acceptance criteria

- `slip init <directory>` creates a valid example workspace.
- `slip new <slug>` creates a valid carousel document.
- `slip dev` opens a browser index of workspace carousels.
- Selecting a carousel shows all its slides at the correct 4:5 ratio.
- Saving valid YAML or a referenced image refreshes the preview.
- Invalid YAML leaves the last valid preview visible and shows the exact error.
- JSON Schema provides field and enum completion in compatible editors.
- `slip layouts` lists layouts and `slip layouts <id>` documents one layout.
- All three layouts reject unknown fields, excessive copy, and invalid options.
- Instagram export creates correctly ordered 1080 × 1350 PNG files.
- LinkedIn export creates one flattened PDF with equal 4:5 pages.
- Browser and CLI downloads call the same export implementation.
- Automated browser tests prove the example carousel can be previewed and both
  exports can be downloaded.

## Design

### User workflow

```text
slip init my-carousels
cd my-carousels
slip new software-is-disposable
slip dev
```

The user edits `carousels/software-is-disposable/carousel.yaml` while the
browser preview remains open. Validation appears in both the terminal and
browser. When ready, the user downloads from the browser or runs:

```text
slip export software-is-disposable --platform instagram
slip export software-is-disposable --platform linkedin
```

The browser does not edit files in the MVP. This avoids competing sources of
truth, comment loss, autosave ambiguity, and conflict handling.

### Workspace

```text
my-carousels/
  slip.yaml
  schema/
    carousel.schema.json
  assets/
  carousels/
    software-is-disposable/
      carousel.yaml
  exports/
```

`slip.yaml` stores the workspace schema version and default theme. Each
carousel has one directory and one `carousel.yaml`. Images may live anywhere
inside the workspace and are referenced relative to the carousel document.
Exports are derived output and ignored by Git by default.

The filesystem is the source of truth. The MVP has no database,
authentication, hosted service, browser write API, searchable asset library,
or file-conflict system.

### Document model

```yaml
schemaVersion: 1
id: software-is-disposable
title: Software is disposable
slides:
  - id: cover
    layout: photo_band
    content:
      headline: |-
        Software is becoming
        disposable
      emphasis: disposable
      caption: The value is moving somewhere else.
    image:
      src: ../../assets/mountain-range.jpg
      position: [0.62, 0.44]
      zoom: 1.2
    options:
      tone: paper
      emphasisStyle: mark
  - id: argument
    layout: type_only
    content:
      headline: |-
        Code is no longer
        the scarce part
      emphasis: scarce
      body: Judgment, context, and distribution are harder to reproduce.
    options:
      align: left
      tone: ink
      emphasisStyle: italic
```

Documents use a discriminated union keyed by `layout`. Unknown keys are
errors. The layout registry generates the JSON Schema, CLI help, browser forms
for errors, fixtures, and render dispatch from the same contracts.

Image `position` contains normalized `[x, y]` coordinates in the inclusive
range `0` to `1`. `zoom` ranges from `1` to `3` and defaults to `1`. The
renderer uses `cover`, applies zoom, centres the requested position in the
layout's image region, and clamps the result to the image bounds. There is no
separate crop representation.

YAML literal blocks preserve explicit headline and supporting-copy line
breaks. `content.emphasis` optionally names an exact phrase in the headline.
`options.emphasisStyle` renders that phrase as `italic` or `mark`, while
`options.tone` selects the shared `paper` or `ink` palette. All new fields are
optional and default to the original light treatment, preserving existing
schema version 1 documents.

### MVP layout contracts

| Layout | Content | Image | Options | Geometry |
| --- | --- | --- | --- | --- |
| `type_only` | `headline` required, 1–100 chars; `emphasis` optional exact phrase, 1–48 chars; `body` optional, 1–260 chars; `eyebrow` optional, 1–40 chars | Not allowed | `align`: `left` or `center`; `tone`: `paper` or `ink`; `emphasisStyle`: `italic` or `mark` | Oversized type on a tactile paper or ink canvas |
| `photo_split` | `headline` required, 1–80 chars; `emphasis` optional exact phrase, 1–48 chars; `body` optional, 1–220 chars | Required | `side`: `left` or `right`; shared tone and emphasis options | Flush 50/50 composition with a full-height crop beside an opaque text half |
| `photo_band` | `headline` required, 1–80 chars; `emphasis` optional exact phrase, 1–48 chars; `caption` optional, 1–120 chars | Required | Shared tone and emphasis options | Wide crop with an asymmetric inset opaque text surface |

All layouts use fixed regions, type styles, spacing, and safe areas. Text
surfaces remain fully opaque even where they overlap photography. Overflow is
an export-blocking validation error rather than triggering auto-shrink or
truncation.

Changing a layout is a manual YAML edit. Compatible field migration is outside
the MVP.

### Visual system

The single editorial system uses:

- 1080 × 1350 pixel canvas;
- warm paper, near-black ink, quiet supporting tones, and one restrained accent;
- bundled regular and italic editorial serif faces with a neutral sans-serif;
- authored headline line breaks and explicit phrase emphasis;
- asymmetric crops, offset opaque text surfaces, and purposeful whitespace;
- fixed, deterministic paper texture shared by preview, PNG, and PDF rendering;
- quiet context-driven folios such as `01 / 05`;
- square corners and no repeated brand footer.

The system excludes gradients, glass effects, decorative blobs, icon grids,
excessive cards, automatic word highlighting, and user-authored CSS.

### CLI

```text
slip init <directory>
slip new <slug> [--title <title>]
slip dev [workspace] [--no-open]
slip layouts [layout]
slip validate [carousel]
slip export <carousel> --platform <instagram|linkedin> [--output <path>]
```

`slip new` creates a valid `type_only` example. Validation errors contain the
file, YAML path, rejected value, and allowed values where applicable. Mutating
commands use atomic writes. Validation and export never modify sources.

### Browser preview

`slip dev` starts a loopback-only Node server and opens the React application.
The server rejects unexpected `Host` and `Origin` headers and resolves every
requested path within the selected workspace.

The project index lists carousel title, slide count, updated time, and a
thumbnail. Selecting a project shows its ordered slides. Each project has
Instagram and LinkedIn download actions. The browser calls the same exporter
used by the CLI.

The server watches carousel YAML and referenced images. A valid change replaces
the preview. A parse, schema, asset, or overflow error leaves the previous
preview visible and displays an actionable error.

### Rendering and export

Layout components render to SVG with bundled fonts. The same SVG is shown in
the browser and passed through Resvg for PNG export.

Instagram export writes numbered files such as `01-cover.png` at exactly
1080 × 1350 pixels. Browser download packages them into a ZIP. CLI export
writes the PNG directory unless the output path ends in `.zip`.

LinkedIn export embeds each rendered 1080 × 1350 slide into an equal 576 × 720
point PDF page. The PDF is flattened, sRGB, and must remain under 100 MB.

Exports are written to a temporary destination and moved into place only after
every slide succeeds. Tests compare decoded PNG pixels and rasterized PDF pages,
not file bytes or metadata.

### Technical choices

- TypeScript and pnpm workspaces
- React and Vite for the browser
- Hono on Node.js for the loopback server
- Commander for the CLI
- Zod for runtime schemas and JSON Schema generation
- YAML for documents
- Chokidar for file watching
- Satori and Resvg for SVG and PNG rendering
- PDF-lib and JSZip for export packaging
- Sharp for image inspection
- Vitest for unit and contract tests
- Playwright for browser and download tests

The CLI, server, browser, schema, layouts, and renderer share packages inside
one pnpm workspace.

## Failure behavior

- Invalid workspaces and documents report an actionable path and message.
- Unknown layouts, fields, options, and external asset paths are rejected.
- Missing, corrupt, or undersized images block export.
- The effective cropped image region must provide at least one source pixel per
  output pixel. Upscaling is rejected.
- Text overflow blocks export and identifies the slide and field.
- Invalid live edits keep the previous valid preview visible.
- The local server rejects traversal, symlink escape, non-loopback binding, and
  cross-origin requests.
- Failed exports leave no partially successful output.

## Test approach

- Unit-test schemas, JSON Schema output, path containment, image positioning,
  overflow, ordering, and atomic exports.
- Contract-test every CLI command and actionable error format.
- Pixel-diff all layouts at minimum and maximum valid content.
- Test missing, corrupt, low-resolution, and out-of-workspace images.
- Browser-test project discovery, live reload, invalid-source errors, and both
  download actions.
- Rasterize LinkedIn PDFs and compare their pages with the PNG render fixtures.
- Keep three complete example carousels as a visual review corpus covering all
  layouts, tones, emphasis styles, image sides, alignments, and content limits.
- Use checked-in real photographic fixtures with explicit source and license
  attribution.

## Risks

- **Satori typography is insufficient:** prove font loading, wrapping, and all
  three layouts in the first vertical slice before adding features.
- **YAML is difficult to discover:** generate JSON Schema, examples, and layout
  help from the same contracts.
- **Layouts become one-offs:** add a layout only when the review corpus exposes
  a repeated content shape.
- **Photography feels generic:** expressive choices come from the user's real
  image, crop, sequence, and copy rather than decorative styling. Example
  fixtures use clearly licensed photographs, never generated placeholder art.
- **Platform requirements change:** keep platform limits in one tested module
  with a last-verified date.

## Out of scope

- Browser editing or autosave
- Built-in AI
- Hosted accounts, database persistence, and cloud storage
- Searchable image-library metadata
- Layout and document migrations
- Multiple themes or user-authored CSS
- Free-form positioning
- Stock-photo search
- Direct social publishing
- Collaboration and analytics
