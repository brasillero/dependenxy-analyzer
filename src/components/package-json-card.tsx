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
