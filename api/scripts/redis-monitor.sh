#!/bin/bash
# Redis Monitoring Script

CONTAINER_NAME="redis-po-sync-prod"
LOG_FILE="logs/redis-monitor.log"
ALERT_EMAIL="admin@yourcompany.com"

# Function to log with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a $LOG_FILE
}

# Check if Redis container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    log "CRITICAL: Redis container is not running"
    exit 1
fi

# Get Redis info
REDIS_INFO=$(docker exec $CONTAINER_NAME redis-cli info)
MEMORY_USED=$(echo "$REDIS_INFO" | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
CONNECTED_CLIENTS=$(echo "$REDIS_INFO" | grep "connected_clients" | cut -d: -f2 | tr -d '\r')
UPTIME=$(echo "$REDIS_INFO" | grep "uptime_in_days" | cut -d: -f2 | tr -d '\r')

# Check memory usage
MEMORY_PERCENT=$(docker exec $CONTAINER_NAME redis-cli info memory | grep used_memory_rss | cut -d: -f2 | tr -d '\r')
if [ "$MEMORY_PERCENT" -gt 1073741824 ]; then  # 1GB
    log "WARNING: High memory usage: $MEMORY_USED"
fi

# Check connection count
if [ "$CONNECTED_CLIENTS" -gt 100 ]; then
    log "WARNING: High connection count: $CONNECTED_CLIENTS"
fi

# Log status
log "STATUS: Memory: $MEMORY_USED, Clients: $CONNECTED_CLIENTS, Uptime: $UPTIME days"

# Check last save time
LAST_SAVE=$(docker exec $CONTAINER_NAME redis-cli lastsave)
CURRENT_TIME=$(date +%s)
SAVE_DIFF=$((CURRENT_TIME - LAST_SAVE))

if [ "$SAVE_DIFF" -gt 3600 ]; then  # 1 hour
    log "WARNING: Last save was $(($SAVE_DIFF / 60)) minutes ago"
fi
