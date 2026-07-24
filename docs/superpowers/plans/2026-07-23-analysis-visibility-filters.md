# Analysis Visibility Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Hide unique" and "Hide shared" toggles to the analysis view, filtering dependency groups by how many projects use them.

**Architecture:** Pure filter helper in `src/lib/grouping.ts` (next to the grouping algorithm) + two checkboxes with local state in `analysis-view.tsx`, composed with the existing search filter. No persistence (ephemeral like the search box).

**Tech Stack:** Existing — React 19, Vitest + RTL, shadcn checkbox.

**Definitions:** a dependency group is **unique** when its total project count (sum of `versions[].projects.length`, i.e. distinct repo+package pairs) is exactly 1, **shared** when > 1 — consistent with the "N projects" badge on each card.

---

## Task 1: Visibility filter helper (TDD)

**Files:**
- Modify: `src/lib/grouping.ts`
- Test: `src/lib/grouping.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/grouping.test.ts` (imports at top of file already cover `groupDependencies`; extend the import from `./grouping` to include `totalProjects` and `filterGroupsByVisibility`):

```ts
describe('totalProjects', () => {
  it('sums projects across all versions of a group', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { x: '^1.0.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { x: '^2.0.0' } })] },
    ]);
    const [group] = groupDependencies(entries);
    expect(totalProjects(group)).toBe(2);
  });
});

describe('filterGroupsByVisibility', () => {
  function groupsFixture() {
    return groupDependencies(
      flattenDependencies([
        { repo: repo('a'), files: [pkg('package.json', { dependencies: { shared: '^1.0.0', unique: '^1.0.0' } })] },
        { repo: repo('b'), files: [pkg('package.json', { dependencies: { shared: '^1.0.0' } })] },
      ]),
    );
  }

  it('returns everything when both filters are off', () => {
    const groups = groupsFixture();
    expect(filterGroupsByVisibility(groups, { hideUnique: false, hideShared: false })).toHaveLength(2);
  });

  it('hideUnique drops groups used by exactly one project', () => {
    const result = filterGroupsByVisibility(groupsFixture(), { hideUnique: true, hideShared: false });
    expect(result.map((g) => g.depName)).toEqual(['shared']);
  });

  it('hideShared drops groups used by more than one project', () => {
    const result = filterGroupsByVisibility(groupsFixture(), { hideUnique: false, hideShared: true });
    expect(result.map((g) => g.depName)).toEqual(['unique']);
  });

  it('both on hides everything', () => {
    const result = filterGroupsByVisibility(groupsFixture(), { hideUnique: true, hideShared: true });
    expect(result).toEqual([]);
  });

  it('counts monorepo packages individually: a dep in 2 packages of one repo is shared', () => {
    const groups = groupDependencies(
      flattenDependencies([
        {
          repo: repo('mono'),
          files: [
            pkg('packages/a/package.json', { dependencies: { x: '^1.0.0' } }),
            pkg('packages/b/package.json', { dependencies: { x: '^1.0.0' } }),
          ],
        },
      ]),
    );
    expect(filterGroupsByVisibility(groups, { hideUnique: false, hideShared: true })).toEqual([]);
    expect(filterGroupsByVisibility(groups, { hideUnique: true, hideShared: false })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/grouping.test.ts`
Expected: FAIL — `totalProjects` / `filterGroupsByVisibility` not exported.

- [ ] **Step 3: Implement in `src/lib/grouping.ts`**

Append to the file:

```ts
export interface VisibilityFilter {
  hideUnique: boolean;
  hideShared: boolean;
}

/** Total project count of a group (distinct repo+package pairs across all versions). */
export function totalProjects(group: DependencyGroup): number {
  return group.versions.reduce((n, v) => n + v.projects.length, 0);
}

/**
 * Visibility filtering for the analysis view: unique = exactly 1 project,
 * shared = more than 1. Both flags compose; both on hides everything.
 */
export function filterGroupsByVisibility(
  groups: DependencyGroup[],
  filter: VisibilityFilter,
): DependencyGroup[] {
  return groups.filter((group) => {
    const count = totalProjects(group);
    if (filter.hideUnique && count === 1) return false;
    if (filter.hideShared && count > 1) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/grouping.test.ts`
Expected: PASS (existing 7 + 6 new = 13 in this file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts src/lib/grouping.test.ts
git commit -m "feat: visibility filter helpers for analysis groups"
```

---

## Task 2: Wire toggles into the analysis view

**Files:**
- Modify: `src/components/analysis-view.tsx`

- [ ] **Step 1: Add the toggle state and compose the filters**

In `src/components/analysis-view.tsx`:

1. Extend the grouping import to include the new helpers:

```ts
import { filterGroupsByVisibility } from '@/lib/grouping';
```

2. Add state next to `search`:

```ts
const [hideUnique, setHideUnique] = useState(false);
const [hideShared, setHideShared] = useState(false);
```

3. Replace the `filtered` useMemo with:

```ts
const filtered = useMemo(() => {
  const byVisibility = filterGroupsByVisibility(analysis ?? [], { hideUnique, hideShared });
  const term = search.trim().toLowerCase();
  if (!term) return byVisibility;
  return byVisibility.filter((g) => g.depName.toLowerCase().includes(term));
}, [analysis, search, hideUnique, hideShared]);
```

4. Add the checkboxes to the header row, right before the search `Input` (keep the search's `ml-auto` on the Input so the group stays right-aligned):

```tsx
<label className="flex items-center gap-1.5 text-sm cursor-pointer">
  <Checkbox checked={hideUnique} onCheckedChange={(v) => setHideUnique(v === true)} aria-label="Hide unique" />
  Hide unique
</label>
<label className="flex items-center gap-1.5 text-sm cursor-pointer">
  <Checkbox checked={hideShared} onCheckedChange={(v) => setHideShared(v === true)} aria-label="Hide shared" />
  Hide shared
</label>
```

Import `Checkbox` from `@/components/ui/checkbox`.

5. Adjust the empty-filtered message so it makes sense when filters (not search) hide everything:

```tsx
{filtered.length === 0 && (
  <p className="text-sm text-muted-foreground">
    {analysis.length === 0
      ? 'No dependencies found in the analyzed repositories.'
      : 'No dependencies match your search or filters.'}
  </p>
)}
```

- [ ] **Step 2: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: all green (no new tests required for the wiring; filter logic is unit-tested in Task 1 and the existing suite must stay green).

- [ ] **Step 3: Manual smoke**

Run `pnpm dev`, open the app (if you have a previous session's repos, re-add tokens and run Analyze; otherwise trust the unit tests). In the analysis view: check "Hide unique" → only multi-project deps remain; check "Hide shared" → only single-project deps remain; both → explicit empty message; uncheck → full list returns. Search still composes.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis-view.tsx
git commit -m "feat: hide unique/shared toggles in analysis view"
```
