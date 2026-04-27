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
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  showNotificationPreview,
} from "../../pwa/notifications.ts";

export const SettingsPage: FC = () => {
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
    <Card>
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
  );
};
