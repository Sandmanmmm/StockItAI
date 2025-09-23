#!/bin/bash
# Redis Weekly Backup Script

BACKUP_DIR="./backups/redis/weekly"
TIMESTAMP=$(date +%Y%m%d)
CONTAINER_NAME="redis-po-sync-prod"

echo "Starting Redis weekly backup at $(date)"

# Create full backup with verification
docker exec $CONTAINER_NAME redis-cli BGSAVE
sleep 10

# Copy and verify backup
docker cp $CONTAINER_NAME:/data/dump.rdb $BACKUP_DIR/dump_weekly_$TIMESTAMP.rdb
docker cp $CONTAINER_NAME:/data/appendonly.aof $BACKUP_DIR/appendonly_weekly_$TIMESTAMP.aof 2>/dev/null || true

# Create archive
tar -czf $BACKUP_DIR/redis_weekly_$TIMESTAMP.tar.gz -C $BACKUP_DIR dump_weekly_$TIMESTAMP.rdb appendonly_weekly_$TIMESTAMP.aof 2>/dev/null || tar -czf $BACKUP_DIR/redis_weekly_$TIMESTAMP.tar.gz -C $BACKUP_DIR dump_weekly_$TIMESTAMP.rdb

# Clean individual files
rm -f $BACKUP_DIR/dump_weekly_$TIMESTAMP.rdb $BACKUP_DIR/appendonly_weekly_$TIMESTAMP.aof

# Clean old weekly backups (keep 4 weeks)
find $BACKUP_DIR -name "redis_weekly_*.tar.gz" -mtime +28 -delete

echo "Redis weekly backup completed at $(date)"
