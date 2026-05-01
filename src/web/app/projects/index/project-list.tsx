import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FolderIcon } from 'lucide-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { projectsQueryKey } from '../$projectId/queries.ts';
import { buttonVariants } from '../../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card.tsx';
import { fetchProjects } from '../../../lib/api/acp.ts';
import { cn } from '../../../lib/utils.ts';

export const ProjectList: FC = () => {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery({
    queryKey: projectsQueryKey,
    queryFn: fetchProjects,
  });

  const projects = useMemo(
    () =>
      [...data.projects].sort((left, right) =>
        left.name.localeCompare(right.name, 'ja-JP', { sensitivity: 'base' }),
      ),
    [data.projects],
  );

  if (projects.length === 0) {
    return (
      <Card className="app-panel">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderIcon className="mb-4 size-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">{t('projects.noProjectsYet')}</h3>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {t('projects.noProjectsDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Card className="app-panel app-card-hover" key={project.id}>
          <CardHeader>
            <CardTitle className="flex items-start justify-start gap-2">
              <FolderIcon className="size-5 shrink-0" />
              <span className="flex-1 text-wrap">{project.name}</span>
            </CardTitle>
            <CardDescription className="break-all font-mono text-xs">
              {project.workingDirectory}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              className={cn(buttonVariants({ variant: 'default' }), 'w-full')}
              params={{ projectId: project.id }}
              to="/projects/$projectId"
            >
              {t('common.open')}
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const ProjectListSkeleton: FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-sm text-muted-foreground">{t('projects.loading')}</div>
    </div>
  );
};
