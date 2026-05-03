/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Upload, 
  TrendingUp, 
  ShieldCheck, 
  Trash2, 
  AlertCircle,
  ChevronRight,
  Wallet,
  Settings,
  BrainCircuit,
  CreditCard,
  Building2,
  MoreHorizontal,
  Sparkles,
  Send,
  X,
  Search,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { useDropzone } from 'react-dropzone';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Transaction, SavingsInsight, TransactionCategory, Account, AccountType, DEFAULT_CATEGORIES } from './lib/types';
import { StorageService } from './lib/storage';
import { GeminiService } from './lib/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_CATEGORY_COLORS: Record<string, string> = {
  'Housing': '#ef4444',
  'Food & Dining': '#f97316',
  'Shopping': '#10b981',
  'Entertainment': '#3b82f6',
  'Utilities': '#6366f1',
  'Health': '#8b5cf6',
  'Personal': '#ec4899',
  'Vacation & Stays': '#0ea5e9',
  'Fuel': '#f59e0b',
  'Investment': '#6366f1',
  'Salary': '#059669',
  'Dividends': '#10b981',
  'Interest': '#34d399',
  'Transfer': '#94a3b8',
  'Income': '#22c55e',
  'Cashback': '#059669',
  'Other': '#71717a',
};

const RANDOM_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#0ea5e9', '#f43f5e', '#14b8a6', '#06b6d4'
];

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [insights, setInsights] = useState<SavingsInsight[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'accounts' | 'categories'>('dashboard');
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<TransactionCategory | 'All'>('All');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilterType, setDateFilterType] = useState<'All' | 'Month' | 'Custom'>('All');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<Account>>({ type: 'Credit Card', name: '', color: '#0f172a', cashbackRate: 0 });
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [savedTransactions, savedInsights, savedAccounts, savedCategories] = await Promise.all([
      StorageService.getTransactions(),
      StorageService.getInsights(),
      StorageService.getAccounts(),
      StorageService.getCategories()
    ]);

    const currentCategories = savedCategories || [...DEFAULT_CATEGORIES];
    setCategories(currentCategories);

    // Initialize colors for all categories
    const colors: Record<string, string> = { ...INITIAL_CATEGORY_COLORS };
    currentCategories.forEach(cat => {
      if (!colors[cat]) {
        colors[cat] = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
      }
    });
    setCategoryColors(colors);

    // Ensure we have at least one default account if none exist
    let currentAccounts = savedAccounts.map(a => ({ ...a, cashbackRate: a.cashbackRate || 0 }));
    if (savedAccounts.length === 0) {
      currentAccounts = [{
        id: 'default',
        name: 'Primary Account',
        type: 'Savings',
        color: '#0f172a',
        balance: 0,
        cashbackRate: 0
      }];
      await StorageService.saveAccounts(currentAccounts);
    }
    
    setAccounts(currentAccounts);
    setTransactions(savedTransactions);
    setInsights(savedInsights);
    setLoading(false);
  };

  const [importAccountId, setImportAccountId] = useState<string>('auto');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim() || isAsking) return;
    
    setIsAsking(true);
    try {
      const answer = await GeminiService.askAboutSpending(aiQuestion, transactions, accounts);
      setAiAnswer(answer);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAsking(false);
    }
  };

  const refreshInsights = async () => {
    if (transactions.length === 0) return;
    setIsAnalyzing(true);
    try {
      const newInsights = await GeminiService.getSavingsInsights(transactions, accounts);
      setInsights(newInsights);
      await StorageService.saveInsights(newInsights);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processText = async (text: string) => {
    setIsParsing(true);
    try {
      const parsed = await GeminiService.parseStatement(text);
      const newTransactionsRaw = parsed.transactions;
      
      let targetAccountId = importAccountId;
      
      // Auto-detection logic
      if (importAccountId === 'auto' && parsed.accountInfo) {
        const info = parsed.accountInfo;
        // Try to find matching account
        const matchedAccount = accounts.find(a => 
          (info.lastFour && a.lastFour === info.lastFour) || 
          (info.name && a.name.toLowerCase().includes(info.name.toLowerCase()))
        );
        
        if (matchedAccount) {
          targetAccountId = matchedAccount.id;
        } else {
          // If no match found, create a new one based on AI hints
          const newAcc: Account = {
            id: crypto.randomUUID(),
            name: info.name || 'New Detected Account',
            type: info.type || 'Credit Card',
            color: '#'+Math.floor(Math.random()*16777215).toString(16),
            lastFour: info.lastFour
          };
          const updatedAccounts = [...accounts, newAcc];
          setAccounts(updatedAccounts);
          await StorageService.saveAccounts(updatedAccounts);
          targetAccountId = newAcc.id;
        }
      } else if (importAccountId === 'auto') {
        // Default fallback if AI couldn't detect and it was set to auto
        targetAccountId = accounts[0].id;
      }

      const newTransactions = newTransactionsRaw.map(t => ({
        ...t,
        accountId: targetAccountId
      }));
      
      // Deduplication logic: Filter out transactions that already exist based on unique fingerprint
      const existingFingerprints = new Set(
        transactions.map(t => `${t.date}-${t.description}-${t.amount}-${t.accountId}`)
      );
      
      const filteredNewTransactions = newTransactions.filter(t => {
        const fingerprint = `${t.date}-${t.description}-${t.amount}-${t.accountId}`;
        return !existingFingerprints.has(fingerprint);
      });

      if (filteredNewTransactions.length === 0 && newTransactions.length > 0) {
        alert("No new unique transactions found for this account. All entries are already in your vault.");
        return true;
      }

      const updatedTransactions = [...filteredNewTransactions, ...transactions];
      await StorageService.saveTransactions(updatedTransactions);
      setTransactions(updatedTransactions);
      
      const newInsights = await GeminiService.getSavingsInsights(updatedTransactions, accounts);
      setInsights(newInsights);
      await StorageService.saveInsights(newInsights);
      return true;
    } catch (error) {
      alert("Error parsing data. Ensure it contains recognizable transaction info.");
      return false;
    } finally {
      setIsParsing(false);
    }
  };

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const handleFileUpload = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const text = await file.text();
    await processText(text);
  };

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    const success = await processText(pasteText);
    if (success) {
      setPasteText("");
      setIsPasteModalOpen(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileUpload as any,
    accept: { 'text/plain': ['.txt', '.csv'] },
    multiple: false
  } as any);

  const clearData = async () => {
    await StorageService.clearAll();
    setTransactions([]);
    setInsights([]);
    setIsClearConfirmOpen(false);
  };

  const [isAccountDeleteConfirmOpen, setIsAccountDeleteConfirmOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  const deleteAccount = async () => {
    if (!accountToDelete) return;
    if (accounts.length <= 1) {
      alert("You must have at least one account.");
      setAccountToDelete(null);
      setIsAccountDeleteConfirmOpen(false);
      return;
    }
    
    const id = accountToDelete;
    const updatedAccounts = accounts.filter(a => a.id !== id);
    const updatedTransactions = transactions.filter(t => t.accountId !== id);
    
    setAccounts(updatedAccounts);
    setTransactions(updatedTransactions);
    
    await StorageService.saveAccounts(updatedAccounts);
    await StorageService.saveTransactions(updatedTransactions);
    
    if (selectedAccountFilter === id) {
      setSelectedAccountFilter('All');
    }
    
    setAccountToDelete(null);
    setIsAccountDeleteConfirmOpen(false);
  };

  const addAccount = async () => {
    if (!newAccount.name) return;
    const acc: Account = {
      id: crypto.randomUUID(),
      name: newAccount.name,
      type: newAccount.type as AccountType,
      color: newAccount.color || '#0f172a',
      lastFour: newAccount.lastFour,
      balance: 0,
      cashbackRate: newAccount.cashbackRate || 0
    };
    const updated = [...accounts, acc];
    setAccounts(updated);
    await StorageService.saveAccounts(updated);
    setIsAddAccountModalOpen(false);
    setNewAccount({ type: 'Credit Card', name: '', color: '#0f172a' });
  };

  const updateTransactionCategory = async (transactionId: string, newCategory: TransactionCategory) => {
    const updated = transactions.map(t => t.id === transactionId ? { ...t, category: newCategory } : t);
    setTransactions(updated);
    await StorageService.saveTransactions(updated);
  };

  const addCategory = async (name: string) => {
    if (!name || categories.includes(name)) return;
    const updated = [...categories, name];
    setCategories(updated);
    const newColor = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
    setCategoryColors({ ...categoryColors, [name]: newColor });
    await StorageService.saveCategories(updated);
  };

  const removeCategory = async (name: string) => {
    if (['Income', 'Cashback', 'Other'].includes(name)) {
      alert("You cannot remove core system categories.");
      return;
    }
    const updated = categories.filter(c => c !== name);
    setCategories(updated);
    await StorageService.saveCategories(updated);
    
    // Update transactions that were in this category to 'Other'
    const updatedTransactions = transactions.map(t => t.category === name ? { ...t, category: 'Other' } : t);
    setTransactions(updatedTransactions);
    await StorageService.saveTransactions(updatedTransactions);
  };

  // Computing stats
  const filteredTransactions = transactions.filter(t => {
    let matchesCategory = selectedCategoryFilter === 'All' || t.category === selectedCategoryFilter;
    
    // Support for the virtual category 'Refunds/Credits' from the income breakdown
    if (selectedCategoryFilter === 'Refunds/Credits') {
      matchesCategory = t.amount < 0 && !['Income', 'Cashback', 'Salary', 'Dividends', 'Interest'].includes(t.category);
    }

    const matchesAccount = selectedAccountFilter === 'All' || t.accountId === selectedAccountFilter;
    const matchesSearch = t.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         t.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesDate = true;
    if (dateFilterType === 'Month') {
      matchesDate = t.date.startsWith(selectedMonth);
    } else if (dateFilterType === 'Custom') {
      if (startDate) matchesDate = matchesDate && t.date >= startDate;
      if (endDate) matchesDate = matchesDate && t.date <= endDate;
    }

    return matchesCategory && matchesAccount && matchesSearch && matchesDate;
  });

  const spendingByCategory = filteredTransactions.reduce((acc, t) => {
    if (t.category === 'Income' || t.category === 'Cashback' || t.category === 'Salary' || t.category === 'Dividends' || t.category === 'Interest' || t.category === 'Transfer') return acc;
    // t.amount is positive for spends, negative for refunds/credits
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {} as Record<string, number>);

  const incomeByCategory = filteredTransactions.reduce((acc, t) => {
    if (t.category === 'Income' || t.category === 'Cashback' || t.category === 'Salary' || t.category === 'Dividends' || t.category === 'Interest' || t.amount < 0) {
        if (t.category === 'Transfer') return acc;
        let cat = t.category;
        // If it's a negative amount but not explicitly an income/cashback category, it's a refund/credit
        if (t.amount < 0 && !['Income', 'Cashback', 'Salary', 'Dividends', 'Interest'].includes(t.category)) {
            cat = 'Refunds/Credits';
        }
        
        if (['Income', 'Cashback', 'Salary', 'Dividends', 'Interest', 'Refunds/Credits'].includes(cat)) {
            acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
        }
    }
    return acc;
  }, {} as Record<string, number>);

  const incomeChartData = Object.entries(incomeByCategory)
    .filter(([name, value]) => (value as number) > 0 && !hiddenCategories.has(name))
    .map(([name, value]) => ({ name, value: value as number }));

  // Ensure we don't have negative spending for a category (can happen if refunds > spending in a period)
  Object.keys(spendingByCategory).forEach(cat => {
    if (spendingByCategory[cat] < 0) spendingByCategory[cat] = 0;
  });

  const chartData = Object.entries(spendingByCategory)
    .filter(([name, value]) => (value as number) > 0 && !hiddenCategories.has(name))
    .map(([name, value]) => ({ name, value: value as number }));
  
  const toggleCategoryVisibility = (category: string) => {
    const next = new Set(hiddenCategories);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    setHiddenCategories(next);
  };
  
  const filteredSpending = (Object.values(spendingByCategory) as number[]).reduce((a, b) => a + b, 0);
  
  const filteredIncome = (Object.values(incomeByCategory) as number[]).reduce((a, b) => a + b, 0);
  
  const filteredCashback = accounts.reduce((sum, acc) => {
    const accSpending = filteredTransactions
      .filter(t => t.accountId === acc.id && !['Income', 'Cashback', 'Salary', 'Dividends', 'Interest', 'Transfer'].includes(t.category) && t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    return sum + (accSpending * (acc.cashbackRate || 0) / 100);
  }, 0) + filteredTransactions
    .filter(t => t.category === 'Cashback')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const potentialOptimizations = insights.reduce((sum, i) => sum + i.potentialSavings, 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <BrainCircuit className="w-12 h-12 text-slate-900 animate-pulse" />
          <p className="text-slate-500 font-medium tracking-tight">Securing your vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 md:pl-64">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex-col p-6">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold">P</div>
          <h1 className="text-lg font-semibold tracking-tight">PrivateVault</h1>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-6 px-6 space-y-8">
          <nav className="space-y-1">
            <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<TrendingUp size={18} />} label="Overview" />
            <NavItem active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} icon={<Plus size={18} />} label="Activity" />
            <NavItem active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} icon={<CreditCard size={18} />} label="My Accounts" />
            <NavItem active={activeTab === 'categories'} onClick={() => setActiveTab('categories')} icon={<Settings size={18} />} label="Categories" />
          </nav>

          <div className="space-y-4">
            <div className="px-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Accounts</span>
              <button 
                onClick={() => {
                  setNewAccount({ type: 'Credit Card', name: '', color: '#0f172a', cashbackRate: 0 });
                  setIsAddAccountModalOpen(true);
                }} 
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            <div className="space-y-1">
              {accounts.map(acc => (
                <button 
                  key={acc.id} 
                  onClick={() => {
                    setSelectedAccountFilter(acc.id);
                    setActiveTab('transactions');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-all text-left group"
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: acc.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{acc.name}</p>
                    <p className="text-[9px] text-slate-400 font-medium">
                      {acc.type === 'Credit Card' ? `Card • ${acc.lastFour || 'XXXX'}` : 'Savings'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 space-y-4 border-t border-slate-100">
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold mb-1">Privacy Mode</p>
            <p className="text-xs text-emerald-700 leading-relaxed">All data stored locally. No cloud sync active.</p>
          </div>
          <button 
            onClick={() => setIsClearConfirmOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-600 transition-colors text-xs font-medium"
          >
            <Trash2 size={14} />
            <span>Clear Local Vault</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              {activeTab === 'dashboard' ? 'Financial Overview' : 'Activity Journal'}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {activeTab === 'dashboard' ? `Based on ${transactions.length} entries in your vault` : 'A chronological record of processed statements.'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsPasteModalOpen(true)}
                className="flex items-center gap-2 bg-white border border-slate-200 text-slate-900 px-5 py-2.5 rounded-xl transition-all shadow-sm hover:bg-slate-50 font-medium"
              >
                <Plus size={16} />
                <span className="text-sm">Paste Statement</span>
             </button>

             <div 
              {...getRootProps()} 
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-xl bg-slate-900 text-white px-5 py-2.5 transition-all shadow-sm hover:bg-slate-800",
                isParsing && "pointer-events-none opacity-50"
              )}
            >
              <input {...getInputProps()} />
              <div className="flex items-center gap-2">
                <Upload className={cn("w-4 h-4", isParsing && "animate-bounce")} />
                <span className="text-sm font-medium">
                  {isParsing ? "AI Analyzing..." : "Import File"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Global Filters */}
        {(activeTab === 'dashboard' || activeTab === 'transactions') && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 group focus-within:ring-2 focus-within:ring-slate-900/5 transition-all">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Search activity..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none p-0 text-xs font-medium text-slate-900 outline-none w-full"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-900">
                  <X size={12} />
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <select 
                value={selectedAccountFilter}
                onChange={(e) => setSelectedAccountFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
              >
                <option value="All">All Accounts</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>

              <select 
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
              >
                <option value="All">All Categories</option>
                <option value="Transfer">Transfers</option>
                <option value="Refunds/Credits">Refunds & Credits</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

              <select 
                value={dateFilterType}
                onChange={(e) => setDateFilterType(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
              >
                <option value="All">All Time</option>
                <option value="Month">By Month</option>
                <option value="Custom">Custom Range</option>
              </select>

              {dateFilterType === 'Month' && (
                <input 
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                />
              )}

              {dateFilterType === 'Custom' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                  />
                  <span className="text-slate-400 text-[10px] font-bold uppercase">to</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Paste Modal */}
        <AnimatePresence>
          {isPasteModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200"
              >
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Paste Statement Text</h3>
                      <p className="text-slate-500 text-sm mt-1">Copy raw text from your password-protected PDF and paste it here.</p>
                    </div>
                    <button onClick={() => setIsPasteModalOpen(false)} className="text-slate-400 hover:text-slate-900 p-2">
                      <Plus size={20} className="rotate-45" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest pl-1">Target Account</label>
                       <select 
                         value={importAccountId}
                         onChange={(e) => setImportAccountId(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900/5 appearance-none"
                       >
                         <option value="auto">✨ Detect Automatically</option>
                         {accounts.map(acc => (
                           <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest pl-1">Processing Method</label>
                       <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 flex items-center gap-2">
                          <BrainCircuit size={14} className="text-slate-400" />
                          Local AI Inference
                       </div>
                    </div>
                  </div>
                  
                  <textarea 
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="E.g. 12/04/2024 UPI/Zomato/1239... 450.00 DR"
                    className="w-full h-64 bg-slate-50 border border-slate-200 rounded-2xl p-6 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-900/5 resize-none transition-all"
                  />

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                       <ShieldCheck size={12} className="text-emerald-500" />
                       Processed locally via AI
                    </div>
                    <button 
                      onClick={handlePasteSubmit}
                      disabled={!pasteText.trim() || isParsing}
                      className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200"
                    >
                      {isParsing ? "Analyzing..." : "Analyze Local Data"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Purge Vault Confirmation Modal */}
        <AnimatePresence>
          {isClearConfirmOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200"
              >
                <div className="p-8 space-y-6 text-center">
                  <div className="mx-auto w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                    <Trash2 size={24} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-900">Purge Data Vault?</h3>
                    <p className="text-slate-500 text-sm">This action is permanent. All your locally stored transactions, budgets, and AI insights will be erased forever.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={() => setIsClearConfirmOpen(false)}
                      className="px-6 py-3 rounded-xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={clearData}
                      className="px-6 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-100"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Account Delete Confirmation Modal */}
        <AnimatePresence>
          {isAccountDeleteConfirmOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200"
              >
                <div className="p-8 space-y-6 text-center">
                  <div className="mx-auto w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                    <Trash2 size={24} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-900">Remove Account?</h3>
                    <p className="text-slate-500 text-sm">All transactions linked to this account will be permanently erased. This cannot be undone.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={() => {
                        setIsAccountDeleteConfirmOpen(false);
                        setAccountToDelete(null);
                      }}
                      className="px-6 py-3 rounded-xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50"
                    >
                      Keep It
                    </button>
                    <button 
                      onClick={deleteAccount}
                      className="px-6 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Account Modal */}
        <AnimatePresence>
          {isAddAccountModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200"
              >
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-bold text-slate-900">New Account</h3>
                    <button onClick={() => setIsAddAccountModalOpen(false)} className="text-slate-400 hover:text-slate-900 p-2">
                      <Plus size={20} className="rotate-45" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Account Name</label>
                      <input 
                        value={newAccount.name} 
                        onChange={e => setNewAccount({...newAccount, name: e.target.value})}
                        placeholder="E.g. Sapphire Preferred" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900/5"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Type</label>
                        <select 
                          value={newAccount.type}
                          onChange={e => setNewAccount({...newAccount, type: e.target.value as any})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none"
                        >
                          <option value="Credit Card">Credit Card</option>
                          <option value="Savings">Savings</option>
                          <option value="Wallet">Wallet</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cashback %</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={newAccount.cashbackRate}
                          onChange={e => setNewAccount({...newAccount, cashbackRate: parseFloat(e.target.value) || 0})}
                          placeholder="e.g. 1.5" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900/5"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Last 4 Digits</label>
                      <input 
                        value={newAccount.lastFour}
                        onChange={e => setNewAccount({...newAccount, lastFour: e.target.value})}
                        placeholder="1234" 
                        maxLength={4}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Color Theme</label>
                      <div className="flex flex-wrap gap-2">
                        {['#0f172a', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'].map(c => (
                          <button 
                            key={c}
                            onClick={() => setNewAccount({...newAccount, color: c})}
                            className={cn(
                              "w-8 h-8 rounded-full border-2 transition-all",
                              newAccount.color === c ? "border-slate-900 scale-110" : "border-transparent"
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={addAccount}
                    disabled={!newAccount.name}
                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 disabled:opacity-50 shadow-lg shadow-slate-200"
                  >
                    Add Account
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && (
              <div className="space-y-10">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  <StatCard 
                    label="Total Income" 
                    value={formatCurrency(filteredIncome)} 
                    color="text-emerald-600"
                    subtitle="Credits & Earnings"
                  />
                  <StatCard 
                    label="Total Spending" 
                    value={formatCurrency(filteredSpending)} 
                    subtitle={`${filteredTransactions.length} items filtered`}
                  />
                  <StatCard 
                    label="Net Savings" 
                    value={formatCurrency(filteredIncome - filteredSpending)} 
                    color="text-emerald-500"
                    subtitle={`Savings rate: ${filteredIncome > 0 ? Math.round(( (filteredIncome - filteredSpending) / filteredIncome) * 100) : 0}%`}
                  />
                  <StatCard 
                    label="Cashback Earned" 
                    value={formatCurrency(filteredCashback)} 
                    color="text-emerald-500"
                    subtitle="Rewards earned in period"
                  />
                  <StatCard 
                    label="AI Profit Potential" 
                    value={formatCurrency(potentialOptimizations)} 
                    color="text-indigo-600"
                    subtitle="Missed rewards identified"
                  />
                </div>

                {/* Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                       <h4 className="font-bold">Spending by Category</h4>
                       <div className="text-[10px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1 uppercase font-bold text-slate-400">
                         {dateFilterType === 'Month' ? selectedMonth : dateFilterType === 'Custom' ? 'Custom Range' : 'All Statements'}
                       </div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center gap-8">
                      <div className="relative w-48 h-48 cursor-pointer group/pie">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData}
                              innerRadius={65}
                              outerRadius={85}
                              paddingAngle={4}
                              dataKey="value"
                              onClick={(data) => {
                                if (data && data.name) {
                                  setSelectedCategoryFilter(data.name as TransactionCategory);
                                  setActiveTab('transactions');
                                }
                              }}
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#0f172a' : (categoryColors[entry.name as string] || '#cbd5e1')} />
                              ))}
                            </Pie>
                            <Tooltip 
                               contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                           <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Largest</span>
                           <span className="text-sm font-bold text-slate-900">
                             {[...chartData].sort((a, b) => (b.value as number) - (a.value as number))[0]?.name || 'N/A'}
                           </span>
                        </div>
                      </div>
                      <div className="w-full grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries(spendingByCategory)
                          .filter(([_, val]) => (val as number) > 0)
                          .sort((a, b) => (b[1] as number) - (a[1] as number))
                          .map(([name, value]) => (
                            <div 
                              key={name}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategoryVisibility(name);
                              }}
                              className={cn(
                                "flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-all group/cat border border-transparent",
                                hiddenCategories.has(name) ? "opacity-40 grayscale" : "hover:border-slate-100"
                              )}
                            >
                              <div className="relative flex items-center justify-center">
                                <div 
                                  className="w-4 h-4 rounded-md border border-slate-200" 
                                  style={{ backgroundColor: categoryColors[name] }} 
                                />
                                {!hiddenCategories.has(name) && (
                                  <div className="absolute inset-0 flex items-center justify-center text-white">
                                    <Check size={10} strokeWidth={4} />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0" onClick={(e) => {
                                if (!hiddenCategories.has(name)) {
                                  e.stopPropagation();
                                  setSelectedCategoryFilter(name as TransactionCategory);
                                  setActiveTab('transactions');
                                }
                              }}>
                                <span className={cn(
                                  "text-sm font-semibold truncate block transition-colors",
                                  hiddenCategories.has(name) ? "text-slate-400 line-through" : "text-slate-600 group-hover/cat:text-slate-900"
                                )}>
                                  {name}
                                </span>
                              </div>
                              <span className="text-sm text-slate-400 font-mono ml-auto group-hover/cat:text-slate-600">
                                {formatCurrency(value as number)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </section>

                  <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                       <h4 className="font-bold">Income Breakdown</h4>
                       <div className="text-[10px] bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1 uppercase font-bold text-emerald-600">
                         Current Period
                       </div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center gap-8">
                      <div className="relative w-48 h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={incomeChartData}
                              innerRadius={65}
                              outerRadius={85}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {incomeChartData.map((entry, index) => {
                                const colors: Record<string, string> = {
                                  'Salary': '#059669',
                                  'Dividends': '#10b981',
                                  'Interest': '#34d399',
                                  'Income': '#6ee7b7',
                                  'Cashback': '#a7f3d0',
                                  'Refunds/Credits': '#d1fae5'
                                };
                                return <Cell key={`cell-income-${index}`} fill={colors[entry.name] || '#cbd5e1'} />;
                              })}
                            </Pie>
                            <Tooltip 
                               contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                           <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Total</span>
                           <span className="text-sm font-bold text-slate-900">
                             {formatCurrency(filteredIncome)}
                           </span>
                        </div>
                      </div>
                      <div className="w-full grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries(incomeByCategory)
                          .filter(([_, val]) => (val as number) > 0)
                          .sort((a, b) => (b[1] as number) - (a[1] as number))
                          .map(([name, value]) => {
                            const colors: Record<string, string> = {
                              'Salary': '#059669',
                              'Dividends': '#10b981',
                              'Interest': '#34d399',
                              'Income': '#6ee7b7',
                              'Cashback': '#a7f3d0',
                              'Refunds/Credits': '#d1fae5'
                            };
                            return (
                              <div 
                                key={name}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCategoryVisibility(name);
                                }}
                                className={cn(
                                  "flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-all group/income border border-transparent",
                                  hiddenCategories.has(name) ? "opacity-40 grayscale" : "hover:border-slate-100"
                                )}
                              >
                                <div className="relative flex items-center justify-center">
                                  <div 
                                    className="w-4 h-4 rounded-md border border-slate-200" 
                                    style={{ backgroundColor: colors[name] || '#cbd5e1' }} 
                                  />
                                  {!hiddenCategories.has(name) && (
                                    <div className="absolute inset-0 flex items-center justify-center text-white">
                                      <Check size={10} strokeWidth={4} />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0" onClick={(e) => {
                                  if (!hiddenCategories.has(name)) {
                                    e.stopPropagation();
                                    setSelectedCategoryFilter(name as TransactionCategory);
                                    setActiveTab('transactions');
                                  }
                                }}>
                                  <span className={cn(
                                    "text-sm font-semibold truncate block transition-colors",
                                    hiddenCategories.has(name) ? "text-slate-400 line-through" : "text-slate-600 group-hover/income:text-slate-900"
                                  )}>
                                    {name}
                                  </span>
                                </div>
                                <span className="text-sm text-slate-400 font-mono ml-auto group-hover/income:text-slate-600">
                                  {formatCurrency(value as number)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </section>
                </div>

                {/* Savings Insights */}
                <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex flex-col md:flex-row gap-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[80px]" />
                  <div className="md:w-1/3 space-y-4 relative">
                    <div className="flex items-center gap-3 mb-4">
                       <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-sm">💡</div>
                       <h4 className="font-bold text-sm uppercase tracking-wider">AI Optimizer</h4>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      AI scans your card benefits vs actual spending to find missed cashbacks and better payment options.
                    </p>
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={refreshInsights}
                        disabled={isAnalyzing || transactions.length === 0}
                        className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed group w-full"
                      >
                        <Sparkles size={14} className={cn("text-emerald-400", isAnalyzing && "animate-pulse")} />
                        {isAnalyzing ? 'Analyzing Patterns...' : 'Refresh Optimization'}
                      </button>

                      <form onSubmit={handleAskAi} className="space-y-2 mt-4 pt-4 border-t border-white/10">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Ask a question</label>
                        <div className="relative">
                          <input 
                            value={aiQuestion}
                            onChange={e => setAiQuestion(e.target.value)}
                            placeholder="How much did I spend on food?"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-medium outline-none focus:border-emerald-500/50 transition-colors pr-10"
                          />
                          <button 
                            type="submit"
                            disabled={isAsking || !aiQuestion.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-400 p-1 disabled:opacity-30"
                          >
                            <Send size={14} />
                          </button>
                        </div>
                        {aiAnswer && (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white/5 border border-white/5 p-3 rounded-xl relative"
                          >
                            <button 
                              onClick={() => setAiAnswer(null)}
                              className="absolute top-1 right-1 p-1 text-white/20 hover:text-white"
                            >
                              <X size={10} />
                            </button>
                            <p className="text-[12px] leading-relaxed text-slate-300">
                              {aiAnswer}
                            </p>
                          </motion.div>
                        )}
                      </form>
                    </div>
                  </div>
                  
                  <div className="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                    {insights.length > 0 ? insights.map((insight, i) => {
                      // Detect if it's a card optimization tip (usually mentions a card name)
                      const isOptimization = accounts.some(a => insight.suggestion.toLowerCase().includes(a.name.toLowerCase()));
                      
                      return (
                        <div key={i} className={cn(
                          "p-4 rounded-2xl border transition-all cursor-default",
                          isOptimization 
                            ? "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40" 
                            : "bg-white/5 border-white/5 hover:border-white/10"
                        )}>
                          <div className="flex items-start gap-3">
                            {isOptimization && <CreditCard size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />}
                            <div className="space-y-1">
                              <h5 className={cn("text-[10px] font-bold uppercase tracking-widest", isOptimization ? "text-emerald-400" : "text-slate-400")}>
                                {isOptimization ? 'Optimization Tip' : 'Savings Insight'}
                              </h5>
                              <p className="text-[13px] leading-relaxed font-medium">
                                {insight.suggestion.includes(insight.potentialSavings.toString()) ? (
                                  insight.suggestion
                                ) : (
                                  <>
                                    {insight.suggestion} You could gain <span className="font-bold text-emerald-400">{formatCurrency(insight.potentialSavings)}</span>.
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="col-span-2 py-6 text-slate-500 text-sm italic">
                        Upload a statement to generate personalized insights.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'categories' && (
              <div className="space-y-10">
                <div className="max-w-2xl">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Category Management</h3>
                  <p className="text-slate-500 text-sm mb-8">Personalize how you classify your transactions. System categories cannot be removed.</p>

                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
                      <div className="flex-1">
                        <input 
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Add new category (e.g. Subscriptions)"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900/5"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addCategory(newCategoryName);
                              setNewCategoryName('');
                            }
                          }}
                        />
                      </div>
                      <button 
                        onClick={() => {
                          addCategory(newCategoryName);
                          setNewCategoryName('');
                        }}
                        disabled={!newCategoryName.trim()}
                        className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm shadow-slate-200"
                      >
                        Add
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {categories.map(cat => (
                        <div key={cat} className="flex items-center justify-between p-4 px-6 group hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: categoryColors[cat] }} />
                            <span className="text-sm font-semibold text-slate-900">{cat}</span>
                            {['Income', 'Cashback', 'Other'].includes(cat) && (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">System</span>
                            )}
                          </div>
                          {!['Income', 'Cashback', 'Other'].includes(cat) && (
                            <button 
                              onClick={() => removeCategory(cat)}
                              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="max-w-2xl mt-12 bg-red-50/50 rounded-3xl border border-red-100 p-8">
                  <h3 className="text-xl font-bold text-red-900 mb-2">Danger Zone</h3>
                  <p className="text-red-700/70 text-sm mb-6">Irreversible actions for your local vault.</p>
                  
                  <button 
                    onClick={() => setIsClearConfirmOpen(true)}
                    className="flex items-center gap-2 bg-white border border-red-200 text-red-600 px-6 py-3 rounded-xl text-sm font-bold hover:bg-red-50 transition-all shadow-sm"
                  >
                    <Trash2 size={16} />
                    Clear Entire Local Vault
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold">Activity Journal</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                      {filteredTransactions.length} entries matching
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50/50 text-slate-400 uppercase text-[10px] tracking-widest font-bold">
                        <tr>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Account</th>
                          <th className="px-6 py-4">Description</th>
                          <th className="px-6 py-4">Category</th>
                          <th className="px-6 py-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.map(t => {
                          const account = accounts.find(a => a.id === t.accountId);
                          return (
                            <tr key={t.id} className="data-row">
                              <td className="px-6 py-4 font-mono text-slate-400 text-xs whitespace-nowrap">{t.date}</td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: account?.color || '#cbd5e1' }} />
                                  <span className="text-xs text-slate-900 font-medium truncate max-w-[120px]">{account?.name || 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 font-medium max-w-[300px] truncate">{t.description}</td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 group/cat-select">
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColors[t.category] }} />
                                  <select 
                                    value={t.category}
                                    onChange={(e) => updateTransactionCategory(t.id, e.target.value as TransactionCategory)}
                                    className="bg-transparent border-none p-0 text-xs text-slate-500 font-medium focus:ring-0 cursor-pointer hover:text-slate-900 transition-colors appearance-none"
                                  >
                                    {categories.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className={cn("px-6 py-4 text-right font-mono font-bold", t.amount < 0 ? "text-emerald-600" : "text-slate-900")}>
                                {t.amount < 0 ? `+${formatCurrency(Math.abs(t.amount))}` : formatCurrency(t.amount)}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredTransactions.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-20 text-center text-slate-300 italic">
                              {transactions.length === 0 ? "No transactions in vault. Import a statement to begin." : "No transactions match your current filters."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {filteredTransactions.length > 0 && (
                        <tfoot className="bg-slate-50/80 border-t border-slate-200 font-bold">
                          <tr className="text-slate-900">
                            <td colSpan={3} className="px-6 py-4 text-xs uppercase tracking-wider text-slate-400">
                              Summary for current view
                            </td>
                            <td className="px-6 py-4 text-right space-y-1">
                               <div className="text-[10px] uppercase text-slate-400">In / Out</div>
                               <div className="text-xs font-mono">
                                  <span className="text-emerald-600">+{formatCurrency(filteredIncome)}</span>
                                  <span className="mx-2 text-slate-300">|</span>
                                  <span className="text-slate-600">-{formatCurrency(filteredSpending)}</span>
                               </div>
                            </td>
                            <td className="px-6 py-4 text-right space-y-1">
                               <div className="text-[10px] uppercase text-slate-400">Net Variance</div>
                               <div className={cn(
                                 "text-sm font-mono",
                                 (filteredIncome - filteredSpending) >= 0 ? "text-emerald-600" : "text-amber-600"
                               )}>
                                 {(filteredIncome - filteredSpending) >= 0 ? "+" : ""}{formatCurrency(filteredIncome - filteredSpending)}
                               </div>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'accounts' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {accounts.map(acc => {
                    const accSpending = transactions
                      .filter(t => t.accountId === acc.id && t.category !== 'Income')
                      .reduce((sum, t) => sum + t.amount, 0);
                    const cashbackEarned = accSpending * (acc.cashbackRate || 0) / 100;
                    return (
                      <div key={acc.id} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-400 transition-all">
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                           {acc.type === 'Credit Card' ? <CreditCard size={48} /> : <Building2 size={48} />}
                        </div>
                        <div className="flex items-center gap-3 mb-6">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color }} />
                           <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">{acc.type}</span>
                           {acc.cashbackRate ? (
                             <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold ml-auto">{acc.cashbackRate}% CB</span>
                           ) : null}
                        </div>
                        <div className="space-y-1 mb-6">
                           <h4 className="text-xl font-bold text-slate-900">{acc.name}</h4>
                           <p className="text-xs text-slate-400 font-medium">Account ending in {acc.lastFour || 'XXXX'}</p>
                        </div>
                        
                        {cashbackEarned > 0 && (
                          <div className="mb-6 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Cashback Earned</span>
                            <span className="text-sm font-mono font-bold text-emerald-700">+{formatCurrency(cashbackEarned)}</span>
                          </div>
                        )}

                        <div className="flex items-end justify-between">
                           <div className="space-y-1">
                              <p className="text-[9px] uppercase font-bold text-slate-400">Total Spend (Local)</p>
                              <p className="text-2xl font-mono font-bold text-slate-900">{formatCurrency(accSpending)}</p>
                           </div>
                           <div className="flex items-center gap-2">
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setAccountToDelete(acc.id);
                                 setIsAccountDeleteConfirmOpen(true);
                               }}
                               className="opacity-0 group-hover:opacity-100 p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                               title="Remove Account"
                             >
                                <Trash2 size={16} />
                             </button>
                             <button 
                              onClick={() => {
                                 setSelectedAccountFilter(acc.id);
                                 setActiveTab('transactions');
                              }}
                              className="bg-slate-50 p-2.5 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                             >
                                <ChevronRight size={16} />
                             </button>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <button 
                    onClick={() => setIsAddAccountModalOpen(true)}
                    className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                       <Plus size={24} />
                    </div>
                    <span className="font-bold text-sm">Add New Card or Account</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 h-16 glass rounded-2xl flex items-center justify-around px-4 shadow-2xl z-50">
        <MobileNavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<TrendingUp size={24} />} />
        <MobileNavItem active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} icon={<Plus size={24} />} />
        <MobileNavItem active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} icon={<CreditCard size={24} />} />
        <MobileNavItem active={activeTab === 'categories'} onClick={() => setActiveTab('categories')} icon={<Settings size={22} />} />
      </nav>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm",
        active ? "bg-slate-100 text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
      )}
    >
      <div className={cn("flex items-center justify-center transition-colors", active ? "text-slate-900" : "text-slate-400")}>
        {active ? <div className="w-1.5 h-1.5 bg-slate-900 rounded-full" /> : icon}
      </div>
      <span>{label}</span>
    </button>
  );
}

function MobileNavItem({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl transition-all",
        active ? "text-slate-900 bg-slate-100 scale-105" : "text-slate-400"
      )}
    >
      {icon}
    </button>
  );
}

function StatCard({ 
  label, 
  value, 
  color, 
  subtitle, 
  showProgress, 
  progressValue 
}: { 
  label: string; 
  value: string; 
  color?: string; 
  subtitle?: string;
  showProgress?: boolean;
  progressValue?: number;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <h3 className={cn("text-3xl font-bold tracking-tight", color || "text-slate-900")}>{value}</h3>
      {showProgress && (
        <div className="mt-4 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-slate-900" 
            style={{ width: `${progressValue}%` }} 
          />
        </div>
      )}
      {subtitle && (
        <p className="text-xs text-slate-500 mt-3">{subtitle}</p>
      )}
    </div>
  );
}
