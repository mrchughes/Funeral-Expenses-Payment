#!/bin/bash

# WebSocket Testing Toolkit
# This script helps set up and run WebSocket testing for the document processing system

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PORT=4007
MODE="interactive"

# Display script header
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Document Processing WebSocket Test Tool ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo

# Function to display help
show_help() {
    echo -e "Usage: $0 [options]"
    echo
    echo -e "Options:"
    echo -e "  -m, --mode MODE     Set mode: 'server', 'client', or 'both' (default: interactive)"
    echo -e "  -p, --port PORT     Set WebSocket server port (default: 4007)"
    echo -e "  -h, --help          Show this help message"
    echo
    echo -e "Modes:"
    echo -e "  server    - Start only the WebSocket test server"
    echo -e "  client    - Start only the WebSocket test client"
    echo -e "  both      - Start both server and client"
    echo -e "  browser   - Open the WebSocket debug client in the default browser"
    echo -e "  interactive - Ask what to start (default)"
    echo
}

# Function to check required dependencies
check_dependencies() {
    echo -e "${BLUE}Checking dependencies...${NC}"
    
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        echo "Please install Node.js before running this script"
        exit 1
    fi
    
    # Check for npm and ws package
    if ! npm list ws &> /dev/null; then
        echo -e "${YELLOW}Warning: WebSocket (ws) package not found. Installing...${NC}"
        npm install ws --no-save
    fi
    
    echo -e "${GREEN}All dependencies satisfied${NC}"
    echo
}

# Function to start the WebSocket server
start_server() {
    echo -e "${BLUE}Starting WebSocket test server on port $PORT...${NC}"
    node websocket-test-server.js &
    SERVER_PID=$!
    echo -e "${GREEN}Server started with PID: $SERVER_PID${NC}"
    echo -e "Use Ctrl+C to stop the server when done"
    echo
}

# Function to start the WebSocket client
start_client() {
    echo -e "${BLUE}Starting WebSocket test client...${NC}"
    node websocket-test-client.js
}

# Function to open browser debug client
open_browser() {
    echo -e "${BLUE}Opening WebSocket debug client in browser...${NC}"
    
    # Check if server is running
    if ! nc -z localhost $PORT &>/dev/null; then
        echo -e "${YELLOW}WebSocket server does not appear to be running on port $PORT.${NC}"
        echo -e "Starting server in the background..."
        start_server
        sleep 2
    fi
    
    # Open in browser based on platform
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "http://localhost:$PORT"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "http://localhost:$PORT"
    else
        echo -e "${YELLOW}Couldn't automatically open browser. Please open this URL manually:${NC}"
        echo -e "http://localhost:$PORT"
    fi
    
    echo -e "${GREEN}Debug client should be opening in your browser${NC}"
    echo
}

# Function for interactive mode
interactive_mode() {
    echo "What would you like to do?"
    echo "1) Start WebSocket test server"
    echo "2) Start WebSocket test client (command line)"
    echo "3) Open browser debug client"
    echo "4) Start both server and client"
    echo "5) Exit"
    
    read -p "Enter your choice [1-5]: " choice
    
    case $choice in
        1)
            start_server
            # Wait for server to be terminated
            wait $SERVER_PID
            ;;
        2)
            start_client
            ;;
        3)
            open_browser
            # Keep script running until Ctrl+C
            echo "Press Ctrl+C to exit"
            while true; do sleep 1; done
            ;;
        4)
            start_server
            start_client
            # Once client exits, kill server
            kill $SERVER_PID 2>/dev/null
            ;;
        5)
            echo -e "${BLUE}Exiting${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Please try again.${NC}"
            interactive_mode
            ;;
    esac
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -m|--mode)
            MODE="$2"
            shift
            shift
            ;;
        -p|--port)
            PORT="$2"
            shift
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Check dependencies
check_dependencies

# Execute mode
case $MODE in
    server)
        start_server
        # Wait for server to be terminated
        wait $SERVER_PID
        ;;
    client)
        start_client
        ;;
    both)
        start_server
        start_client
        # Once client exits, kill server
        kill $SERVER_PID 2>/dev/null
        ;;
    browser)
        open_browser
        # Keep script running until Ctrl+C
        echo "Press Ctrl+C to exit"
        while true; do sleep 1; done
        ;;
    interactive)
        interactive_mode
        ;;
    *)
        echo -e "${RED}Invalid mode: $MODE${NC}"
        show_help
        exit 1
        ;;
esac

# Clean up on exit
trap "echo -e '${BLUE}Shutting down...${NC}'; kill $SERVER_PID 2>/dev/null" EXIT
