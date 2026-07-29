import type { RepoConfig } from '@/lib/types';
import { parsePackageJson } from '@/lib/package-json';
import { postGraphql } from '@/lib/proxy-client';
import type { PackageFilesResult } from '@/lib/package-files';

/**
 * All GitLab GraphQL queries in one place. Every function throws on
 * transport or GraphQL-level failure — callers decide whether to fall back
 * to the equivalent REST flow (older self-hosted instances may lag behind).
 */

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function graphqlQuery<T>(
  repo: RepoConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await postGraphql<GraphqlResponse<T>>(repo, { query, variables });
  if (response.errors?.length) {
    throw new Error(`GitLab GraphQL error: ${response.errors[0].message}`);
  }
  if (response.data === undefined) {
    throw new Error('GitLab GraphQL returned no data.');
  }
  return response.data;
}

/** Default branch via repository.rootRef. */
export async function fetchDefaultBranchGraphql(repo: RepoConfig): Promise<string> {
  interface Payload {
    project?: { repository?: { rootRef?: string } };
  }
  const data = await graphqlQuery<Payload>(
    repo,
    `query ($fullPath: ID!) { project(fullPath: $fullPath) { repository { rootRef } } }`,
    { fullPath: repo.path },
  );
  const rootRef = data.project?.repository?.rootRef;
  if (!rootRef) {
    throw new Error('GitLab GraphQL returned no rootRef.');
  }
  return rootRef;
}

/**
 * All branch names via branchNames(searchPattern: "*") with limit/offset
 * paging, capped at maxBranches (mirrors the REST branch cap).
 */
export async function fetchBranchNamesGraphql(
  repo: RepoConfig,
  maxBranches = 500,
): Promise<string[]> {
  const PAGE = 100;
  interface Payload {
    project?: { repository?: { branchNames?: string[] } };
  }
  const names: string[] = [];
  for (let offset = 0; names.length < maxBranches; offset += PAGE) {
    const data = await graphqlQuery<Payload>(
      repo,
      `query ($fullPath: ID!, $limit: Int!, $offset: Int!) {
        project(fullPath: $fullPath) {
          repository { branchNames(searchPattern: "*", limit: $limit, offset: $offset) }
        }
      }`,
      { fullPath: repo.path, limit: PAGE, offset },
    );
    const page = data.project?.repository?.branchNames;
    if (!page) {
      throw new Error('GitLab GraphQL returned no branchNames.');
    }
    names.push(...page);
    if (page.length < PAGE) break;
  }
  return names.slice(0, maxBranches);
}

const BLOB_BATCH_SIZE = 50;

interface GraphqlBlobsPayload {
  project?: {
    repository?: {
      blobs?: { nodes: Array<{ path: string; rawTextBlob: string | null }> };
    };
  };
}

const BLOBS_QUERY = `
  query ($fullPath: ID!, $ref: String!, $paths: [String!]!) {
    project(fullPath: $fullPath) {
      repository {
        blobs(paths: $paths, ref: $ref) {
          nodes { path rawTextBlob }
        }
      }
    }
  }
`;

/**
 * Batch-read package.json files via blobs(paths:) — one request per
 * BLOB_BATCH_SIZE files instead of one REST call per file, which dominates
 * fetch time on monorepos. Throws on failure so the caller can fall back to
 * per-file REST (older GitLab versions lack this field).
 */
export async function fetchPackageJsonsBatched(
  repo: RepoConfig,
  branch: string,
  paths: string[],
): Promise<PackageFilesResult> {
  const files: PackageFilesResult['files'] = [];
  let failedCount = 0;

  for (let start = 0; start < paths.length; start += BLOB_BATCH_SIZE) {
    const chunk = paths.slice(start, start + BLOB_BATCH_SIZE);
    const data = await graphqlQuery<GraphqlBlobsPayload>(repo, BLOBS_QUERY, {
      fullPath: repo.path,
      ref: branch,
      paths: chunk,
    });
    const nodes = data.project?.repository?.blobs?.nodes;
    if (!nodes) {
      throw new Error('GitLab GraphQL returned no blobs data.');
    }
    const byPath = new Map(nodes.map((node) => [node.path, node.rawTextBlob]));
    for (const path of chunk) {
      const raw = byPath.get(path);
      if (raw == null) {
        failedCount += 1;
        continue;
      }
      try {
        files.push(parsePackageJson(path, raw));
      } catch {
        failedCount += 1;
      }
    }
  }

  return { files, failedCount };
}
