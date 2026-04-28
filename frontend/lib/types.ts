export type QueueStatus = "open" | "closed" | "paused";
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
