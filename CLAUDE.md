# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Endfield Calc is a production chain calculator for "Arknights: Endfield" — a single-page React + TypeScript app that computes resource requirements, production ratios, and facility needs for potentially circular production loops. Deployed to GitHub Pages at `/endfield-calc/`.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server
pnpm build            # Type-check (tsc -b) then Vite build
pnpm lint             # ESLint
pnpm test             # Vitest (run all tests)
pnpm knip             # Detect unused code/exports
```

Tests are in `src/tests/lib/`. Run a single test file with:
```bash
pnpm vitest run src/tests/lib/calculator.test.ts
```

## Architecture

### Core Algorithm (`src/lib/calculator.ts`)

The central piece of the codebase. Implements a graph-based production planner:

1. **Bipartite graph** — items and recipes as two node types, connected by consumption/production edges
2. **SCC detection** — Tarjan's algorithm finds circular production dependencies
3. **Condensed DAG** — SCCs are collapsed into super-nodes, topologically sorted
4. **Flow calculation** — walks the DAG; within SCCs, solves a linear system (Gaussian elimination in `linear-solver.ts`) to determine internal flow rates
5. **Backtracking** — when multiple recipes exist for an item, tries alternatives if a chosen recipe leads to an invalid SCC solution

The output is a `ProductionDependencyGraph` (nodes + edges with flow rates).

### Data Flow

```
User selects targets + rates
  → useProductionPlan hook (src/hooks/useProductionPlan.ts)
    → calculateProductionPlan (src/lib/calculator.ts)
      → ProductionDependencyGraph
        ├→ Table View: useProductionTable → ProductionTable
        └→ Tree View: mapper (merged or separated) → ELK layout → React Flow
```

### Two Visualization Paths

- **Merged mapper** (`src/components/mappers/merged-mapper.ts`) — aggregates identical recipes, shows facility counts per recipe
- **Separated mapper** (`src/components/mappers/separated-mapper.ts`) — individual facility instances with capacity allocation

Both use ELK (`src/lib/layout.ts`) for hierarchical graph layout, preloaded at startup.

### Type System

Branded types in `src/types/constants.ts` prevent mixing IDs:
```typescript
type ItemId = string & { readonly __brand: "ItemId" };
type RecipeId = string & { readonly __brand: "RecipeId" };
type FacilityId = string & { readonly __brand: "FacilityId" };
```

Core domain types are in `src/types/core.ts` (Item, Recipe, Facility), `src/types/production.ts` (ProductionNode, DetectedCycle, ProductionDependencyGraph), and `src/types/flow.ts` (visualization-specific types).

### Game Data

Static game data lives in `src/data/` — `items.ts`, `recipes.ts`, `facilities.ts`. The `forcedRawMaterials` constant defines items that are always treated as raw inputs.

### Internationalization

7 languages supported via i18next. Translation files are in `public/locales/{lang}/{namespace}.json` with namespaces: `item`, `facility`, `app`, `production`. Language config is in `src/i18n.ts` with extraction config in `i18next.config.ts`.

### UI Stack

Shadcn/ui components (Radix UI primitives + Tailwind CSS) in `src/components/ui/`. Custom React Flow nodes in `src/components/nodes/`. Component scaffolding config in `components.json`.

## Commit Convention

- `Add:` new feature
- `Fix:` bug fix
- `Update:` enhancement to existing feature
- `Refactor:` code restructuring
