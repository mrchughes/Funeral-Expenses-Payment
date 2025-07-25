#!/bin/bash
# Script to clean out user uploads and ensure a blank database for testing

echo "=== Starting complete data cleanup process ==="

# Change to the script directory
cd "$(dirname "$0")"

# Clear the database
echo "Clearing MongoDB database..."
node ./clear_db.js

# Clean the uploads directory (if any files exist)
UPLOADS_DIR="../mern-app/backend/uploads/evidence"
echo "Cleaning uploads directory: $UPLOADS_DIR"
if [ -d "$UPLOADS_DIR" ]; then
    # Remove all files but keep the directory structure
    find "$UPLOADS_DIR" -type f -delete
    echo "Uploads directory cleaned"
else
    echo "Uploads directory not found, creating it..."
    mkdir -p "$UPLOADS_DIR"
fi

# Restart the containers for a clean state
echo "Would you like to restart the application containers? (y/n)"
read -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Restarting containers..."
    cd .. && docker-compose restart backend frontend
    echo "Containers restarted"
fi

echo "=== Data cleanup completed ==="
echo "The system is now ready for testing with a blank database and clean file storage."
