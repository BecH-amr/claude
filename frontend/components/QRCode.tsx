"use client";

import { api } from "@/lib/api";

interface Props {
  queueId: number;
  size?: number;
}

/**
 * Renders the queue's QR via the backend's /api/queues/{id}/qr endpoint.
 * Lets the browser cache it, includes a print stylesheet hint via media query
 * so the print page hides everything except the code.
 */
export default function QRCode({ queueId, size = 256 }: Props) {
  return (
    <img
      src={api.qrUrl(queueId)}
      alt="QR code to join this queue"
      width={size}
      height={size}
      className="rounded-2xl border border-line bg-cream-raised p-3"
    />
  );
}
