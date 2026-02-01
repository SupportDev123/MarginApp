# Margin Chrome Extension - Auction Advisor

Real-time flip/skip decisions for eBay auctions.

## Features

- **Non-interfering overlay** - Displays on eBay item pages without blocking bid buttons
- **Pass-through clicks** - All clicks pass through to eBay unless interacting with the drag handle
- **Movable** - Drag the handle to reposition anywhere on screen
- **Expandable** - Click expand to see max bid, profit, and confidence details
- **Dismissible** - Close when not needed

## Installation (Development)

1. **Generate icons** (required):
   ```bash
   # Install ImageMagick if needed
   # On macOS: brew install imagemagick
   # On Ubuntu: sudo apt install imagemagick
   
   # Convert SVG to PNG
   convert icons/icon16.svg icons/icon16.png
   convert icons/icon48.svg icons/icon48.png
   convert icons/icon128.svg icons/icon128.png
   ```
   
   Or create simple 16x16, 48x48, and 128x128 PNG icons manually.

2. **Load in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Configure**:
   - Update `CONFIG.wsUrl` in `src/content.js` with your Margin app URL
   - Update `CONFIG.apiBase` in `src/background.js` with your Margin app URL

## Usage

1. Navigate to any eBay item page (e.g., `ebay.com/itm/...`)
2. The overlay appears in the top-right corner
3. **Drag** the handle to move
4. **Expand** (⤢) to see detailed analysis
5. **Dismiss** (✕) to hide

## How It Works

- Content script injects overlay on eBay item pages
- Extracts item ID and price from the page
- Connects to Margin backend for real-time analysis
- Updates display with flip/skip decision

## Production Setup

1. Replace placeholder URLs with your deployed Margin app URL
2. Set up WebSocket endpoint on backend for real-time updates
3. Package extension for Chrome Web Store distribution
