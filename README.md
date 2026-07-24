# Repository Dependency Analyzer

RDA consolidates the `package.json` dependencies of multiple GitHub and GitLab
repositories into a single cross-repo view. It is monorepo-aware (it scans every
`package.json` in a repo, not just the root) and highlights version drift — the
same dependency pinned to different versions across repositories and packages.

## Quickstart

```bash
pnpm install
pnpm dev    # dev server on http://localhost:3000
pnpm test   # vitest unit tests
pnpm build  # production build
```

## Security model

- Access tokens are held **in memory only** — never persisted, never written to
  disk, and cleared when the tab closes.
- Tokens are sent exclusively to the app's **same-origin proxy routes**
  (`/api/proxy/github/*`, `/api/proxy/gitlab/*`), which forward them upstream.
  They never travel to a third party.
- Only non-secret repository configuration (provider, host, path, branches) is
  persisted, in `localStorage`.

## Minimum token scopes

- **GitHub:** a fine-grained or classic PAT with read-only access to repository
  contents (classic: `repo` for private repos; public repos need no scope).
- **GitLab:** a personal access token with the `read_api` scope.
