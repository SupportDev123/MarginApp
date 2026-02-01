import { useState, useMemo } from "react";
import { useExpenses, useExpenseSummary, useCreateExpense, useDeleteExpense, useUpdateExpense, useInventory, type BusinessExpense } from "@/hooks/use-items";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Car, Package, DollarSign, Calculator, Download, ChevronDown, TrendingUp, Settings, Pencil, Calendar, FileText } from "lucide-react";
import { HistoryPageSkeleton } from "@/components/ScanLoadingSkeleton";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { MarginLogoFull } from "@/components/MarginLogo";
import { Link } from "wouter";
import { format, getMonth, parseISO } from "date-fns";

const MONTHS = [
  { value: 'all', label: 'All Months' },
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
];

const EXPENSE_CATEGORIES = [
  { value: 'mileage', label: 'Mileage', icon: Car },
  { value: 'shipping_supplies', label: 'Shipping Supplies', icon: Package },
  { value: 'platform_fees', label: 'Platform Fees', icon: DollarSign },
  { value: 'software', label: 'Software/Subscriptions', icon: Calculator },
  { value: 'equipment', label: 'Equipment', icon: Package },
  { value: 'office_supplies', label: 'Office Supplies', icon: Package },
  { value: 'storage', label: 'Storage', icon: Package },
  { value: 'education', label: 'Education', icon: Package },
  { value: 'other', label: 'Other', icon: Package },
] as const;

const IRS_MILEAGE_RATE_2025 = 0.70; // 2025 IRS standard mileage rate

const SCHEDULE_C_MAPPING: Record<string, { line: string; description: string }> = {
  mileage: { line: 'Line 9', description: 'Car and truck expenses' },
  shipping_supplies: { line: 'Line 22', description: 'Supplies' },
  platform_fees: { line: 'Line 10', description: 'Commissions and fees' },
  software: { line: 'Line 27a', description: 'Other expenses - Software' },
  equipment: { line: 'Line 13', description: 'Depreciation and section 179 expense' },
  office_supplies: { line: 'Line 18', description: 'Office expense' },
  storage: { line: 'Line 20b', description: 'Rent or lease - Other business property' },
  education: { line: 'Line 27a', description: 'Other expenses - Education' },
  other: { line: 'Line 27a', description: 'Other expenses' },
};

export default function ExpensesPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(String(currentMonth));
  const { data: expenses, isLoading } = useExpenses(selectedYear);
  const { data: summary } = useExpenseSummary(selectedYear);
  const { data: inventory } = useInventory();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const updateExpense = useUpdateExpense();
  const { toast } = useToast();
  
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  
  const [formCategory, setFormCategory] = useState<string>('mileage');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formMiles, setFormMiles] = useState('');
  const [formStartLocation, setFormStartLocation] = useState('');
  const [formEndLocation, setFormEndLocation] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (selectedMonth === 'all') return expenses;
    return expenses.filter(e => {
      const expenseMonth = getMonth(parseISO(e.date));
      return expenseMonth === parseInt(selectedMonth);
    });
  }, [expenses, selectedMonth]);

  const monthlyTotal = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  }, [filteredExpenses]);

  const monthlyMileage = useMemo(() => {
    return filteredExpenses.filter(e => e.category === 'mileage')
      .reduce((sum, e) => sum + parseFloat(e.miles || '0'), 0);
  }, [filteredExpenses]);

  const ytdTotal = useMemo(() => {
    return expenses?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;
  }, [expenses]);

  const ytdMileage = useMemo(() => {
    return expenses?.filter(e => e.category === 'mileage')
      .reduce((sum, e) => sum + parseFloat(e.miles || '0'), 0) || 0;
  }, [expenses]);

  const monthlyByCategory = useMemo(() => {
    const byCategory: Record<string, { total: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      if (!byCategory[e.category]) {
        byCategory[e.category] = { total: 0, count: 0 };
      }
      byCategory[e.category].total += parseFloat(e.amount);
      byCategory[e.category].count += 1;
    });
    return Object.entries(byCategory)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const totalExpenses = useMemo(() => {
    return summary?.reduce((sum, cat) => sum + cat.total, 0) || 0;
  }, [summary]);

  const totalMileage = useMemo(() => {
    return expenses?.filter(e => e.category === 'mileage')
      .reduce((sum, e) => sum + parseFloat(e.miles || '0'), 0) || 0;
  }, [expenses]);

  const soldItemsThisYear = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter(item => {
      if (item.status !== 'sold' || !item.soldDate) return false;
      const soldYear = new Date(item.soldDate).getFullYear();
      return soldYear === selectedYear;
    });
  }, [inventory, selectedYear]);

  const grossRevenue = useMemo(() => {
    return soldItemsThisYear.reduce((sum, item) => {
      return sum + parseFloat(item.actualSalePrice || '0');
    }, 0);
  }, [soldItemsThisYear]);

  const costOfGoodsSold = useMemo(() => {
    return soldItemsThisYear.reduce((sum, item) => {
      return sum + parseFloat(item.purchasePrice || '0');
    }, 0);
  }, [soldItemsThisYear]);

  const grossProfit = grossRevenue - costOfGoodsSold;
  const netProfit = grossProfit - ytdTotal;

  const getCategoryIcon = (category: string) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === category);
    const Icon = cat?.icon || Package;
    return <Icon className="w-4 h-4" />;
  };

  const getCategoryLabel = (category: string) => {
    return EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'mileage': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'shipping_supplies': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'platform_fees': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
      case 'software': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const resetForm = () => {
    setFormCategory('mileage');
    setFormDescription('');
    setFormAmount('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormMiles('');
    setFormStartLocation('');
    setFormEndLocation('');
    setFormNotes('');
  };

  const handleAddExpense = async () => {
    if (!formDescription) {
      toast({ variant: "destructive", title: "Description required" });
      return;
    }

    let amount = formAmount;
    if (formCategory === 'mileage' && formMiles) {
      amount = String(parseFloat(formMiles) * IRS_MILEAGE_RATE_2025);
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({ variant: "destructive", title: "Amount required" });
      return;
    }

    await createExpense.mutateAsync({
      category: formCategory,
      description: formDescription,
      amount,
      date: formDate,
      miles: formCategory === 'mileage' ? formMiles : undefined,
      mileageRate: formCategory === 'mileage' ? String(IRS_MILEAGE_RATE_2025) : undefined,
      startLocation: formCategory === 'mileage' ? formStartLocation : undefined,
      endLocation: formCategory === 'mileage' ? formEndLocation : undefined,
      notes: formNotes || undefined,
      taxYear: selectedYear,
    });

    setAddModalOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (deleteTargetId === null) return;
    await deleteExpense.mutateAsync(deleteTargetId);
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  };

  const openEditModal = (expense: BusinessExpense) => {
    setEditExpenseId(expense.id);
    setFormCategory(expense.category);
    setFormDescription(expense.description);
    setFormAmount(expense.amount);
    setFormDate(format(new Date(expense.date), 'yyyy-MM-dd'));
    setFormMiles(expense.miles || '');
    setFormStartLocation(expense.startLocation || '');
    setFormEndLocation(expense.endLocation || '');
    setFormNotes(expense.notes || '');
    setEditModalOpen(true);
  };

  const handleUpdateExpense = async () => {
    if (editExpenseId === null) return;
    
    if (!formDescription) {
      toast({ variant: "destructive", title: "Description required" });
      return;
    }

    let amount = formAmount;
    if (formCategory === 'mileage' && formMiles) {
      amount = String(parseFloat(formMiles) * IRS_MILEAGE_RATE_2025);
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({ variant: "destructive", title: "Amount required" });
      return;
    }

    await updateExpense.mutateAsync({
      id: editExpenseId,
      category: formCategory,
      description: formDescription,
      amount,
      date: formDate,
      miles: formCategory === 'mileage' ? formMiles : null,
      mileageRate: formCategory === 'mileage' ? String(IRS_MILEAGE_RATE_2025) : null,
      startLocation: formCategory === 'mileage' ? formStartLocation : null,
      endLocation: formCategory === 'mileage' ? formEndLocation : null,
      notes: formNotes || null,
      taxYear: selectedYear,
    });

    setEditModalOpen(false);
    setEditExpenseId(null);
    resetForm();
  };

  const handleExportCSV = () => {
    if (!expenses || expenses.length === 0) {
      toast({ variant: "destructive", title: "No expenses to export" });
      return;
    }

    const headers = ['Date', 'Category', 'Description', 'Amount', 'Miles', 'Notes'];
    const rows = expenses.map(e => [
      format(new Date(e.date), 'yyyy-MM-dd'),
      getCategoryLabel(e.category),
      e.description,
      `$${parseFloat(e.amount).toFixed(2)}`,
      e.miles || '',
      e.notes || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `margin-expenses-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Exported", description: `${expenses.length} expenses exported to CSV` });
  };

  const handleExportScheduleC = () => {
    const expensesByCategory: Record<string, number> = {};
    expenses?.forEach(e => {
      if (!expensesByCategory[e.category]) {
        expensesByCategory[e.category] = 0;
      }
      expensesByCategory[e.category] += parseFloat(e.amount);
    });

    const scheduleByLine: Record<string, { description: string; amount: number }> = {};
    Object.entries(expensesByCategory).forEach(([category, amount]) => {
      const mapping = SCHEDULE_C_MAPPING[category];
      if (mapping) {
        if (!scheduleByLine[mapping.line]) {
          scheduleByLine[mapping.line] = { description: mapping.description, amount: 0 };
        }
        scheduleByLine[mapping.line].amount += amount;
      }
    });

    let report = `SCHEDULE C - PROFIT OR LOSS FROM BUSINESS\n`;
    report += `Tax Year: ${selectedYear}\n`;
    report += `Generated: ${format(new Date(), 'MMMM d, yyyy')}\n`;
    report += `${'='.repeat(60)}\n\n`;

    report += `PART I - INCOME\n`;
    report += `-`.repeat(40) + `\n`;
    report += `Line 1  Gross receipts or sales............ $${grossRevenue.toFixed(2)}\n`;
    report += `Line 4  Cost of goods sold (COGS).......... $${costOfGoodsSold.toFixed(2)}\n`;
    report += `Line 5  GROSS PROFIT (Line 1 - Line 4)..... $${grossProfit.toFixed(2)}\n\n`;

    report += `PART II - EXPENSES\n`;
    report += `-`.repeat(40) + `\n`;
    
    const sortedLines = Object.entries(scheduleByLine).sort((a, b) => {
      const numA = parseInt(a[0].replace('Line ', ''));
      const numB = parseInt(b[0].replace('Line ', ''));
      return numA - numB;
    });

    sortedLines.forEach(([line, data]) => {
      const paddedLine = line.padEnd(8);
      const paddedDesc = data.description.padEnd(32);
      report += `${paddedLine}${paddedDesc} $${data.amount.toFixed(2)}\n`;
    });

    report += `-`.repeat(40) + `\n`;
    report += `Line 28 TOTAL EXPENSES.................... $${ytdTotal.toFixed(2)}\n\n`;

    report += `SUMMARY\n`;
    report += `${'='.repeat(60)}\n`;
    report += `Gross Revenue:.............. $${grossRevenue.toFixed(2)}\n`;
    report += `Cost of Goods Sold:......... $${costOfGoodsSold.toFixed(2)}\n`;
    report += `Gross Profit:............... $${grossProfit.toFixed(2)}\n`;
    report += `Total Expenses:............. $${ytdTotal.toFixed(2)}\n`;
    report += `-`.repeat(40) + `\n`;
    report += `NET PROFIT (Line 31):....... $${netProfit.toFixed(2)}\n\n`;

    report += `DETAIL - ITEMS SOLD (${soldItemsThisYear.length} items)\n`;
    report += `-`.repeat(40) + `\n`;
    soldItemsThisYear.forEach(item => {
      const soldDate = item.soldDate ? format(new Date(item.soldDate), 'MM/dd') : 'N/A';
      const title = item.title.substring(0, 35).padEnd(35);
      const cost = parseFloat(item.purchasePrice || '0');
      const sale = parseFloat(item.actualSalePrice || '0');
      const profit = sale - cost;
      report += `${soldDate} ${title} Cost: $${cost.toFixed(2)} Sale: $${sale.toFixed(2)} Profit: $${profit.toFixed(2)}\n`;
    });

    report += `\n${'='.repeat(60)}\n`;
    report += `Total Mileage: ${ytdMileage.toFixed(0)} miles @ $${IRS_MILEAGE_RATE_2025}/mile\n`;
    report += `This report is for informational purposes. Consult a tax professional.\n`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `margin-schedule-c-${selectedYear}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ 
      title: "P&L Report Exported", 
      description: `Schedule C format report for ${selectedYear} downloaded` 
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10">
        <div className="h-1 bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#3b82f6]" />
        
        <div className="bg-background/95 backdrop-blur-md border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex justify-between items-center">
              <MarginLogoFull height={48} />
              <div className="flex items-center gap-2">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-28" data-testid="select-month">
                    <Calendar className="w-3 h-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-20" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link href="/settings">
                  <Button size="icon" variant="ghost" className="text-muted-foreground" data-testid="button-settings">
                    <Settings className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="px-4 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-card rounded-lg p-2.5 border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">
                  {selectedMonth === 'all' ? 'YTD Expenses' : `${MONTHS.find(m => m.value === selectedMonth)?.label} Expenses`}
                </span>
                <p className="font-mono font-bold text-lg text-foreground" data-testid="stat-monthly-expenses">
                  ${monthlyTotal.toFixed(2)}
                </p>
              </div>
              <div className="bg-card rounded-lg p-2.5 border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">
                  {selectedMonth === 'all' ? 'YTD Mileage' : `${MONTHS.find(m => m.value === selectedMonth)?.label} Mileage`}
                </span>
                <p className="font-mono font-bold text-lg text-foreground" data-testid="stat-monthly-mileage">
                  {monthlyMileage.toFixed(0)} mi
                </p>
              </div>
            </div>
            {selectedMonth !== 'all' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-2 border border-border/30">
                  <span className="text-xs text-muted-foreground block mb-0.5">YTD Total</span>
                  <p className="font-mono font-semibold text-sm text-muted-foreground" data-testid="stat-ytd-expenses">
                    ${ytdTotal.toFixed(2)}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 border border-border/30">
                  <span className="text-xs text-muted-foreground block mb-0.5">YTD Miles</span>
                  <p className="font-mono font-semibold text-sm text-muted-foreground" data-testid="stat-ytd-mileage">
                    {ytdMileage.toFixed(0)} mi
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 pb-3 flex gap-2">
            <Button 
              className="flex-1" 
              onClick={() => setAddModalOpen(true)}
              data-testid="button-add-expense"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
            <Button 
              variant="outline" 
              onClick={handleExportCSV}
              disabled={!expenses || expenses.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline"
              className="bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/20"
              onClick={handleExportScheduleC}
              data-testid="button-export-schedule-c"
            >
              <FileText className="w-4 h-4 mr-1" />
              P&L
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-4">
        {monthlyByCategory.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {selectedMonth === 'all' ? 'YTD Summary' : `${MONTHS.find(m => m.value === selectedMonth)?.label} Summary`}
            </h3>
            <div className="space-y-2">
              {monthlyByCategory.map(cat => (
                <div key={cat.category} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(cat.category)}
                    <span className="text-sm">{getCategoryLabel(cat.category)}</span>
                    <Badge variant="secondary" className="text-xs">{cat.count}</Badge>
                  </div>
                  <span className="font-mono font-medium">${cat.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {isLoading ? (
          <HistoryPageSkeleton />
        ) : filteredExpenses.length > 0 ? (
          <div className="space-y-3">
            {filteredExpenses.map((expense, index) => (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <Card className="p-4" data-testid={`card-expense-${expense.id}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${getCategoryColor(expense.category)}`}>
                          {getCategoryIcon(expense.category)}
                          <span className="ml-1">{getCategoryLabel(expense.category)}</span>
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(expense.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{expense.description}</p>
                      {expense.category === 'mileage' && expense.miles && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {expense.startLocation} → {expense.endLocation} ({expense.miles} mi)
                        </p>
                      )}
                      {expense.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{expense.notes}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-bold text-lg">${parseFloat(expense.amount).toFixed(2)}</p>
                      <div className="flex gap-1 mt-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => openEditModal(expense)}
                          data-testid={`button-edit-expense-${expense.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setDeleteTargetId(expense.id);
                            setDeleteConfirmOpen(true);
                          }}
                          data-testid={`button-delete-expense-${expense.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div 
            className="text-center py-16 px-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border mb-6">
              <DollarSign className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-foreground">
              {selectedMonth === 'all' ? 'No expenses yet' : `No expenses in ${MONTHS.find(m => m.value === selectedMonth)?.label}`}
            </h3>
            <p className="text-muted-foreground text-base mb-8 max-w-xs mx-auto leading-relaxed">
              {selectedMonth === 'all' 
                ? 'Track your business expenses for tax deductions.'
                : 'Add expenses for this month or select a different time period.'}
            </p>
            <Button 
              size="lg" 
              className="shadow-lg px-8"
              onClick={() => setAddModalOpen(true)}
              data-testid="button-add-first-expense"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add First Expense
            </Button>
          </motion.div>
        )}
      </main>

      <BottomNav />

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Track a business expense for {selectedYear}.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description</Label>
              <Input 
                placeholder={formCategory === 'mileage' ? "Trip to Goodwill" : "What did you buy?"}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                data-testid="input-expense-description"
              />
            </div>

            <div>
              <Label>Date</Label>
              <Input 
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                data-testid="input-expense-date"
              />
            </div>

            {formCategory === 'mileage' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Location</Label>
                    <Input 
                      placeholder="Home"
                      value={formStartLocation}
                      onChange={(e) => setFormStartLocation(e.target.value)}
                      data-testid="input-start-location"
                    />
                  </div>
                  <div>
                    <Label>End Location</Label>
                    <Input 
                      placeholder="Goodwill"
                      value={formEndLocation}
                      onChange={(e) => setFormEndLocation(e.target.value)}
                      data-testid="input-end-location"
                    />
                  </div>
                </div>
                <div>
                  <Label>Miles (round trip)</Label>
                  <Input 
                    type="number"
                    placeholder="15"
                    value={formMiles}
                    onChange={(e) => setFormMiles(e.target.value)}
                    data-testid="input-miles"
                  />
                  {formMiles && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Deduction: ${(parseFloat(formMiles) * IRS_MILEAGE_RATE_2025).toFixed(2)} 
                      <span className="ml-1">(@ ${IRS_MILEAGE_RATE_2025}/mi)</span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <Label>Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    data-testid="input-expense-amount"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Textarea 
                placeholder="Additional details..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                data-testid="input-expense-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAddExpense}
              disabled={createExpense.isPending}
              data-testid="button-save-expense"
            >
              {createExpense.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={(open) => {
        setEditModalOpen(open);
        if (!open) {
          setEditExpenseId(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>Update expense details.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger data-testid="edit-select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description</Label>
              <Input 
                placeholder="e.g., Trip to Goodwill"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                data-testid="edit-input-expense-description"
              />
            </div>

            <div>
              <Label>Date</Label>
              <Input 
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                data-testid="edit-input-expense-date"
              />
            </div>

            {formCategory === 'mileage' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Location</Label>
                    <Input 
                      placeholder="Home"
                      value={formStartLocation}
                      onChange={(e) => setFormStartLocation(e.target.value)}
                      data-testid="edit-input-start-location"
                    />
                  </div>
                  <div>
                    <Label>End Location</Label>
                    <Input 
                      placeholder="Goodwill"
                      value={formEndLocation}
                      onChange={(e) => setFormEndLocation(e.target.value)}
                      data-testid="edit-input-end-location"
                    />
                  </div>
                </div>
                <div>
                  <Label>Miles (round trip)</Label>
                  <Input 
                    type="number"
                    placeholder="15"
                    value={formMiles}
                    onChange={(e) => setFormMiles(e.target.value)}
                    data-testid="edit-input-miles"
                  />
                  {formMiles && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Deduction: ${(parseFloat(formMiles) * IRS_MILEAGE_RATE_2025).toFixed(2)} 
                      <span className="ml-1">(@ ${IRS_MILEAGE_RATE_2025}/mi)</span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <Label>Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    data-testid="edit-input-expense-amount"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Textarea 
                placeholder="Additional details..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                data-testid="edit-input-expense-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleUpdateExpense}
              disabled={updateExpense.isPending}
              data-testid="button-update-expense"
            >
              {updateExpense.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Expense?</DialogTitle>
            <DialogDescription>
              This will permanently remove this expense record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteExpense.isPending}
              data-testid="button-confirm-delete-expense"
            >
              {deleteExpense.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
