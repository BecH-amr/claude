"""Review-fix follow-ups: drop paused from queue_status, add tickets composite index.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-28

`paused` was an unreachable enum value with no API surface, no scheduler, and
no test coverage. Removing it both prevents schema drift and lets the Pydantic
model exhaustively cover every valid status.

The composite index on tickets(queue_id, status) backs the two hottest queries
in the app: `waiting_count(queue_id)` and `call_next` lookup of the next
waiting ticket. Sequential scans were emerging once a queue grew past a few
hundred tickets.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Composite index for the queue_id+status hot path.
    op.create_index(
        "ix_tickets_queue_id_status",
        "tickets",
        ["queue_id", "status"],
    )

    # Drop `paused` from queue_status. SQLite (used in tests) has no native
    # enums, so the type swap only runs on Postgres. ALTER TYPE … DROP VALUE
    # doesn't exist in PG, so we rebuild the enum.
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE queue_status RENAME TO queue_status_old")
        op.execute("CREATE TYPE queue_status AS ENUM ('open', 'closed')")
        # Coerce stray paused rows to closed (semantically the safer
        # interpretation — paused never had user-visible behavior).
        op.execute(
            "ALTER TABLE queues ALTER COLUMN status TYPE queue_status "
            "USING (CASE WHEN status::text = 'paused' THEN 'closed' "
            "ELSE status::text END)::queue_status"
        )
        op.execute("DROP TYPE queue_status_old")


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_tickets_queue_id_status", table_name="tickets")

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE queue_status RENAME TO queue_status_old")
        op.execute("CREATE TYPE queue_status AS ENUM ('open', 'closed', 'paused')")
        op.execute(
            "ALTER TABLE queues ALTER COLUMN status TYPE queue_status "
            "USING status::text::queue_status"
        )
        op.execute("DROP TYPE queue_status_old")
