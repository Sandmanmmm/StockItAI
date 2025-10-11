-- CreateTable
CREATE TABLE IF NOT EXISTS "performance_metrics" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "resultCount" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_metrics_merchantId_operation_createdAt_idx" ON "performance_metrics"("merchantId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "performance_metrics_engine_operation_idx" ON "performance_metrics"("engine", "operation");

-- CreateIndex
CREATE INDEX "performance_metrics_operation_createdAt_idx" ON "performance_metrics"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "performance_metrics_createdAt_idx" ON "performance_metrics"("createdAt");

-- Add comment
COMMENT ON TABLE "performance_metrics" IS 'Performance metrics for monitoring and optimization. Tracks execution time and success rates of supplier matching operations.';
