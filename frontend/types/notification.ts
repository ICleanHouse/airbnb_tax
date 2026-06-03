export interface AppNotification {
  id: number;
  notification_type: string;
  channel: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
