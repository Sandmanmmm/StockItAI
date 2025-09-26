/**
 * Merchant Dashboard Component
 * 
 * Demonstrates the merchant-facing error handling and transparency features
 */

import React, { useState, useEffect } from 'react'

interface Workflow {
  workflowId: string
  status: string
  message: string
  icon: string
  confidence?: number
  requiresAction: boolean
  canRetry: boolean
  actionNeeded?: string
  lastUpdated: string
  createdAt: string
}

const MerchantDashboard = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkflows()
  }, [])

  const fetchWorkflows = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/merchant/status')
      const data = await response.json()
      
      if (data.success) {
        setWorkflows(data.workflows)
      } else {
        setError(data.message)
      }
    } catch (err) {
      setError('Failed to load workflows')
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (workflowId) => {
    try {
      const response = await fetch(`/api/merchant/retry/${workflowId}`, {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        alert('✅ Retry initiated successfully!')
        await fetchWorkflows() // Refresh the list
      } else {
        alert(`❌ Retry failed: ${data.message}`)
      }
    } catch (err) {
      alert('❌ Failed to initiate retry')
    }
  }

  const handleApprove = async (workflowId, approvedData) => {
    try {
      const response = await fetch(`/api/merchant/approve/${workflowId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          approvedData,
          notes: 'Approved by merchant'
        })
      })
      const data = await response.json()
      
      if (data.success) {
        alert('✅ Workflow approved successfully!')
        await fetchWorkflows() // Refresh the list
      } else {
        alert(`❌ Approval failed: ${data.message}`)
      }
    } catch (err) {
      alert('❌ Failed to approve workflow')
    }
  }

  const getStatusBadgeClass = (status) => {
    const baseClass = 'px-3 py-1 rounded-full text-sm font-medium '
    
    switch (status) {
      case 'completed':
        return baseClass + 'bg-green-100 text-green-800'
      case 'review_needed':
        return baseClass + 'bg-yellow-100 text-yellow-800'
      case 'denied':
        return baseClass + 'bg-red-100 text-red-800'
      case 'failed':
        return baseClass + 'bg-red-100 text-red-800'
      case 'retrying':
        return baseClass + 'bg-blue-100 text-blue-800'
      case 'processing':
      default:
        return baseClass + 'bg-gray-100 text-gray-800'
    }
  }

  const WorkflowStatusCard = ({ workflow }: { workflow: Workflow }) => (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Workflow {workflow.workflowId}
        </h3>
        <span className={getStatusBadgeClass(workflow.status)}>
          {workflow.icon} {workflow.status.replace('_', ' ').toUpperCase()}
        </span>
      </div>
      
      <div className="mb-4">
        <p className="text-gray-700 mb-2">{workflow.message}</p>
        
        {workflow.confidence && (
          <div className="mb-2">
            <span className="text-sm text-gray-600">AI Confidence: </span>
            <div className="inline-block w-32 bg-gray-200 rounded-full h-2 ml-2">
              <div 
                className={`h-2 rounded-full ${
                  workflow.confidence >= 0.9 ? 'bg-green-500' :
                  workflow.confidence >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${workflow.confidence * 100}%` }}
              />
            </div>
            <span className="text-sm text-gray-600 ml-2">
              {(workflow.confidence * 100).toFixed(1)}%
            </span>
          </div>
        )}
        
        {workflow.lastUpdated && (
          <p className="text-sm text-gray-500">
            Last updated: {new Date(workflow.lastUpdated).toLocaleString()}
          </p>
        )}
      </div>
      
      <div className="flex gap-2">
        {workflow.requiresAction && workflow.status === 'review_needed' && (
          <button
            onClick={() => setSelectedWorkflow(workflow)}
            className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors"
          >
            📋 Review & Approve
          </button>
        )}
        
        {workflow.canRetry && workflow.status === 'failed' && (
          <button
            onClick={() => handleRetry(workflow.workflowId)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            🔄 Retry
          </button>
        )}
        
        <button
          onClick={() => setSelectedWorkflow(workflow)}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
        >
          📊 View Details
        </button>
      </div>
    </div>
  )

  const WorkflowDetailsModal = ({ workflow, onClose }: { workflow: Workflow | null, onClose: () => void }) => {
    if (!workflow) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Workflow Details</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">Status</h3>
              <p className="text-gray-700">{workflow.icon} {workflow.message}</p>
            </div>
            
            {workflow.confidence && (
              <div>
                <h3 className="font-semibold text-gray-900">AI Confidence</h3>
                <div className="flex items-center gap-2">
                  <div className="w-48 bg-gray-200 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full ${
                        workflow.confidence >= 0.9 ? 'bg-green-500' :
                        workflow.confidence >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${workflow.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600">
                    {(workflow.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {workflow.confidence >= 0.9 ? 'High confidence - Auto-approved' :
                   workflow.confidence >= 0.7 ? 'Medium confidence - Review recommended' :
                   'Low confidence - Manual review required'}
                </p>
              </div>
            )}
            
            {workflow.actionNeeded && (
              <div>
                <h3 className="font-semibold text-gray-900">Action Needed</h3>
                <p className="text-gray-700">{workflow.actionNeeded}</p>
              </div>
            )}
            
            <div>
              <h3 className="font-semibold text-gray-900">Timeline</h3>
              <p className="text-sm text-gray-600">
                Created: {new Date(workflow.createdAt).toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">
                Updated: {new Date(workflow.lastUpdated).toLocaleString()}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 mt-6">
            {workflow.requiresAction && workflow.status === 'review_needed' && (
              <button
                onClick={() => {
                  // In a real app, this would open a review interface
                  const mockApprovedData = { approved: true }
                  handleApprove(workflow.workflowId, mockApprovedData)
                  onClose()
                }}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
              >
                ✅ Approve
              </button>
            )}
            
            {workflow.canRetry && workflow.status === 'failed' && (
              <button
                onClick={() => {
                  handleRetry(workflow.workflowId)
                  onClose()
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                🔄 Retry
              </button>
            )}
            
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading workflows...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <h3 className="font-bold">Error</h3>
        <p>{error}</p>
        <button
          onClick={fetchWorkflows}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Purchase Order Processing Dashboard
        </h1>
        <p className="text-gray-600">
          Monitor your purchase order uploads and processing status
        </p>
      </div>

      {/* Status Legend */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Status Guide</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <span><strong>Synced:</strong> Successfully processed</span>
          </div>
          <div className="flex items-center">
            <span className="text-yellow-600 mr-2">⚠️</span>
            <span><strong>Review:</strong> Needs your attention</span>
          </div>
          <div className="flex items-center">
            <span className="text-red-600 mr-2">❌</span>
            <span><strong>Failed:</strong> Error occurred</span>
          </div>
          <div className="flex items-center">
            <span className="text-blue-600 mr-2">🔄</span>
            <span><strong>Retrying:</strong> Attempting again</span>
          </div>
        </div>
      </div>

      {/* Workflows List */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Workflows ({workflows.length})
          </h2>
          <button
            onClick={fetchWorkflows}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
        
        {workflows.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-600 mb-4">No workflows found</p>
            <p className="text-sm text-gray-500">
              Upload a purchase order to get started
            </p>
          </div>
        ) : (
          workflows.map((workflow) => (
            <WorkflowStatusCard key={workflow.workflowId} workflow={workflow} />
          ))
        )}
      </div>

      {/* Details Modal */}
      <WorkflowDetailsModal
        workflow={selectedWorkflow}
        onClose={() => setSelectedWorkflow(null)}
      />
    </div>
  )
}

export default MerchantDashboard