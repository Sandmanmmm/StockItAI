// Quick OpenAI API test
import OpenAI from 'openai'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()
dotenv.config({ path: '../.env.local' })

console.log('🔍 Testing OpenAI API connection...')
console.log('📊 API Key configured:', !!process.env.OPENAI_API_KEY)
console.log('📊 API Key length:', process.env.OPENAI_API_KEY?.length || 0)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10000
})

async function testOpenAI() {
  try {
    console.log('🚀 Making test API call...')
    const startTime = Date.now()
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Say 'Hello, this is a test' in exactly 5 words."
        }
      ],
      max_tokens: 50,
      temperature: 0.1
    })
    
    const duration = Date.now() - startTime
    console.log(`✅ OpenAI API test completed in ${duration}ms`)
    console.log('📄 Response:', response.choices[0].message.content)
    
  } catch (error) {
    console.error('❌ OpenAI API test failed:', error.message)
    console.error('❌ Error type:', error.constructor.name)
    console.error('❌ Error code:', error.code)
    console.error('❌ Error status:', error.status)
    console.error('❌ Full error:', error)
  }
}

testOpenAI()