/**
 * Job Alert Banner Component for Shopify PO Sync Pro
 * Displays alert notifications for job failures that can be embedded anywhere
 */

import React, { useState } from 'react'
import { Banner, Button, Modal, Text, LegacyStack as Stack, Badge } from '@shopify/polaris'
import { RefreshIcon, ViewIcon } from '@shopify/polaris-icons'
import { useJobAlerts, useJobActions } from '../hooks/useJobStatus'

export function JobAlertBanner() {
  const { alerts, summary, loading, refetch } = useJobAlerts()
  const { loading: actionsLoading, retryAllFailedJobs } = useJobActions()
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  if (loading || !alerts || alerts.length === 0) {
    return null
  }

  // Show only critical and high priority alerts
  const criticalAlerts = alerts.filter(alert => 
    alert.severity === 'critical' || alert.severity === 'high'
  )

  if (criticalAlerts.length === 0) {
    return null
  }

  const handleRetryAll = async () => {
    const result = await retryAllFailedJobs()
    if (result.success) {
      refetch() // Refresh alerts after retry
    }
    setShowRetryModal(false)
  }

  // Get the most critical alert to display
  const mainAlert = criticalAlerts[0]

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <Banner
          tone={mainAlert.type === 'critical' ? 'critical' : 'warning'}
          title={mainAlert.title}
          action={{
            content: mainAlert.action?.label || 'Retry Failed Jobs',
            onAction: () => {
              if (mainAlert.id === 'failed-jobs' || mainAlert.id === 'dead-letter-jobs') {
                setShowRetryModal(true)
              } else {
                setShowDetailsModal(true)
              }
            }
          }}
          secondaryAction={criticalAlerts.length > 1 ? {
            content: `View All (${criticalAlerts.length})`,
            onAction: () => setShowDetailsModal(true)
          } : {
            content: 'View Details',
            onAction: () => setShowDetailsModal(true)
          }}
        >
          <p>{mainAlert.message}</p>
          {criticalAlerts.length > 1 && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.8 }}>
              Plus {criticalAlerts.length - 1} more alert{criticalAlerts.length > 2 ? 's' : ''}
            </p>
          )}
        </Banner>
      </div>

      {/* Retry Confirmation Modal */}
      <Modal
        open={showRetryModal}
        onClose={() => setShowRetryModal(false)}
        title="Retry Failed Jobs"
        primaryAction={{
          content: 'Retry All',
          onAction: handleRetryAll,
          loading: actionsLoading
        }}
        secondaryActions={[{
          content: 'Cancel',
          onAction: () => setShowRetryModal(false)
        }]}
      >
        <Modal.Section>
          <Stack vertical>
            <Text as="p">
              This will retry all failed and dead letter jobs. Failed jobs will be re-queued with high priority.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This action cannot be undone. Jobs that fail again will be moved to the dead letter queue.
            </Text>
          </Stack>
        </Modal.Section>
      </Modal>

      {/* Alert Details Modal */}
      <Modal
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Job Alerts"
        primaryAction={{
          content: 'View Full Dashboard',
          onAction: () => {
            setShowDetailsModal(false)
            // Navigate to job status dashboard - adjust based on your routing
            console.log('Navigate to job status dashboard')
          }
        }}
        secondaryActions={[{
          content: 'Close',
          onAction: () => setShowDetailsModal(false)
        }]}
      >
        <Modal.Section>
          <Stack vertical spacing="loose">
            {criticalAlerts.map((alert) => (
              <div key={alert.id} style={{ padding: '1rem', border: '1px solid #e1e3e5', borderRadius: '4px' }}>
                <Stack alignment="center">
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {alert.title}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {alert.message}
                    </Text>
                  </div>
                  <div>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {alert.count} jobs
                    </Text>
                  </div>
                </Stack>
              </div>
            ))}
          </Stack>
        </Modal.Section>
      </Modal>
    </>
  )
}

/**
 * Compact Job Status Widget for embedding in dashboards
 */
export function JobStatusWidget() {
  const { summary, loading, error } = useJobAlerts()

  if (loading || error || !summary) {
    return null
  }

  const hasIssues = summary.hasIssues
  const criticalCount = summary.criticalAlerts
  const totalCount = summary.totalAlerts

  if (!hasIssues) {
    return (
      <div style={{ 
        padding: '0.75rem 1rem', 
        backgroundColor: '#f6f6f7', 
        borderRadius: '4px',
        border: '1px solid #e1e3e5'
      }}>
        <Stack alignment="center">
          <Text as="span" variant="bodySm" tone="success">
            ✅ All systems operational
          </Text>
          <Button 
            size="micro" 
            icon={ViewIcon}
            onClick={() => console.log('Navigate to job status')}
          >
            View
          </Button>
        </Stack>
      </div>
    )
  }

  return (
    <div style={{ 
      padding: '0.75rem 1rem', 
      backgroundColor: criticalCount > 0 ? '#fef7f0' : '#fef9e7', 
      borderRadius: '4px',
      border: `1px solid ${criticalCount > 0 ? '#f5c6cb' : '#ffeaa7'}`
    }}>
      <Stack alignment="center">
        <Text as="span" variant="bodySm" tone="subdued">
          {criticalCount > 0 ? '🚨' : '⚠️'} {totalCount} job issue{totalCount > 1 ? 's' : ''}
          {criticalCount > 0 && ` (${criticalCount} critical)`}
        </Text>
        <Button 
          size="micro" 
          icon={ViewIcon}
          onClick={() => console.log('Navigate to job status')}
        >
          View
        </Button>
      </Stack>
    </div>
  )
}

/**
 * Inline Job Status for Purchase Order Details
 */
interface PurchaseOrderJobStatusProps {
  purchaseOrderId: string
  compact?: boolean
}

export function PurchaseOrderJobStatus({ 
  purchaseOrderId, 
  compact = false 
}: PurchaseOrderJobStatusProps) {
  // This would typically use usePurchaseOrderJobs hook
  // For now, showing a placeholder implementation
  
  if (compact) {
    return (
      <div style={{ display: 'inline-block', marginLeft: '0.5rem' }}>
        <Badge tone="info">Processing</Badge>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <Text as="h4" variant="headingSm">Job Status</Text>
      <div style={{ marginTop: '0.5rem' }}>
        <Stack spacing="tight">
          <Badge tone="info">Analysis: Complete</Badge>
          <Badge>Sync: Processing</Badge>
        </Stack>
      </div>
    </div>
  )
}