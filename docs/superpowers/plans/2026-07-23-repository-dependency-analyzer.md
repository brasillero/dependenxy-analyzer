# Repository Dependency Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Repository Dependency Analyzer (RDA) v1 — a Next.js app that reads all `package.json` files across multiple GitHub/GitLab repos (monorepo-aware) and consolidates dependencies with version-drift detection.

**Architecture:** SPA on Next.js 16 App Router. All provider traffic goes through two server-side proxy Route Handlers (`/api/proxy/github/*`, `/api/proxy/gitlab/*` with an anti-SSRF guard). Client state: Zustand (repo config persisted to localStorage, tokens memory-only). Server state: TanStack Query with query keys `['branches', repoId]` / `['pkg-files', repoId, branch]`. Provider layer (`src/lib/providers/`) isolates GitHub/GitLab API differences behind one interface.

**Tech Stack:** Next.js 16.2.11 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (new-york/neutral) · Ky · @tanstack/react-query v5 · Zustand (persist) · p-limit · sonner · lucide-react · Vitest + React Testing Library · pnpm

**Source spec:** `.firecrawl/idea-doc.md` (parsed product spec; RF-01..RF-09, contracts in §4, UI spec in §5).

**Constraints (from user):**
- **No Docker / deploy work.** Only the app itself.
- **Do not edit shadcn component internals** (`src/components/ui/*`). Style by composing `className` at usage sites. Only consider adding a cva variant if the same class combo repeats heavily (not expected).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/types.ts` | Domain types: `Provider`, `RepoConfig`, `DepType`, `DEP_TYPES`, `PackageJsonFile`, `DependencyEntry`, `DependencyGroup` |
| `src/lib/package-json.ts` | Shared pure helpers: `EXCLUDED_SEGMENTS`, `isExcludedPath`, `parsePackageJson`, `decodeBase64Utf8` |
| `src/lib/ssrf.ts` | `validateGitLabHost` anti-SSRF guard |
| `src/lib/errors.ts` | `describeError` — maps errors (401/404/429/timeout) to user-facing messages |
| `src/lib/proxy-client.ts` | Ky instance (`prefixUrl /api/proxy`, token-injecting `beforeRequest`) + `createProxyClient(repo)` + `ProxyClient` interface |
| `src/lib/providers/provider.ts` | `GitProvider` interface + `ParsedRepoUrl` |
| `src/lib/providers/github.ts` | GitHub URL parser + 4 API operations (Link-header pagination, recursive tree, base64 contents) |
| `src/lib/providers/gitlab.ts` | GitLab URL parser (any host) + 4 API operations (x-next-page pagination, raw files) |
| `src/lib/providers/index.ts` | `getProvider(provider)` dispatch |
| `src/lib/grouping.ts` | `flattenDependencies`, `groupDependencies` (dep → version → projects) |
| `src/lib/package-files.ts` | `collectFiles` (p-limit fan-out, failure counting) + `fetchPackageJsonFiles(repo, branch)` |
| `src/lib/analyze.ts` | `runAnalysis(repos, queryClient)` — Analyze orchestration with partial-failure collection |
| `src/stores/token-store.ts` | Memory-only tokens: `githubToken`, `gitlabTokens` map, `tokenFor(repo)`, `clearAll` |
| `src/stores/repo-store.ts` | Persisted (`rda-repos`): `repos`, `selectedRepoId`, `addRepo` (dedupe), `removeRepo`, `setBranch`, `selectRepo` |
| `src/stores/settings-store.ts` | Persisted: `enabledDepTypes` toggles (all true by default) |
| `src/stores/view-store.ts` | Ephemeral: `view`, `analysis`, `analysisFailed` |
| `src/hooks/use-branches.ts` | `useBranches(repo)` — query `['branches', repo.id]` |
| `src/hooks/use-package-json-files.ts` | `usePackageJsonFiles(repo, branch)` — query `['pkg-files', repo.id, branch]` |
| `src/app/api/proxy/github/[...path]/route.ts` | GitHub passthrough proxy (Bearer + version headers, no-store) |
| `src/app/api/proxy/gitlab/[...path]/route.ts` | GitLab passthrough proxy (host from `x-gitlab-host`, SSRF guard, PRIVATE-TOKEN) |
| `src/components/query-provider.tsx` | QueryClientProvider with spec'd defaults |
| `src/components/app-header.tsx` | Header: title, dep-type toggles, Token dialog trigger, Analyze button |
| `src/components/dep-type-toggles.tsx` | The 3 checkboxes (Dependencies / Dev / Peer) |
| `src/components/token-dialog.tsx` | Token management dialog (GitHub + per-host GitLab, Clear all) |
| `src/components/add-repo-form.tsx` | URL input + Add (parse, token gate, fetch default branch, persist) |
| `src/components/repo-list.tsx` | Sidebar repo cards (select, remove, branch selector) |
| `src/components/branch-selector.tsx` | Per-repo branch Select (skeleton / error badge / populated) |
| `src/components/dependency-panel.tsx` | View 'repo': toolbar (Reload, counts) + package.json cards |
| `src/components/package-json-card.tsx` | Presentational card for one PackageJsonFile (type-filtered sections) |
| `src/components/analysis-view.tsx` | View 'analysis': header, search, failure banner, group cards |
| `src/components/dependency-group-card.tsx` | Presentational card for one DependencyGroup (drift badge, version groups) |
| `src/app/layout.tsx` | Root layout: QueryProvider + Toaster |
| `src/app/page.tsx` | 3-region layout (header / sidebar / main), hydration guard, view switch |

Tests live next to sources (`*.test.ts` / `*.test.tsx`).

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: whole Next.js scaffold, `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (test scripts), `.gitignore`

- [ ] **Step 1: Scaffold the Next.js app**

The working directory should contain only `.firecrawl/` (parsed spec) and `docs/`. create-next-app tolerates unknown entries, but if it refuses a non-empty directory, temporarily move `.firecrawl` and `docs` out and back.

```bash
pnpm dlx create-next-app@16.2.11 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes
```

Expected: Next.js 16.2.11 app with App Router, Tailwind v4, src dir, git repo initialized.

- [ ] **Step 2: Install runtime dependencies**

```bash
pnpm add ky @tanstack/react-query zustand p-limit sonner lucide-react
```

- [ ] **Step 3: Install dev dependencies for testing**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 4: Add `.firecrawl/` to `.gitignore`**

Append to `.gitignore`:

```
# parsed spec docs
.firecrawl/
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 6: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 7: Add test scripts to `package.json`**

Add to the `"scripts"` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Smoke-test the toolchain**

Create `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test`
Expected: PASS (1 test). Then delete `src/lib/smoke.test.ts`.

- [ ] **Step 9: Verify dev build boots**

Run: `pnpm build`
Expected: compiles successfully (Turbopack production build).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with Vitest tooling"
```

---

## Task 2: shadcn/ui setup

**Files:**
- Create: `components.json`, `src/components/ui/*`, `src/lib/utils.ts`, updates to `src/app/globals.css`

- [ ] **Step 1: Initialize shadcn/ui (new-york style, neutral palette)**

```bash
pnpm dlx shadcn@latest init -y -d
```

If the pnpm dlx invocation errors, retry with npx: `npx shadcn@latest init -y -d`

Expected: `components.json` created (style new-york, baseColor neutral, cssVariables), `src/lib/utils.ts` created, `globals.css` updated with theme variables.

- [ ] **Step 2: Add the required components**

```bash
pnpm dlx shadcn@latest add button input badge card checkbox dialog select skeleton separator scroll-area
```

(Fallback: `npx shadcn@latest add ...`)

Expected: 10 component files under `src/components/ui/`. Do NOT add the shadcn `sonner` wrapper (it pulls next-themes); we use the plain `sonner` package directly.

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui (new-york/neutral) components"
```

---

## Task 3: Domain types + shared package.json helpers

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/package-json.ts`
- Test: `src/lib/package-json.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/package-json.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isExcludedPath,
  parsePackageJson,
  decodeBase64Utf8,
  EXCLUDED_SEGMENTS,
} from './package-json';

describe('isExcludedPath', () => {
  it('excludes generated directories at any depth', () => {
    expect(isExcludedPath('node_modules/foo/package.json')).toBe(true);
    expect(isExcludedPath('packages/app/dist/package.json')).toBe(true);
    expect(isExcludedPath('apps/web/.next/package.json')).toBe(true);
    expect(isExcludedPath('a/build/package.json')).toBe(true);
    expect(isExcludedPath('a/out/package.json')).toBe(true);
    expect(isExcludedPath('a/coverage/package.json')).toBe(true);
    expect(isExcludedPath('a/vendor/package.json')).toBe(true);
  });

  it('keeps legitimate package.json paths', () => {
    expect(isExcludedPath('package.json')).toBe(false);
    expect(isExcludedPath('packages/app/package.json')).toBe(false);
    expect(isExcludedPath('packages/disto/package.json')).toBe(false); // segment match, not substring
  });

  it('lists exactly the spec segments', () => {
    expect([...EXCLUDED_SEGMENTS].sort()).toEqual(
      ['.next', 'build', 'coverage', 'dist', 'node_modules', 'out', 'vendor'].sort(),
    );
  });
});

describe('parsePackageJson', () => {
  it('splits the three dependency blocks and fills missing blocks with {}', () => {
    const file = parsePackageJson(
      'packages/app/package.json',
      JSON.stringify({
        name: '@org/app',
        dependencies: { react: '^18.2.0' },
        peerDependencies: { 'react-dom': '^18.2.0' },
      }),
    );
    expect(file).toEqual({
      path: 'packages/app/package.json',
      packageName: '@org/app',
      deps: {
        dependencies: { react: '^18.2.0' },
        devDependencies: {},
        peerDependencies: { 'react-dom': '^18.2.0' },
      },
    });
  });

  it('falls back to the file path when name is missing', () => {
    const file = parsePackageJson('package.json', JSON.stringify({ dependencies: {} }));
    expect(file.packageName).toBe('package.json');
  });

  it('throws on malformed JSON (caller isolates the failure)', () => {
    expect(() => parsePackageJson('bad/package.json', '{not json')).toThrow();
  });
});

describe('decodeBase64Utf8', () => {
  it('decodes multibyte UTF-8 content with embedded newlines', () => {
    const original = '{ "name": "pação-ümlaut" }';
    const b64 = Buffer.from(original, 'utf-8').toString('base64');
    const withNewlines = `${b64.slice(0, 8)}\n${b64.slice(8)}\n`;
    expect(decodeBase64Utf8(withNewlines)).toBe(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/package-json.test.ts`
Expected: FAIL — module `./package-json` not found.

- [ ] **Step 3: Create `src/lib/types.ts`**

```ts
export type Provider = 'github' | 'gitlab';

export interface RepoConfig {
  id: string;
  provider: Provider;
  /** 'github.com' for GitHub; instance host (e.g. 'gitlab.com', 'gitlab.acme.com') for GitLab. */
  host: string;
  /** 'owner/repo' (GitHub) or full namespace 'group/sub/project' (GitLab). */
  path: string;
  displayName: string;
  defaultBranch?: string;
  selectedBranch?: string;
}

export const DEP_TYPES = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
export type DepType = (typeof DEP_TYPES)[number];

export interface PackageJsonFile {
  path: string;
  packageName: string;
  deps: Record<DepType, Record<string, string>>;
}

export interface DependencyEntry {
  depName: string;
  versionRange: string;
  depType: DepType;
  repoId: string;
  repoName: string;
  packagePath: string;
  packageName: string;
}

export interface DependencyGroup {
  depName: string;
  versions: Array<{
    versionRange: string;
    depTypes: DepType[];
    projects: Array<{
      repoId: string;
      repoName: string;
      packagePath: string;
      packageName: string;
    }>;
  }>;
}
```

- [ ] **Step 4: Create `src/lib/package-json.ts`**

```ts
import type { PackageJsonFile } from './types';

/** Path segments whose package.json files are generated artifacts, not sources. */
export const EXCLUDED_SEGMENTS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  'vendor',
] as const;

/** True when any path segment is a generated/artifact directory. Segment-exact match. */
export function isExcludedPath(path: string): boolean {
  const excluded: readonly string[] = EXCLUDED_SEGMENTS;
  return path.split('/').some((segment) => excluded.includes(segment));
}

/**
 * Parse raw package.json content into a PackageJsonFile with all three dep
 * blocks guaranteed present. Throws on malformed JSON — callers must isolate
 * per-file failures (a bad file never aborts the batch).
 */
export function parsePackageJson(path: string, content: string): PackageJsonFile {
  const json = JSON.parse(content) as {
    name?: unknown;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return {
    path,
    packageName: typeof json.name === 'string' && json.name.length > 0 ? json.name : path,
    deps: {
      dependencies: json.dependencies ?? {},
      devDependencies: json.devDependencies ?? {},
      peerDependencies: json.peerDependencies ?? {},
    },
  };
}

/**
 * Decode GitHub's base64 file content (which contains line breaks) in a
 * unicode-safe way — plain atob corrupts multibyte UTF-8.
 */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/lib/package-json.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/package-json.ts src/lib/package-json.test.ts
git commit -m "feat: domain types and shared package.json helpers"
```

---

## Task 4: Anti-SSRF guard

**Files:**
- Create: `src/lib/ssrf.ts`
- Test: `src/lib/ssrf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ssrf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateGitLabHost } from './ssrf';

describe('validateGitLabHost', () => {
  it('accepts public http/https hosts', () => {
    expect(validateGitLabHost('https://gitlab.com').ok).toBe(true);
    expect(validateGitLabHost('https://gitlab.acme.com').ok).toBe(true);
    expect(validateGitLabHost('http://gitlab.acme.internal:8080').ok).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateGitLabHost('file:///etc/passwd').ok).toBe(false);
    expect(validateGitLabHost('ftp://gitlab.com').ok).toBe(false);
    expect(validateGitLabHost('gopher://evil').ok).toBe(false);
  });

  it('rejects loopback and localhost', () => {
    expect(validateGitLabHost('http://localhost').ok).toBe(false);
    expect(validateGitLabHost('http://foo.localhost').ok).toBe(false);
    expect(validateGitLabHost('http://127.0.0.1').ok).toBe(false);
    expect(validateGitLabHost('http://127.5.5.5').ok).toBe(false);
    expect(validateGitLabHost('http://[::1]').ok).toBe(false);
  });

  it('rejects private and link-local ranges', () => {
    expect(validateGitLabHost('http://10.0.0.4').ok).toBe(false);
    expect(validateGitLabHost('http://192.168.1.10').ok).toBe(false);
    expect(validateGitLabHost('http://172.16.0.1').ok).toBe(false);
    expect(validateGitLabHost('http://172.31.255.255').ok).toBe(false);
    expect(validateGitLabHost('http://169.254.169.254').ok).toBe(false); // cloud metadata
  });

  it('accepts public IPs adjacent to private ranges', () => {
    expect(validateGitLabHost('http://172.15.0.1').ok).toBe(true);
    expect(validateGitLabHost('http://172.32.0.1').ok).toBe(true);
    expect(validateGitLabHost('http://11.0.0.1').ok).toBe(true);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(validateGitLabHost('https://user:pass@gitlab.acme.com').ok).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(validateGitLabHost('not a url').ok).toBe(false);
    expect(validateGitLabHost('').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/ssrf.test.ts`
Expected: FAIL — module `./ssrf` not found.

- [ ] **Step 3: Create `src/lib/ssrf.ts`**

```ts
const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918 172.16.0.0/12
  /^169\.254\./, // link-local / cloud metadata
  /^0\./, // "this" network
];

export type HostValidation = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Validate the client-supplied GitLab host before the proxy dispatches to it.
 * Without this guard the GitLab proxy route would be an open proxy (SSRF).
 * Hostname-based checks only — DNS resolution is intentionally out of scope (spec §6.4).
 */
export function validateGitLabHost(raw: string): HostValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'malformed URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `scheme '${url.protocol}' is not allowed` };
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'credentials in URL are not allowed' };
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost is not allowed' };
  }

  if (hostname === '[::1]' || hostname === '::1') {
    return { ok: false, reason: 'loopback address is not allowed' };
  }

  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return { ok: false, reason: 'private/reserved IP ranges are not allowed' };
  }

  return { ok: true, url };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/ssrf.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ssrf.ts src/lib/ssrf.test.ts
git commit -m "feat: anti-SSRF host validation for GitLab proxy"
```

---

## Task 5: Proxy client (Ky) + provider interface

**Files:**
- Create: `src/lib/proxy-client.ts`
- Create: `src/lib/providers/provider.ts`
- Create: `src/lib/errors.ts`
- Test: `src/lib/errors.test.ts`

Note: `proxy-client.ts` imports the token store, which is created in Task 8. Create the store files first if you implement out of order, or implement Task 8's `token-store.ts` now (it has no dependencies). The plan order below implements stores in Task 8; to keep Task 5 self-contained, `proxy-client.ts` is written against the token store's final API (`useTokenStore.getState().tokenFor(repo)`), and its compile check happens in Task 8.

- [ ] **Step 1: Write the failing test for `describeError`**

Create `src/lib/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeError } from './errors';

function httpError(status: number): Error {
  const err = new Error(`HTTP ${status}`);
  (err as Error & { status?: number }).status = status;
  return err;
}

describe('describeError', () => {
  it('maps 401 to credential guidance', () => {
    expect(describeError(httpError(401))).toMatch(/token|credential/i);
  });

  it('maps 404 to not-found/no-access', () => {
    expect(describeError(httpError(404))).toMatch(/not found|no access/i);
  });

  it('maps 429 to rate limit', () => {
    expect(describeError(httpError(429))).toMatch(/rate limit/i);
  });

  it('maps 403 with rate-limit message to rate limit', () => {
    const err = new Error('API rate limit exceeded');
    (err as Error & { status?: number }).status = 403;
    expect(describeError(err)).toMatch(/rate limit/i);
  });

  it('passes through unknown error messages', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('handles non-Error values', () => {
    expect(describeError('weird')).toMatch(/unexpected|unknown/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/errors.test.ts`
Expected: FAIL — module `./errors` not found.

- [ ] **Step 3: Create `src/lib/errors.ts`**

```ts
/** Errors shaped by our proxy client carry the upstream HTTP status. */
export interface StatusError extends Error {
  status?: number;
}

/**
 * Map any fetch/proxy error to a user-facing message, following the spec's
 * error convention: 401 = credential problem, 404 = missing repo or no
 * permission, 429/403-with-rate-limit = provider throttling.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as StatusError).status;
    if (status === 401) {
      return 'Invalid or expired credential — review your access token.';
    }
    if (status === 404) {
      return 'Repository not found, or the token has no access to it.';
    }
    if (status === 429 || (status === 403 && /rate limit/i.test(error.message))) {
      return 'Provider rate limit reached — wait a moment and try again.';
    }
    return error.message;
  }
  return 'Unexpected error.';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/errors.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Create `src/lib/providers/provider.ts`**

```ts
import type { Provider, RepoConfig, PackageJsonFile } from '@/lib/types';

export interface ParsedRepoUrl {
  provider: Provider;
  host: string;
  path: string;
}

/** Minimal HTTP surface the providers need — implemented by the Ky proxy client. */
export interface ProxyClient {
  /** GET JSON through the app proxy. Throws StatusError on non-2xx. */
  getJson<T>(path: string, searchParams?: Record<string, string>): Promise<T>;
  /** GET plain text through the app proxy (GitLab raw files). */
  getText(path: string, searchParams?: Record<string, string>): Promise<string>;
}

/**
 * Symmetric interface isolating GitHub/GitLab API differences (spec §3.3).
 * Every method receives the repo so self-hosted GitLab hosts work uniformly.
 */
export interface GitProvider {
  parseUrl(url: string): ParsedRepoUrl;
  getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string>;
  listBranches(client: ProxyClient, repo: RepoConfig): Promise<string[]>;
  listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]>;
  fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ): Promise<PackageJsonFile>;
}
```

- [ ] **Step 6: Create `src/lib/proxy-client.ts`**

```ts
import ky, { HTTPError } from 'ky';
import type { RepoConfig } from '@/lib/types';
import type { ProxyClient } from '@/lib/providers/provider';
import type { StatusError } from '@/lib/errors';
import { useTokenStore } from '@/stores/token-store';

/**
 * Browser-side client. NEVER talks to api.github.com or a GitLab instance
 * directly — everything goes through the same-origin Route Handlers, which
 * inject the upstream auth headers. Tokens are read from the in-memory store
 * at request time; they are never persisted or put in URLs.
 */
const kyInstance = ky.create({
  prefixUrl: '/api/proxy',
  retry: 1,
  timeout: 30_000,
  hooks: {
    beforeRequest: [
      (request) => {
        // The route segment after /api/proxy determines the provider.
        const provider = request.url.includes('/api/proxy/github/') ? 'github' : 'gitlab';
        // x-gitlab-host carries a full URL (the SSRF guard parses it with new URL);
        // the token store is keyed by bare host.
        let host = 'github.com';
        if (provider === 'gitlab') {
          const hostHeader = request.headers.get('x-gitlab-host') ?? 'https://gitlab.com';
          host = new URL(hostHeader).host;
        }
        const token = useTokenStore.getState().tokenFor({ provider, host });
        if (token) {
          request.headers.set('x-access-token', token);
        }
      },
    ],
  },
  throwHttpErrors: true,
});

async function toStatusError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof HTTPError) {
      const statusError = new Error(`Request failed with status ${error.response.status}`) as StatusError;
      statusError.status = error.response.status;
      throw statusError;
    }
    throw error;
  }
}

/**
 * Build a ProxyClient bound to one repository. For GitLab the target host is
 * attached as the x-gitlab-host header (a full URL — the proxy route parses
 * and validates it) consumed by the proxy route; for GitHub the host is fixed.
 */
export function createProxyClient(repo: RepoConfig): ProxyClient {
  const base =
    repo.provider === 'github'
      ? kyInstance.extend({ prefixUrl: '/api/proxy/github' })
      : kyInstance.extend({
          prefixUrl: '/api/proxy/gitlab',
          headers: { 'x-gitlab-host': `https://${repo.host}` },
        });

  return {
    async getJson<T>(path: string, searchParams?: Record<string, string>): Promise<T> {
      return toStatusError(base.get(path, { searchParams }).json<T>());
    },
    async getText(path: string, searchParams?: Record<string, string>): Promise<string> {
      return toStatusError(base.get(path, { searchParams }).text());
    },
  };
}
```

Note: `ky` does not expose raw response headers via `.json()`. Branch pagination for GitHub uses the `Link` header — handle this by having the GitHub provider call a small dedicated paginator that uses `kyInstance` responses directly, shown in Task 6 (`getJsonWithHeaders`). To support that, append this helper to `src/lib/proxy-client.ts`:

```ts
export interface PagedResponse<T> {
  data: T;
  headers: Headers;
}

/** GET JSON and expose upstream response headers (needed for Link / x-next-page pagination). */
export async function getJsonWithHeaders<T>(
  repo: RepoConfig,
  path: string,
  searchParams?: Record<string, string>,
): Promise<PagedResponse<T>> {
  const base =
    repo.provider === 'github'
      ? kyInstance.extend({ prefixUrl: '/api/proxy/github' })
      : kyInstance.extend({
          prefixUrl: '/api/proxy/gitlab',
          headers: { 'x-gitlab-host': `https://${repo.host}` },
        });
  const response = await toStatusError(base.get(path, { searchParams }));
  return { data: await response.json<T>(), headers: response.headers };
}
```

(The proxy Route Handlers in Tasks 9–10 must forward the upstream `link` and `x-next-page` headers — already covered in their implementations.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts src/lib/providers/provider.ts src/lib/proxy-client.ts
git commit -m "feat: ky proxy client with in-memory token injection"
```

---

## Task 6: GitHub provider

**Files:**
- Create: `src/lib/providers/github.ts`
- Test: `src/lib/providers/github.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/providers/github.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { githubProvider } from './github';
import type { ProxyClient } from './provider';
import type { RepoConfig } from '@/lib/types';

const repo: RepoConfig = {
  id: 'r1',
  provider: 'github',
  host: 'github.com',
  path: 'acme/web',
  displayName: 'acme/web',
  defaultBranch: 'main',
};

function clientWith(handlers: Record<string, unknown>): ProxyClient {
  return {
    getJson: vi.fn(async (path: string) => {
      const hit = Object.entries(handlers).find(([key]) => path.startsWith(key));
      if (!hit) throw new Error(`unexpected path: ${path}`);
      const value = hit[1];
      if (value instanceof Error) throw value;
      return value;
    }),
    getText: vi.fn(async () => ''),
  };
}

describe('parseUrl', () => {
  it('parses plain repo URLs', () => {
    expect(githubProvider.parseUrl('https://github.com/acme/web')).toEqual({
      provider: 'github',
      host: 'github.com',
      path: 'acme/web',
    });
  });

  it('strips .git suffix and /tree/<branch> prefixes', () => {
    expect(githubProvider.parseUrl('https://github.com/acme/web.git').path).toBe('acme/web');
    expect(githubProvider.parseUrl('https://github.com/acme/web/tree/main').path).toBe('acme/web');
  });

  it('rejects non-GitHub and malformed URLs', () => {
    expect(() => githubProvider.parseUrl('https://gitlab.com/acme/web')).toThrow();
    expect(() => githubProvider.parseUrl('https://github.com/acme')).toThrow();
    expect(() => githubProvider.parseUrl('not a url')).toThrow();
  });
});

describe('getDefaultBranch', () => {
  it('reads default_branch from the repo payload', async () => {
    const client = clientWith({ 'repos/acme/web': { default_branch: 'main' } });
    await expect(githubProvider.getDefaultBranch(client, repo)).resolves.toBe('main');
  });
});

describe('listPackageJsonPaths', () => {
  it('filters blobs ending in package.json and applies exclusion segments', async () => {
    const client = clientWith({
      'repos/acme/web/git/trees/main': {
        truncated: false,
        tree: [
          { type: 'blob', path: 'package.json' },
          { type: 'blob', path: 'packages/app/package.json' },
          { type: 'blob', path: 'node_modules/x/package.json' },
          { type: 'blob', path: 'packages/lib/dist/package.json' },
          { type: 'tree', path: 'packages' },
          { type: 'blob', path: 'README.md' },
        ],
      },
    });
    const paths = await githubProvider.listPackageJsonPaths(client, repo, 'main');
    expect(paths).toEqual(['package.json', 'packages/app/package.json']);
  });

  it('tolerates truncated trees (uses what came)', async () => {
    const client = clientWith({
      'repos/acme/web/git/trees/main': {
        truncated: true,
        tree: [{ type: 'blob', path: 'package.json' }],
      },
    });
    await expect(githubProvider.listPackageJsonPaths(client, repo, 'main')).resolves.toEqual([
      'package.json',
    ]);
  });
});

describe('fetchPackageJson', () => {
  it('decodes base64 content unicode-safe and parses deps', async () => {
    const content = Buffer.from(
      JSON.stringify({ name: 'web', dependencies: { react: '^18.2.0' } }),
      'utf-8',
    ).toString('base64');
    const client = clientWith({
      'repos/acme/web/contents/package.json': { content: `${content}\n`, encoding: 'base64' },
    });
    const file = await githubProvider.fetchPackageJson(client, repo, 'main', 'package.json');
    expect(file.packageName).toBe('web');
    expect(file.deps.dependencies).toEqual({ react: '^18.2.0' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/providers/github.test.ts`
Expected: FAIL — module `./github` not found.

- [ ] **Step 3: Create `src/lib/providers/github.ts`**

Branch listing paginates via the `Link` response header, which the test-facing `ProxyClient` intentionally hides. So the provider's `listBranches` receives a `PagedGet` function (returning data **and** headers) injected by the data hooks — in production it's `getJsonWithHeaders` from `proxy-client.ts`; in tests it's a `vi.fn()` stub. First, update `src/lib/providers/provider.ts` (created in Task 5) so `PagedResponse`/`PagedGet` live there and the interface takes the paged getter:

```ts
import type { Provider, RepoConfig, PackageJsonFile } from '@/lib/types';

export interface ParsedRepoUrl {
  provider: Provider;
  host: string;
  path: string;
}

/** Minimal HTTP surface the providers need — implemented by the Ky proxy client. */
export interface ProxyClient {
  /** GET JSON through the app proxy. Throws StatusError on non-2xx. */
  getJson<T>(path: string, searchParams?: Record<string, string>): Promise<T>;
  /** GET plain text through the app proxy (GitLab raw files). */
  getText(path: string, searchParams?: Record<string, string>): Promise<string>;
}

/** JSON plus upstream response headers (needed for Link / x-next-page pagination). */
export interface PagedResponse<T> {
  data: T;
  headers: Headers;
}
export type PagedGet = <T>(
  path: string,
  searchParams?: Record<string, string>,
) => Promise<PagedResponse<T>>;

/**
 * Symmetric interface isolating GitHub/GitLab API differences (spec §3.3).
 * Every method receives the repo so self-hosted GitLab hosts work uniformly.
 */
export interface GitProvider {
  parseUrl(url: string): ParsedRepoUrl;
  getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string>;
  listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]>;
  listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]>;
  fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ): Promise<PackageJsonFile>;
}
```

In `src/lib/proxy-client.ts`, replace its local `PagedResponse` interface with a re-export (`export type { PagedResponse, PagedGet } from '@/lib/providers/provider';` — `getJsonWithHeaders` keeps the exact `PagedGet` shape, bound to a repo).

Then create `src/lib/providers/github.ts`:

```ts
import type { RepoConfig } from '@/lib/types';
import type { GitProvider, PagedGet, ParsedRepoUrl, ProxyClient } from './provider';
import { decodeBase64Utf8, isExcludedPath, parsePackageJson } from '@/lib/package-json';

const MAX_BRANCHES = 500;

interface GitHubRepoPayload {
  default_branch: string;
}

interface GitHubTreePayload {
  truncated: boolean;
  tree: Array<{ type: string; path: string }>;
}

interface GitHubContentPayload {
  content: string;
  encoding: string;
}

/** Parse the RFC 5988 Link header for a rel="next" URL. */
export function nextLinkUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export const githubProvider: GitProvider = {
  parseUrl(raw: string): ParsedRepoUrl {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new Error('Invalid URL — paste a full GitHub repository URL.');
    }
    if (url.hostname !== 'github.com') {
      throw new Error('Not a GitHub URL.');
    }
    const segments = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    // Drop /tree/<branch>/... suffixes.
    const treeIndex = segments.indexOf('tree');
    const pathSegments = treeIndex === -1 ? segments : segments.slice(0, treeIndex);
    if (pathSegments.length !== 2) {
      throw new Error('Expected https://github.com/owner/repo');
    }
    return { provider: 'github', host: 'github.com', path: pathSegments.join('/') };
  },

  async getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string> {
    const payload = await client.getJson<GitHubRepoPayload>(`repos/${repo.path}`);
    return payload.default_branch;
  },

  /** Full pagination via Link header, capped at MAX_BRANCHES (spec §4.6). */
  async listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]> {
    const names: string[] = [];
    let path: string | null = `repos/${repo.path}/branches`;
    let searchParams: Record<string, string> | undefined = { per_page: '100' };
    while (path && names.length < MAX_BRANCHES) {
      const page = await pagedGet<Array<{ name: string }>>(path, searchParams);
      names.push(...page.data.map((b) => b.name));
      const next = nextLinkUrl(page.headers.get('link'));
      if (!next) break;
      // Subsequent pages: the next URL is absolute (api.github.com); reduce it
      // to a proxy-relative path and re-extract the query for ky.
      const nextUrl = new URL(next);
      path = nextUrl.pathname.replace(/^\/+/, '');
      searchParams = Object.fromEntries(nextUrl.searchParams.entries());
    }
    return names.slice(0, MAX_BRANCHES);
  },

  async listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]> {
    const payload = await client.getJson<GitHubTreePayload>(
      `repos/${repo.path}/git/trees/${encodeURIComponent(branch)}`,
      { recursive: '1' },
    );
    // A truncated tree (giant repos) is tolerated: use what came (spec §4.6).
    return payload.tree
      .filter((entry) => entry.type === 'blob' && entry.path.endsWith('package.json'))
      .map((entry) => entry.path)
      .filter((path) => !isExcludedPath(path));
  },

  async fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ): Promise<ReturnType<typeof parsePackageJson>> {
    const payload = await client.getJson<GitHubContentPayload>(
      `repos/${repo.path}/contents/${path}`,
      { ref: branch },
    );
    return parsePackageJson(path, decodeBase64Utf8(payload.content));
  },
};
```

Append the pagination test to `src/lib/providers/github.test.ts` (inside the top-level describe scope):

```ts
describe('listBranches', () => {
  it('follows Link headers until exhausted and caps at 500', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `b${i}` }));
    const page2 = Array.from({ length: 3 }, (_, i) => ({ name: `c${i}` }));
    const pagedGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: page1,
        headers: new Headers({
          link: '<https://api.github.com/repos/acme/web/branches?per_page=100&page=2>; rel="next"',
        }),
      })
      .mockResolvedValueOnce({ data: page2, headers: new Headers() });
    const names = await githubProvider.listBranches(pagedGet, repo);
    expect(names).toHaveLength(103);
    expect(names[0]).toBe('b0');
    expect(names.at(-1)).toBe('c2');
    expect(pagedGet).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/providers/github.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/github.ts src/lib/providers/github.test.ts src/lib/providers/provider.ts src/lib/proxy-client.ts
git commit -m "feat: GitHub provider with Link pagination and tree scan"
```

---

## Task 7: GitLab provider

**Files:**
- Create: `src/lib/providers/gitlab.ts`
- Create: `src/lib/providers/index.ts`
- Test: `src/lib/providers/gitlab.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/providers/gitlab.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { gitlabProvider } from './gitlab';
import type { ProxyClient } from './provider';
import type { RepoConfig } from '@/lib/types';

const repo: RepoConfig = {
  id: 'r2',
  provider: 'gitlab',
  host: 'gitlab.acme.com',
  path: 'group/sub/project',
  displayName: 'group/sub/project',
  defaultBranch: 'main',
};

function clientWith(handlers: Record<string, unknown>): ProxyClient {
  return {
    getJson: vi.fn(async (path: string) => {
      const hit = Object.entries(handlers).find(([key]) => path.startsWith(key));
      if (!hit) throw new Error(`unexpected path: ${path}`);
      const value = hit[1];
      if (value instanceof Error) throw value;
      return value;
    }),
    getText: vi.fn(async (path: string) => {
      const hit = Object.entries(handlers).find(([key]) => path.startsWith(key));
      if (!hit) throw new Error(`unexpected path: ${path}`);
      const value = hit[1];
      if (value instanceof Error) throw value;
      if (typeof value !== 'string') throw new Error(`not text: ${path}`);
      return value;
    }),
  };
}

describe('parseUrl', () => {
  it('parses gitlab.com URLs with nested groups', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/group/sub/project')).toEqual({
      provider: 'gitlab',
      host: 'gitlab.com',
      path: 'group/sub/project',
    });
  });

  it('parses self-hosted URLs and strips /-/tree/... and .git', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.acme.com/group/sub/project/-/tree/main')).toEqual({
      provider: 'gitlab',
      host: 'gitlab.acme.com',
      path: 'group/sub/project',
    });
    expect(gitlabProvider.parseUrl('https://gitlab.acme.com/group/project.git').path).toBe(
      'group/project',
    );
  });

  it('rejects GitHub URLs and single-segment paths', () => {
    expect(() => gitlabProvider.parseUrl('https://github.com/a/b')).toThrow();
    expect(() => gitlabProvider.parseUrl('https://gitlab.com/onlygroup')).toThrow();
  });
});

describe('getDefaultBranch', () => {
  it('URL-encodes the full project path as one segment', async () => {
    const client = clientWith({ 'projects/group%2Fsub%2Fproject': { default_branch: 'develop' } });
    await expect(gitlabProvider.getDefaultBranch(client, repo)).resolves.toBe('develop');
  });
});

describe('listPackageJsonPaths', () => {
  it('filters blobs named package.json with exclusion segments', async () => {
    const client = clientWith({
      'projects/group%2Fsub%2Fproject/repository/tree': [
        { type: 'blob', path: 'package.json' },
        { type: 'blob', path: 'packages/api/package.json' },
        { type: 'blob', path: 'packages/api/coverage/package.json' },
        { type: 'tree', path: 'packages' },
      ],
    });
    const paths = await gitlabProvider.listPackageJsonPaths(client, repo, 'main');
    expect(paths).toEqual(['package.json', 'packages/api/package.json']);
  });
});

describe('fetchPackageJson', () => {
  it('reads the raw endpoint (plain text, no base64)', async () => {
    const raw = JSON.stringify({ name: 'api', devDependencies: { vitest: '^2.0.0' } });
    const client = clientWith({
      'projects/group%2Fsub%2Fproject/repository/files/package.json%2F..': raw,
    });
    // The provider must encode the file path as a single segment:
    const client2: ProxyClient = {
      getJson: vi.fn(),
      getText: vi.fn(async (path: string) => {
        expect(path).toBe(
          'projects/group%2Fsub%2Fproject/repository/files/package.json/raw',
        );
        return raw;
      }),
    };
    const file = await gitlabProvider.fetchPackageJson(client2, repo, 'main', 'package.json');
    expect(file.packageName).toBe('api');
    expect(file.deps.devDependencies).toEqual({ vitest: '^2.0.0' });
  });
});

describe('listBranches', () => {
  it('follows x-next-page until empty', async () => {
    const pagedGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ name: 'main' }, { name: 'dev' }],
        headers: new Headers({ 'x-next-page': '2' }),
      })
      .mockResolvedValueOnce({ data: [{ name: 'release' }], headers: new Headers({ 'x-next-page': '' }) });
    const names = await gitlabProvider.listBranches(pagedGet, repo);
    expect(names).toEqual(['main', 'dev', 'release']);
    expect(pagedGet).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/providers/gitlab.test.ts`
Expected: FAIL — module `./gitlab` not found.

- [ ] **Step 3: Create `src/lib/providers/gitlab.ts`**

GitLab's recursive tree is paginated (not truncated like GitHub), so `listPackageJsonPaths` also needs the paged getter. Signature deviation from the interface: pass `pagedGet` for tree listing as well. Final interface (already updated in Task 6) uses `pagedGet` only for `listBranches`; for GitLab trees, the provider instead loops pages using `client.getJson` per page — but headers are needed for `x-next-page`. Resolution: `listPackageJsonPaths` for GitLab takes the same `PagedGet` as an optional extra parameter is messy — instead, make the GitLab provider object expose `listPackageJsonPathsPaginated(pagedGet, repo, branch)` and have the data hooks call the paginated variant when `repo.provider === 'gitlab'` via the `getProvider` dispatch in `src/lib/providers/index.ts` below. To keep one symmetric call site, `src/lib/providers/index.ts` will export a single `listPackageJsonPaths(repo, branch, client, pagedGet)` facade used by hooks. Write it:

```ts
import type { RepoConfig } from '@/lib/types';
import type { GitProvider, PagedGet, ParsedRepoUrl, ProxyClient } from './provider';
import { isExcludedPath, parsePackageJson } from '@/lib/package-json';

const MAX_BRANCHES = 500;

interface GitLabProjectPayload {
  default_branch: string;
}

interface GitLabTreeEntry {
  type: 'blob' | 'tree';
  path: string;
}

function projectId(repo: RepoConfig): string {
  return encodeURIComponent(repo.path);
}

export const gitlabProvider: GitProvider = {
  parseUrl(raw: string): ParsedRepoUrl {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new Error('Invalid URL — paste a full GitLab repository URL.');
    }
    if (url.hostname === 'github.com') {
      throw new Error('Use the GitHub provider for github.com URLs.');
    }
    let path = url.pathname.replace(/\.git$/, '');
    // Strip /-/tree/<branch>/... or /tree/<branch>/... suffixes.
    path = path.replace(/\/(-\/)?tree\/.*$/, '');
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error('Expected a GitLab project path like group/project (subgroups allowed).');
    }
    return { provider: 'gitlab', host: url.host, path: segments.join('/') };
  },

  async getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string> {
    const payload = await client.getJson<GitLabProjectPayload>(`projects/${projectId(repo)}`);
    return payload.default_branch;
  },

  async listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]> {
    const names: string[] = [];
    let page = 1;
    while (names.length < MAX_BRANCHES) {
      const response = await pagedGet<Array<{ name: string }>>(
        `projects/${projectId(repo)}/repository/branches`,
        { per_page: '100', page: String(page) },
      );
      names.push(...response.data.map((b) => b.name));
      const nextPage = response.headers.get('x-next-page');
      if (!nextPage) break;
      page = Number(nextPage);
    }
    return names.slice(0, MAX_BRANCHES);
  },

  /** Header-less single-page fallback; hooks use the paginated facade in providers/index.ts. */
  async listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]> {
    const entries = await client.getJson<GitLabTreeEntry[]>(
      `projects/${projectId(repo)}/repository/tree`,
      { recursive: 'true', per_page: '100', ref: branch },
    );
    return filterPackageJsonPaths(entries);
  },

  async fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ) {
    const raw = await client.getText(
      `projects/${projectId(repo)}/repository/files/${encodeURIComponent(path)}/raw`,
      { ref: branch },
    );
    return parsePackageJson(path, raw);
  },
};

export function filterPackageJsonPaths(entries: GitLabTreeEntry[]): string[] {
  return entries
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('package.json'))
    .map((entry) => entry.path)
    .filter((path) => !isExcludedPath(path));
}

/** Paginated recursive-tree listing (GitLab trees paginate instead of truncating). */
export async function listPackageJsonPathsPaginated(
  pagedGet: PagedGet,
  repo: RepoConfig,
  branch: string,
): Promise<string[]> {
  const paths: string[] = [];
  let page = 1;
  for (;;) {
    const response = await pagedGet<GitLabTreeEntry[]>(
      `projects/${projectId(repo)}/repository/tree`,
      { recursive: 'true', per_page: '100', ref: branch, page: String(page) },
    );
    paths.push(...filterPackageJsonPaths(response.data));
    const nextPage = response.headers.get('x-next-page');
    if (!nextPage) break;
    page = Number(nextPage);
  }
  return paths;
}
```

- [ ] **Step 4: Create `src/lib/providers/index.ts`**

One facade so hooks stay provider-agnostic:

```ts
import type { RepoConfig } from '@/lib/types';
import type { PagedGet, ProxyClient } from './provider';
import { githubProvider } from './github';
import { gitlabProvider, listPackageJsonPathsPaginated } from './gitlab';

export function getProvider(repo: RepoConfig) {
  return repo.provider === 'github' ? githubProvider : gitlabProvider;
}

/** Paginated branch listing for either provider. */
export function listBranches(repo: RepoConfig, pagedGet: PagedGet): Promise<string[]> {
  return getProvider(repo).listBranches(pagedGet, repo);
}

/** Paginated package.json path listing (GitHub tree is single-call, GitLab paginates). */
export async function listPackageJsonPaths(
  repo: RepoConfig,
  branch: string,
  client: ProxyClient,
  pagedGet: PagedGet,
): Promise<string[]> {
  if (repo.provider === 'github') {
    return githubProvider.listPackageJsonPaths(client, repo, branch);
  }
  return listPackageJsonPathsPaginated(pagedGet, repo, branch);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/lib/providers/gitlab.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/providers/gitlab.ts src/lib/providers/gitlab.test.ts src/lib/providers/index.ts
git commit -m "feat: GitLab provider with x-next-page pagination and raw file reads"
```

---

## Task 8: Zustand stores (token, repo, settings, view)

**Files:**
- Create: `src/stores/token-store.ts`
- Create: `src/stores/repo-store.ts`
- Create: `src/stores/settings-store.ts`
- Create: `src/stores/view-store.ts`
- Modify: `src/lib/proxy-client.ts` (drop the `as RepoConfig` cast)
- Test: `src/stores/token-store.test.ts`
- Test: `src/stores/repo-store.test.ts`
- Test: `src/stores/settings-store.test.ts`

- [ ] **Step 1: Write the failing token-store test**

Create `src/stores/token-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTokenStore } from './token-store';
import type { RepoConfig } from '@/lib/types';

const githubRepo = { provider: 'github', host: 'github.com' } as RepoConfig;
const gitlabComRepo = { provider: 'gitlab', host: 'gitlab.com' } as RepoConfig;
const selfHostedRepo = { provider: 'gitlab', host: 'gitlab.acme.com' } as RepoConfig;

beforeEach(() => {
  useTokenStore.getState().clearAll();
});

describe('token-store', () => {
  it('starts empty (tokens never persisted)', () => {
    expect(useTokenStore.getState().tokenFor(githubRepo)).toBeNull();
  });

  it('resolves GitHub token regardless of path', () => {
    useTokenStore.getState().setGithubToken('ghp_x');
    expect(useTokenStore.getState().tokenFor(githubRepo)).toBe('ghp_x');
  });

  it('resolves GitLab tokens per host, with no silent fallback (RN RF-01.2)', () => {
    useTokenStore.getState().setGitlabToken('gitlab.acme.com', 'glpat-acme');
    expect(useTokenStore.getState().tokenFor(selfHostedRepo)).toBe('glpat-acme');
    expect(useTokenStore.getState().tokenFor(gitlabComRepo)).toBeNull();
  });

  it('stores gitlab.com token under the default host key', () => {
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat-com');
    expect(useTokenStore.getState().tokenFor(gitlabComRepo)).toBe('glpat-com');
  });

  it('clearAll wipes everything', () => {
    useTokenStore.getState().setGithubToken('ghp_x');
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat-com');
    useTokenStore.getState().clearAll();
    expect(useTokenStore.getState().githubToken).toBe('');
    expect(useTokenStore.getState().gitlabTokens).toEqual({});
  });

  it('setting an empty token removes the host entry', () => {
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat-com');
    useTokenStore.getState().setGitlabToken('gitlab.com', '');
    expect(useTokenStore.getState().tokenFor(gitlabComRepo)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing repo-store test**

Create `src/stores/repo-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useRepoStore } from './repo-store';
import type { RepoConfig } from '@/lib/types';

function repo(id: string, path = `acme/${id}`): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path,
    displayName: path,
    defaultBranch: 'main',
  };
}

beforeEach(() => {
  localStorage.clear();
  useRepoStore.setState({ repos: [], selectedRepoId: null });
});

describe('repo-store', () => {
  it('adds repos and persists to localStorage under rda-repos', () => {
    useRepoStore.getState().addRepo(repo('a'));
    expect(useRepoStore.getState().repos).toHaveLength(1);
    const persisted = JSON.parse(localStorage.getItem('rda-repos') ?? '{}');
    expect(persisted.state.repos).toHaveLength(1);
  });

  it('dedupes by provider+host+path and returns the existing id', () => {
    useRepoStore.getState().addRepo(repo('a'));
    const second = { ...repo('b'), path: 'acme/a' }; // same identity, different id
    const result = useRepoStore.getState().addRepo(second);
    expect(useRepoStore.getState().repos).toHaveLength(1);
    expect(result).toBe('a');
  });

  it('removing the selected repo clears the selection (RN RF-03.5)', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().selectRepo('a');
    useRepoStore.getState().removeRepo('a');
    expect(useRepoStore.getState().repos).toHaveLength(0);
    expect(useRepoStore.getState().selectedRepoId).toBeNull();
  });

  it('removing a non-selected repo keeps the selection', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().addRepo(repo('b'));
    useRepoStore.getState().selectRepo('a');
    useRepoStore.getState().removeRepo('b');
    expect(useRepoStore.getState().selectedRepoId).toBe('a');
  });

  it('setBranch persists the branch per repo', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().addRepo(repo('b'));
    useRepoStore.getState().setBranch('a', 'develop');
    expect(useRepoStore.getState().repos.find((r) => r.id === 'a')?.selectedBranch).toBe('develop');
    expect(useRepoStore.getState().repos.find((r) => r.id === 'b')?.selectedBranch).toBeUndefined();
  });

  it('selection survives a store rehydrate (persisted selectedRepoId)', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().selectRepo('a');
    const persisted = JSON.parse(localStorage.getItem('rda-repos') ?? '{}');
    expect(persisted.state.selectedRepoId).toBe('a');
  });
});
```

- [ ] **Step 3: Write the failing settings-store test**

Create `src/stores/settings-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settings-store';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    enabledDepTypes: { dependencies: true, devDependencies: true, peerDependencies: true },
  });
});

describe('settings-store', () => {
  it('has all three types enabled by default (RN RF-07.1)', () => {
    const { enabledDepTypes } = useSettingsStore.getState();
    expect(enabledDepTypes).toEqual({
      dependencies: true,
      devDependencies: true,
      peerDependencies: true,
    });
  });

  it('toggles types independently', () => {
    useSettingsStore.getState().toggleDepType('devDependencies');
    expect(useSettingsStore.getState().enabledDepTypes.devDependencies).toBe(false);
    expect(useSettingsStore.getState().enabledDepTypes.dependencies).toBe(true);
    useSettingsStore.getState().toggleDepType('devDependencies');
    expect(useSettingsStore.getState().enabledDepTypes.devDependencies).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm test -- src/stores`
Expected: FAIL — store modules not found.

- [ ] **Step 5: Create `src/stores/token-store.ts`**

Deliberately NO persist middleware — tokens live in memory only (spec §6.2).

```ts
import { create } from 'zustand';
import type { Provider } from '@/lib/types';

export const DEFAULT_GITLAB_HOST = 'gitlab.com';

interface TokenState {
  githubToken: string;
  /** host (e.g. 'gitlab.com', 'gitlab.acme.com') -> token */
  gitlabTokens: Record<string, string>;
  setGithubToken: (token: string) => void;
  setGitlabToken: (host: string, token: string) => void;
  /** Resolve the applicable token; null when missing — never a silent fallback. */
  tokenFor: (target: { provider: Provider; host: string }) => string | null;
  clearAll: () => void;
}

export const useTokenStore = create<TokenState>()((set, get) => ({
  githubToken: '',
  gitlabTokens: {},

  setGithubToken: (token) => set({ githubToken: token }),

  setGitlabToken: (host, token) =>
    set((state) => {
      const gitlabTokens = { ...state.gitlabTokens };
      if (token === '') {
        delete gitlabTokens[host];
      } else {
        gitlabTokens[host] = token;
      }
      return { gitlabTokens };
    }),

  tokenFor: ({ provider, host }) => {
    const state = get();
    if (provider === 'github') {
      return state.githubToken || null;
    }
    return state.gitlabTokens[host] ?? null;
  },

  clearAll: () => set({ githubToken: '', gitlabTokens: {} }),
}));
```

- [ ] **Step 6: Create `src/stores/repo-store.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepoConfig } from '@/lib/types';

interface RepoState {
  repos: RepoConfig[];
  selectedRepoId: string | null;
  /** Add a repo; dedupes on provider+host+path. Returns the effective repo id. */
  addRepo: (repo: RepoConfig) => string;
  removeRepo: (id: string) => void;
  setBranch: (id: string, branch: string) => void;
  selectRepo: (id: string | null) => void;
}

function sameIdentity(a: RepoConfig, b: RepoConfig): boolean {
  return a.provider === b.provider && a.host === b.host && a.path === b.path;
}

export const useRepoStore = create<RepoState>()(
  persist(
    (set, get) => ({
      repos: [],
      selectedRepoId: null,

      addRepo: (repo) => {
        const existing = get().repos.find((r) => sameIdentity(r, repo));
        if (existing) return existing.id;
        set((state) => ({ repos: [...state.repos, repo] }));
        return repo.id;
      },

      removeRepo: (id) =>
        set((state) => ({
          repos: state.repos.filter((r) => r.id !== id),
          selectedRepoId: state.selectedRepoId === id ? null : state.selectedRepoId,
        })),

      setBranch: (id, branch) =>
        set((state) => ({
          repos: state.repos.map((r) => (r.id === id ? { ...r, selectedBranch: branch } : r)),
        })),

      selectRepo: (id) => set({ selectedRepoId: id }),
    }),
    {
      name: 'rda-repos',
      partialize: (state) => ({ repos: state.repos, selectedRepoId: state.selectedRepoId }),
    },
  ),
);
```

- [ ] **Step 7: Create `src/stores/settings-store.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DepType } from '@/lib/types';

interface SettingsState {
  enabledDepTypes: Record<DepType, boolean>;
  toggleDepType: (type: DepType) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      enabledDepTypes: { dependencies: true, devDependencies: true, peerDependencies: true },
      toggleDepType: (type) =>
        set((state) => ({
          enabledDepTypes: {
            ...state.enabledDepTypes,
            [type]: !state.enabledDepTypes[type],
          },
        })),
    }),
    { name: 'rda-settings' },
  ),
);
```

- [ ] **Step 8: Create `src/stores/view-store.ts`**

Ephemeral — no persist (analysis results are session-scoped).

```ts
import { create } from 'zustand';
import type { DependencyGroup } from '@/lib/types';

export interface AnalysisFailure {
  repoName: string;
  error: string;
}

interface ViewState {
  view: 'repo' | 'analysis';
  analysis: DependencyGroup[] | null;
  analysisFailed: AnalysisFailure[];
  setView: (view: 'repo' | 'analysis') => void;
  setAnalysis: (groups: DependencyGroup[], failed: AnalysisFailure[]) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: 'repo',
  analysis: null,
  analysisFailed: [],
  setView: (view) => set({ view }),
  setAnalysis: (groups, failed) => set({ view: 'analysis', analysis: groups, analysisFailed: failed }),
}));
```

- [ ] **Step 9: Verify `src/lib/proxy-client.ts` compiles against the store**

The `beforeRequest` hook (Task 5) already calls `tokenFor({ provider, host })`, which matches the loose `{ provider: Provider; host: string }` signature above — no change needed. Run a typecheck to confirm the store import resolves:

Run: `pnpm exec tsc --noEmit`
Expected: no errors (route handlers come later; if any unrelated scaffold error appears, note it and move on — `pnpm build` in Task 14 is the gate).

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all suites, including earlier ones).

- [ ] **Step 11: Commit**

```bash
git add src/stores src/lib/proxy-client.ts
git commit -m "feat: zustand stores (memory-only tokens, persisted repo config)"
```

---

## Task 9: GitHub proxy Route Handler

**Files:**
- Create: `src/app/api/proxy/github/[...path]/route.ts`
- Test: `src/app/api/proxy/github/[...path]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Route handlers are plain async functions — test by invoking `GET` with a mocked global `fetch`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('github proxy route', () => {
  it('forwards path and query string to api.github.com', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await GET(req('/api/proxy/github/repos/acme/web/branches?per_page=100', { 'x-access-token': 'tok' }), params(['repos', 'acme', 'web', 'branches']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/web/branches?per_page=100');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('application/vnd.github+json');
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('omits Authorization when no token header is present', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await GET(req('/api/proxy/github/repos/a/b'), params(['repos', 'a', 'b']));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('passes upstream status and body through untouched, marked no-store', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"Not Found"}', { status: 404, headers: { 'content-type': 'application/json' } }),
    );
    const res = await GET(req('/api/proxy/github/repos/a/b', { 'x-access-token': 't' }), params(['repos', 'a', 'b']));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"message":"Not Found"}');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('forwards the upstream link header for pagination', async () => {
    fetchMock.mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { link: '<https://api.github.com/x?page=2>; rel="next"' },
      }),
    );
    const res = await GET(req('/api/proxy/github/repos/a/b/branches'), params(['repos', 'a', 'b', 'branches']));
    expect(res.headers.get('link')).toContain('rel="next"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/api/proxy/github`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Create `src/app/api/proxy/github/[...path]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM_BASE = 'https://api.github.com';

/** Response headers worth forwarding to the browser (pagination + content type). */
const FORWARD_HEADERS = ['content-type', 'link', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const search = new URL(req.url).search;
  const upstreamUrl = `${UPSTREAM_BASE}/${path.join('/')}${search}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = req.headers.get('x-access-token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const upstream = await fetch(upstreamUrl, { headers, cache: 'no-store' });

  const responseHeaders = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // Client-side TanStack Query owns caching; a second server cache would
  // create incoherent invalidation (spec §3.2).
  responseHeaders.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/api/proxy/github`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/proxy/github"
git commit -m "feat: GitHub proxy route handler (passthrough, no-store)"
```

---

## Task 10: GitLab proxy Route Handler (with SSRF guard)

**Files:**
- Create: `src/app/api/proxy/gitlab/[...path]/route.ts`
- Test: `src/app/api/proxy/gitlab/[...path]/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const SEGMENTS = ['projects', 'group%2Fproject', 'repository', 'branches'];

describe('gitlab proxy route', () => {
  it('defaults to https://gitlab.com and uses PRIVATE-TOKEN', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
    await GET(req('/api/proxy/gitlab/projects/x', { 'x-access-token': 'glpat' }), params(['projects', 'x']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gitlab.com/api/v4/projects/x');
    expect(init.headers['PRIVATE-TOKEN']).toBe('glpat');
  });

  it('targets the self-hosted host from x-gitlab-host', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
    await GET(
      req('/api/proxy/gitlab/x?per_page=100', {
        'x-access-token': 'glpat',
        'x-gitlab-host': 'https://gitlab.acme.com',
      }),
      params(['x']),
    );
    expect(fetchMock.mock.calls[0][0]).toBe('https://gitlab.acme.com/api/v4/x?per_page=100');
  });

  it('rejects SSRF targets before dispatching (no upstream call)', async () => {
    const res = await GET(
      req('/api/proxy/gitlab/x', { 'x-gitlab-host': 'http://169.254.169.254' }),
      params(['x']),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-http schemes', async () => {
    const res = await GET(
      req('/api/proxy/gitlab/x', { 'x-gitlab-host': 'file:///etc/passwd' }),
      params(['x']),
    );
    expect(res.status).toBe(400);
  });

  it('forwards x-next-page for pagination and marks no-store', async () => {
    fetchMock.mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'x-next-page': '2' } }),
    );
    const res = await GET(
      req('/api/proxy/gitlab/p', { 'x-access-token': 't' }),
      params(['p']),
    );
    expect(res.headers.get('x-next-page')).toBe('2');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('passes upstream errors through untouched', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"401 Unauthorized"}', { status: 401 }));
    const res = await GET(req('/api/proxy/gitlab/p', { 'x-access-token': 'bad' }), params(['p']));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"message":"401 Unauthorized"}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/api/proxy/gitlab`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Create `src/app/api/proxy/gitlab/[...path]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { validateGitLabHost } from '@/lib/ssrf';

const DEFAULT_HOST = 'https://gitlab.com';
const FORWARD_HEADERS = ['content-type', 'x-next-page', 'x-page', 'x-per-page', 'x-total', 'x-total-pages'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;

  // The target host is client-controlled — validate before dispatching or
  // this route is an open proxy into the internal network (SSRF).
  const rawHost = req.headers.get('x-gitlab-host') ?? DEFAULT_HOST;
  const validation = validateGitLabHost(rawHost);
  if (!validation.ok) {
    return NextResponse.json(
      { error: `Rejected GitLab host: ${validation.reason}` },
      { status: 400 },
    );
  }

  const search = new URL(req.url).search;
  const upstreamUrl = `${validation.url.origin}/api/v4/${path.join('/')}${search}`;

  const headers: Record<string, string> = {};
  const token = req.headers.get('x-access-token');
  if (token) {
    headers['PRIVATE-TOKEN'] = token;
  }

  const upstream = await fetch(upstreamUrl, { headers, cache: 'no-store' });

  const responseHeaders = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/api/proxy/gitlab`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/proxy/gitlab"
git commit -m "feat: GitLab proxy route handler with anti-SSRF guard"
```

---

## Task 11: Dependency grouping

**Files:**
- Create: `src/lib/grouping.ts`
- Test: `src/lib/grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/grouping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flattenDependencies, groupDependencies, hasDrift } from './grouping';
import type { PackageJsonFile, RepoConfig } from '@/lib/types';

function repo(id: string): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path: `acme/${id}`,
    displayName: `acme/${id}`,
    defaultBranch: 'main',
  };
}

function pkg(path: string, deps: Partial<PackageJsonFile['deps']>): PackageJsonFile {
  return {
    path,
    packageName: path.replace(/\/package\.json$/, '') || 'root',
    deps: {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      ...deps,
    },
  };
}

describe('flattenDependencies', () => {
  it('flattens all three dep types with full lineage', () => {
    const entries = flattenDependencies([
      {
        repo: repo('a'),
        files: [
          pkg('package.json', {
            dependencies: { react: '^18.2.0' },
            devDependencies: { vitest: '^2.0.0' },
          }),
          pkg('packages/lib/package.json', { peerDependencies: { react: '^18.2.0' } }),
        ],
      },
    ]);
    expect(entries).toHaveLength(3);
    const peer = entries.find((e) => e.depType === 'peerDependencies');
    expect(peer).toMatchObject({
      depName: 'react',
      versionRange: '^18.2.0',
      repoId: 'a',
      repoName: 'acme/a',
      packagePath: 'packages/lib/package.json',
    });
  });
});

describe('groupDependencies', () => {
  it('groups dep -> versionRange -> projects and flags drift on >1 distinct range', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { axios: '^1.6.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { axios: '^1.6.0' } })] },
      { repo: repo('c'), files: [pkg('package.json', { dependencies: { axios: '^0.27.0' } })] },
    ]);
    const groups = groupDependencies(entries);
    expect(groups).toHaveLength(1);
    const axios = groups[0];
    expect(axios.depName).toBe('axios');
    expect(axios.versions).toHaveLength(2);
    expect(hasDrift(axios)).toBe(true);
    const v16 = axios.versions.find((v) => v.versionRange === '^1.6.0');
    expect(v16?.projects.map((p) => p.repoName).sort()).toEqual(['acme/a', 'acme/b']);
  });

  it('treats ^1.2.3 and 1.2.3 as distinct ranges (literal manifest divergence)', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { x: '^1.2.3' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { x: '1.2.3' } })] },
    ]);
    const [group] = groupDependencies(entries);
    expect(group.versions).toHaveLength(2);
    expect(hasDrift(group)).toBe(true);
  });

  it('counts monorepo packages as separate projects on the same version', () => {
    const entries = flattenDependencies([
      {
        repo: repo('mono'),
        files: [
          pkg('packages/a/package.json', { dependencies: { lodash: '^4.17.21' } }),
          pkg('packages/b/package.json', { dependencies: { lodash: '^4.17.21' } }),
        ],
      },
    ]);
    const [group] = groupDependencies(entries);
    expect(group.versions[0].projects).toHaveLength(2);
    expect(hasDrift(group)).toBe(false);
  });

  it('records the dep types a version appears in, deduped per project', () => {
    const entries = flattenDependencies([
      {
        repo: repo('a'),
        files: [
          pkg('package.json', {
            dependencies: { ts: '^5.0.0' },
            devDependencies: { ts: '^5.0.0' },
          }),
        ],
      },
    ]);
    const [group] = groupDependencies(entries);
    expect(group.versions[0].depTypes.sort()).toEqual(['dependencies', 'devDependencies']);
    expect(group.versions[0].projects).toHaveLength(1);
  });

  it('sorts groups by total project count descending', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { rare: '^1.0.0', common: '^2.0.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { common: '^2.0.0' } })] },
    ]);
    const groups = groupDependencies(entries);
    expect(groups[0].depName).toBe('common');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/grouping.test.ts`
Expected: FAIL — module `./grouping` not found.

- [ ] **Step 3: Create `src/lib/grouping.ts`**

```ts
import { DEP_TYPES, type DependencyEntry, type DependencyGroup, type PackageJsonFile, type RepoConfig } from './types';

export interface RepoFiles {
  repo: RepoConfig;
  files: PackageJsonFile[];
}

/** Flatten every dep declaration across repos, preserving full lineage (RN-08.5). */
export function flattenDependencies(perRepo: RepoFiles[]): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  for (const { repo, files } of perRepo) {
    for (const file of files) {
      for (const depType of DEP_TYPES) {
        for (const [depName, versionRange] of Object.entries(file.deps[depType])) {
          entries.push({
            depName,
            versionRange,
            depType,
            repoId: repo.id,
            repoName: repo.displayName,
            packagePath: file.path,
            packageName: file.packageName,
          });
        }
      }
    }
  }
  return entries;
}

/** Drift = more than one distinct version range string for the dependency (RN-08.4). */
export function hasDrift(group: DependencyGroup): boolean {
  return group.versions.length > 1;
}

/**
 * Group dependency -> versionRange -> projects (RN-08.3). Projects are keyed
 * by (repoId, packagePath), so a monorepo's packages count individually.
 * Ranges are compared as raw strings — deliberate literal divergence (§4.1).
 * Groups are sorted by total project count, descending.
 */
export function groupDependencies(entries: DependencyEntry[]): DependencyGroup[] {
  const byDep = new Map<
    string,
    Map<string, { depTypes: Set<DependencyEntry['depType']>; projects: DependencyGroup['versions'][number]['projects'] }>
  >();

  for (const entry of entries) {
    let byVersion = byDep.get(entry.depName);
    if (!byVersion) {
      byVersion = new Map();
      byDep.set(entry.depName, byVersion);
    }
    let bucket = byVersion.get(entry.versionRange);
    if (!bucket) {
      bucket = { depTypes: new Set(), projects: [] };
      byVersion.set(entry.versionRange, bucket);
    }
    bucket.depTypes.add(entry.depType);
    if (!bucket.projects.some((p) => p.repoId === entry.repoId && p.packagePath === entry.packagePath)) {
      bucket.projects.push({
        repoId: entry.repoId,
        repoName: entry.repoName,
        packagePath: entry.packagePath,
        packageName: entry.packageName,
      });
    }
  }

  const groups: DependencyGroup[] = [...byDep.entries()].map(([depName, byVersion]) => ({
    depName,
    versions: [...byVersion.entries()]
      .map(([versionRange, bucket]) => ({
        versionRange,
        depTypes: [...bucket.depTypes],
        projects: bucket.projects,
      }))
      .sort((a, b) => b.projects.length - a.projects.length),
  }));

  groups.sort(
    (a, b) =>
      b.versions.reduce((n, v) => n + v.projects.length, 0) -
      a.versions.reduce((n, v) => n + v.projects.length, 0),
  );
  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/grouping.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.ts src/lib/grouping.test.ts
git commit -m "feat: dependency flattening and drift grouping"
```

---

## Task 12: Package-file collection + data hooks

**Files:**
- Create: `src/lib/package-files.ts`
- Create: `src/hooks/use-branches.ts`
- Create: `src/hooks/use-package-json-files.ts`
- Test: `src/lib/package-files.test.ts`

- [ ] **Step 1: Write the failing test**

`collectFiles` is the p-limit fan-out with per-file failure isolation — test it with an injected fetcher:

```ts
import { describe, it, expect, vi } from 'vitest';
import { collectFiles } from './package-files';
import type { PackageJsonFile } from './types';

function file(path: string): PackageJsonFile {
  return {
    path,
    packageName: path,
    deps: { dependencies: {}, devDependencies: {}, peerDependencies: {} },
  };
}

describe('collectFiles', () => {
  it('fetches every path and returns files in order', async () => {
    const fetchOne = vi.fn(async (path: string) => file(path));
    const result = await collectFiles(['a/package.json', 'b/package.json'], fetchOne);
    expect(result.files.map((f) => f.path)).toEqual(['a/package.json', 'b/package.json']);
    expect(result.failedCount).toBe(0);
  });

  it('skips and counts individually failing files without aborting (RN RF-05.6)', async () => {
    const fetchOne = vi.fn(async (path: string) => {
      if (path === 'bad/package.json') throw new Error('malformed JSON');
      return file(path);
    });
    const result = await collectFiles(
      ['ok1/package.json', 'bad/package.json', 'ok2/package.json'],
      fetchOne,
    );
    expect(result.files).toHaveLength(2);
    expect(result.failedCount).toBe(1);
  });

  it('never exceeds the concurrency limit of 8', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn(async (path: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return file(path);
    });
    const paths = Array.from({ length: 30 }, (_, i) => `pkg${i}/package.json`);
    await collectFiles(paths, fetchOne);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(fetchOne).toHaveBeenCalledTimes(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/package-files.test.ts`
Expected: FAIL — module `./package-files` not found.

- [ ] **Step 3: Create `src/lib/package-files.ts`**

```ts
import pLimit from 'p-limit';
import type { PackageJsonFile, RepoConfig } from './types';
import { createProxyClient, getJsonWithHeaders } from './proxy-client';
import { getProvider, listPackageJsonPaths } from './providers';

export interface PackageFilesResult {
  files: PackageJsonFile[];
  failedCount: number;
}

export const FETCH_CONCURRENCY = 8;

/**
 * Fetch every package.json path with bounded concurrency (max 8 in flight —
 * spec §4.6). Individual failures are skipped and counted, never fatal.
 */
export async function collectFiles(
  paths: string[],
  fetchOne: (path: string) => Promise<PackageJsonFile>,
): Promise<PackageFilesResult> {
  const limit = pLimit(FETCH_CONCURRENCY);
  let failedCount = 0;
  const results = await Promise.all(
    paths.map((path) =>
      limit(async () => {
        try {
          return await fetchOne(path);
        } catch {
          failedCount += 1;
          return null;
        }
      }),
    ),
  );
  return {
    files: results.filter((f): f is PackageJsonFile => f !== null),
    failedCount,
  };
}

/**
 * Full read of one repo at one branch: list package.json paths (monorepo
 * scan), then fetch each file. This is the queryFn shared by
 * usePackageJsonFiles and the Analyze orchestration (same cache entry).
 */
export async function fetchPackageJsonFiles(
  repo: RepoConfig,
  branch: string,
): Promise<PackageFilesResult> {
  const client = createProxyClient(repo);
  const pagedGet = <T,>(path: string, searchParams?: Record<string, string>) =>
    getJsonWithHeaders<T>(repo, path, searchParams);
  const paths = await listPackageJsonPaths(repo, branch, client, pagedGet);
  return collectFiles(paths, (path) =>
    getProvider(repo).fetchPackageJson(client, repo, branch, path),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/package-files.test.ts`
Expected: PASS (3 tests). (`fetchPackageJsonFiles` itself is wiring — covered by provider tests + manual smoke.)

- [ ] **Step 5: Create `src/hooks/use-branches.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { RepoConfig } from '@/lib/types';
import { getJsonWithHeaders } from '@/lib/proxy-client';
import { listBranches } from '@/lib/providers';
import { useTokenStore } from '@/stores/token-store';

/** Branches for one repo — cache keyed ['branches', repo.id] (RN RF-04.1). */
export function useBranches(repo: RepoConfig | null) {
  const hasToken = useTokenStore((state) => (repo ? state.tokenFor(repo) !== null : false));
  return useQuery({
    queryKey: ['branches', repo?.id],
    queryFn: () => {
      const pagedGet = <T,>(path: string, searchParams?: Record<string, string>) =>
        getJsonWithHeaders<T>(repo!, path, searchParams);
      return listBranches(repo!, pagedGet);
    },
    enabled: repo !== null && hasToken,
  });
}
```

- [ ] **Step 6: Create `src/hooks/use-package-json-files.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { RepoConfig } from '@/lib/types';
import { fetchPackageJsonFiles } from '@/lib/package-files';
import { useTokenStore } from '@/stores/token-store';

/** Effective branch: explicit user selection wins over the repo default. */
export function effectiveBranch(repo: RepoConfig): string | undefined {
  return repo.selectedBranch ?? repo.defaultBranch;
}

/**
 * package.json files for one repo+branch — cache keyed
 * ['pkg-files', repo.id, branch] so branch switches never share cache
 * (RN RF-04.3, RN RF-05.1).
 */
export function usePackageJsonFiles(repo: RepoConfig | null, branch: string | undefined) {
  const hasToken = useTokenStore((state) => (repo ? state.tokenFor(repo) !== null : false));
  return useQuery({
    queryKey: ['pkg-files', repo?.id, branch],
    queryFn: () => fetchPackageJsonFiles(repo!, branch!),
    enabled: repo !== null && branch !== undefined && hasToken,
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/package-files.ts src/lib/package-files.test.ts src/hooks
git commit -m "feat: package.json collection with p-limit(8) and data hooks"
```

---

## Task 13: Analyze orchestration

**Files:**
- Create: `src/lib/analyze.ts`
- Test: `src/lib/analyze.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/analyze.test.ts`. It mocks `fetchPackageJsonFiles` and the token store, using a real `QueryClient`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { runAnalysis } from './analyze';
import { useTokenStore } from '@/stores/token-store';
import type { PackageJsonFile, RepoConfig } from './types';

vi.mock('./package-files', () => ({
  fetchPackageJsonFiles: vi.fn(),
}));

import { fetchPackageJsonFiles } from './package-files';
const fetchMock = vi.mocked(fetchPackageJsonFiles);

function repo(id: string, overrides: Partial<RepoConfig> = {}): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path: `acme/${id}`,
    displayName: `acme/${id}`,
    defaultBranch: 'main',
    ...overrides,
  };
}

function files(deps: Record<string, string>): { files: PackageJsonFile[]; failedCount: number } {
  return {
    files: [
      {
        path: 'package.json',
        packageName: 'root',
        deps: { dependencies: deps, devDependencies: {}, peerDependencies: {} },
      },
    ],
    failedCount: 0,
  };
}

function freshQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  useTokenStore.getState().clearAll();
  fetchMock.mockReset();
  useTokenStore.getState().setGithubToken('tok');
});

describe('runAnalysis', () => {
  it('aggregates deps across repos using each repo\'s selected branch', async () => {
    fetchMock.mockResolvedValueOnce(files({ axios: '^1.6.0' }));
    fetchMock.mockResolvedValueOnce(files({ axios: '^0.27.0' }));
    const repos = [repo('a'), repo('b', { selectedBranch: 'develop' })];
    const { groups, failed } = await runAnalysis(repos, freshQueryClient());
    expect(failed).toEqual([]);
    expect(groups[0].depName).toBe('axios');
    expect(groups[0].versions).toHaveLength(2);
    // Second repo fetched with its selected branch:
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'b' }), 'develop');
  });

  it('reports repos without token as failures and continues (RN-08.7)', async () => {
    useTokenStore.getState().clearAll();
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat');
    fetchMock.mockResolvedValueOnce(files({ x: '^1.0.0' }));
    const repos = [
      repo('gh'), // github — no token now
      repo('gl', { provider: 'gitlab', host: 'gitlab.com', path: 'g/p' }),
    ];
    const { groups, failed } = await runAnalysis(repos, freshQueryClient());
    expect(failed).toHaveLength(1);
    expect(failed[0].repoName).toBe('acme/gh');
    expect(failed[0].error).toMatch(/token/i);
    expect(groups.some((g) => g.depName === 'x')).toBe(true);
  });

  it('collects per-repo fetch errors in the banner without aborting (RN-08.6)', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
    fetchMock.mockResolvedValueOnce(files({ react: '^18.2.0' }));
    const { groups, failed } = await runAnalysis([repo('a'), repo('b')], freshQueryClient());
    expect(failed).toEqual([{ repoName: 'acme/a', error: expect.stringMatching(/not found/i) }]);
    expect(groups[0].depName).toBe('react');
  });

  it('reuses warm cache: second run does not refetch', async () => {
    const queryClient = freshQueryClient();
    fetchMock.mockResolvedValue(files({ x: '^1.0.0' }));
    await runAnalysis([repo('a')], queryClient);
    await runAnalysis([repo('a')], queryClient);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/analyze.test.ts`
Expected: FAIL — module `./analyze` not found.

- [ ] **Step 3: Create `src/lib/analyze.ts`**

```ts
import type { QueryClient } from '@tanstack/react-query';
import type { DependencyGroup, RepoConfig } from './types';
import { fetchPackageJsonFiles, type PackageFilesResult } from './package-files';
import { flattenDependencies, groupDependencies, type RepoFiles } from './grouping';
import { describeError } from './errors';
import { useTokenStore } from '@/stores/token-store';

export interface AnalysisFailure {
  repoName: string;
  error: string;
}

export interface AnalysisResult {
  groups: DependencyGroup[];
  failed: AnalysisFailure[];
}

const ANALYSIS_STALE_TIME = 5 * 60 * 1000;

/**
 * Cross-repo analysis (RF-08). Each repo is read at its effective branch via
 * ensureQueryData — warm cache entries are reused untouched (§3.6). Failures
 * (missing token, 401/404/rate limit, network) are collected per repo and
 * never abort the run.
 */
export async function runAnalysis(
  repos: RepoConfig[],
  queryClient: QueryClient,
): Promise<AnalysisResult> {
  const failed: AnalysisFailure[] = [];
  const perRepo: RepoFiles[] = [];

  for (const repo of repos) {
    const branch = repo.selectedBranch ?? repo.defaultBranch;
    if (!branch) {
      failed.push({ repoName: repo.displayName, error: 'No branch selected.' });
      continue;
    }
    if (useTokenStore.getState().tokenFor(repo) === null) {
      failed.push({
        repoName: repo.displayName,
        error: 'No access token configured for this provider/host — open Access Tokens.',
      });
      continue;
    }
    try {
      const result = await queryClient.ensureQueryData<PackageFilesResult>({
        queryKey: ['pkg-files', repo.id, branch],
        queryFn: () => fetchPackageJsonFiles(repo, branch),
        staleTime: ANALYSIS_STALE_TIME,
      });
      perRepo.push({ repo, files: result.files });
    } catch (error) {
      failed.push({ repoName: repo.displayName, error: describeError(error) });
    }
  }

  return { groups: groupDependencies(flattenDependencies(perRepo)), failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/analyze.test.ts`
Expected: PASS (4 tests). Note the cache test relies on `staleTime` making the second `ensureQueryData` a no-op.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyze.ts src/lib/analyze.test.ts
git commit -m "feat: analyze orchestration with partial-failure collection"
```

---

## Task 14: Query provider + root layout

**Files:**
- Create: `src/components/query-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `src/components/query-provider.tsx`**

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 min — exploration without refetch storms
            gcTime: 30 * 60 * 1000, // 30 min — warm for a typical analysis session
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`**

Replace its content with:

```tsx
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Repository Dependency Analyzer',
  description: 'Consolidate package.json dependencies across repositories and detect version drift.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
```

(Keep any font setup create-next-app generated if you prefer — the className merge is the only thing to preserve. Plain `antialiased` is sufficient per the spec's sober aesthetic.)

- [ ] **Step 3: Verify the app still builds**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/components/query-provider.tsx src/app/layout.tsx
git commit -m "feat: query client provider and root layout with toaster"
```

---

## Task 15: App header + dep-type toggles

**Files:**
- Create: `src/components/dep-type-toggles.tsx`
- Create: `src/components/app-header.tsx`

Styling rule (applies to all UI tasks): use shadcn components as shipped — compose via `className` at the usage site, never edit `src/components/ui/*`. The amber "warning" styling (`border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400`) is applied per usage site per spec §5.2 (amber = warnings), not added as a badge variant.

- [ ] **Step 1: Create `src/components/dep-type-toggles.tsx`**

```tsx
'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { useSettingsStore } from '@/stores/settings-store';
import type { DepType } from '@/lib/types';

const LABELS: Array<{ type: DepType; label: string }> = [
  { type: 'dependencies', label: 'Dependencies' },
  { type: 'devDependencies', label: 'Dev' },
  { type: 'peerDependencies', label: 'Peer' },
];

export function DepTypeToggles() {
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const toggleDepType = useSettingsStore((s) => s.toggleDepType);

  return (
    <div className="flex items-center gap-4">
      {LABELS.map(({ type, label }) => (
        <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
          <Checkbox
            checked={enabledDepTypes[type]}
            onCheckedChange={() => toggleDepType(type)}
            aria-label={label}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/app-header.tsx`**

The Analyze button lives here; the dialog component (`TokenDialog`) is Task 16 — create a placeholder import now and the real file next, or implement Task 16 first. Write the header as:

```tsx
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DepTypeToggles } from '@/components/dep-type-toggles';
import { TokenDialog } from '@/components/token-dialog';
import { runAnalysis } from '@/lib/analyze';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';

export function AppHeader() {
  const repos = useRepoStore((s) => s.repos);
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const handleAnalyze = async () => {
    if (repos.length === 0 || analyzing) return;
    setAnalyzing(true);
    try {
      const { groups, failed } = await runAnalysis(repos, queryClient);
      useViewStore.getState().setAnalysis(groups, failed);
      if (failed.length === repos.length) {
        toast.error('No repository could be analyzed.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
      <h1 className="text-sm font-medium">Repository Dependency Analyzer</h1>
      <div className="ml-auto flex items-center gap-4">
        <DepTypeToggles />
        <Separator orientation="vertical" className="h-6" />
        <TokenDialog />
        <Button onClick={handleAnalyze} disabled={repos.length === 0 || analyzing}>
          {analyzing ? 'Analyzing…' : 'Analyze'}
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dep-type-toggles.tsx src/components/app-header.tsx
git commit -m "feat: app header with dep-type toggles and analyze trigger"
```

---

## Task 16: Token dialog

**Files:**
- Create: `src/components/token-dialog.tsx`
- Test: `src/components/token-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/token-dialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenDialog } from './token-dialog';
import { useTokenStore } from '@/stores/token-store';
import { useRepoStore } from '@/stores/repo-store';
import type { RepoConfig } from '@/lib/types';

beforeEach(() => {
  localStorage.clear();
  useTokenStore.getState().clearAll();
  useRepoStore.setState({ repos: [], selectedRepoId: null });
});

async function openDialog() {
  const user = userEvent.setup();
  render(<TokenDialog />);
  await user.click(screen.getByRole('button', { name: /access tokens/i }));
  return user;
}

describe('TokenDialog', () => {
  it('always shows the gitlab.com row and the memory-only note', async () => {
    await openDialog();
    expect(screen.getByText(/kept in memory only and never stored/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gitlab\.com/i)).toBeInTheDocument();
  });

  it('adds a row for each self-hosted GitLab host in the repo list', async () => {
    useRepoStore.setState({
      repos: [
        {
          id: 'r1',
          provider: 'gitlab',
          host: 'gitlab.acme.com',
          path: 'g/p',
          displayName: 'g/p',
        } as RepoConfig,
      ],
      selectedRepoId: null,
    });
    await openDialog();
    expect(screen.getByLabelText(/gitlab\.acme\.com/i)).toBeInTheDocument();
  });

  it('writes tokens into the memory store via password fields', async () => {
    const user = await openDialog();
    await user.type(screen.getByLabelText(/^github$/i), 'ghp_secret');
    expect(useTokenStore.getState().githubToken).toBe('ghp_secret');
  });

  it('clear all empties every token', async () => {
    useTokenStore.getState().setGithubToken('x');
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(useTokenStore.getState().githubToken).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/token-dialog.test.tsx`
Expected: FAIL — module `./token-dialog` not found.

- [ ] **Step 3: Create `src/components/token-dialog.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DEFAULT_GITLAB_HOST, useTokenStore } from '@/stores/token-store';
import { useRepoStore } from '@/stores/repo-store';

export function TokenDialog() {
  const [open, setOpen] = useState(false);
  const githubToken = useTokenStore((s) => s.githubToken);
  const gitlabTokens = useTokenStore((s) => s.gitlabTokens);
  const setGithubToken = useTokenStore((s) => s.setGithubToken);
  const setGitlabToken = useTokenStore((s) => s.setGitlabToken);
  const clearAll = useTokenStore((s) => s.clearAll);
  const repos = useRepoStore((s) => s.repos);

  // gitlab.com is always present; self-hosted hosts appear as repos are added.
  const gitlabHosts = useMemo(() => {
    const hosts = new Set<string>([DEFAULT_GITLAB_HOST]);
    for (const repo of repos) {
      if (repo.provider === 'gitlab') hosts.add(repo.host);
    }
    return [...hosts];
  }, [repos]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Access Tokens</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access Tokens</DialogTitle>
          <DialogDescription>
            Tokens are kept in memory only and never stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="token-github" className="text-sm font-medium">
              GitHub
            </label>
            <Input
              id="token-github"
              type="password"
              placeholder="ghp_…"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
          </div>
          {gitlabHosts.map((host) => (
            <div key={host} className="space-y-1.5">
              <label htmlFor={`token-gitlab-${host}`} className="text-sm font-medium">
                {host}
              </label>
              <Input
                id={`token-gitlab-${host}`}
                type="password"
                placeholder="glpat-…"
                value={gitlabTokens[host] ?? ''}
                onChange={(e) => setGitlabToken(host, e.target.value)}
              />
            </div>
          ))}
          <Button variant="destructive" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/token-dialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/token-dialog.tsx src/components/token-dialog.test.tsx
git commit -m "feat: token dialog with per-host gitlab tokens"
```

---

## Task 17: Sidebar — add-repo form, repo list, branch selector

**Files:**
- Create: `src/components/add-repo-form.tsx`
- Create: `src/components/branch-selector.tsx`
- Create: `src/components/repo-list.tsx`

- [ ] **Step 1: Create `src/components/add-repo-form.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { githubProvider } from '@/lib/providers/github';
import { gitlabProvider } from '@/lib/providers/gitlab';
import { createProxyClient } from '@/lib/proxy-client';
import { getProvider } from '@/lib/providers';
import { describeError } from '@/lib/errors';
import type { RepoConfig } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useTokenStore } from '@/stores/token-store';

/** Client-side URL parse — invalid URLs are rejected before any request (§6.3). */
function parseRepoUrl(url: string) {
  return url.includes('github.com') ? githubProvider.parseUrl(url) : gitlabProvider.parseUrl(url);
}

export function AddRepoForm() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const addRepo = useRepoStore((s) => s.addRepo);
  const selectRepo = useRepoStore((s) => s.selectRepo);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = parseRepoUrl(trimmed);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Invalid repository URL.';
      setError(message);
      return;
    }

    const draft: RepoConfig = {
      id: crypto.randomUUID(),
      provider: parsed.provider,
      host: parsed.host,
      path: parsed.path,
      displayName: parsed.path,
    };

    // RN RF-02.3: adding without the applicable token is blocked; nothing is saved.
    if (useTokenStore.getState().tokenFor(draft) === null) {
      toast.error(`Configure the access token for ${parsed.host} first (Access Tokens).`);
      return;
    }

    setAdding(true);
    try {
      const client = createProxyClient(draft);
      const defaultBranch = await getProvider(draft).getDefaultBranch(client, draft);
      const id = addRepo({ ...draft, defaultBranch });
      selectRepo(id);
      setUrl('');
    } catch (apiError) {
      toast.error(describeError(apiError));
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          aria-label="Repository URL"
        />
        <Button type="submit" variant="secondary" disabled={adding || !url.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Create `src/components/branch-selector.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranches } from '@/hooks/use-branches';
import { effectiveBranch } from '@/hooks/use-package-json-files';
import { describeError } from '@/lib/errors';
import type { RepoConfig } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useTokenStore } from '@/stores/token-store';

export function BranchSelector({ repo }: { repo: RepoConfig }) {
  const setBranch = useRepoStore((s) => s.setBranch);
  const hasToken = useTokenStore((s) => s.tokenFor(repo) !== null);
  const { data: branches, isLoading, error } = useBranches(repo);

  useEffect(() => {
    if (error) toast.error(describeError(error));
  }, [error]);

  if (!hasToken) {
    return (
      <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        token needed
      </Badge>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-9 w-full" aria-label="Loading branches" />;
  }

  if (error) {
    return <Badge variant="destructive">branch error</Badge>;
  }

  return (
    <Select
      value={effectiveBranch(repo)}
      onValueChange={(branch) => setBranch(repo.id, branch)}
    >
      <SelectTrigger className="w-full" aria-label={`Branch for ${repo.displayName}`}>
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {(branches ?? []).map((branch) => (
          <SelectItem key={branch} value={branch}>
            {branch}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Create `src/components/repo-list.tsx`**

```tsx
'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BranchSelector } from '@/components/branch-selector';
import { cn } from '@/lib/utils';
import { useRepoStore } from '@/stores/repo-store';

export function RepoList() {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const removeRepo = useRepoStore((s) => s.removeRepo);

  return (
    <div className="space-y-2">
      {repos.map((repo) => (
        <Card
          key={repo.id}
          className={cn(
            'cursor-pointer transition-colors',
            repo.id === selectedRepoId && 'border-primary ring-1 ring-primary',
          )}
          onClick={() => selectRepo(repo.id)}
        >
          <CardContent className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">{repo.displayName}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="secondary">{repo.provider === 'github' ? 'GitHub' : 'GitLab'}</Badge>
                  {repo.provider === 'gitlab' && repo.host !== 'gitlab.com' && (
                    <Badge variant="outline">{repo.host}</Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label={`Remove ${repo.displayName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeRepo(repo.id);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div onClick={(event) => event.stopPropagation()}>
              <BranchSelector repo={repo} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/add-repo-form.tsx src/components/branch-selector.tsx src/components/repo-list.tsx
git commit -m "feat: sidebar repo management with branch selection"
```

---

## Task 18: Dependency panel (view 'repo')

**Files:**
- Create: `src/components/package-json-card.tsx`
- Create: `src/components/dependency-panel.tsx`
- Test: `src/components/package-json-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/package-json-card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackageJsonCard } from './package-json-card';
import type { PackageJsonFile } from '@/lib/types';

const file: PackageJsonFile = {
  path: 'packages/app/package.json',
  packageName: '@acme/app',
  deps: {
    dependencies: { react: '^18.2.0' },
    devDependencies: { vitest: '^2.0.0' },
    peerDependencies: { 'react-dom': '^18.2.0' },
  },
};

const allOn = { dependencies: true, devDependencies: true, peerDependencies: true };

describe('PackageJsonCard', () => {
  it('renders all three sections when all types are enabled', () => {
    render(<PackageJsonCard file={file} enabledTypes={allOn} />);
    expect(screen.getByText('@acme/app')).toBeInTheDocument();
    expect(screen.getByText('packages/app/package.json')).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('vitest')).toBeInTheDocument();
    expect(screen.getByText('react-dom')).toBeInTheDocument();
  });

  it('hides disabled types without touching data (RN RF-07.2)', () => {
    render(<PackageJsonCard file={file} enabledTypes={{ ...allOn, devDependencies: false }} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.queryByText('vitest')).not.toBeInTheDocument();
  });

  it('renders version ranges as-is', () => {
    render(<PackageJsonCard file={file} enabledTypes={allOn} />);
    expect(screen.getByText('^18.2.0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/package-json-card.test.tsx`
Expected: FAIL — module `./package-json-card` not found.

- [ ] **Step 3: Create `src/components/package-json-card.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEP_TYPES, type DepType, type PackageJsonFile } from '@/lib/types';

const SECTION_TITLES: Record<DepType, string> = {
  dependencies: 'Dependencies',
  devDependencies: 'Dev Dependencies',
  peerDependencies: 'Peer Dependencies',
};

interface Props {
  file: PackageJsonFile;
  enabledTypes: Record<DepType, boolean>;
}

export function PackageJsonCard({ file, enabledTypes }: Props) {
  const visibleSections = DEP_TYPES.filter(
    (type) => enabledTypes[type] && Object.keys(file.deps[type]).length > 0,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-mono text-sm">{file.packageName}</CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {file.path}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleSections.length === 0 && (
          <p className="text-sm text-muted-foreground">No dependencies of the enabled types.</p>
        )}
        {visibleSections.map((type) => (
          <section key={type}>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {SECTION_TITLES[type]}
            </h3>
            <ul className="space-y-1">
              {Object.entries(file.deps[type]).map(([name, range]) => (
                <li key={name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-mono">{name}</span>
                  <Badge variant="secondary" className="font-mono">
                    {range}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/package-json-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `src/components/dependency-panel.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PackageJsonCard } from '@/components/package-json-card';
import { effectiveBranch, usePackageJsonFiles } from '@/hooks/use-package-json-files';
import { describeError } from '@/lib/errors';
import { DEP_TYPES } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';

export function DependencyPanel() {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const queryClient = useQueryClient();

  const repo = repos.find((r) => r.id === selectedRepoId) ?? null;
  const branch = repo ? effectiveBranch(repo) : undefined;
  const { data, isLoading, error } = usePackageJsonFiles(repo, branch);

  useEffect(() => {
    if (error) toast.error(describeError(error));
  }, [error]);

  if (repos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md space-y-2 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No repositories yet</p>
          <p>
            Open <span className="font-medium">Access Tokens</span> to add your GitHub/GitLab
            tokens, paste a repository URL in the sidebar, pick a branch, and its package.json
            dependencies will appear here. Use <span className="font-medium">Analyze</span> to
            detect version drift across all repositories.
          </p>
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a repository in the sidebar.
      </div>
    );
  }

  const handleReload = () => {
    // RN RF-06.2: invalidate exactly the active repo+branch pair.
    queryClient.invalidateQueries({ queryKey: ['pkg-files', repo.id, branch] });
    queryClient.invalidateQueries({ queryKey: ['branches', repo.id] });
  };

  const allTypesOff = DEP_TYPES.every((type) => !enabledDepTypes[type]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-mono text-sm font-medium">{repo.displayName}</h2>
        {branch && <span className="text-sm text-muted-foreground">on {branch}</span>}
        {data && <Badge variant="secondary">{data.files.length} package.json</Badge>}
        {data && data.failedCount > 0 && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            {data.failedCount} file(s) skipped
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          aria-label="Reload"
          onClick={handleReload}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">{describeError(error)}</CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {data && allTypesOff && (
        <p className="text-sm text-muted-foreground">
          All dependency types are hidden — re-enable at least one type in the header.
        </p>
      )}

      {data && !allTypesOff && data.files.length === 0 && (
        <p className="text-sm text-muted-foreground">No package.json files found in this branch.</p>
      )}

      {data &&
        !allTypesOff &&
        data.files.map((file) => (
          <PackageJsonCard key={file.path} file={file} enabledTypes={enabledDepTypes} />
        ))}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/package-json-card.tsx src/components/package-json-card.test.tsx src/components/dependency-panel.tsx
git commit -m "feat: dependency panel with per-file cards and reload"
```

---

## Task 19: Analysis view (view 'analysis')

**Files:**
- Create: `src/components/dependency-group-card.tsx`
- Create: `src/components/analysis-view.tsx`
- Test: `src/components/dependency-group-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dependency-group-card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DependencyGroupCard } from './dependency-group-card';
import type { DependencyGroup } from '@/lib/types';

const drifted: DependencyGroup = {
  depName: 'react',
  versions: [
    {
      versionRange: '^18.2.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'b', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
        { repoId: 'c', repoName: 'acme/c', packagePath: 'package.json', packageName: 'c' },
      ],
    },
    {
      versionRange: '^17.0.2',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'd', repoName: 'acme/d', packagePath: 'package.json', packageName: 'd' },
      ],
    },
  ],
};

const converged: DependencyGroup = {
  depName: 'lodash',
  versions: [
    {
      versionRange: '^4.17.21',
      depTypes: ['dependencies', 'devDependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
      ],
    },
  ],
};

describe('DependencyGroupCard', () => {
  it('shows the drift badge only when more than one range exists (RN RF-09.3)', () => {
    const { rerender } = render(<DependencyGroupCard group={drifted} />);
    expect(screen.getByText(/version drift/i)).toBeInTheDocument();
    rerender(<DependencyGroupCard group={converged} />);
    expect(screen.queryByText(/version drift/i)).not.toBeInTheDocument();
  });

  it('lists every project nominally under its version group', () => {
    render(<DependencyGroupCard group={drifted} />);
    expect(screen.getByText('^18.2.0')).toBeInTheDocument();
    expect(screen.getByText('^17.0.2')).toBeInTheDocument();
    for (const name of ['acme/a', 'acme/b', 'acme/c', 'acme/d']) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  it('shows project and version counts', () => {
    render(<DependencyGroupCard group={drifted} />);
    expect(screen.getByText(/4 projects/)).toBeInTheDocument();
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/dependency-group-card.test.tsx`
Expected: FAIL — module `./dependency-group-card` not found.

- [ ] **Step 3: Create `src/components/dependency-group-card.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hasDrift } from '@/lib/grouping';
import type { DependencyGroup } from '@/lib/types';

export function DependencyGroupCard({ group }: { group: DependencyGroup }) {
  const projectCount = group.versions.reduce((n, v) => n + v.projects.length, 0);
  const drift = hasDrift(group);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-mono text-sm font-bold">{group.depName}</CardTitle>
          <Badge variant="secondary">{projectCount} projects</Badge>
          <Badge variant="secondary">
            {group.versions.length} version{group.versions.length === 1 ? '' : 's'}
          </Badge>
          {drift && (
            <Badge
              variant="outline"
              className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              version drift
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.versions.map((version) => (
          <div key={version.versionRange} className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {version.versionRange}
            </Badge>
            <div className="flex flex-wrap gap-1">
              {version.projects.map((project) => (
                <Badge
                  key={`${project.repoId}:${project.packagePath}`}
                  variant="secondary"
                  className="font-mono text-xs"
                >
                  {project.repoName} / {project.packageName}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/dependency-group-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `src/components/analysis-view.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DependencyGroupCard } from '@/components/dependency-group-card';
import { useViewStore } from '@/stores/view-store';

export function AnalysisView() {
  const analysis = useViewStore((s) => s.analysis);
  const analysisFailed = useViewStore((s) => s.analysisFailed);
  const setView = useViewStore((s) => s.setView);
  const [search, setSearch] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const filtered = useMemo(() => {
    const groups = analysis ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.depName.toLowerCase().includes(term));
  }, [analysis, search]);

  // "M projects" = distinct (repoId, packagePath) pairs across the result.
  const projectCount = useMemo(() => {
    const keys = new Set<string>();
    for (const group of analysis ?? []) {
      for (const version of group.versions) {
        for (const project of version.projects) {
          keys.add(`${project.repoId}:${project.packagePath}`);
        }
      }
    }
    return keys.size;
  }, [analysis]);

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Run Analyze to see cross-repo results.
      </div>
    );
  }

  const showBanner = analysisFailed.length > 0 && !bannerDismissed;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">
          Analysis — {analysis.length} dependencies across {projectCount} projects
        </h2>
        <Button variant="outline" size="sm" onClick={() => setView('repo')}>
          Back to repository view
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dependency…"
          aria-label="Search dependency"
          className="ml-auto w-64"
        />
      </div>

      {showBanner && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Partial analysis — {analysisFailed.length} repositor
                {analysisFailed.length === 1 ? 'y' : 'ies'} failed
              </p>
              <ul className="space-y-0.5 text-sm text-amber-700 dark:text-amber-400">
                {analysisFailed.map((failure) => (
                  <li key={failure.repoName}>
                    <span className="font-mono">{failure.repoName}</span> — {failure.error}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {analysis.length === 0
            ? 'No dependencies found in the analyzed repositories.'
            : 'No dependencies match your search.'}
        </p>
      )}

      {filtered.map((group) => (
        <DependencyGroupCard key={group.depName} group={group} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/dependency-group-card.tsx src/components/dependency-group-card.test.tsx src/components/analysis-view.tsx
git commit -m "feat: analysis view with drift badges and failure banner"
```

---

## Task 20: Page wiring + final verification

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx`**

The persisted stores hydrate from localStorage on the client only — gate rendering on mount to avoid hydration mismatch:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AddRepoForm } from '@/components/add-repo-form';
import { AnalysisView } from '@/components/analysis-view';
import { AppHeader } from '@/components/app-header';
import { DependencyPanel } from '@/components/dependency-panel';
import { RepoList } from '@/components/repo-list';
import { Skeleton } from '@/components/ui/skeleton';
import { useViewStore } from '@/stores/view-store';

export default function Page() {
  const view = useViewStore((s) => s.view);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-r p-4">
          <AddRepoForm />
          {mounted ? <RepoList /> : <Skeleton className="h-24 w-full" />}
        </aside>
        <main className="flex-1 overflow-y-auto p-4">
          {!mounted ? (
            <Skeleton className="h-32 w-full" />
          ) : view === 'analysis' ? (
            <AnalysisView />
          ) : (
            <DependencyPanel />
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites (~45 tests).

- [ ] **Step 3: Run lint and fix any findings**

Run: `pnpm lint`
Expected: no errors. Fix anything surfaced — remove, don't suppress.

- [ ] **Step 4: Verify the production build**

Run: `pnpm build`
Expected: compiles; both `/api/proxy/github/[...path]` and `/api/proxy/gitlab/[...path]` listed as route handlers.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev` and walk the critical paths in the browser:

1. Empty state renders with instructions; Analyze is disabled.
2. Open Access Tokens → add a GitHub PAT → note "Tokens are kept in memory only and never stored" is visible.
3. Add a GitHub repo URL (e.g. a public repo you own) → card appears, branch selector populates, panel lists dependencies with version badges.
4. Toggle "Dev" off → devDependencies vanish instantly, no network call (check DevTools).
5. Click Reload → skeletons, data refetched.
6. Add a second repo with a known version divergence → Analyze → drift badge appears on the diverging dependency; banner absent when all repos succeed.
7. Add a repo URL for a nonexistent repo → 404 toast; nothing saved.
8. Reload the page → repos/branches restored, tokens gone (blocked actions show guidance).
9. Search box in analysis view filters cards per keystroke; Back returns to repo view with selection preserved.
10. SSRF check: `curl "http://localhost:3000/api/proxy/gitlab/projects/x" -H "x-gitlab-host: http://169.254.169.254"` → 400.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire main page layout and views"
```

---

## Spec Coverage Map (self-review)

| Spec item | Task |
| --- | --- |
| RF-01 token auth (memory-only, per-host GitLab, no fallback) | 8, 15, 16 |
| RF-02 add repo (URL parse, token gate, dedupe, persist) | 8, 17 |
| RF-03 repo list (single selection, persisted, removal clears panel) | 8, 17, 20 |
| RF-04 branch selection (per-repo, persisted, query key includes branch) | 12, 17 |
| RF-05 dependency panel (monorepo scan, exclusions, p-limit 8, failedCount, malformed JSON isolated) | 3, 6, 7, 12, 18 |
| RF-06 reload (invalidates active repo+branch only) | 18 |
| RF-07 dep-type toggles (default on, render-only filter, explicit empty state) | 8, 15, 18 |
| RF-08 analyze (all repos at selected branches, partial failures banner, cache reuse) | 11, 12, 13, 15 |
| RF-09 results view (dep→version→projects, drift badge, banner persists until dismissed) | 11, 19 |
| §3.2 proxy handlers (GitHub/GitLab passthrough, no-store, anti-SSRF) | 4, 9, 10 |
| §4.1 domain types | 3 |
| §4.3/§4.4 provider endpoints + pagination + encodings | 6, 7 |
| §4.5 grouping algorithm + exclusions | 3, 11 |
| §4.6 limits (500 branches, truncated tree tolerance, concurrency 8, failedCount) | 6, 7, 12 |
| §5 UI (3-region layout, header/sidebar/panel, states table, amber warnings, mono identifiers) | 15–20 |
| §6.2 security (no token persistence, no-store, SSRF guard) | 4, 8, 9, 10 |
| Docker/deploy | **Out of scope per user instruction** |

## Execution Deviations (recorded post-implementation, 2026-07-23)

The plan was executed with subagent-driven development (all 20 tasks + two-stage review each). Deviations from this plan's original text, all review-approved:

- **ky v2 API**: installed ky is 2.0.2, so `prefixUrl` → `prefix` and the `beforeRequest` hook takes `({ request })`; `toStatusError` reads the upstream body from ky v2's `error.data` (the `error.response.text()` approach is inert in v2).
- **shadcn CLI pinned to 3.8.5**: `shadcn@latest` (4.x) no longer generates new-york style; the CLI is pinned as a devDependency.
- **SSRF guard hardened beyond spec** (security review): trailing-dot hostnames, IPv4-mapped IPv6 (`[::ffff:]`), IPv6 ULA/link-local/NAT64 (fc00::/7, fe80::/10, `::`, 64:ff9b::/96) also rejected; normalization regression tests added.
- **GitLab proxy uses the raw request-URL path**, not catch-all params (Next.js decodes `%2F`, which would break project ids); route also uses `redirect: 'manual'`, a 30s upstream timeout, and a 502-JSON error contract (GitHub route got the same timeout/502 pattern).
- **Pagination guards**: branch listing capped at 5 pages (both providers); GitLab tree listing capped at 100 pages; `gitlabProvider.listPackageJsonPaths` single-page fallback throws with a pointer to the facade.
- **Persisted stores use `skipHydration: true`** with manual `rehydrate()` in the page's mount effect (SSR/first-render consistency); Task 20's original `setMounted(true)` snippet was superseded.
- **Grouping sorts drift-first**, project count as tiebreak (RF-09.1 vs §4.5 reconciliation; spec contradicted itself).
- **UI behavior deviations from spec, accepted as improvements**: token-blocked states show inline badges/hints instead of toasts; the "0 package.json" empty state shows a text message plus the count badge; depTypes are displayed per version group (RF-09.5); a token-needed hint appears in the dependency panel when credentials are missing; token inputs use `autoComplete="new-password"` so browsers don't offer to save tokens.
- **Not implemented (accepted)**: RN-08.9 branch attribution in analysis results (soft spec language); Docker/deploy (out of scope per user instruction); dark-mode toggle (CSS variables only, spec §5.2).
