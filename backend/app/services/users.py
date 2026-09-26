"""User records and the username cache."""

from app.db import Database, utc_now
from app.models import MeUpdate, TelegramUser, User


async def upsert_user(db: Database, tg_user: TelegramUser, *, config_admin: bool) -> User:
    """Create or refresh a user from verified Telegram data.

    Called on every API request and bot update. Usernames are a cache: if another
    row still holds this username (Telegram usernames are case-insensitive), that
    row's username is cleared, since the name now belongs to this user.

    `config_admin`: whether ADMIN_IDS / OWNER_ID make them an admin. Admins the owner added
    in the app (`admin_granted`) stay admins either way.
    """
    username = tg_user.username or None
    # Most calls change nothing (the app polls while open), so they skip the write lock.
    # A row that already holds this username needs no clearing of others: whoever took
    # the name last cleared it everywhere else.
    async with db.conn.execute(
        "SELECT * FROM users WHERE telegram_id = ?", (tg_user.id,)
    ) as cursor:
        current = await cursor.fetchone()
    if current is not None and (
        current["username"] == username
        and current["first_name"] == tg_user.first_name
        and bool(current["is_admin"]) == (config_admin or bool(current["admin_granted"]))
    ):
        return User.from_row(current)

    now = utc_now()
    async with db.transaction() as conn:
        if username is not None:
            await conn.execute(
                "UPDATE users SET username = NULL, updated_at = ? "
                "WHERE username = ? COLLATE NOCASE AND telegram_id != ?",
                (now, username, tg_user.id),
            )
        # The WHERE clause skips the write (and the updated_at bump) when nothing changed.
        await conn.execute(
            """
            INSERT INTO users (telegram_id, username, first_name, is_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (telegram_id) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name,
                is_admin = MAX(excluded.is_admin, admin_granted),
                updated_at = excluded.updated_at
            WHERE username IS NOT excluded.username
                OR first_name IS NOT excluded.first_name
                OR is_admin IS NOT MAX(excluded.is_admin, admin_granted)
            """,
            (tg_user.id, username, tg_user.first_name, int(config_admin), now, now),
        )
        async with conn.execute(
            "SELECT * FROM users WHERE telegram_id = ?", (tg_user.id,)
        ) as cursor:
            row = await cursor.fetchone()
    assert row is not None
    return User.from_row(row)


async def update_receiving_details(db: Database, user_id: int, update: MeUpdate) -> User:
    """Set the fields present in `update`; an empty value clears one."""
    # Column names come from the model's fixed field names, never from input.
    fields = {name: getattr(update, name) or None for name in update.model_fields_set}
    async with db.transaction() as conn:
        if fields:
            assignments = ", ".join(f"{name} = :{name}" for name in sorted(fields))
            await conn.execute(
                f"UPDATE users SET {assignments}, updated_at = :now WHERE telegram_id = :id",
                {**fields, "now": utc_now(), "id": user_id},
            )
        async with conn.execute("SELECT * FROM users WHERE telegram_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
    assert row is not None
    return User.from_row(row)
