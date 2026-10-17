from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status)
