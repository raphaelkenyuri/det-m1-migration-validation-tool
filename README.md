# DET M1 Migration Validation Tool

DHIS2 app for validating DET M1 migration quality by importing OLD MAD workbooks, mapping indicators, fetching DHIS2 event data, and comparing results.

## Repository Structure

- `mad-migration-test/`: DHIS2 application source code
- `Migration Test Tool - DET M1 - V3.1 (2).xlsx`: workbook used for migration testing

## Prerequisites

- Node.js 18+
- `pnpm`
- Access to a DHIS2 instance

## Local Development

```bash
cd mad-migration-test
pnpm install
pnpm start
```

## Build

```bash
cd mad-migration-test
pnpm build
```

## Deploy to DHIS2

```bash
cd mad-migration-test
pnpm build
pnpm deploy
```

## Testing and Quality Checks

```bash
cd mad-migration-test
pnpm exec eslint
pnpm exec tsc --noEmit
pnpm test
```

## Core Workflow in the App

1. Upload OLD MAD workbook (`Upload` tab)
2. Configure program/stages and mappings (`Mappings` tab)
3. Save mapping configuration
4. Fetch DHIS2 data and compare results (`Compare` tab)

