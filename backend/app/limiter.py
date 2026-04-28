"""Single shared slowapi Limiter instance.

Lives in its own module so route files (api/auth.py, api/tickets.py) can
attach @limiter.limit(...) decorators without circular-importing app.main.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Per-IP key. If we move behind a trusted proxy, switch to a key_func that
# reads X-Forwarded-For only after CORS/proxy validation — `get_remote_address`
# uses the immediate peer, which is safe behind a single proxy hop.
limiter = Limiter(key_func=get_remote_address, default_limits=[])
