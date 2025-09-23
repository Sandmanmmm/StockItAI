#!/bin/bash
# Redis Daily Backup Script

BACKUP_DIR="./backups/redis/daily"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="redis-po-sync-prod"

echo "Starting Redis backup at $(date)"

# Create RDB backup
docker exec $CONTAINER_NAME redis-cli BGSAVE
sleep 5

# Copy RDB file
docker cp $CONTAINER_NAME:/data/dump.rdb $BACKUP_DIR/dump_$TIMESTAMP.rdb

# Copy AOF file if exists
if docker exec $CONTAINER_NAME test -f /data/appendonly.aof; then
    docker cp $CONTAINER_NAME:/data/appendonly.aof $BACKUP_DIR/appendonly_$TIMESTAMP.aof
fi

# Compress backups
gzip $BACKUP_DIR/dump_$TIMESTAMP.rdb
[ -f $BACKUP_DIR/appendonly_$TIMESTAMP.aof ] && gzip $BACKUP_DIR/appendonly_$TIMESTAMP.aof

# Clean old backups (keep 7 days)
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Redis backup completed at $(date)"
