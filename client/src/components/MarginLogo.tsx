import marginLogo from "../assets/margin-logo-new.png";

interface MarginLogoProps {
  className?: string;
  size?: number;
}

export function MarginLogo({ className = "", size = 32 }: MarginLogoProps) {
  return (
    <img 
      src={marginLogo}
      width={size} 
      height={size} 
      alt="Margin"
      className={`${className}`}
      data-testid="icon-margin-logo"
    />
  );
}

export function MarginLogoMark({ className = "", size = 24 }: MarginLogoProps) {
  return (
    <img 
      src={marginLogo}
      width={size} 
      height={size} 
      alt="Margin"
      className={`${className}`}
      data-testid="icon-margin-mark"
    />
  );
}

export function MarginLogoFull({ className = "", height = 48 }: { className?: string; height?: number }) {
  return (
    <div 
      className={`relative flex items-center justify-center ${className}`}
      data-testid="icon-margin-logo-full"
    >
      <img 
        src={marginLogo}
        alt="Margin"
        className="relative z-10 w-auto"
        style={{ 
          height,
          objectFit: 'contain'
        }}
      />
    </div>
  );
}

export function MarginHeader({ className }: { className?: string }) {
  return (
    <div className={`flex justify-center py-4 ${className || ''}`} data-testid="margin-header">
      <img 
        src={marginLogo} 
        alt="Margin" 
        className="h-12 w-auto"
        data-testid="img-margin-banner"
      />
    </div>
  );
}
