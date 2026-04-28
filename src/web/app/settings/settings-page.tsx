import { useEffect, useState, type FC } from "react";

import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import { Label } from "../../components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import { parseThemePreference, type ThemePreference } from "../../lib/theme.pure.ts";
import { useTheme } from "../../lib/theme.tsx";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  showNotificationPreview,
} from "../../pwa/notifications.ts";

const themePreferenceChoices = [
  {
    value: "system",
    label: "System",
    description: "OS の外観設定に合わせます。",
  },
  {
    value: "light",
    label: "Light",
    description: "常にライトテーマを使います。",
  },
  {
    value: "dark",
    label: "Dark",
    description: "常にダークテーマを使います。",
  },
] as const satisfies readonly {
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
}[];

export const SettingsPage: FC = () => {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [notificationPermission, setNotificationPermission] = useState(
    getNotificationPermissionState,
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(getNotificationPermissionState());
    };

    syncNotificationPermission();
    window.addEventListener("focus", syncNotificationPermission);

    return () => {
      window.removeEventListener("focus", syncNotificationPermission);
    };
  }, []);

  const handleEnableNotifications = async () => {
    const nextPermission = await requestNotificationPermission();
    setNotificationPermission(nextPermission);

    if (nextPermission === "denied") {
      setNotificationError("通知が拒否されています。ブラウザ設定から許可してください。");
      return;
    }

    if (nextPermission === "unsupported") {
      setNotificationError("この環境では Service Worker 通知を利用できません。");
      return;
    }

    setNotificationError(null);
  };

  const handlePreviewNotification = async () => {
    const didShowNotification = await showNotificationPreview({
      projectId: "settings",
      projectName: "ACP Playground",
      sessionId: "settings",
      text: "バックグラウンド時の assistant 応答をこの形式で通知します。",
      timestamp: Date.now(),
      url: "/settings",
    });

    if (!didShowNotification) {
      setNotificationError("通知を表示できませんでした。先に通知を許可してください。");
      return;
    }

    setNotificationError(null);
  };

  return (
    <div className="space-y-6">
      <Card className="app-panel">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>UI の配色テーマを設定します。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
          <div className="space-y-1">
            <Label htmlFor="theme-preference">Theme</Label>
            <p className="text-sm text-muted-foreground">
              現在の表示は <span className="font-medium text-foreground">{resolvedTheme}</span>{" "}
              です。
            </p>
          </div>
          <Select
            onValueChange={(nextPreference) => {
              setPreference(parseThemePreference(nextPreference));
            }}
            value={preference}
          >
            <SelectTrigger className="w-full" id="theme-preference">
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-64">
              {themePreferenceChoices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  <div className="flex flex-col">
                    <span>{choice.label}</span>
                    <span className="text-xs text-muted-foreground">{choice.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="app-panel">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            バックグラウンド時の assistant 応答を Service Worker 通知で受け取るための設定。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{notificationPermission}</Badge>
            <Button
              disabled={
                notificationPermission === "denied" ||
                notificationPermission === "granted" ||
                notificationPermission === "unsupported"
              }
              onClick={() => {
                void handleEnableNotifications();
              }}
              type="button"
              variant="outline"
            >
              Enable
            </Button>
            <Button
              disabled={notificationPermission !== "granted"}
              onClick={() => {
                void handlePreviewNotification();
              }}
              type="button"
              variant="outline"
            >
              Test
            </Button>
          </div>
          {notificationError === null ? null : (
            <p className="text-xs text-destructive">{notificationError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
