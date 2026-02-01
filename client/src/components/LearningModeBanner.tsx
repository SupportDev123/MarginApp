import { Info, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

interface LearningModeBannerProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export function LearningModeBanner({ variant = 'compact', className = '' }: LearningModeBannerProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const showBanner = import.meta.env.VITE_SHOW_LEARNING_MODE === 'true';
    const wasDismissed = sessionStorage.getItem('learning_banner_dismissed') === 'true';
    setIsEnabled(showBanner);
    setDismissed(wasDismissed);
  }, []);

  if (!isEnabled || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('learning_banner_dismissed', 'true');
    setDismissed(true);
  };

  if (variant === 'compact') {
    return (
      <div 
        className={`flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm ${className}`}
        data-testid="banner-learning-mode"
      >
        <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="text-blue-300/90">
          Learning mode active — accuracy improves as we analyze more sales data
        </span>
        <button 
          onClick={handleDismiss}
          className="ml-auto text-blue-400/60 hover:text-blue-300 text-xs"
          data-testid="button-dismiss-learning"
        >
          Got it
        </button>
      </div>
    );
  }

  return (
    <div 
      className={`p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl ${className}`}
      data-testid="banner-learning-mode-full"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <Sparkles className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-blue-300">Learning Mode Active</h4>
            <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full">Beta</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our visual matching system is actively improving as we analyze more real sales data. 
            High-value categories like <span className="text-blue-300">trading cards</span> and{' '}
            <span className="text-blue-300">watches</span> are learning first. 
            Accuracy will continue to improve over time.
          </p>
        </div>
        <button 
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground p-1"
          data-testid="button-dismiss-learning-full"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
