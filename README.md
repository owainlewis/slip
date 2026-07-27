# Slip

Slip is a local-first, read-only browser preview for declarative social carousels.
YAML files remain the source of truth.

## Run it

Requires Node.js 22 or newer and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm build
SLIP_BIN="$PWD/apps/cli/dist/index.js"
"$SLIP_BIN" init /tmp/slip-mvp
cd /tmp/slip-mvp
"$SLIP_BIN" new demo --title "Demo carousel"
"$SLIP_BIN" dev --no-open
```

Open the printed loopback URL. Edit
`carousels/demo/carousel.yaml` to update the preview. The browser keeps the last
valid render visible when YAML is invalid.

During repository development, commands can run directly from source:

```bash
pnpm exec tsx apps/cli/src/index.ts init /tmp/slip-mvp
```

## Verify

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test
```
