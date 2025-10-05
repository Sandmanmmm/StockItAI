# Shopify Webhook Secret Deployment Guide

## Production Webhook Secret Deployment

### 1. Generated Secure Webhook Secret
**Webhook Secret:** `your_generated_webhook_secret_here`

⚠️ **IMPORTANT SECURITY NOTES:**
- This secret should be kept confidential and stored securely
- Never commit this secret to version control
- Use environment variables or secure secret management systems
- Rotate this secret periodically for enhanced security

### 2. Deployment Steps

#### Step 1: Add to Production Environment
Add the following to your production environment configuration:

```bash
# Shopify Webhook Configuration
SHOPIFY_WEBHOOK_SECRET=your_generated_webhook_secret_here

# Additional webhook settings
WEBHOOK_RATE_LIMIT=100
WEBHOOK_TIMEOUT=30000
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_RETRY_DELAY=2000
```

#### Step 2: Update .env File (if using file-based configuration)
```bash
# Add to api/.env (production)
SHOPIFY_WEBHOOK_SECRET=your_generated_webhook_secret_here
```

#### Step 3: Cloud Platform Deployment

##### For Heroku:
```bash
heroku config:set SHOPIFY_WEBHOOK_SECRET=your_generated_webhook_secret_here --app your-app-name
```

##### For Vercel:
```bash
vercel env add SHOPIFY_WEBHOOK_SECRET
# Enter the secret when prompted: your_generated_webhook_secret_here
```

##### For AWS (using AWS CLI):
```bash
aws ssm put-parameter --name "/shopify-po-sync/webhook-secret" --value "your_generated_webhook_secret_here" --type "SecureString"
```

##### For Docker:
```bash
docker run -e SHOPIFY_WEBHOOK_SECRET=your_generated_webhook_secret_here your-image
```

### 3. Verification Steps

#### Step 1: Environment Variable Check
Create a verification script to ensure the secret is properly loaded:

```javascript
// verify-webhook-secret.js
console.log('Webhook Secret Status:', {
  isSet: !!process.env.SHOPIFY_WEBHOOK_SECRET,
  length: process.env.SHOPIFY_WEBHOOK_SECRET?.length || 0,
  preview: process.env.SHOPIFY_WEBHOOK_SECRET ? 
    process.env.SHOPIFY_WEBHOOK_SECRET.substring(0, 8) + '...' : 
    'NOT SET'
});
```

#### Step 2: Webhook Authentication Test
Test webhook signature verification:

```javascript
// test-webhook-auth.js
import crypto from 'crypto';

const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
const testPayload = '{"test": "webhook"}';
const signature = crypto
  .createHmac('sha256', secret)
  .update(testPayload, 'utf8')
  .digest('base64');

console.log('Test signature generated successfully:', !!signature);
```

#### Step 3: Health Check Endpoint
Verify webhook endpoints are responding:

```bash
curl -X GET https://your-domain.com/api/webhooks/health
```

Expected response:
```json
{
  "success": true,
  "message": "Webhook endpoints are healthy",
  "supportedWebhooks": [
    "orders/created",
    "orders/updated", 
    "orders/cancelled",
    "products/create",
    "products/update",
    "inventory_levels/update",
    "app/uninstalled"
  ]
}
```

### 4. Shopify App Configuration

#### Step 1: Update Shopify Partner Dashboard
1. Go to Shopify Partner Dashboard
2. Navigate to your app settings
3. In the "App setup" tab, configure webhook endpoints:
   - `https://your-domain.com/api/webhooks/orders/created`
   - `https://your-domain.com/api/webhooks/orders/updated`
   - `https://your-domain.com/api/webhooks/orders/cancelled`
   - `https://your-domain.com/api/webhooks/products/create`
   - `https://your-domain.com/api/webhooks/products/update`
   - `https://your-domain.com/api/webhooks/inventory_levels/update`
   - `https://your-domain.com/api/webhooks/app/uninstalled`

#### Step 2: Webhook API Version
Ensure webhook API version is set to `2024-10` in your Shopify app configuration.

### 5. Security Best Practices

#### Secure Storage Options
1. **Environment Variables** (Basic)
   - Store in platform-specific environment variables
   - Ensure environment is not logged or exposed

2. **Secret Management Services** (Recommended)
   - AWS Secrets Manager
   - Azure Key Vault
   - Google Secret Manager
   - HashiCorp Vault

3. **Kubernetes Secrets** (For K8s deployments)
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: shopify-webhook-secret
   type: Opaque
   data:
     webhook-secret: cjdGeGJnS3dlQXZCVU14KzIxUi9na09rU2tXUmFnOVBzVVpiT21PSGRPaz0=
   ```

#### Access Control
- Limit access to webhook secret to essential personnel only
- Use role-based access control (RBAC)
- Implement audit logging for secret access
- Regular access reviews and rotation schedules

### 6. Monitoring and Alerting

#### Webhook Failure Monitoring
Monitor for:
- HMAC verification failures (potential security issue)
- High error rates (>5% failure rate)
- Processing latency (>30 seconds)
- Queue backup (>1000 pending webhooks)

#### Alert Configuration Examples

##### New Relic:
```sql
SELECT count(*) FROM WebhookLog WHERE status = 'failed' AND timestamp > 1 HOUR AGO
```

##### Datadog:
```
webhook.processing.failed{environment:production}.rollup(sum, 300) > 10
```

##### CloudWatch:
```json
{
  "MetricName": "WebhookFailures",
  "Threshold": 5,
  "ComparisonOperator": "GreaterThanThreshold",
  "EvaluationPeriods": 2
}
```

### 7. Secret Rotation Plan

#### Rotation Schedule
- **Frequency:** Every 90 days or immediately if compromised
- **Process:** Zero-downtime rotation using dual-secret validation
- **Verification:** Test all webhook endpoints after rotation

#### Rotation Process
1. Generate new webhook secret
2. Update application configuration with both old and new secrets
3. Deploy application with dual-secret validation
4. Update Shopify webhook configuration
5. Remove old secret after validation period
6. Update monitoring and alerting thresholds

### 8. Troubleshooting

#### Common Issues

**Issue:** HMAC verification failures
**Solution:** 
- Verify secret is correctly set in environment
- Check that raw body is used for signature verification
- Ensure no middleware is modifying request body

**Issue:** Webhook timeouts
**Solution:**
- Increase `WEBHOOK_TIMEOUT` value
- Optimize webhook processing logic
- Implement async processing for heavy operations

**Issue:** High error rates
**Solution:**
- Check application logs for specific errors
- Verify database connectivity
- Monitor Redis queue health
- Check external API rate limits

### 9. Production Checklist

- [ ] Webhook secret generated and stored securely
- [ ] Environment variables configured in production
- [ ] Webhook endpoints deployed and accessible
- [ ] HMAC verification enabled and tested
- [ ] Rate limiting configured and tested
- [ ] Monitoring and alerting configured
- [ ] Error handling and retry logic tested
- [ ] Database migrations for webhook logging applied
- [ ] Redis queue properly configured
- [ ] All webhook endpoints returning 200 for valid requests
- [ ] Security audit completed
- [ ] Documentation updated with deployment details

### 10. Emergency Procedures

#### If Webhook Secret is Compromised:
1. **Immediate:** Generate new webhook secret
2. **Update:** All production environments immediately
3. **Verify:** HMAC verification is working with new secret
4. **Monitor:** For any suspicious webhook activity
5. **Audit:** Recent webhook logs for unauthorized access
6. **Document:** Incident and lessons learned

#### Rollback Plan:
1. Keep previous webhook secret for 24 hours during deployment
2. Implement dual-secret validation during transition
3. Have rollback scripts ready for quick reversion
4. Monitor application health during and after deployment

---

**Next Steps:**
1. Deploy the webhook secret to your production environment
2. Run verification tests
3. Update Shopify app configuration
4. Monitor webhook processing for 24 hours
5. Complete security audit checklist
