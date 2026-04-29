export type TaskCompletionSoundPreference = 'none' | 'chime' | 'ping' | 'soft';

export const taskCompletionSoundOptions = [
  { value: 'none', label: 'なし' },
  { value: 'chime', label: 'Chime' },
  { value: 'ping', label: 'Ping' },
  { value: 'soft', label: 'Soft' },
] as const satisfies readonly {
  readonly value: TaskCompletionSoundPreference;
  readonly label: string;
}[];

export const taskCompletionSoundStorageKey = 'remote-agent:task-completion-sound';

export const defaultTaskCompletionSoundPreference = 'none' satisfies TaskCompletionSoundPreference;

export const parseTaskCompletionSoundPreference = (
  value: string | null,
): TaskCompletionSoundPreference => {
  if (value === 'enabled') {
    return 'chime';
  }
  if (value === 'disabled') {
    return 'none';
  }
  switch (value) {
    case 'none':
    case 'chime':
    case 'ping':
    case 'soft':
      return value;
    case null:
    default:
      return defaultTaskCompletionSoundPreference;
  }
};

export const isTaskCompletionSoundEnabled = (preference: TaskCompletionSoundPreference): boolean =>
  preference !== 'none';
