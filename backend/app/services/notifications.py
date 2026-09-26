"""Bot messages about deals.

Only two events message a user: someone took their request (to the author), and the author
accepted a deal (to the responder). Everything else is shown only in the app.

Notifications are sent after the deal's transaction commits and never block or fail the
request that caused them: a user who blocked the bot still sees everything in the app.
"""

from typing import Protocol

from app.models import DealOut


class Notifier(Protocol):
    def deal_requested(self, author_id: int, deal: DealOut) -> None:
        """Someone took the author's request. `deal` is as the author sees it."""

    def deal_accepted(self, responder_id: int, deal: DealOut) -> None:
        """The author accepted the responder. `deal` is as the responder sees it."""


class NullNotifier:
    """Used when the bot isn't running."""

    def deal_requested(self, author_id: int, deal: DealOut) -> None:
        pass

    def deal_accepted(self, responder_id: int, deal: DealOut) -> None:
        pass
