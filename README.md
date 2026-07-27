# Slip

Slip turns declarative YAML into art-directed social carousels. Files remain the
source of truth while a local, read-only browser shows the live result. The same
renderer exports Instagram PNGs and a flattened LinkedIn PDF.

## Install

Slip requires Node.js 22 or newer and pnpm 10. From this repository:

```bash
pnpm install --frozen-lockfile
pnpm build
export SLIP_BIN="$PWD/apps/cli/dist/index.js"
```

During development, replace `"$SLIP_BIN"` in the examples below with
`pnpm exec tsx apps/cli/src/index.ts`.

## Create a workspace

```bash
"$SLIP_BIN" init /tmp/my-carousels
cd /tmp/my-carousels
"$SLIP_BIN" new software-is-disposable --title "Software is disposable"
```

The workspace contains:

```text
slip.yaml
schema/carousel.schema.json
assets/
carousels/software-is-disposable/carousel.yaml
exports/
```

The generated JSON Schema provides field and enum completion in compatible
editors. Source images can live anywhere inside the workspace. Reference them
relative to the carousel document.

## Author YAML

Each carousel uses one registered layout per slide:

```yaml
schemaVersion: 1
id: software-is-disposable
title: Software is disposable
slides:
  - id: cover
    layout: photo_band
    content:
      headline: Software is becoming disposable
      caption: The value is moving somewhere else.
    image:
      src: ../../assets/circuit-board.jpg
      position: [0.62, 0.44]
      zoom: 1.2
  - id: argument
    layout: type_only
    content:
      headline: Code is no longer the scarce part
      body: Judgment, context, and distribution are harder to reproduce.
    options:
      align: left
```

Discover all available layouts or inspect one layout’s fields, choices, and
copy limits:

```bash
"$SLIP_BIN" layouts
"$SLIP_BIN" layouts photo_split
"$SLIP_BIN" validate software-is-disposable
```

The checked-in `examples/editorial` workspace contains three complete carousels
covering every layout, alignment, image side, copy shape, and focal-position
boundary.

## Preview

```bash
"$SLIP_BIN" dev
```

Open the printed loopback URL. The index lists every carousel. A project page
shows its ordered slides and download actions for both platforms. Saving valid
YAML or a referenced image refreshes the preview. Invalid input leaves the last
valid preview visible and shows the exact file and YAML path. The browser never
writes to the workspace.

Use `"$SLIP_BIN" dev examples/editorial --no-open` from the repository to open
the checked-in example workspace without launching a browser automatically.

## Export

Instagram exports an ordered directory of 1080 × 1350 sRGB PNG files by
default. An output ending in `.zip` creates the same files in one archive.
LinkedIn exports one flattened PDF with a 576 × 720 point page per slide.

```bash
"$SLIP_BIN" export software-is-disposable --platform instagram
"$SLIP_BIN" export software-is-disposable --platform instagram --output exports/post.zip
"$SLIP_BIN" export software-is-disposable --platform linkedin
"$SLIP_BIN" export software-is-disposable --platform linkedin --output exports/post.pdf
```

Exports validate the complete carousel before replacing the destination.

## Verify

The PDF raster comparison requires Poppler’s `pdftoppm` executable on `PATH`.
Install it with `brew install poppler` on macOS,
`sudo apt-get install poppler-utils` on Ubuntu, or
`choco install poppler` on Windows.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test
```
