# MAD Migration Test App

DHIS2 app for validating DET M1 migration quality by importing OLD MAD workbooks, configuring indicator mappings, fetching DHIS2 event data, and comparing results.

## Prerequisites

- Node.js 18+
- `pnpm`
- Access to a DHIS2 instance

## Development

```bash
pnpm install
pnpm start
```

## Build

```bash
pnpm build
```

## Deploy

```bash
pnpm build
pnpm deploy
```

## Quality Checks

```bash
pnpm exec eslint
pnpm exec tsc --noEmit
pnpm test
```

## App Workflow

1. Upload OLD MAD workbook in `Upload`
2. Configure program/stages and mappings in `Mappings`
3. Save mapping configuration
4. Fetch DHIS2 data and compare outputs in `Compare`

