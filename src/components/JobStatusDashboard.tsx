/**
 * Job Status Dashboard Component for Shopify PO Sync Pro
 * Provides merchant-facing job visibility with Polaris UI components
 */

import React, { useState } from 'react'
import {
  Card,
  Layout,
  Page,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Spinner,
  Banner,
  Modal,
  Text,
  Tabs,
  ProgressBar,
  Toast,
  Frame,
  LegacyStack as Stack
} from '@shopify/polaris'
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  RefreshIcon,
  DeleteIcon
} from '@shopify/polaris-icons'
import { useJobSummary, useJobsByStatus, useJobActions, useJobAlerts } from '../hooks/useJobStatus'

export function JobStatusDashboard() {
  const [selectedTab, setSelectedTab] = useState(0)
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [toastActive, setToastActive] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const { summary, loading: summaryLoading, error: summaryError, refetch: refetchSummary } = useJobSummary()
  const { alerts, summary: alertsSummary, loading: alertsLoading } = useJobAlerts()
  const { loading: actionsLoading, retryAllFailedJobs } = useJobActions()

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastActive(true)
  }

  const handleRetryAllFailed = async () => {
    const result = await retryAllFailedJobs()
    if (result.success && result.data) {
      showToast(`Retried ${result.data.successful} jobs successfully`)
      refetchSummary()
    } else {
      showToast(result.error || 'Failed to retry jobs')
    }
    setShowRetryModal(false)
  }

  const tabs = [
    { id: 'overview', content: 'Overview' },
    { id: 'processing', content: `Processing (${summary?.status.processing || 0})` },
    { id: 'failed', content: `Failed (${summary?.status.failed || 0})` },
    { id: 'completed', content: `Completed (${summary?.status.completed || 0})` },
    { id: 'dead-letter', content: `Dead Letter (${summary?.status.deadLetterQueue || 0})` }
  ]

  if (summaryLoading) {
    return (
      <Page title="Job Status">
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Spinner size="large" />
          </div>
        </Card>
      </Page>
    )
  }

  if (summaryError) {
    return (
      <Page title="Job Status">
        <Banner tone="critical">
          <p>Error loading job status: {summaryError}</p>
        </Banner>
      </Page>
    )
  }

  const renderOverviewTab = () => (
    <Layout>
      <Layout.Section variant="oneHalf">
        <Card>
          <Text as="h2" variant="headingMd">System Health</Text>
          <div style={{ marginTop: '1rem' }}>
            <Stack alignment="center">
              <Text as="span" variant="headingLg">
                Health Score: {summary?.health.score || 0}%
              </Text>
              <Badge 
                tone={
                  summary?.health.status === 'excellent' ? 'success' :
                  summary?.health.status === 'good' ? 'info' :
                  summary?.health.status === 'warning' ? 'warning' : 'critical'
                }
              >
                {summary?.health.status || 'unknown'}
              </Badge>
            </Stack>
            <div style={{ marginTop: '1rem' }}>
              <ProgressBar progress={summary?.health.score || 0} size="small" />
            </div>
          </div>
        </Card>
      </Layout.Section>
      
      <Layout.Section variant="oneHalf">
        <Card>
          <Text as="h2" variant="headingMd">Job Statistics</Text>
          <div style={{ marginTop: '1rem' }}>
            <Stack vertical spacing="loose">
              <Stack alignment="center">
                <ClockIcon />
                <Text as="span">Processing: {summary?.status.processing || 0}</Text>
              </Stack>
              <Stack alignment="center">
                <CheckCircleIcon />
                <Text as="span">Completed: {summary?.status.completed || 0}</Text>
              </Stack>
              <Stack alignment="center">
                <XCircleIcon />
                <Text as="span">Failed: {summary?.status.failed || 0}</Text>
              </Stack>
              <Stack alignment="center">
                <AlertTriangleIcon />
                <Text as="span">Dead Letter: {summary?.status.deadLetterQueue || 0}</Text>
              </Stack>
            </Stack>
          </div>
        </Card>
      </Layout.Section>

      {alerts && alerts.length > 0 && (
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">Active Alerts</Text>
            <div style={{ marginTop: '1rem' }}>
              <Stack vertical spacing="loose">
                {alerts.map((alert) => (
                  <Banner
                    key={alert.id}
                    tone={
                      alert.type === 'critical' ? 'critical' :
                      alert.type === 'error' ? 'critical' :
                      alert.type === 'warning' ? 'warning' : 'info'
                    }
                    title={alert.title}
                    action={alert.action ? {
                      content: alert.action.label,
                      onAction: () => {
                        if (alert.id === 'failed-jobs' || alert.id === 'dead-letter-jobs') {
                          setShowRetryModal(true)
                        }
                      }
                    } : undefined}
                  >
                    <p>{alert.message}</p>
                  </Banner>
                ))}
              </Stack>
            </div>
          </Card>
        </Layout.Section>
      )}

      {(summary?.status.failed || 0) > 0 && (
        <Layout.Section>
          <Card>
            <Stack alignment="center">
              <Button
                variant="primary"
                icon={RefreshIcon}
                loading={actionsLoading}
                onClick={() => setShowRetryModal(true)}
              >
                Retry All Failed Jobs
              </Button>
              <Text as="span" variant="bodySm" tone="subdued">
                Retry {summary?.status.failed} failed jobs and {summary?.status.deadLetterQueue} dead letter jobs
              </Text>
            </Stack>
          </Card>
        </Layout.Section>
      )}
    </Layout>
  )

  return (
    <Frame>
      <Page 
        title="Job Status Dashboard"
        subtitle="Monitor and manage your PO processing jobs"
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: refetchSummary,
          loading: summaryLoading
        }}
      >
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          <Card>
            {selectedTab === 0 && renderOverviewTab()}
            {selectedTab === 1 && <JobsTable status="processing" />}
            {selectedTab === 2 && <JobsTable status="failed" />}
            {selectedTab === 3 && <JobsTable status="completed" />}
            {selectedTab === 4 && <JobsTable status="dead-letter" />}
          </Card>
        </Tabs>

        <Modal
          open={showRetryModal}
          onClose={() => setShowRetryModal(false)}
          title="Retry Failed Jobs"
          primaryAction={{
            content: 'Retry All',
            onAction: handleRetryAllFailed,
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
                This will retry all failed jobs ({summary?.status.failed}) and 
                dead letter jobs ({summary?.status.deadLetterQueue}).
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Failed jobs will be re-queued with high priority. This action cannot be undone.
              </Text>
            </Stack>
          </Modal.Section>
        </Modal>

        {toastActive && (
          <Toast
            content={toastMessage}
            onDismiss={() => setToastActive(false)}
          />
        )}
      </Page>
    </Frame>
  )
}

interface JobsTableProps {
  status: 'processing' | 'completed' | 'failed' | 'dead-letter'
}

function JobsTable({ status }: JobsTableProps) {
  const { jobs, loading, error, pagination } = useJobsByStatus(status)
  const { retryJob, removeJob, loading: actionsLoading } = useJobActions()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Spinner size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <Banner tone="critical">
        <p>Error loading jobs: {error}</p>
      </Banner>
    )
  }

  if (!jobs || jobs.length === 0) {
    return (
      <EmptyState
        heading={`No ${status} jobs`}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>There are currently no {status} jobs to display.</p>
      </EmptyState>
    )
  }

  const rows = jobs.map((job) => [
    job.id,
    job.purchaseOrderId || 'N/A',
    job.fileName || 'N/A',
    <Badge 
      key={`priority-${job.id}`}
      tone={
        job.priority === 'critical' ? 'critical' :
        job.priority === 'high' ? 'warning' : 'info'
      }
    >
      {job.priority}
    </Badge>,
    job.progress > 0 ? `${job.progress}%` : 'N/A',
    job.attempts > 0 ? `${job.attempts}/${job.maxAttempts}` : 'N/A',
    new Date(job.createdAt).toLocaleString(),
    job.error ? (
      <Text key={`error-${job.id}`} as="span" tone="critical" variant="bodySm">
        {job.error.substring(0, 50)}...
      </Text>
    ) : 'N/A',
    <Stack key={`actions-${job.id}`} spacing="tight">
      {job.canRetry && (
        <Button
          size="micro"
          icon={RefreshIcon}
          loading={actionsLoading && selectedJobId === job.id}
          onClick={async () => {
            setSelectedJobId(job.id)
            await retryJob(job.id)
            setSelectedJobId(null)
          }}
        >
          Retry
        </Button>
      )}
      <Button
        size="micro"
        icon={DeleteIcon}
        variant="primary"
        tone="critical"
        loading={actionsLoading && selectedJobId === job.id}
        onClick={async () => {
          setSelectedJobId(job.id)
          await removeJob(job.id)
          setSelectedJobId(null)
        }}
      >
        Remove
      </Button>
    </Stack>
  ])

  const headings = [
    'Job ID',
    'PO ID',
    'File Name',
    'Priority',
    'Progress',
    'Attempts',
    'Created',
    'Error',
    'Actions'
  ]

  return (
    <DataTable
      columnContentTypes={[
        'text',
        'text',
        'text',
        'text',
        'text',
        'text',
        'text',
        'text',
        'text'
      ]}
      headings={headings}
      rows={rows}
    />
  )
}