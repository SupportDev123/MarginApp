const DB_NAME = 'margin-offline';
const DB_VERSION = 2;
const STORES = {
  scans: 'scans',
  items: 'items',
  pending: 'pendingUploads',
  scanQueue: 'scanQueue'
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORES.scans)) {
        const scanStore = db.createObjectStore(STORES.scans, { keyPath: 'id', autoIncrement: true });
        scanStore.createIndex('timestamp', 'timestamp', { unique: false });
        scanStore.createIndex('synced', 'synced', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORES.items)) {
        const itemStore = db.createObjectStore(STORES.items, { keyPath: 'id' });
        itemStore.createIndex('userId', 'userId', { unique: false });
        itemStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORES.pending)) {
        db.createObjectStore(STORES.pending, { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains(STORES.scanQueue)) {
        const queueStore = db.createObjectStore(STORES.scanQueue, { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        queueStore.createIndex('scanMode', 'scanMode', { unique: false });
      }
    };
  });
  
  return dbPromise;
}

export interface OfflineScan {
  id?: number;
  imageData: string;
  timestamp: number;
  synced: boolean;
  result?: any;
}

export interface CachedItem {
  id: number;
  userId: number;
  data: any;
  cachedAt: number;
}

export async function saveOfflineScan(scan: Omit<OfflineScan, 'id'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scans, 'readwrite');
    const store = transaction.objectStore(STORES.scans);
    const request = store.add(scan);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineScans(): Promise<OfflineScan[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scans, 'readonly');
    const store = transaction.objectStore(STORES.scans);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingScans(): Promise<OfflineScan[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scans, 'readonly');
    const store = transaction.objectStore(STORES.scans);
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markScanSynced(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scans, 'readwrite');
    const store = transaction.objectStore(STORES.scans);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const scan = getRequest.result;
      if (scan) {
        scan.synced = true;
        store.put(scan);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function cacheItem(item: CachedItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.items, 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedItem(id: number): Promise<CachedItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.items, 'readonly');
    const store = transaction.objectStore(STORES.items);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedItems(userId: number): Promise<CachedItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.items, 'readonly');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearOldCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const db = await openDB();
  const cutoff = Date.now() - maxAge;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.items, 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('cachedAt');
    const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ============================================================================
// OFFLINE SCAN QUEUE - For batch/yard-sale mode offline support
// ============================================================================

export type ScanQueueStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ScanMode = 'batch' | 'yardsale';

export interface QueuedScan {
  id?: number;
  imageBase64: string;
  scanMode: ScanMode;
  status: ScanQueueStatus;
  buyPrice?: number;
  profitPercent?: number;
  createdAt: number;
  processedAt?: number;
  result?: any;
  error?: string;
  retryCount: number;
}

export async function queueOfflineScan(scan: Omit<QueuedScan, 'id' | 'status' | 'createdAt' | 'retryCount'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readwrite');
    const store = transaction.objectStore(STORES.scanQueue);
    const request = store.add({
      ...scan,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
    });
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingScanQueue(): Promise<QueuedScan[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readonly');
    const store = transaction.objectStore(STORES.scanQueue);
    const index = store.index('status');
    const request = index.getAll(IDBKeyRange.only('pending'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllQueuedScans(): Promise<QueuedScan[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readonly');
    const store = transaction.objectStore(STORES.scanQueue);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updateQueuedScan(id: number, updates: Partial<QueuedScan>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readwrite');
    const store = transaction.objectStore(STORES.scanQueue);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const scan = getRequest.result;
      if (scan) {
        const updated = { ...scan, ...updates };
        store.put(updated);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function markQueuedScanProcessing(id: number): Promise<void> {
  return updateQueuedScan(id, { status: 'processing' });
}

export async function markQueuedScanCompleted(id: number, result: any): Promise<void> {
  return updateQueuedScan(id, { 
    status: 'completed', 
    result, 
    processedAt: Date.now() 
  });
}

export async function markQueuedScanFailed(id: number, error: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readwrite');
    const store = transaction.objectStore(STORES.scanQueue);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const scan = getRequest.result;
      if (scan) {
        scan.status = 'failed';
        scan.error = error;
        scan.retryCount = (scan.retryCount || 0) + 1;
        scan.processedAt = Date.now();
        store.put(scan);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeQueuedScan(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readwrite');
    const store = transaction.objectStore(STORES.scanQueue);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearCompletedScans(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scanQueue, 'readwrite');
    const store = transaction.objectStore(STORES.scanQueue);
    const index = store.index('status');
    const request = index.openCursor(IDBKeyRange.only('completed'));
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}> {
  const scans = await getAllQueuedScans();
  return {
    pending: scans.filter(s => s.status === 'pending').length,
    processing: scans.filter(s => s.status === 'processing').length,
    completed: scans.filter(s => s.status === 'completed').length,
    failed: scans.filter(s => s.status === 'failed').length,
    total: scans.length,
  };
}
