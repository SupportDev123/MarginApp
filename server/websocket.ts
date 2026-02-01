/**
 * WebSocket support for real-time auction overlay updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

interface AuctionClient {
  ws: WebSocket;
  itemId: string;
  userId?: number;
}

const clients = new Map<WebSocket, AuctionClient>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/auction'
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const itemId = url.searchParams.get('itemId');
    
    if (!itemId) {
      ws.close(4000, 'Missing itemId');
      return;
    }

    console.log(`[WebSocket] Client connected for item: ${itemId}`);
    
    clients.set(ws, { ws, itemId });

    // Send initial analysis if available
    sendItemAnalysis(ws, itemId);

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'subscribe' && data.itemId) {
          const client = clients.get(ws);
          if (client) {
            client.itemId = data.itemId;
            await sendItemAnalysis(ws, data.itemId);
          }
        }
        
        if (data.type === 'analyze' && data.url) {
          // Trigger analysis and broadcast result
          // This would call your existing analysis logic
          console.log(`[WebSocket] Analysis requested for: ${data.url}`);
        }
      } catch (e) {
        console.error('[WebSocket] Message parse error:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WebSocket] Client disconnected`);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
      clients.delete(ws);
    });
  });

  console.log('[WebSocket] Server initialized on /ws/auction');
  
  return wss;
}

async function sendItemAnalysis(ws: WebSocket, itemId: string) {
  try {
    // Look up item by eBay ID in database
    // For now, send a placeholder response
    // In production, query storage for the item
    
    const message = {
      type: 'analysis',
      itemId,
      status: 'pending',
      message: 'Analysis not yet available. Scan this item in the Margin app first.'
    };
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  } catch (e) {
    console.error('[WebSocket] Send error:', e);
  }
}

/**
 * Broadcast analysis update to all clients watching this item
 */
export function broadcastItemUpdate(itemId: string, data: {
  decision: 'flip' | 'skip' | 'caution' | 'hold';
  decisionText: string;
  score: number;
  maxBid: number;
  profit: number;
}) {
  const message = JSON.stringify({
    type: 'analysis',
    itemId,
    ...data
  });

  clients.forEach((client) => {
    if (client.itemId === itemId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}
