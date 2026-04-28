import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronRight, Folder } from 'lucide-react';
import { useEffect, useState, type FC } from 'react';

import { Checkbox } from '../../../components/ui/checkbox.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { fetchDirectoryListing } from '../../../lib/api/acp.ts';

export type DirectoryPickerProps = {
  readonly onPathChange: (path: string) => void;
};

export const DirectoryPicker: FC<DirectoryPickerProps> = ({ onPathChange }) => {
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [showHidden, setShowHidden] = useState(false);

  const { data } = useSuspenseQuery({
    queryKey: ['directory-listing', currentPath, showHidden] as const,
    queryFn: () => fetchDirectoryListing(currentPath, showHidden),
  });

  useEffect(() => {
    if (data?.currentPath !== undefined && data.currentPath.length > 0) {
      onPathChange(data.currentPath);
    }
  }, [data?.currentPath, onPathChange]);

  const directoryEntries = (data?.entries ?? []).filter((entry) => entry.type === 'directory');

  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/50 p-3">
        <p className="text-sm font-medium">
          Current: <span className="font-mono">{data?.currentPath ?? '~'}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 border-b p-3">
        <Checkbox
          checked={showHidden}
          id="directory-picker-show-hidden"
          onCheckedChange={(checked) => {
            setShowHidden(checked);
          }}
        />
        <Label className="cursor-pointer text-sm" htmlFor="directory-picker-show-hidden">
          Show hidden
        </Label>
      </div>
      <div className="max-h-96 overflow-auto">
        {directoryEntries.length > 0 ? (
          <div className="divide-y">
            {directoryEntries.map((entry) => (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                key={entry.path}
                onClick={() => {
                  setCurrentPath(entry.path);
                }}
                type="button"
              >
                {entry.name === '..' ? (
                  <ChevronRight className="size-4 rotate-180" />
                ) : (
                  <Folder className="size-4 text-blue-500" />
                )}
                <span className="text-sm">{entry.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No directories.</div>
        )}
      </div>
    </div>
  );
};
