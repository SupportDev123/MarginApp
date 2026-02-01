import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, FileText, Calendar, TrendingUp, DollarSign, ShoppingCart, AlertCircle } from "lucide-react";

interface TaxReport {
  year: number;
  summary: {
    totalScans: number;
    totalFlips: number;
    totalSkips: number;
    totalCost: number;
    totalRevenue: number;
    totalProfit: number;
    totalFees: number;
    netIncome: number;
    averageMargin: number;
  };
  categoryBreakdown: Array<{
    category: string;
    count: number;
    cost: number;
    revenue: number;
    profit: number;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    count: number;
    cost: number;
    revenue: number;
    profit: number;
  }>;
  disclaimer: string;
}

export default function ExportPage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [csvStartDate, setCsvStartDate] = useState("");
  const [csvEndDate, setCsvEndDate] = useState("");
  const [csvCategory, setCsvCategory] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<{ subscriptionTier?: string; isAdmin?: boolean }>({
    queryKey: ["/api/user"],
  });

  const isElite = user?.subscriptionTier === "elite" || user?.isAdmin;

  const { data: taxReport, isLoading: taxLoading, refetch: refetchTax } = useQuery<TaxReport>({
    queryKey: ["/api/export/tax-report", selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/export/tax-report?year=${selectedYear}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Elite subscription required");
        }
        throw new Error("Failed to load tax report");
      }
      return res.json();
    },
    enabled: !!user && isElite,
  });

  const handleCsvExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (csvStartDate) params.append("startDate", csvStartDate);
      if (csvEndDate) params.append("endDate", csvEndDate);
      if (csvCategory !== "all") params.append("category", csvCategory);

      const res = await fetch(`/api/export/csv?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          toast({
            title: "Elite Required",
            description: "Upgrade to Elite to export your data.",
            variant: "destructive",
          });
          return;
        }
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `margin-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "Your scan history has been downloaded.",
      });
    } catch (err) {
      toast({
        title: "Export Failed",
        description: "Could not export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleTaxDownload = async () => {
    try {
      const res = await fetch(`/api/export/tax-report/download?year=${selectedYear}`);
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `margin-tax-report-${selectedYear}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Report Downloaded",
        description: `Tax summary for ${selectedYear} has been downloaded.`,
      });
    } catch (err) {
      toast({
        title: "Download Failed",
        description: "Could not download report.",
        variant: "destructive",
      });
    }
  };

  if (userLoading) {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isElite) {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <CardTitle>Elite Feature</CardTitle>
            <CardDescription>
              Tax reports and data export are available exclusively to Elite subscribers.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Elite includes:</p>
                <ul className="mt-2 space-y-1">
                  <li>CSV data export</li>
                  <li>Annual tax reports</li>
                  <li>Permanent scan history</li>
                  <li>3 team seats</li>
                </ul>
              </div>
              <Button 
                className="w-full"
                onClick={() => window.location.href = "/settings"}
                data-testid="button-upgrade-elite"
              >
                Upgrade to Elite - $49.99/month
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Data Export</h1>
        <p className="text-muted-foreground">Export your scan history and generate tax reports</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Export Scan History
            </CardTitle>
            <CardDescription>
              Download your complete scan history as a CSV file for spreadsheet analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={csvStartDate}
                  onChange={(e) => setCsvStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={csvEndDate}
                  onChange={(e) => setCsvEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={csvCategory} onValueChange={setCsvCategory}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Shoes">Shoes</SelectItem>
                    <SelectItem value="Watches">Watches</SelectItem>
                    <SelectItem value="Trading Cards">Trading Cards</SelectItem>
                    <SelectItem value="Collectibles">Collectibles</SelectItem>
                    <SelectItem value="Electronics">Electronics</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="mt-4 w-full sm:w-auto"
              onClick={handleCsvExport}
              disabled={isExporting}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Exporting..." : "Download CSV"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Tax Report
            </CardTitle>
            <CardDescription>
              Generate an annual summary for tax purposes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="space-y-2">
                <Label>Tax Year</Label>
                <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); }}>
                  <SelectTrigger className="w-32" data-testid="select-tax-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={handleTaxDownload}
                className="mt-6"
                data-testid="button-download-tax"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Report
              </Button>
            </div>

            {taxLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading report...</div>
            ) : taxReport ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <ShoppingCart className="w-4 h-4" />
                      Total Flips
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-total-flips">
                      {taxReport.summary.totalFlips}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <DollarSign className="w-4 h-4" />
                      Total Revenue
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-total-revenue">
                      ${taxReport.summary.totalRevenue.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <TrendingUp className="w-4 h-4" />
                      Gross Profit
                    </div>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-gross-profit">
                      ${taxReport.summary.totalProfit.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Calendar className="w-4 h-4" />
                      Net Income
                    </div>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-net-income">
                      ${taxReport.summary.netIncome.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="font-medium mb-3">By Category</h3>
                    <div className="space-y-2">
                      {taxReport.categoryBreakdown.map((cat) => (
                        <div
                          key={cat.category}
                          className="flex items-center justify-between p-2 rounded bg-muted/30"
                        >
                          <span className="text-sm">{cat.category}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{cat.count} items</Badge>
                            <span className="text-sm font-medium text-green-600">
                              +${cat.profit.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Monthly Breakdown</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {taxReport.monthlyBreakdown.map((month) => (
                        <div
                          key={month.month}
                          className="flex items-center justify-between p-2 rounded bg-muted/30"
                        >
                          <span className="text-sm">{month.month}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{month.count} flips</Badge>
                            <span className="text-sm font-medium text-green-600">
                              +${month.profit.toFixed(0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  {taxReport.disclaimer}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Select a year to view your tax summary
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
