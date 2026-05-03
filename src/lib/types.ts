/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionCategory = string;

export const DEFAULT_CATEGORIES = [
  'Housing', 
  'Food & Dining', 
  'Shopping', 
  'Entertainment', 
  'Utilities', 
  'Health', 
  'Personal', 
  'Vacation & Stays',
  'Fuel',
  'Investment',
  'Salary',
  'Dividends',
  'Interest',
  'Transfer',
  'Income', 
  'Cashback',
  'Other'
] as const;

export type AccountType = 'Savings' | 'Credit Card' | 'Wallet' | 'Other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  lastFour?: string;
  balance?: number;
  cashbackRate?: number; // Percentage, e.g., 1.5 for 1.5%
}

export interface Trip {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  color?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: TransactionCategory;
  accountId: string;
  isRecurring?: boolean;
  tripId?: string;
}

export interface SavingsInsight {
  title: string;
  suggestion: string;
  potentialSavings: number;
}
