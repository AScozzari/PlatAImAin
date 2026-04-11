#!/usr/bin/env python3
"""
Bootstrap the first admin user.

Usage:
    python scripts/create_admin.py
    python scripts/create_admin.py --email admin@example.com --name "Admin"
"""
import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

# Add repo root to path
sys.path.insert(0, str(Path(__file__).parent.parent / "gateway"))

# Load .env file
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


async def run(email: str, name: str, password: str):
    from gateway.config.settings import get_settings
    from gateway.db.postgres import init_db, close_db
    from gateway.services.auth_service import create_admin_user
    from gateway.db.postgres import fetchrow

    settings = get_settings()
    await init_db(settings.database_url)

    # Check if user already exists
    existing = await fetchrow("SELECT id FROM admin_users WHERE email = $1", email)
    if existing:
        print(f"Admin user '{email}' already exists.")
        await close_db()
        return

    user = await create_admin_user(email, password, name)
    print(f"\n✓ Admin user created:")
    print(f"  ID:    {user['id']}")
    print(f"  Email: {user['email']}")
    print(f"  Name:  {user['name']}")
    print(f"\nLogin at your dashboard with these credentials.")

    await close_db()


def main():
    parser = argparse.ArgumentParser(description="Create the first Custom AI admin user")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--name", default="Admin", help="Display name")
    args = parser.parse_args()

    email = args.email or input("Email: ").strip()
    if not email:
        print("Email is required.")
        sys.exit(1)

    name = args.name
    password = getpass.getpass("Password: ")
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    asyncio.run(run(email, name, password))


if __name__ == "__main__":
    main()
