#!/bin/bash

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting chat interface application in container...${NC}"

# Start Python server
echo -e "${YELLOW}Starting Python server on port 8444...${NC}"
python3 server.py &
PYTHON_PID=$!
echo -e "${GREEN}Python server started with PID ${PYTHON_PID}.${NC}"

# Start Next.js frontend
echo -e "${YELLOW}Starting Next.js frontend...${NC}"
npm start &
NEXTJS_PID=$!
echo -e "${GREEN}Next.js frontend started with PID ${NEXTJS_PID}.${NC}"

echo -e "${GREEN}All services started. The application is running on port 3000.${NC}"

# Handle termination
function cleanup {
    echo -e "${YELLOW}Shutting down services...${NC}"
    kill $PYTHON_PID $NEXTJS_PID 2>/dev/null
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

trap cleanup INT TERM

# Wait for processes to complete
wait 