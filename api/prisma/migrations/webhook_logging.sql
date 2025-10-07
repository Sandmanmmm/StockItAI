-- Webhook logging table for audit and monitoring
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    shop_domain VARCHAR(255) NOT NULL,
    webhook_id VARCHAR(255),
    status VARCHAR(50) NOT NULL, -- 'queued', 'completed', 'failed'
    payload JSONB,
    headers JSONB,
    error TEXT,
    job_id VARCHAR(255),
    processing_time INTEGER, -- in milliseconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_shop_domain ON webhook_logs(shop_domain);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);

-- Webhook statistics view
CREATE OR REPLACE VIEW webhook_statistics AS
SELECT 
    event_type,
    shop_domain,
    COUNT(*) as total_webhooks,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_webhooks,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_webhooks,
    ROUND(
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*) * 100, 2
    ) as success_rate,
    AVG(processing_time) as avg_processing_time,
    MAX(created_at) as last_webhook_at
FROM webhook_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY event_type, shop_domain
ORDER BY total_webhooks DESC;