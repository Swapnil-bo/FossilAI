from __future__ import annotations

import asyncio
import time


class AsyncRateLimiter:
    """Async rate limiter with per-minute request tracking and exponential backoff.

    Usage:
        limiter = AsyncRateLimiter(rpm=15, base_backoff=1.0, max_backoff=64.0)
        async with limiter:
            # make your API call
            response = await client.post(...)
        # If you hit a rate limit, call:
        await limiter.backoff()
    """

    def __init__(
        self,
        rpm: int = 15,
        base_backoff: float = 1.0,
        max_backoff: float = 64.0,
    ):
        self._rpm = rpm
        self._base_backoff = base_backoff
        self._max_backoff = max_backoff
        self._min_interval = 60.0 / rpm
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()
        self._consecutive_failures: int = 0
        self._request_times: list[float] = []

    async def __aenter__(self) -> AsyncRateLimiter:
        """Wait until it's safe to make a request (respects RPM)."""
        async with self._lock:
            now = time.monotonic()

            # Purge request timestamps older than 60 seconds
            cutoff = now - 60.0
            self._request_times = [t for t in self._request_times if t > cutoff]

            # If we've hit the RPM limit, wait until the oldest request expires
            if len(self._request_times) >= self._rpm:
                oldest = self._request_times[0]
                wait_time = 60.0 - (now - oldest) + 0.1
                if wait_time > 0:
                    await asyncio.sleep(wait_time)

            # Enforce minimum interval between requests
            elapsed = time.monotonic() - self._last_request_time
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)

            self._last_request_time = time.monotonic()
            self._request_times.append(self._last_request_time)

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        pass

    async def backoff(self) -> None:
        """Sleep with exponential backoff after a rate-limit error."""
        self._consecutive_failures += 1
        delay = min(
            self._base_backoff * (2 ** (self._consecutive_failures - 1)),
            self._max_backoff,
        )
        await asyncio.sleep(delay)

    def reset_backoff(self) -> None:
        """Reset the failure counter after a successful request."""
        self._consecutive_failures = 0

    @property
    def current_backoff_delay(self) -> float:
        """Preview the next backoff delay without sleeping."""
        if self._consecutive_failures == 0:
            return self._base_backoff
        return min(
            self._base_backoff * (2 ** self._consecutive_failures),
            self._max_backoff,
        )
