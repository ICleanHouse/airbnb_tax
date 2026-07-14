export type ConnectionStatus = "pending" | "accepted" | "declined" | "removed";
export type ConnectionDirection = "incoming" | "outgoing" | "connected";

export interface Connection {
  id: number;
  status: ConnectionStatus;
  direction: ConnectionDirection;
  other_user_id: number;
  other_user_name: string;
  other_user_role: string;
  other_user_image: string | null;
  other_user_profile_id: number | null;
  unread_count: number;
  last_message: { body: string; created_at: string; sender: number } | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  connection: number;
  sender: number;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface SharedContext {
  properties: { name: string; city: string; cleanings: number }[];
  cleanings: {
    job_id: number;
    property_name: string;
    scheduled_start: string;
    status: string;
    agreed_price: string | null;
    currency: string;
  }[];
  cleanings_count: number;
}
