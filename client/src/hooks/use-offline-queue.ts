import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  isOnline,
  onOnlineStatusChange,
  getPendingScanQueue,
  markQueuedScanProcessing,
  markQueuedScanCompleted,
  markQueuedScanFailed,
  updateQueuedScan,
  getQueueStats,
  queueOfflineScan,
  type QueuedScan,
  type ScanMode,
} from '@/lib/offlineStorage';

interface UseOfflineQueueOptions {
  onScanComplete?: (scan: QueuedScan, result: any) => void;
  onScanFailed?: (scan: QueuedScan, error: string) => void;
  autoFlush?: boolean;
  maxRetries?: number;
}

export function useOfflineQueue(options: UseOfflineQueueOptions = {}) {
  const { 
    onScanComplete, 
    onScanFailed, 
    autoFlush = true,
    maxRetries = 3 
  } = options;
  
  const { toast } = useToast();
  const [online, setOnline] = useState(isOnline());
  const [isFlushing, setIsFlushing] = useState(false);
  const [queueStats, setQueueStats] = useState({ pending: 0, processing: 0, completed: 0, failed: 0, total: 0 });
  const flushingRef = useRef(false);

  const refreshStats = useCallback(async () => {
    try {
      const stats = await getQueueStats();
      setQueueStats(stats);
    } catch (err) {
      console.error('[OfflineQueue] Failed to get stats:', err);
    }
  }, []);

  const addToQueue = useCallback(async (
    imageBase64: string,
    scanMode: ScanMode,
    extras?: { buyPrice?: number; profitPercent?: number }
  ): Promise<number> => {
    const id = await queueOfflineScan({
      imageBase64,
      scanMode,
      ...extras,
    });
    await refreshStats();
    
    toast({
      title: 'Scan queued',
      description: 'Will process when back online',
    });
    
    return id;
  }, [refreshStats, toast]);

  const processScan = useCallback(async (scan: QueuedScan): Promise<boolean> => {
    if (!scan.id) return false;
    
    try {
      await markQueuedScanProcessing(scan.id);
      
      const response = await apiRequest('POST', '/api/batch/scanAndAnalyze', {
        imageBase64: scan.imageBase64,
        buyPrice: scan.buyPrice,
      });
      
      const result = await response.json();
      
      if (result.success) {
        await markQueuedScanCompleted(scan.id, result);
        onScanComplete?.(scan, result);
        return true;
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      const newRetryCount = (scan.retryCount || 0) + 1;
      
      if (newRetryCount >= maxRetries) {
        // Max retries reached - mark as permanently failed
        await markQueuedScanFailed(scan.id, `Failed after ${maxRetries} retries: ${errorMsg}`);
        onScanFailed?.(scan, errorMsg);
      } else {
        // Mark back to pending with incremented retry count for future retry
        await updateQueuedScan(scan.id, { 
          status: 'pending', 
          retryCount: newRetryCount,
          error: errorMsg,
        });
      }
      
      return false;
    }
  }, [maxRetries, onScanComplete, onScanFailed]);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !isOnline()) return;
    
    flushingRef.current = true;
    setIsFlushing(true);
    
    try {
      const pending = await getPendingScanQueue();
      
      if (pending.length === 0) {
        flushingRef.current = false;
        setIsFlushing(false);
        return;
      }
      
      console.log(`[OfflineQueue] Flushing ${pending.length} queued scans...`);
      
      toast({
        title: 'Processing offline scans',
        description: `${pending.length} scan${pending.length > 1 ? 's' : ''} queued`,
      });
      
      let successCount = 0;
      let failCount = 0;
      
      for (const scan of pending) {
        if (!isOnline()) {
          console.log('[OfflineQueue] Lost connection, stopping flush');
          break;
        }
        
        const success = await processScan(scan);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
        
        await refreshStats();
      }
      
      if (successCount > 0 || failCount > 0) {
        toast({
          title: 'Offline scans processed',
          description: `${successCount} completed, ${failCount} failed`,
          variant: failCount > 0 ? 'destructive' : 'default',
        });
      }
    } catch (err) {
      console.error('[OfflineQueue] Flush error:', err);
    } finally {
      flushingRef.current = false;
      setIsFlushing(false);
      await refreshStats();
    }
  }, [processScan, refreshStats, toast]);

  useEffect(() => {
    const unsubscribe = onOnlineStatusChange((isNowOnline) => {
      setOnline(isNowOnline);
      
      if (isNowOnline && autoFlush) {
        console.log('[OfflineQueue] Back online, auto-flushing queue...');
        flushQueue();
      }
    });
    
    return unsubscribe;
  }, [autoFlush, flushQueue]);

  useEffect(() => {
    refreshStats();
    
    if (online && autoFlush) {
      flushQueue();
    }
  }, []);

  return {
    online,
    isFlushing,
    queueStats,
    addToQueue,
    flushQueue,
    refreshStats,
  };
}
