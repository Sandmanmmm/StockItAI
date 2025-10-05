/**
 * Enhanced Shopify Webhook Setup and Management
 * Production-ready webhook registration and management
 */

import fetch from 'node-fetch'

export class WebhookManager {
  constructor(shopDomain, accessToken) {
    this.shopDomain = shopDomain
    this.accessToken = accessToken
    this.apiVersion = '2024-10'
    this.baseUrl = `https://${shopDomain}/admin/api/${this.apiVersion}`
  }

  /**
   * Setup all essential webhooks for the application
   */
  async setupEssentialWebhooks(appUrl) {
    const webhooks = [
      {
        topic: 'orders/created',
        address: `${appUrl}/api/webhooks/orders/created`,
        format: 'json'
      },
      {
        topic: 'orders/updated',
        address: `${appUrl}/api/webhooks/orders/updated`,
        format: 'json'
      },
      {
        topic: 'orders/cancelled',
        address: `${appUrl}/api/webhooks/orders/cancelled`,
        format: 'json'
      },
      {
        topic: 'products/create',
        address: `${appUrl}/api/webhooks/products/create`,
        format: 'json'
      },
      {
        topic: 'products/update',
        address: `${appUrl}/api/webhooks/products/update`,
        format: 'json'
      },
      {
        topic: 'inventory_levels/update',
        address: `${appUrl}/api/webhooks/inventory_levels/update`,
        format: 'json'
      },
      {
        topic: 'app/uninstalled',
        address: `${appUrl}/api/webhooks/app/uninstalled`,
        format: 'json'
      }
    ]

    const results = []
    
    for (const webhookConfig of webhooks) {
      try {
        console.log(`🔗 Setting up webhook: ${webhookConfig.topic}`)
        
        // Check if webhook already exists
        const existing = await this.findWebhookByTopic(webhookConfig.topic)
        
        if (existing) {
          console.log(`✅ Webhook already exists: ${webhookConfig.topic}`)
          results.push({
            topic: webhookConfig.topic,
            status: 'exists',
            webhook: existing
          })
          continue
        }
        
        // Create new webhook
        const webhook = await this.createWebhook(webhookConfig)
        
        results.push({
          topic: webhookConfig.topic,
          status: 'created',
          webhook
        })
        
        console.log(`✅ Webhook created: ${webhookConfig.topic}`)
        
      } catch (error) {
        console.error(`❌ Failed to setup webhook ${webhookConfig.topic}:`, error.message)
        
        results.push({
          topic: webhookConfig.topic,
          status: 'failed',
          error: error.message
        })
      }
    }
    
    return {
      success: results.every(r => r.status !== 'failed'),
      results,
      totalWebhooks: webhooks.length,
      successCount: results.filter(r => r.status !== 'failed').length,
      failureCount: results.filter(r => r.status === 'failed').length
    }
  }

  /**
   * Create a single webhook
   */
  async createWebhook(webhookConfig) {
    const response = await fetch(`${this.baseUrl}/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: webhookConfig
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create webhook: ${error}`)
    }

    const data = await response.json()
    return data.webhook
  }

  /**
   * Find existing webhook by topic
   */
  async findWebhookByTopic(topic) {
    const webhooks = await this.listWebhooks()
    return webhooks.find(webhook => webhook.topic === topic)
  }

  /**
   * List all webhooks
   */
  async listWebhooks() {
    const response = await fetch(`${this.baseUrl}/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to list webhooks: ${error}`)
    }

    const data = await response.json()
    return data.webhooks || []
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(webhookId, updates) {
    const response = await fetch(`${this.baseUrl}/webhooks/${webhookId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: updates
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to update webhook: ${error}`)
    }

    const data = await response.json()
    return data.webhook
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId) {
    const response = await fetch(`${this.baseUrl}/webhooks/${webhookId}.json`, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': this.accessToken
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to delete webhook: ${error}`)
    }

    return true
  }

  /**
   * Test webhook connectivity
   */
  async testWebhook(webhookId) {
    try {
      const response = await fetch(`${this.baseUrl}/webhooks/${webhookId}.json`, {
        headers: {
          'X-Shopify-Access-Token': this.accessToken
        }
      })

      if (!response.ok) {
        return {
          success: false,
          error: 'Failed to retrieve webhook'
        }
      }

      const data = await response.json()
      
      return {
        success: true,
        webhook: data.webhook,
        status: 'active'
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Cleanup webhooks (remove all webhooks for this app)
   */
  async cleanupWebhooks() {
    try {
      const webhooks = await this.listWebhooks()
      const results = []
      
      for (const webhook of webhooks) {
        try {
          await this.deleteWebhook(webhook.id)
          results.push({
            id: webhook.id,
            topic: webhook.topic,
            status: 'deleted'
          })
        } catch (error) {
          results.push({
            id: webhook.id,
            topic: webhook.topic,
            status: 'failed',
            error: error.message
          })
        }
      }
      
      return {
        success: true,
        results,
        totalDeleted: results.filter(r => r.status === 'deleted').length
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get webhook health status
   */
  async getWebhookHealth() {
    try {
      const webhooks = await this.listWebhooks()
      const health = {
        totalWebhooks: webhooks.length,
        activeWebhooks: 0,
        configuredTopics: [],
        missingTopics: [],
        status: 'healthy'
      }

      const requiredTopics = [
        'orders/created',
        'orders/updated',
        'orders/cancelled',
        'products/create',
        'products/update',
        'inventory_levels/update',
        'app/uninstalled'
      ]

      // Check configured webhooks
      webhooks.forEach(webhook => {
        health.configuredTopics.push(webhook.topic)
        if (webhook.api_client_id) {
          health.activeWebhooks++
        }
      })

      // Check for missing required webhooks
      health.missingTopics = requiredTopics.filter(
        topic => !health.configuredTopics.includes(topic)
      )

      // Determine overall health status
      if (health.missingTopics.length > 0) {
        health.status = 'incomplete'
      }

      if (health.activeWebhooks === 0) {
        health.status = 'unhealthy'
      }

      return health

    } catch (error) {
      return {
        status: 'error',
        error: error.message
      }
    }
  }
}

/**
 * Setup webhooks for a merchant during OAuth flow
 */
export async function setupMerchantWebhooks(shopDomain, accessToken, appUrl) {
  try {
    const manager = new WebhookManager(shopDomain, accessToken)
    const result = await manager.setupEssentialWebhooks(appUrl)
    
    console.log(`🔗 Webhook setup completed for ${shopDomain}:`)
    console.log(`   ✅ Success: ${result.successCount}/${result.totalWebhooks}`)
    
    if (result.failureCount > 0) {
      console.log(`   ❌ Failed: ${result.failureCount}`)
    }
    
    return result
    
  } catch (error) {
    console.error('Failed to setup merchant webhooks:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

export default WebhookManager