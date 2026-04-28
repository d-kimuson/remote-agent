import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type FC, type MouseEvent } from "react";
import { toast } from "sonner";

import { Button } from "../../../components/ui/button.tsx";
import { cn } from "../../../lib/utils.ts";

const COPIED_RESET_MS = 1_500;

const writeClipboardText = async (text: string): Promise<void> => {
  if (navigator.clipboard === undefined) {
    throw new Error("clipboard API is unavailable");
  }
  await navigator.clipboard.writeText(text);
};

export const CopyBlockButton: FC<{
  readonly text: string;
  readonly className?: string;
}> = ({ text, className }) => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const canCopy = text.trim().length > 0;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canCopy) {
      return;
    }

    void writeClipboardText(text)
      .then(() => {
        setCopied(true);
        toast.success("コピーしました");
        if (resetTimerRef.current !== null) {
          window.clearTimeout(resetTimerRef.current);
        }
        resetTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          resetTimerRef.current = null;
        }, COPIED_RESET_MS);
      })
      .catch(() => {
        toast.error("コピーに失敗しました");
      });
  };

  return (
    <Button
      aria-label={copied ? "Copied" : "Copy block"}
      className={cn("size-7 shrink-0 text-muted-foreground", className)}
      disabled={!canCopy}
      onClick={handleCopy}
      size="icon"
      title={copied ? "コピーしました" : "ブロックをコピー"}
      type="button"
      variant="ghost"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
};
