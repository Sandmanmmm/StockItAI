# Google Custom Search Setup Instructions

## Step 1: Create Custom Search Engine

1. Go to: https://cse.google.com/cse/
2. Click "Add" to create a new search engine
3. In "Sites to search", enter: `*` (to search the entire web)
4. Give it a name like "Product Image Reference Search"
5. Click "Create"

## Step 2: Get Search Engine ID

1. After creation, click on your search engine
2. Go to "Setup" tab
3. Copy the "Search engine ID" (looks like: 012345678901234567890:abcdefghijk)
4. Replace `YOUR_SEARCH_ENGINE_ID_HERE` in the .env file with this ID

## Step 3: Configure for Image Search

1. In your search engine settings, go to "Setup" tab
2. Under "Basics", make sure "Search the entire web" is enabled
3. Go to "Look and feel" tab
4. Select "Results only" layout
5. Save changes

## Current Configuration

```
GOOGLE_SEARCH_API_KEY=your_google_api_key_here
GOOGLE_SEARCH_ENGINE_ID=YOUR_SEARCH_ENGINE_ID_HERE  # Replace this
```

## Test Command

After setup, test with:
```bash
node test-reference-based-images.js
```

This will enable accurate product photo generation using Google Images as references!
