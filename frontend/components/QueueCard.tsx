import type { QueueStatus } from "@/lib/types";

interface Props {
  businessName: string;
  queueName: string;
  status: QueueStatus;
  waitingCount: number;
  nowServing: number | null;
}

const statusLabel: Record<QueueStatus, string> = {
  open: "Open",
  closed: "Closed",
};

const statusDot: Record<QueueStatus, string> = {
  open: "bg-emerald-500",
  closed: "bg-ink-subtle",
};

export default function QueueCard({
  businessName,
  queueName,
  status,
  waitingCount,
  nowServing,
}: Props) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs uppercase tracking-widest text-ink-subtle">
          {businessName}
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status]}`} />
          {statusLabel[status]}
        </span>
      </div>
      <h2 className="text-2xl font-serif tracking-tightest">{queueName}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-cream-sunken px-4 py-3">
          <p className="text-xs text-ink-subtle">Waiting</p>
          <p className="text-2xl font-serif text-ink">{waitingCount}</p>
        </div>
        <div className="rounded-xl bg-cream-sunken px-4 py-3">
          <p className="text-xs text-ink-subtle">Now serving</p>
          <p className="text-2xl font-serif text-ink">{nowServing ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
