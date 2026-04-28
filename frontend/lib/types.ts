export type QueueStatus = "open" | "closed";
export type TicketStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "no_show"
  | "cancelled";
export type TicketSource = "app" | "walk_in";

export interface QueuePublic {
  id: number;
  name: string;
  status: QueueStatus;
  business_name: string;
  waiting_count: number;
  now_serving: number | null;
  max_capacity: number | null;
}

export interface TicketPublic {
  id: number;
  queue_id: number;
  ticket_number: number;
  source: TicketSource;
  status: TicketStatus;
  joined_at: string;
  called_at: string | null;
  completed_at: string | null;
}

export interface TicketStatusResponse {
  ticket: TicketPublic;
  position: number | null;
  waiting_count: number;
  now_serving: number | null;
  queue_status: QueueStatus;
}

export type BusinessType = "clinic" | "barber" | "gov" | "restaurant" | "other";

export interface BusinessOut {
  id: number;
  name: string;
  phone: string;
  business_type: BusinessType;
  address: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  business: BusinessOut;
}

export interface WsTicketOut {
  ws_token: string;
  expires_in: number;
}

export interface QueueOut {
  id: number;
  business_id: number;
  name: string;
  status: QueueStatus;
  max_capacity: number | null;
  close_on_max_reached: boolean;
  current_ticket_number: number;
  now_serving: number | null;
  created_at: string;
}

export interface TicketOut {
  id: number;
  queue_id: number;
  ticket_number: number;
  customer_name: string | null;
  customer_phone: string | null;
  source: TicketSource;
  status: TicketStatus;
  joined_at: string;
  called_at: string | null;
  completed_at: string | null;
}

export interface QueueWsEvent {
  event: string;
  queue_id: number;
  status: QueueStatus;
  now_serving: number | null;
  waiting_count: number;
  current_ticket_number: number;
  ticket_id?: number;
  ticket_number?: number;
}
