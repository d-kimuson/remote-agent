/* oxlint-disable no-restricted-globals -- This public bootstrap page intentionally uses direct browser APIs before API auth is configured. */
import { createFileRoute } from '@tanstack/react-router';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Info,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useEffect, useState, type FC } from 'react';

import { Badge } from '../components/ui/badge.tsx';
import { Button, buttonVariants } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { cn } from '../lib/utils.ts';

type MobileSetupConfig = {
  readonly appUrl: string;
  readonly limitedAppUrl: string;
  readonly certificateUrl: string;
};

type CopyState = 'idle' | 'copied' | 'failed';

type Platform = 'ios' | 'android';

const setupConfigUrl = '/.well-known/remote-agent-mobile-setup.json';

const fetchSetupConfig = async (): Promise<MobileSetupConfig> => {
  const response = await fetch(setupConfigUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load mobile setup config: ${String(response.status)}`);
  }
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('appUrl' in value) ||
    typeof value.appUrl !== 'string' ||
    !('limitedAppUrl' in value) ||
    typeof value.limitedAppUrl !== 'string' ||
    !('certificateUrl' in value) ||
    typeof value.certificateUrl !== 'string'
  ) {
    throw new Error('Invalid mobile setup config.');
  }
  return {
    appUrl: value.appUrl,
    limitedAppUrl: value.limitedAppUrl,
    certificateUrl: value.certificateUrl,
  };
};

const copyText = async (value: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // Clipboard API is often unavailable on HTTP private IP pages. Fall back to execCommand.
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  // oxlint-disable-next-line typescript-eslint/no-deprecated -- Fallback for HTTP private IP pages where Clipboard API is unavailable.
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) {
    throw new Error('Copy failed.');
  }
};

const CopyButton: FC<{ readonly value: string; readonly label?: string }> = ({
  value,
  label = 'コピー',
}) => {
  const [state, setState] = useState<CopyState>('idle');
  return (
    <Button
      onClick={() => {
        void copyText(value)
          .then(() => {
            setState('copied');
            window.setTimeout(() => setState('idle'), 1500);
          })
          .catch(() => {
            setState('failed');
            window.setTimeout(() => setState('idle'), 1800);
          });
      }}
      type="button"
      variant="outline"
    >
      <Copy className="size-4" />
      {state === 'copied' ? 'コピーしました' : state === 'failed' ? 'コピー失敗' : label}
    </Button>
  );
};

const UrlBlock: FC<{ readonly children: string }> = ({ children }) => (
  <code className="block break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
    {children}
  </code>
);

const InstructionTabs: FC = () => {
  const [platform, setPlatform] = useState<Platform>('ios');
  return (
    <Card>
      <CardHeader>
        <CardTitle>インストール手順</CardTitle>
        <CardDescription>利用している端末に合わせて手順を確認してください。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            aria-pressed={platform === 'ios'}
            onClick={() => setPlatform('ios')}
            type="button"
            variant={platform === 'ios' ? 'default' : 'ghost'}
          >
            iPhone / iPad
          </Button>
          <Button
            aria-pressed={platform === 'android'}
            onClick={() => setPlatform('android')}
            type="button"
            variant={platform === 'android' ? 'default' : 'ghost'}
          >
            Android
          </Button>
        </div>

        {platform === 'ios' ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>証明書 URL を Safari で開く。</li>
            <li>プロファイルのダウンロードを許可する。</li>
            <li>設定アプリ →「プロファイルがダウンロード済み」→ インストール。</li>
            <li>設定 → 一般 → 情報 → 証明書信頼設定。</li>
            <li>
              <code>remote-agent local CA</code> の「ルート証明書を全面的に信頼」を ON。
            </li>
            <li>ブラウザを再起動して remote-agent を開く。</li>
          </ol>
        ) : (
          <div className="space-y-3">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>「CA 証明書をインストール」から .crt をダウンロード。</li>
              <li>設定 → セキュリティ → 暗号化と認証情報 → 証明書をインストール。</li>
              <li>「CA 証明書」または「VPN とアプリ」を選び、証明書を選択。</li>
              <li>Chrome を再起動して remote-agent を開く。</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              機種により項目名は少し違います。証明書追加時に画面ロック設定が必要な場合があります。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const SetupPage: FC = () => {
  const [config, setConfig] = useState<MobileSetupConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trustStatus, setTrustStatus] = useState<'checking' | 'trusted' | 'untrusted'>('checking');

  useEffect(() => {
    void fetchSetupConfig()
      .then(setConfig)
      .catch((unknownError: unknown) => {
        setError(unknownError instanceof Error ? unknownError.message : String(unknownError));
      });
  }, []);

  useEffect(() => {
    if (config === null) return;
    void fetch(`${config.appUrl}/.well-known/remote-agent-trust-check?ts=${String(Date.now())}`, {
      mode: 'no-cors',
      cache: 'no-store',
    })
      .then(() => {
        setTrustStatus('trusted');
        window.setTimeout(() => {
          window.location.href = config.appUrl;
        }, 700);
      })
      .catch(() => {
        setTrustStatus('untrusted');
      });
  }, [config]);

  if (error !== null) {
    return (
      <div className="fixed inset-0 touch-pan-y overflow-y-auto overscroll-y-contain bg-background p-4 [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto flex min-h-full max-w-2xl items-center">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>セットアップ情報を読み込めませんでした</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (config === null) {
    return (
      <div className="fixed inset-0 flex touch-pan-y items-center justify-center overflow-y-auto overscroll-y-contain bg-background p-4 text-sm [-webkit-overflow-scrolling:touch]">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="fixed inset-0 touch-pan-y overflow-y-auto overscroll-y-contain bg-background [-webkit-overflow-scrolling:touch]">
      <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-8 sm:pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="space-y-3 pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="size-4" />
            remote-agent mobile setup
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            スマホから remote-agent を開く
          </h1>
          <p className="text-sm text-muted-foreground">
            まずは機能制限版ですぐ開けます。PWA / 通知を使いたい場合は、続けて HTTPS
            用の証明書を設定してください。
          </p>
        </header>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-6">
            {trustStatus === 'trusted' ? (
              <CheckCircle2 className="mt-0.5 size-5 text-primary" />
            ) : (
              <Info className="mt-0.5 size-5 text-primary" />
            )}
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {trustStatus === 'checking'
                  ? '証明書の信頼状態を確認中...'
                  : trustStatus === 'trusted'
                    ? '証明書は信頼されています。remote-agent に移動します...'
                    : 'PWA / 通知を使うには CA 証明書の信頼が必要です。'}
              </p>
              <p className="text-muted-foreground">
                信頼済みの場合は自動的に remote-agent に移動します。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>すぐ使う</CardTitle>
              <Badge variant="secondary">機能制限版</Badge>
            </div>
            <CardDescription>
              ブラウザから画面確認だけしたい場合は、証明書なしで Private IP URL から利用できます。
              HTTP のため PWA / 通知は制限されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-full')}
              href={config.limitedAppUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-4" />
              機能制限版を別タブで開く
            </a>
            <UrlBlock>{config.limitedAppUrl}</UrlBlock>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle>PWA / 通知を使う</CardTitle>
            </div>
            <CardDescription>
              PWA と通知には HTTPS が必要です。CA 証明書をインストールして端末側で信頼してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-full')}
              href={config.certificateUrl}
            >
              <Download className="size-4" />
              CA 証明書をインストール
            </a>
            <CopyButton label="証明書 URL をコピー" value={config.certificateUrl} />
            <UrlBlock>{config.certificateUrl}</UrlBlock>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              iPhone / iPad ではインストールは Safari で行う必要があります。Chrome など Safari
              以外で開いている場合は、証明書 URL をコピーして Safari
              のアドレスバーに貼り付けてください。
            </div>
          </CardContent>
        </Card>

        <InstructionTabs />

        <Card>
          <CardHeader>
            <CardTitle>remote-agent を開く</CardTitle>
            <CardDescription>
              証明書を信頼したあとに開いてください。PWA
              として利用する場合は、遷移後にホーム画面へ追加します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-full')}
              href={config.appUrl}
            >
              <ExternalLink className="size-4" />
              remote-agent を開く
            </a>
            <CopyButton label="URL をコピー" value={config.appUrl} />
            <UrlBlock>{config.appUrl}</UrlBlock>
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">PWA として使うには</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>iPhone / iPad: Safari で開く → 共有 → ホーム画面に追加</li>
                <li>Android Chrome: メニュー → ホーム画面に追加 / アプリをインストール</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export const Route = createFileRoute('/setup-mobile-crt')({
  component: SetupPage,
});
