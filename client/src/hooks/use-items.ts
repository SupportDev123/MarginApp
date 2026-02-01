import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

export function useItems() {
  return useQuery({
    queryKey: [api.items.list.path],
    queryFn: async () => {
      const res = await fetch(api.items.list.path);
      if (!res.ok) throw new Error("Failed to fetch items");
      return api.items.list.responses[200].parse(await res.json());
    },
  });
}

export function useExtractItem() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(api.items.extract.path, {
        method: api.items.extract.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Extraction failed");
      }
      return api.items.extract.responses[200].parse(await res.json());
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Extraction Failed",
        description: error.message,
      });
    },
  });
}

type ConfirmInput = z.infer<typeof api.items.confirmAndAnalyze.input>;

export function useConfirmAndAnalyze() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: ConfirmInput) => {
      const res = await fetch(api.items.confirmAndAnalyze.path, {
        method: api.items.confirmAndAnalyze.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Analysis failed");
      }
      return api.items.confirmAndAnalyze.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: error.message,
      });
    },
  });
}

type DecisionInput = z.infer<typeof api.items.updateDecision.input>;

export function useScanStatus() {
  return useQuery({
    queryKey: [api.user.scanStatus.path],
    queryFn: async () => {
      const res = await fetch(api.user.scanStatus.path);
      if (!res.ok) throw new Error("Failed to fetch scan status");
      return api.user.scanStatus.responses[200].parse(await res.json());
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useUpdateDecision() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: DecisionInput['decision'] }) => {
      const res = await fetch(`/api/items/${id}/decision`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update decision");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    },
  });
}

export function useUpdateFlipPrice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, flipPrice }: { id: number; flipPrice: number }) => {
      const res = await fetch(`/api/items/${id}/flip`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flipPrice }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to record flip price");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
      toast({
        title: "Flip Recorded",
        description: "Your sale has been recorded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Record Flip",
        description: error.message,
      });
    },
  });
}

// ========== INVENTORY HOOKS ==========

export function useInventory() {
  return useQuery({
    queryKey: [api.inventory.list.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.list.path);
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return api.inventory.list.responses[200].parse(await res.json());
    },
  });
}

type CreateInventoryInput = z.infer<typeof api.inventory.create.input>;

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateInventoryInput) => {
      const res = await fetch(api.inventory.create.path, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add to inventory");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      toast({
        title: "Added to Inventory",
        description: "Item has been added to your inventory.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Add",
        description: error.message,
      });
    },
  });
}

type UpdateInventoryInput = z.infer<typeof api.inventory.update.input>;

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateInventoryInput) => {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update inventory item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    },
  });
}

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete inventory item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.inventory.list.path] });
      toast({
        title: "Item Removed",
        description: "Item has been removed from your inventory.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message,
      });
    },
  });
}

// ========== EXPENSE HOOKS ==========

export interface BusinessExpense {
  id: number;
  userId: number;
  category: string;
  description: string;
  amount: string;
  date: string;
  miles?: string | null;
  mileageRate?: string | null;
  startLocation?: string | null;
  endLocation?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
  taxYear: number;
  createdAt: string;
  updatedAt: string;
}

export function useExpenses(taxYear?: number) {
  const url = taxYear ? `/api/expenses?year=${taxYear}` : '/api/expenses';
  return useQuery<BusinessExpense[]>({
    queryKey: ['/api/expenses', taxYear],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
  });
}

export function useExpenseSummary(taxYear: number) {
  return useQuery<{ category: string; total: number; count: number }[]>({
    queryKey: ['/api/expenses/summary', taxYear],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/summary/${taxYear}`);
      if (!res.ok) throw new Error("Failed to fetch expense summary");
      return res.json();
    },
  });
}

interface CreateExpenseInput {
  category: string;
  description: string;
  amount: string;
  date?: string;
  miles?: string;
  mileageRate?: string;
  startLocation?: string;
  endLocation?: string;
  notes?: string;
  taxYear: number;
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create expense");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({
        title: "Expense Added",
        description: "Your expense has been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Add Expense",
        description: error.message,
      });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete expense");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({
        title: "Expense Removed",
        description: "Expense has been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message,
      });
    },
  });
}

export interface UpdateExpenseInput {
  category?: string;
  description?: string;
  amount?: string;
  date?: string;
  miles?: string | null;
  mileageRate?: string | null;
  startLocation?: string | null;
  endLocation?: string | null;
  notes?: string | null;
  taxYear?: number;
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateExpenseInput & { id: number }) => {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update expense");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({
        title: "Expense Updated",
        description: "Your expense has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    },
  });
}

// ========== SOURCING LOCATION HOOKS ==========

export interface SourcingLocation {
  id: number;
  userId: number;
  name: string;
  type: string;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
}

export function useSourcingLocations() {
  return useQuery<SourcingLocation[]>({
    queryKey: ['/api/sourcing-locations'],
    queryFn: async () => {
      const res = await fetch('/api/sourcing-locations');
      if (!res.ok) throw new Error("Failed to fetch sourcing locations");
      return res.json();
    },
  });
}

export function useCreateSourcingLocation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { name: string; type: string; address?: string; notes?: string }) => {
      const res = await fetch('/api/sourcing-locations', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create location");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sourcing-locations'] });
      toast({
        title: "Location Added",
        description: "Sourcing location has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Add Location",
        description: error.message,
      });
    },
  });
}

