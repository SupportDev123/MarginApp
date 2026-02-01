import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ShieldCheck, AlertCircle, Trophy, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface PSACertData {
  certNumber: string;
  brand: string;
  year: string;
  cardNumber: string;
  subject: string;
  variety: string;
  grade: string;
  gradeDescription: string;
  population: number;
  populationHigher: number;
  labelType: string;
  specNumber: string;
}

interface PSALookupProps {
  onCertVerified?: (data: PSACertData) => void;
  initialCertNumber?: string;
}

export function PSALookup({ onCertVerified, initialCertNumber = '' }: PSALookupProps) {
  const { toast } = useToast();
  const [certNumber, setCertNumber] = useState(initialCertNumber);
  const [isLoading, setIsLoading] = useState(false);
  const [certData, setCertData] = useState<PSACertData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getGradeColor = (grade: string): string => {
    const gradeNum = parseFloat(grade);
    if (gradeNum >= 10) return 'bg-amber-500';
    if (gradeNum >= 9) return 'bg-green-500';
    if (gradeNum >= 8) return 'bg-blue-500';
    if (gradeNum >= 7) return 'bg-purple-500';
    return 'bg-gray-500';
  };

  const formatGrade = (grade: string): string => {
    const gradeNum = parseFloat(grade);
    if (isNaN(gradeNum)) return grade;
    
    const labels: Record<number, string> = {
      10: 'GEM MINT',
      9: 'MINT',
      8: 'NM-MT',
      7: 'NM',
      6: 'EX-MT',
      5: 'EX',
      4: 'VG-EX',
      3: 'VG',
      2: 'GOOD',
      1: 'POOR'
    };
    
    return labels[Math.floor(gradeNum)] || grade;
  };

  const lookupCert = async () => {
    if (!certNumber.trim()) {
      toast({
        title: 'Enter cert number',
        description: 'Please enter a PSA cert number to lookup',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setCertData(null);

    try {
      const response = await fetch(`/api/psa/cert/${certNumber.trim()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to lookup cert');
      }

      const data: PSACertData = await response.json();
      setCertData(data);
      
      if (onCertVerified) {
        onCertVerified(data);
      }

      toast({
        title: 'Cert verified',
        description: `${data.subject} - PSA ${data.grade}`
      });
    } catch (err: any) {
      setError(err.message);
      toast({
        title: 'Lookup failed',
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          PSA Cert Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="certNumber" className="sr-only">PSA Cert Number</Label>
            <Input
              id="certNumber"
              placeholder="Enter PSA cert number..."
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupCert()}
              data-testid="input-psa-cert"
            />
          </div>
          <Button 
            onClick={lookupCert} 
            disabled={isLoading}
            data-testid="button-psa-lookup"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {certData && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge className={`${getGradeColor(certData.grade)} text-white`}>
                  PSA {certData.grade}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatGrade(certData.grade)}
                </span>
              </div>
              <Badge variant="outline" className="text-xs">
                {certData.labelType}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="font-medium text-sm">{certData.subject}</p>
              <p className="text-xs text-muted-foreground">
                {certData.year} {certData.brand} #{certData.cardNumber}
              </p>
              {certData.variety && (
                <p className="text-xs text-muted-foreground">{certData.variety}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-muted/50 rounded-md p-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  Population
                </div>
                <p className="font-semibold">{certData.population.toLocaleString()}</p>
              </div>
              <div className="bg-muted/50 rounded-md p-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Trophy className="w-3.5 h-3.5" />
                  Higher Grades
                </div>
                <p className="font-semibold">{certData.populationHigher.toLocaleString()}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-1">
              Cert #{certData.certNumber} | Spec #{certData.specNumber}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
