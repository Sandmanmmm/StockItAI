-- Add job tracking fields to PurchaseOrder table
-- This enables tracking of async job processing status

ALTER TABLE "PurchaseOrder" 
ADD COLUMN "analysisJobId" TEXT,
ADD COLUMN "syncJobId" TEXT,
ADD COLUMN "jobStatus" TEXT DEFAULT 'pending',
ADD COLUMN "jobStartedAt" TIMESTAMP(3),
ADD COLUMN "jobCompletedAt" TIMESTAMP(3),
ADD COLUMN "jobError" TEXT;

-- Create indexes for job tracking queries
CREATE INDEX "PurchaseOrder_analysisJobId_idx" ON "PurchaseOrder"("analysisJobId");
CREATE INDEX "PurchaseOrder_syncJobId_idx" ON "PurchaseOrder"("syncJobId");
CREATE INDEX "PurchaseOrder_jobStatus_idx" ON "PurchaseOrder"("jobStatus");

-- Comments for clarity
COMMENT ON COLUMN "PurchaseOrder"."analysisJobId" IS 'Redis job ID for PO analysis processing';
COMMENT ON COLUMN "PurchaseOrder"."syncJobId" IS 'Redis job ID for Shopify sync operations';
COMMENT ON COLUMN "PurchaseOrder"."jobStatus" IS 'Current job processing status: pending, processing, completed, failed';
COMMENT ON COLUMN "PurchaseOrder"."jobStartedAt" IS 'Timestamp when job processing started';
COMMENT ON COLUMN "PurchaseOrder"."jobCompletedAt" IS 'Timestamp when job processing completed';
COMMENT ON COLUMN "PurchaseOrder"."jobError" IS 'Error message if job failed';