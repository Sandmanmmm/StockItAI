/**
 * Free Google Image Search via Web Scraping
 * Cost: $0 (vs $5 per 1000 queries for API)
 * Quality: Same as Google Images API
 */

import * as cheerio from 'cheerio'

class FreeImageSearchService {
  
  /**
   * Search Google Images without API costs
   */
  async searchGoogleImages(query, maxResults = 5) {
    try {
      console.log(`   🔍 Searching Google Images (scraping): "${query}"`)
      
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=isz:m`
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/',
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const html = await response.text()
      const images = this.extractImagesFromHtml(html, maxResults)
      
      console.log(`      ✅ Found ${images.length} images (cost: $0)`)
      
      return images
      
    } catch (error) {
      console.log(`      ❌ Scraping failed: ${error.message}`)
      return []
    }
  }
  
  /**
   * Extract image URLs from Google Images HTML
   */
  extractImagesFromHtml(html, maxResults) {
    const images = []
    
    try {
      // Google Images embeds data in JavaScript
      // Look for the AF_initDataCallback pattern that contains image data
      const scriptRegex = /AF_initDataCallback\(\{[^}]*data:function\(\)\{return\s*(\[.+?\])\}/g
      
      let match
      while ((match = scriptRegex.exec(html)) !== null && images.length < maxResults) {
        try {
          const data = JSON.parse(match[1])
          this.parseImageData(data, images, maxResults)
        } catch (e) {
          // Skip invalid JSON
          continue
        }
      }
      
      // Alternative: Extract from thumbnail data
      if (images.length === 0) {
        const thumbnailRegex = /"ou":"([^"]+)"/g
        while ((match = thumbnailRegex.exec(html)) !== null && images.length < maxResults) {
          images.push({
            url: match[1],
            source: 'google_scraping',
            confidence: 0.8
          })
        }
      }
      
    } catch (error) {
      console.error('Error parsing HTML:', error.message)
    }
    
    return images.slice(0, maxResults)
  }
  
  /**
   * Recursively parse image data from Google's JSON structure
   */
  parseImageData(data, images, maxResults) {
    if (!data || images.length >= maxResults) return
    
    if (Array.isArray(data)) {
      for (const item of data) {
        if (images.length >= maxResults) break
        
        if (Array.isArray(item)) {
          this.parseImageData(item, images, maxResults)
        } else if (typeof item === 'object' && item !== null) {
          // Look for image URL patterns
          if (typeof item === 'string' && item.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(item)) {
            images.push({
              url: item,
              source: 'google_scraping',
              confidence: 0.85
            })
          }
        }
      }
    }
  }
  
  /**
   * Rate limiting to avoid getting blocked
   */
  async rateLimit() {
    // Add random delay between 200-500ms
    const delay = 200 + Math.random() * 300
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}

// Example usage:
/*
const searchService = new FreeImageSearchService()

const images = await searchService.searchGoogleImages('Haribo Balla Stixx Strawberry')

console.log('Found images:')
images.forEach(img => {
  console.log(`  - ${img.url}`)
})
*/

export default FreeImageSearchService
