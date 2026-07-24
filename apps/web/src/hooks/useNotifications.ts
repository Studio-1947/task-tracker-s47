import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { http } from '../lib/api';
import type { NotificationItem, Paginated } from '@task-tracker/shared';

const keys = {
  all: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useNotifications(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...keys.all, page, pageSize],
    queryFn: () => http.get<Paginated<NotificationItem>>(`/notifications?page=${page}&pageSize=${pageSize}`),
  });
}

export function useNotificationsUnreadCount() {
  return useQuery({
    queryKey: keys.unreadCount,
    queryFn: () => http.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30000, // Poll count every 30s as a fallback
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.patch<NotificationItem>(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.post<{ ok: boolean }>('/notifications/read-all', {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

export function useVapidPublicKey() {
  return useQuery({
    queryKey: ['notifications', 'vapid-key'] as const,
    queryFn: () => http.get<{ publicKey: string | null }>('/notifications/vapid-public-key'),
    staleTime: Infinity,
  });
}

export function useSubscribePush() {
  return useMutation({
    mutationFn: (subscription: any) => http.post<{ ok: boolean }>('/notifications/subscribe', subscription),
  });
}

export function useUnsubscribePush() {
  return useMutation({
    mutationFn: (endpoint: string) => http.post<{ ok: boolean }>('/notifications/unsubscribe', { endpoint }),
  });
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

