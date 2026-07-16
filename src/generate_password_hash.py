"""Generate a password hash for APP_PASSWORD_HASH."""

from __future__ import annotations

from getpass import getpass

from src.auth import hash_password


def main() -> None:
    password = getpass("Enter password for MyOS: ").strip()
    confirm = getpass("Confirm password: ").strip()

    if not password:
        raise SystemExit("Password cannot be empty.")
    if password != confirm:
        raise SystemExit("Passwords did not match.")

    print(hash_password(password))


if __name__ == "__main__":
    main()
