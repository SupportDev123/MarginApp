import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (window.navigator as any).standalone === true;
    
    setIsIOS(isIOSDevice);
    setIsStandalone(isInStandalone);

    const wasDismissed = localStorage.getItem('installPromptDismissed');
    if (wasDismissed) {
      const dismissedTime = parseInt(wasDismissed, 10);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setDismissed(true);
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    if (isIOSDevice && !isInStandalone) {
      setTimeout(() => setShowPrompt(true), 3000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  };

  if (isStandalone || dismissed || !showPrompt) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-20 left-4 right-4 z-50 bg-card border rounded-lg p-4 shadow-lg"
      data-testid="install-prompt"
    >
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-muted-foreground hover-elevate p-1 rounded"
        data-testid="button-dismiss-install"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Download className="w-6 h-6 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Add Margin to Home Screen</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scan faster with one-tap access. Works offline too!
          </p>
          
          {isIOS ? (
            <div className="mt-2 space-y-2">
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1 font-medium text-foreground">
                  How to install on iPhone:
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">1</span>
                  Tap <Share className="w-4 h-4 inline text-primary" /> at bottom of Safari
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">2</span>
                  Scroll down, tap "Add to Home Screen"
                </p>
              </div>
            </div>
          ) : (
            <Button 
              size="sm" 
              className="mt-2"
              onClick={handleInstall}
              data-testid="button-install-app"
            >
              Install App
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
