import { registerSW } from "virtual:pwa-register";

let registerOnce = false;

export const registerServiceWorker = (): void => {
  if (registerOnce || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  registerOnce = true;

  registerSW({
    immediate: true,
    onRegisteredSW(serviceWorkerUrl, registration) {
      if (import.meta.env.DEV) {
        console.info("[pwa] service worker registered", serviceWorkerUrl, registration);
      }
    },
    onOfflineReady() {
      console.info("[pwa] app is ready to work offline");
    },
    onRegisterError(error) {
      console.error("[pwa] failed to register service worker", error);
    },
  });
};
