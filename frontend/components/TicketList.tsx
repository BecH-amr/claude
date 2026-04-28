"use client";

import type { TicketOut, TicketStatus } from "@/lib/types";

interface Props {
  tickets: TicketOut[];
  onComplete?: (ticketId: number) => void;
  onNoShow?: (ticketId: number) => void;
  emptyLabel: string;
  completeLabel: string;
  noShowLabel: string;
}

const statusBadge: Record<TicketStatus, string> = {
  waiting: "bg-cream-sunken text-ink-muted",
  called: "bg-coral text-cream",
  serving: "bg-coral text-cream",
  completed: "bg-cream-sunken text-ink-subtle",
  no_show: "bg-cream-sunken text-ink-subtle",
  cancelled: "bg-cream-sunken text-ink-subtle",
};

export default function TicketList({
  tickets,
  onComplete,
  onNoShow,
  emptyLabel,
  completeLabel,
  noShowLabel,
}: Props) {
  if (tickets.length === 0) {
    return (
      <div className="card p-6 text-center text-ink-muted text-sm">{emptyLabel}</div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tickets.map((t) => (
        <li
          key={t.id}
          className="card flex items-center gap-3 p-3"
        >
          <span
            className={`shrink-0 grid place-items-center h-10 w-10 rounded-xl font-serif text-lg ${
              statusBadge[t.status]
            }`}
            aria-label={`Ticket number ${t.ticket_number}, status ${t.status}`}
          >
            {t.ticket_number}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink truncate">
              {t.customer_name || (t.source === "walk_in" ? "Walk-in" : "Anonymous")}
            </p>
            <p className="text-xs text-ink-subtle truncate">
              {t.customer_phone ?? ""}
            </p>
          </div>
          {(t.status === "called" || t.status === "waiting") && (
            <div className="flex gap-1">
              {t.status === "called" && onComplete && (
                <button
                  type="button"
                  onClick={() => onComplete(t.id)}
                  className="btn-ghost px-3 py-1.5 text-sm"
                >
                  {completeLabel}
                </button>
              )}
              {onNoShow && (
                <button
                  type="button"
                  onClick={() => onNoShow(t.id)}
                  className="btn-ghost px-3 py-1.5 text-sm text-ink-muted"
                >
                  {noShowLabel}
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
