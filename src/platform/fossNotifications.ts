import { NativeEventEmitter, NativeModules } from 'react-native';

const NativeNotifications = NativeModules.FossNotifications;
const emitter = NativeNotifications ? new NativeEventEmitter(NativeNotifications) : null;

export const AndroidImportance = { HIGH: 4 } as const;
export const AndroidNotificationPriority = { HIGH: 'high' } as const;

type Response = { notification: { request: { content: { data: { action?: string } } } } };
const shapeResponse = (payload?: { action?: string | null } | null): Response | null =>
  payload?.action ? { notification: { request: { content: { data: { action: payload.action } } } } } : null;

const requireNative = () => {
  if (!NativeNotifications) throw new Error('FLOSS notification module is unavailable. Rebuild the Android app.');
  return NativeNotifications;
};

export async function getPermissionsAsync(): Promise<{ status: 'granted' | 'denied' }> {
  return { status: await requireNative().getPermissionStatus() };
}
export async function setNotificationChannelAsync(id: string, options: Record<string, unknown>): Promise<void> {
  await requireNative().setChannel(id, options);
}
export async function deleteNotificationChannelAsync(id: string): Promise<void> { await requireNative().deleteChannel(id); }
export async function scheduleNotificationAsync(request: any): Promise<string> {
  const content = request?.content ?? {};
  return requireNative().show({
    channelId: content.channelId ?? 'active-call', title: content.title, body: content.body,
    action: content.data?.action, sticky: !!content.sticky, autoDismiss: content.autoDismiss !== false,
  });
}
export async function dismissNotificationAsync(id: string): Promise<void> { await requireNative().dismiss(id); }
export async function cancelScheduledNotificationAsync(id: string): Promise<void> { await requireNative().dismiss(id); }
export async function dismissAllNotificationsAsync(): Promise<void> { await requireNative().dismissAll(); }
export function addNotificationResponseReceivedListener(callback: (response: Response) => void) {
  const subscription = emitter?.addListener('fossNotificationResponse', (payload) => {
    const response = shapeResponse(payload); if (response) callback(response);
  });
  return { remove: () => subscription?.remove() };
}
export async function getLastNotificationResponseAsync(): Promise<Response | null> {
  return shapeResponse(await requireNative().getLastResponse());
}
