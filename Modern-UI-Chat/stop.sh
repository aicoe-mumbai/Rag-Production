#!/bin/bash

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping all chat interface processes...${NC}"

# Kill Python server processes
echo -e "${YELLOW}Stopping Python server processes...${NC}"
pkill -f "python.*server.py" 2>/dev/null && echo -e "${GREEN}Python server processes stopped.${NC}" || echo -e "${RED}No Python server processes found.${NC}"

# Kill Next.js processes
echo -e "${YELLOW}Stopping Next.js processes...${NC}"
pkill -f "node.*next" 2>/dev/null && echo -e "${GREEN}Next.js processes stopped.${NC}" || echo -e "${RED}No Next.js processes found.${NC}"

# Check if port 8444 is still in use
if lsof -i :8444 >/dev/null 2>&1; then
    echo -e "${YELLOW}Port 8444 is still in use. Killing those processes...${NC}"
    lsof -i :8444 | awk 'NR>1 {print $2}' | xargs kill -9
    echo -e "${GREEN}Processes killed.${NC}"
else
    echo -e "${GREEN}Port 8444 is free.${NC}"
fi

echo -e "${GREEN}All processes stopped.${NC}" 