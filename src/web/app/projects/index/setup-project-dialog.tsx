import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Plus } from 'lucide-react';
import { Suspense, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProjectsResponse } from '../../../../shared/acp.ts';

import { Button } from '../../../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog.tsx';
import { createProjectRequest } from '../../../lib/api/acp.ts';
import { DirectoryPicker } from './directory-picker.tsx';

const projectsQueryKey = ['projects'] as const;

const deriveProjectName = (workingDirectory: string): string => {
  const parts = workingDirectory.split('/').filter(Boolean);
  return parts.at(-1) ?? workingDirectory;
};

export const SetupProjectDialog: FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setupProjectMutation = useMutation({
    mutationFn: () =>
      createProjectRequest({
        name: deriveProjectName(selectedPath),
        workingDirectory: selectedPath,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData<ProjectsResponse>(projectsQueryKey, (current) =>
        current === undefined
          ? current
          : {
              projects: current.projects.some((project) => project.id === response.project.id)
                ? current.projects.map((project) =>
                    project.id === response.project.id ? response.project : project,
                  )
                : [response.project, ...current.projects],
            },
      );

      setOpen(false);
      void navigate({
        to: '/projects/$projectId',
        params: { projectId: response.project.id },
      });
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            {t('projects.newProject')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('projects.setupTitle')}</DialogTitle>
          <DialogDescription>{t('projects.setupDescription')}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Suspense
            fallback={
              <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                {t('projects.loadingDirectories')}
              </div>
            }
          >
            <DirectoryPicker onPathChange={setSelectedPath} />
          </Suspense>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setOpen(false);
            }}
            type="button"
            variant="outline"
          >
            {t('common.cancel')}
          </Button>
          <Button
            disabled={selectedPath === '' || setupProjectMutation.isPending}
            onClick={() => {
              setupProjectMutation.mutate();
            }}
            type="button"
          >
            {setupProjectMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('projects.settingUp')}
              </>
            ) : (
              <>
                <Plus className="size-4" />
                {t('projects.setUpProject')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
