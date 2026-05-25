"""Phase 9 — in-memory login rate limiting + temporary lockout.

Lenient by design and intentionally in-memory: a backend restart clears all
lockouts, so it can never permanently lock the local admin out. Tunable via env.

Flow per identifier (e.g. "staff:yaso|127.0.0.1"):
- record_failure() appends a timestamp; once failures within the window reach
  LOGIN_MAX_ATTEMPTS the key is locked for LOCKOUT_SECONDS (auto-expires).
- record_success() / unlock() clears everything for the key.
- check_locked() returns remaining lock seconds (or 0).
"""
import os
import threading
import time

LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
LOCKOUT_SECONDS = int(os.environ.get("LOCKOUT_MINUTES", "5")) * 60
WINDOW_SECONDS = int(os.environ.get("LOGIN_WINDOW_MINUTES", "5")) * 60

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}   # key -> recent failure timestamps
_locked_until: dict[str, float] = {}     # key -> epoch when lock lifts


def make_key(scope: str, identifier: str, ip: str | None) -> str:
    return f"{scope}:{(identifier or '').strip().lower()}|{ip or '-'}"


def check_locked(key: str) -> int:
    """Seconds remaining on an active lock, or 0 if not locked."""
    now = time.time()
    with _lock:
        until = _locked_until.get(key)
        if until and until > now:
            return int(until - now) + 1
        if until:
            _locked_until.pop(key, None)  # expired
        return 0


def record_failure(key: str) -> int:
    """Register a failed attempt. Returns lock seconds if this trips a lockout, else 0."""
    now = time.time()
    with _lock:
        times = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
        times.append(now)
        _failures[key] = times
        if len(times) >= LOGIN_MAX_ATTEMPTS:
            _locked_until[key] = now + LOCKOUT_SECONDS
            _failures[key] = []
            return LOCKOUT_SECONDS
        return 0


def record_success(key: str):
    with _lock:
        _failures.pop(key, None)
        _locked_until.pop(key, None)


def unlock(key_substring: str = "") -> int:
    """Clear lockouts/failures. With a substring, only matching keys; empty = all.
    Returns number of keys cleared. (Admin escape hatch.)"""
    with _lock:
        keys = set(_failures) | set(_locked_until)
        target = [k for k in keys if not key_substring or key_substring.lower() in k]
        for k in target:
            _failures.pop(k, None)
            _locked_until.pop(k, None)
        return len(target)
