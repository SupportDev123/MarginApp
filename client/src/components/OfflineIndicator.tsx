import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
    };
    
    const handleOffline = () => {
      setIsOffline(true);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showBanner && !isOffline) return null;

  return (
    <AnimatePresence>
      {(showBanner || isOffline) && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className={`fixed top-0 left-0 right-0 z-[100] py-2 px-4 text-center text-sm font-medium ${
            isOffline 
              ? 'bg-orange-500 text-white' 
              : 'bg-green-500 text-white'
          }`}
          data-testid="offline-indicator"
        >
          {isOffline ? (
            <span className="flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4" />
              You're offline. Some features may be limited.
            </span>
          ) : (
            <span>Back online!</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
