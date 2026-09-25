"""User records and the username cache."""

from app.db import Database, utc_now
from app.models import TelegramUser, User


async def upsert_user(db: Database, tg_user: TelegramUser, *, is_admin: bool) -> User:
    """Create or refresh a user from verified Telegram data.

    Called on every API request and bot update. Usernames are a cache: if another
    row still holds this username (Telegram usernames are case-insensitive), that
    row's username is cleared, since the name now belongs to this user.
    """
    now = utc_now()
    username = tg_user.username or None
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
                is_admin = excluded.is_admin,
                updated_at = excluded.updated_at
            WHERE username IS NOT excluded.username
                OR first_name IS NOT excluded.first_name
                OR is_admin IS NOT excluded.is_admin
            """,
            (tg_user.id, username, tg_user.first_name, int(is_admin), now, now),
        )
        async with conn.execute(
            "SELECT * FROM users WHERE telegram_id = ?", (tg_user.id,)
        ) as cursor:
            row = await cursor.fetchone()
    assert row is not None
    return User.from_row(row)
