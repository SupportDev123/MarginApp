import { useState, useCallback, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSupport = async () => {
      try {
        const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        setIsSupported(supported);

        if (supported) {
          // Add timeout for service worker ready check
          const timeoutPromise = new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Service worker timeout')), 3000)
          );
          
          try {
            const registration = await Promise.race([
              navigator.serviceWorker.ready,
              timeoutPromise
            ]) as ServiceWorkerRegistration;
            
            if (registration) {
              const subscription = await registration.pushManager.getSubscription();
              setIsSubscribed(!!subscription);
            }
          } catch (swError) {
            console.log('[Push] Service worker not ready:', swError);
            // Still allow push toggle even if SW isn't fully ready yet
          }
        }
      } catch (err) {
        console.error('[Push] Check support error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkSupport();
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      setError('Push notifications not supported');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Notification permission denied');
        setIsLoading(false);
        return false;
      }

      const response = await fetch('/api/push/vapid-key');
      if (!response.ok) {
        throw new Error('Push notifications not available');
      }
      const { vapidPublicKey } = await response.json();

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await apiRequest('POST', '/api/push/subscribe', {
        subscription: subscription.toJSON(),
      });

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to enable notifications');
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await apiRequest('POST', '/api/push/unsubscribe', {
          endpoint: subscription.endpoint,
        });
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to disable notifications');
      setIsLoading(false);
      return false;
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
