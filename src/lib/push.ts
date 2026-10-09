import { supabase, isSupabaseConfigured } from "./supabase";

// Web Push (Phase 3): lets the `push` edge function reach this device while the
// app is closed. On iPhone/iPad this only works in the installed app
// (Share → Add to Home Screen, iOS 16.4+).

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || null;
}

export async function getPushState(): Promise<PushState> {
  if (!isSupabaseConfigured) return "unsupported";
  if (!pushSupported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("push", { body });
  if (error) throw error;
  return data as T;
}

// Subscribe this device for `recipient` (a nameKey). Safe to call again — e.g.
// after switching identity — it just re-points the device to the new member.
export async function enablePush(recipient: string): Promise<PushState> {
  if (!pushSupported()) return getPushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = (await registration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await call<{ publicKey: string }>({ action: "vapid" });
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) as BufferSource });
  }
  await call({
    action: "subscribe",
    subscription: sub.toJSON(),
    recipient,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    userAgent: navigator.userAgent,
  });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await call({ action: "unsubscribe", endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return getPushState();
}

export async function sendTestPush(): Promise<boolean> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return false;
  const res = await call<{ ok?: boolean }>({ action: "test", endpoint: sub.endpoint });
  return !!res?.ok;
}

// Keep the server's record of this device pointed at the current identity.
export async function resyncPush(recipient: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await call({
    action: "subscribe",
    subscription: sub.toJSON(),
    recipient,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    userAgent: navigator.userAgent,
  }).catch(() => {});
}
