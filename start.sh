#!/bin/bash
# CP Arena — Start both servers
# Usage: bash start.sh

echo "🚀 Starting CP Arena..."

# Kill any existing servers on ports 8000 and 3001
fuser -k 8000/tcp 2>/dev/null
fuser -k 3001/tcp 2>/dev/null
sleep 0.5

# Start Express backend
echo "▶ Backend API  → http://localhost:3001"
node backend/server.js &
BACKEND_PID=$!

# Start frontend static server (no-cache)
echo "▶ Frontend     → http://localhost:8000"
python3 server.py &
FRONTEND_PID=$!

echo ""
echo "✓ Both servers running."
echo "  Open: http://localhost:8000"
echo ""
echo "  Press Ctrl+C to stop."
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
