"""The About page's donate section: shown to everyone, edited only by the owner (OWNER_ID).

Donations are voluntary, handled entirely outside the app, and give nothing in return.
"""

import json

from app.db import Database, utc_now
from app.models import AboutOut, AboutUpdate, DonateOption
from app.services.errors import PermissionDeniedError


async def get_about(db: Database) -> AboutOut:
    async with db.conn.execute(
        "SELECT donate_note, donate_options, updated_at FROM about WHERE id = 1"
    ) as cursor:
        row = await cursor.fetchone()
    if row is None:
        return AboutOut(donate_note="", donate_options=[], updated_at=None)
    options = [DonateOption.model_validate(item) for item in json.loads(row["donate_options"])]
    return AboutOut(
        donate_note=row["donate_note"], donate_options=options, updated_at=row["updated_at"]
    )


async def update_about(
    db: Database, actor_id: int, owner_id: int | None, data: AboutUpdate
) -> AboutOut:
    """Replace the donate section. Only the owner may, not other admins."""
    if owner_id is None or actor_id != owner_id:
        raise PermissionDeniedError("owner_only")
    options = json.dumps(
        [option.model_dump() for option in data.donate_options], ensure_ascii=False
    )
    async with db.transaction() as conn:
        await conn.execute(
            """
            INSERT INTO about (id, donate_note, donate_options, updated_at) VALUES (1, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                donate_note = excluded.donate_note,
                donate_options = excluded.donate_options,
                updated_at = excluded.updated_at
            """,
            (data.donate_note, options, utc_now()),
        )
    return await get_about(db)
