import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hasDrift } from '@/lib/grouping';
import { pluralize } from '@/lib/utils';
import type { DependencyGroup } from '@/lib/types';

const DEP_TYPE_LABELS: Record<string, string> = {
  dependencies: 'deps',
  devDependencies: 'dev',
  peerDependencies: 'peer',
};

export function DependencyGroupCard({ group }: { group: DependencyGroup }) {
  const projectCount = group.versions.reduce((n, v) => n + v.projects.length, 0);
  const drift = hasDrift(group);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-mono text-sm font-bold">{group.depName}</CardTitle>
          <Badge variant="secondary">{pluralize(projectCount, 'project', 'projects')}</Badge>
          <Badge variant="secondary">{pluralize(group.versions.length, 'version', 'versions')}</Badge>
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
            {version.depTypes.map((depType) => (
              <Badge key={depType} variant="secondary" className="text-xs">
                {DEP_TYPE_LABELS[depType] ?? depType}
              </Badge>
            ))}
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
