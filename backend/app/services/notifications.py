"""Bot messages.

Three events message a user about a deal: someone took their request (to the author), the
author accepted a deal (to the responder), and, once, a side that hasn't confirmed receiving
the money 3 h after the deal was accepted (see deals.remind_unconfirmed). Besides those,
people who turned alerts on get a message about each new request in that Board tab, crossed
out once it leaves the board (see app/services/alerts.py). Everything else is shown only in the app.

Messages are sent after the transaction commits and never block or fail the request that
caused them: a user who blocked the bot still sees everything in the app.
"""

from typing import Protocol

from app.models import DealOut


class Notifier(Protocol):
    def deal_requested(self, author_id: int, deal: DealOut) -> None:
        """Someone took the author's request. `deal` is as the author sees it."""

    def deal_accepted(self, responder_id: int, deal: DealOut) -> None:
        """The author accepted the responder. `deal` is as the responder sees it."""

    def payment_reminder(self, user_id: int, deal: DealOut) -> None:
        """The user hasn't confirmed receiving the money yet. `deal` is as they see it."""

    def request_posted(self, request_id: int) -> None:
        """A new request is on the board: alert whoever has alerts on for its tab."""

    def requests_left_board(self) -> None:
        """Requests may have left the board: cross out the alerts about them."""


class NullNotifier:
    """Used when the bot isn't running."""

    def deal_requested(self, author_id: int, deal: DealOut) -> None:
        pass

    def deal_accepted(self, responder_id: int, deal: DealOut) -> None:
        pass

    def payment_reminder(self, user_id: int, deal: DealOut) -> None:
        pass

    def request_posted(self, request_id: int) -> None:
        pass

    def requests_left_board(self) -> None:
        pass
