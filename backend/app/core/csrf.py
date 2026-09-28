import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from ..config import CSRF_COOKIE_NAME, CSRF_HEADER_NAME

CSRF_EXEMPT_PATHS = {
    "/",
    "/csrf",
    "/admin/login",
    "/organizer/login",
    "/organizer/accept-terms",
    "/investigator/login",
    "/setup",
    "/setup/status",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return await call_next(request)

        if request.url.path in CSRF_EXEMPT_PATHS:
            return await call_next(request)

        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)
        if (
            not cookie_token
            or not header_token
            or not secrets.compare_digest(cookie_token, header_token)
        ):
            return JSONResponse(
                status_code=403,
                content={
                    "detail": (
                        "Your session is no longer valid. "
                        "Please refresh the page and sign in again."
                    )
                },
            )

        return await call_next(request)
