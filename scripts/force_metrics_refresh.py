#!/usr/bin/env python3
"""Force complete metrics refresh for a user."""

import sys
from research_os.services.publication_metrics_service import (
    enqueue_publication_top_metrics_refresh,
)
from research_os.services.publications_analytics_service import (
    enqueue_publications_analytics_recompute,
)
from research_os.db import create_all_tables, session_scope, User


def main() -> int:
    email = "ciarang-c@hotmail.com"
    
    create_all_tables()
    
    # Find user
    with session_scope() as session:
        user = session.query(User).filter(User.email == email).first()
        if not user:
            print(f"✗ User not found: {email}")
            return 1
        user_id = str(user.id)
        print(f"Found user: {user.name} ({user.email})")
        print(f"User ID: {user_id}\n")
    
    # Force refresh top metrics
    print("1. Forcing top metrics refresh...")
    try:
        enqueued = enqueue_publication_top_metrics_refresh(
            user_id=user_id,
            reason="manual_force_refresh",
            force=True,
        )
        if enqueued:
            print("✓ Top metrics refresh enqueued\n")
        else:
            print("⚠ Top metrics refresh already running or failed\n")
    except Exception as e:
        print(f"✗ Top metrics refresh failed: {e}\n")
        return 1
    
    # Force refresh analytics
    print("2. Forcing analytics recompute...")
    try:
        enqueued = enqueue_publications_analytics_recompute(
            user_id=user_id,
            force=True,
            reason="manual_force_refresh",
        )
        if enqueued:
            print("✓ Analytics recompute enqueued\n")
        else:
            print("⚠ Analytics recompute already running or failed\n")
    except Exception as e:
        print(f"✗ Analytics recompute failed: {e}\n")
        return 1
    
    print("✓ All metrics refresh jobs enqueued successfully!")
    print("\nMetrics will update in the background (~30-60 seconds).")
    print("Clear your browser cache or open an incognito window to see fresh data.")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
