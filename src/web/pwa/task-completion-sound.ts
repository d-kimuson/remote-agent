import {
  defaultTaskCompletionSoundPreference,
  isTaskCompletionSoundEnabled,
  parseTaskCompletionSoundPreference,
  taskCompletionSoundStorageKey,
  type TaskCompletionSoundPreference,
} from './task-completion-sound.pure.ts';

export const readTaskCompletionSoundPreference = (): TaskCompletionSoundPreference => {
  if (typeof window === 'undefined') {
    return defaultTaskCompletionSoundPreference;
  }

  try {
    return parseTaskCompletionSoundPreference(
      window.localStorage.getItem(taskCompletionSoundStorageKey),
    );
  } catch {
    return defaultTaskCompletionSoundPreference;
  }
};

export const persistTaskCompletionSoundPreference = (
  preference: TaskCompletionSoundPreference,
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(taskCompletionSoundStorageKey, preference);
  } catch {
    // Ignore storage failures so the Settings UI can still reflect the current tab state.
  }
};

const playTone = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || window.AudioContext === undefined) {
    return false;
  }

  const preference = readTaskCompletionSoundPreference();
  if (!isTaskCompletionSoundEnabled(preference)) {
    return false;
  }

  const audioContext = new window.AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startAt = audioContext.currentTime;
  const endAt = startAt + (preference === 'soft' ? 0.42 : 0.24);

  oscillator.type = preference === 'ping' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(
    preference === 'ping' ? 1046.5 : preference === 'soft' ? 523.25 : 880,
    startAt,
  );
  if (preference === 'chime') {
    oscillator.frequency.exponentialRampToValueAtTime(1318.51, startAt + 0.08);
  }
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(preference === 'soft' ? 0.08 : 0.12, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  await audioContext.resume();
  oscillator.start(startAt);
  oscillator.stop(endAt);

  await new Promise((resolve) => {
    window.setTimeout(resolve, 280);
  });
  await audioContext.close();

  return true;
};

export const playTaskCompletionSound = async (): Promise<boolean> => {
  try {
    return await playTone();
  } catch {
    return false;
  }
};
