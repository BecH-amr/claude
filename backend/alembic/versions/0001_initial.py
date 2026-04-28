"""initial schema: businesses, queues, tickets

Revision ID: 0001
Revises:
Create Date: 2026-04-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    business_type = sa.Enum("clinic", "barber", "gov", "restaurant", "other", name="business_type")
    queue_status = sa.Enum("open", "closed", "paused", name="queue_status")
    ticket_source = sa.Enum("app", "walk_in", name="ticket_source")
    ticket_status = sa.Enum(
        "waiting", "called", "serving", "completed", "no_show", "cancelled", name="ticket_status"
    )

    op.create_table(
        "businesses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("business_type", business_type, nullable=False),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("phone", name="uq_businesses_phone"),
    )
    op.create_index("ix_businesses_phone", "businesses", ["phone"])

    op.create_table(
        "queues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "business_id",
            sa.Integer(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", queue_status, nullable=False),
        sa.Column("max_capacity", sa.Integer(), nullable=True),
        sa.Column("auto_open_time", sa.Time(), nullable=True),
        sa.Column("auto_close_time", sa.Time(), nullable=True),
        sa.Column(
            "close_on_max_reached",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "current_ticket_number",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("now_serving", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_queues_business_id", "queues", ["business_id"])

    op.create_table(
        "tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "queue_id",
            sa.Integer(),
            sa.ForeignKey("queues.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ticket_number", sa.Integer(), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=True),
        sa.Column("customer_phone", sa.String(length=32), nullable=True),
        sa.Column("source", ticket_source, nullable=False),
        sa.Column("status", ticket_status, nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("called_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tickets_queue_id", "tickets", ["queue_id"])
    op.create_index("ix_tickets_status", "tickets", ["status"])


def downgrade() -> None:
    op.drop_index("ix_tickets_status", table_name="tickets")
    op.drop_index("ix_tickets_queue_id", table_name="tickets")
    op.drop_table("tickets")

    op.drop_index("ix_queues_business_id", table_name="queues")
    op.drop_table("queues")

    op.drop_index("ix_businesses_phone", table_name="businesses")
    op.drop_table("businesses")

    sa.Enum(name="ticket_status").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="ticket_source").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="queue_status").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="business_type").drop(op.get_bind(), checkfirst=False)
