/**
 * Production Environment Configuration
 * Essential environment variables and settings for production deployment
 */

export const requiredEnvVars = [
  // Core Service Configuration
  'NODE_ENV',
  'PORT',
  
  // Database Configuration  
  'DATABASE_URL',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  
  // Redis Configuration
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  
  // Shopify Configuration
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'SHOPIFY_SCOPES',
  'SHOPIFY_APP_URL',
  
  // AI Service Configuration
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_MAX_TOKENS',
  
  // Security Configuration
  'JWT_SECRET',
  'SESSION_SECRET',
  'ADMIN_API_KEY',
  
  // Email Configuration (optional)
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'FROM_EMAIL',
  
  // Monitoring Configuration (optional)
  'SENTRY_DSN',
  'LOG_LEVEL'
]

export const optionalEnvVars = [
  'SMTP_HOST',
  'SMTP_PORT', 
  'SMTP_USER',
  'SMTP_PASSWORD',
  'FROM_EMAIL',
  'SENTRY_DSN',
  'LOG_LEVEL'
]

export const defaultValues = {
  NODE_ENV: 'production',
  PORT: 3000,
  REDIS_PORT: 6379,
  POSTGRES_PORT: 5432,
  OPENAI_MODEL: 'gpt-4-turbo-preview',
  OPENAI_MAX_TOKENS: 4096,
  LOG_LEVEL: 'info',
  SHOPIFY_SCOPES: 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory'
}

/**
 * Validate production environment configuration
 */
export function validateProductionConfig() {
  const missing = []
  const warnings = []
  
  console.log('🔍 Validating production environment configuration...')
  
  // Check required environment variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName] && !defaultValues[varName]) {
      missing.push(varName)
    } else if (!process.env[varName] && defaultValues[varName]) {
      process.env[varName] = defaultValues[varName]
      warnings.push(`${varName} not set, using default: ${defaultValues[varName]}`)
    }
  })
  
  // Check optional but recommended variables
  optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      warnings.push(`${varName} not configured (optional but recommended)`)
    }
  })
  
  // Report results
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach(varName => {
      console.error(`   - ${varName}`)
    })
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️ Configuration warnings:')
    warnings.forEach(warning => {
      console.warn(`   - ${warning}`)
    })
  }
  
  console.log('✅ Environment configuration validated successfully')
  
  // Return configuration summary
  return {
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
    database: process.env.DATABASE_URL ? 'configured' : 'not configured',
    redis: process.env.REDIS_URL ? 'configured' : 'not configured',
    shopify: process.env.SHOPIFY_API_KEY ? 'configured' : 'not configured',
    openai: process.env.OPENAI_API_KEY ? 'configured' : 'not configured',
    security: {
      jwt: process.env.JWT_SECRET ? 'configured' : 'not configured',
      admin: process.env.ADMIN_API_KEY ? 'configured' : 'not configured'
    },
    email: process.env.SMTP_HOST ? 'configured' : 'not configured',
    monitoring: process.env.SENTRY_DSN ? 'configured' : 'not configured'
  }
}

/**
 * Production security configuration
 */
export const securityConfig = {
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.openai.com"]
      }
    },
    crossOriginEmbedderPolicy: false
  },
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://admin.shopify.com'],
    credentials: true,
    optionsSuccessStatus: 200
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  }
}

/**
 * Performance and reliability configuration
 */
export const performanceConfig = {
  compression: {
    threshold: 1024,
    level: 6
  },
  bodyParser: {
    json: { limit: '10mb' },
    urlencoded: { extended: true, limit: '10mb' }
  },
  timeout: {
    server: 30000, // 30 seconds
    keepAlive: 65000 // 65 seconds
  }
}