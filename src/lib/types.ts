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
