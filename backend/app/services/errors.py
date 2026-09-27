"""Errors raised by services. `code` is the machine code returned to clients.

API routes turn these into `{"detail": code}` responses (see `app.main`); bot handlers
will map the same codes to messages.
"""


class ServiceError(Exception):
    status_code = 400

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class InvalidInputError(ServiceError):
    status_code = 422


class PermissionDeniedError(ServiceError):
    status_code = 403


class NotFoundError(ServiceError):
    status_code = 404


class ConflictError(ServiceError):
    status_code = 409


class RateLimitedError(ServiceError):
    status_code = 429


class UnavailableError(ServiceError):
    status_code = 503
