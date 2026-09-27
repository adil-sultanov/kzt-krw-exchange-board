"""Limits the board to members of one Telegram group chat (`GROUP_ID`).

The bot only asks Telegram whether a user is in the group: it never posts there or reads
the group's messages. Non-members get no user row. Admins from `ADMIN_IDS` / `OWNER_ID` are
always allowed, so a misconfigured group can't lock the owner out.
"""

import logging
import time
from typing import Protocol

from app.services.errors import PermissionDeniedError, UnavailableError

logger = logging.getLogger(__name__)

# A confirmed member isn't asked about again for this long. Leaving the group ends access at
# once (the bot hears about it, see `forget`); this is the fallback if that update is missed.
# Non-members aren't cached: joining works on the next try.
MEMBER_CACHE_SECONDS = 10 * 60


class MemberLookup(Protocol):
    async def __call__(self, group_id: int, user_id: int) -> bool:
        """Whether the user is in the group. Raises if Telegram can't be asked."""


class Membership:
    def __init__(self, group_id: int | None, lookup: MemberLookup | None) -> None:
        self.group_id = group_id
        self._lookup = lookup
        # user_id -> when the membership was last confirmed (monotonic seconds)
        self._confirmed: dict[int, float] = {}

    async def is_allowed(self, user_id: int, *, config_admin: bool) -> bool:
        if self.group_id is None or config_admin:
            return True
        confirmed = self._confirmed.get(user_id)
        if confirmed is not None and time.monotonic() - confirmed < MEMBER_CACHE_SECONDS:
            return True
        if self._lookup is None:
            logger.error("GROUP_ID is set but the bot is off, so membership can't be checked")
            raise UnavailableError("membership_check_failed")
        try:
            member = await self._lookup(self.group_id, user_id)
        except Exception:
            logger.exception("Group membership check failed")
            # Telegram is unreachable: a recent member keeps access rather than being locked out.
            if confirmed is not None:
                return True
            raise UnavailableError("membership_check_failed") from None
        if member:
            self._confirmed[user_id] = time.monotonic()
        else:
            self._confirmed.pop(user_id, None)
        return member

    def forget(self, user_id: int) -> None:
        """Their membership changed: ask Telegram again on their next request."""
        self._confirmed.pop(user_id, None)

    async def require(self, user_id: int, *, config_admin: bool) -> None:
        if not await self.is_allowed(user_id, config_admin=config_admin):
            raise PermissionDeniedError("not_group_member")
