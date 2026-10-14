import { Loader2, Mic, Paperclip } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { AppSubmitKeyBinding, SlashCommand } from '../../../../shared/acp.ts';

import { Button } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/utils.ts';
import { appendRichPromptText } from './rich-prompt-editor.pure.ts';
import { RichPromptEditor, type RichPromptEditorApi } from './rich-prompt-editor.tsx';

type SpeechRecognitionAlternativeLike = {
  readonly transcript: string;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  item: (index: number) => SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  item: (index: number) => SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEvent = {
  readonly error: string;
  readonly message: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const resolveSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
};

const finalSpeechTextFromEvent = (event: SpeechRecognitionEvent): string => {
  const chunks: string[] = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results.item(index);
    if (!result.isFinal) {
      continue;
    }
    const alternative = result.item(0);
    const transcript = alternative.transcript.trim();
    if (transcript.length > 0) {
      chunks.push(transcript);
    }
  }
  return chunks.join(' ').trim();
};

export type ChatPromptComposerHandle = {
  readonly readValue: () => string;
  readonly replaceValue: (value: string) => void;
  readonly abortSpeech: () => void;
};

export type ChatPromptComposerProps = {
  readonly disabled?: boolean;
  readonly isUploadingAttachments?: boolean;
  readonly onAttachClick: () => void;
  readonly onSubmit: (value: string) => void;
  readonly placeholder: string;
  readonly projectId: string;
  readonly reviewTrailing?: ReactNode;
  readonly slashCommands: readonly SlashCommand[];
  readonly submitKeyBinding: AppSubmitKeyBinding;
};

const ChatPromptComposerInner = forwardRef<ChatPromptComposerHandle, ChatPromptComposerProps>(
  function ChatPromptComposer(
    {
      disabled = false,
      isUploadingAttachments = false,
      onAttachClick,
      onSubmit,
      placeholder,
      projectId,
      reviewTrailing,
      slashCommands,
      submitKeyBinding,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const editorApiRef = useRef<RichPromptEditorApi | null>(null);
    const [promptExternalValue, setPromptExternalValue] = useState({
      revision: 0,
      value: '',
    });
    const [isListeningToSpeech, setIsListeningToSpeech] = useState(false);
    const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const speechListeningDesiredRef = useRef(false);
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const onAttachClickRef = useRef(onAttachClick);
    onAttachClickRef.current = onAttachClick;

    const replaceValue = useCallback((value: string) => {
      // Instant DOM write — parent send path must not wait for a React commit.
      editorApiRef.current?.replaceValue(value);
      setPromptExternalValue((current) => ({
        revision: current.revision + 1,
        value,
      }));
    }, []);

    const abortSpeech = useCallback(() => {
      speechListeningDesiredRef.current = false;
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
      setIsListeningToSpeech(false);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        readValue: () => editorApiRef.current?.readValue() ?? '',
        replaceValue,
        abortSpeech,
      }),
      [abortSpeech, replaceValue],
    );

    useEffect(
      () => () => {
        speechListeningDesiredRef.current = false;
        speechRecognitionRef.current?.abort();
      },
      [],
    );

    const handleEditorApiReady = useCallback((api: RichPromptEditorApi) => {
      editorApiRef.current = api;
    }, []);

    const handleStableSubmit = useCallback((value: string) => {
      onSubmitRef.current(value);
    }, []);

    const handleToggleSpeechInput = () => {
      if (disabled) {
        return;
      }
      const currentRecognition = speechRecognitionRef.current;
      if (isListeningToSpeech) {
        speechListeningDesiredRef.current = false;
        currentRecognition?.stop();
        setIsListeningToSpeech(false);
        return;
      }

      const SpeechRecognition = resolveSpeechRecognitionConstructor();
      if (SpeechRecognition === null) {
        toast.error(t('chat.voiceNotSupported'));
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = navigator.language.length > 0 ? navigator.language : 'ja-JP';
      recognition.onresult = (event) => {
        if (!speechListeningDesiredRef.current) {
          return;
        }
        const speechText = finalSpeechTextFromEvent(event);
        if (speechText.length === 0) {
          return;
        }
        replaceValue(
          appendRichPromptText({
            value: editorApiRef.current?.readValue() ?? '',
            addition: speechText,
          }),
        );
      };
      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') {
          return;
        }
        speechListeningDesiredRef.current = false;
        setIsListeningToSpeech(false);
        speechRecognitionRef.current = null;
        toast.error(event.message.length > 0 ? event.message : t('chat.voiceFailed'));
      };
      recognition.onend = () => {
        if (speechRecognitionRef.current !== recognition) {
          return;
        }
        if (!speechListeningDesiredRef.current) {
          setIsListeningToSpeech(false);
          speechRecognitionRef.current = null;
          return;
        }
        try {
          recognition.start();
        } catch {
          speechListeningDesiredRef.current = false;
          setIsListeningToSpeech(false);
          speechRecognitionRef.current = null;
        }
      };
      speechRecognitionRef.current = recognition;
      speechListeningDesiredRef.current = true;
      try {
        recognition.start();
        setIsListeningToSpeech(true);
      } catch {
        speechListeningDesiredRef.current = false;
        speechRecognitionRef.current = null;
        setIsListeningToSpeech(false);
        toast.error(t('chat.voiceStartFailed'));
      }
    };

    return (
      <RichPromptEditor
        disabled={disabled}
        toolbarTrailing={
          <>
            {reviewTrailing}
            <Button
              aria-label="Attach files"
              disabled={disabled || isUploadingAttachments}
              onClick={() => {
                onAttachClickRef.current();
              }}
              size="icon-sm"
              title="Attach files"
              type="button"
              variant="ghost"
            >
              {isUploadingAttachments ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
            </Button>
            <Button
              aria-label={isListeningToSpeech ? 'Stop voice input' : 'Start voice input'}
              className={cn(
                isListeningToSpeech
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive'
                  : '',
              )}
              disabled={disabled}
              onClick={handleToggleSpeechInput}
              size="icon-sm"
              title={isListeningToSpeech ? t('chat.voiceInputStop') : t('chat.voiceInputStart')}
              type="button"
              variant="ghost"
            >
              <Mic className="size-4" />
            </Button>
          </>
        }
        externalValue={promptExternalValue}
        onSubmit={handleStableSubmit}
        onEditorApiReady={handleEditorApiReady}
        placeholder={placeholder}
        projectId={projectId}
        slashCommands={slashCommands}
        submitKeyBinding={submitKeyBinding}
      />
    );
  },
);

export const ChatPromptComposer = memo(
  ChatPromptComposerInner,
  (previous, next) =>
    previous.disabled === next.disabled &&
    previous.isUploadingAttachments === next.isUploadingAttachments &&
    previous.placeholder === next.placeholder &&
    previous.projectId === next.projectId &&
    previous.submitKeyBinding === next.submitKeyBinding &&
    previous.slashCommands === next.slashCommands,
);
