#!/bin/bash
# Script to clear user data from MongoDB

echo "=== Starting database cleanup ==="
cd "$(dirname "$0")/.."
node ./scripts/clear_db.js

echo "=== Database cleanup completed ==="
