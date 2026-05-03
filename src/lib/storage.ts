/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { get, set, del } from 'idb-keyval';
import { Transaction, SavingsInsight, Account } from './types';

const STORAGE_KEYS = {
  TRANSACTIONS: 'privatrack_transactions',
  INSIGHTS: 'privatrack_insights',
  USER_PREFS: 'privatrack_prefs',
  ACCOUNTS: 'privatrack_accounts',
  CATEGORIES: 'privatrack_categories',
};

export const StorageService = {
  async getCategories(): Promise<string[] | null> {
    return await get<string[]>(STORAGE_KEYS.CATEGORIES);
  },

  async saveCategories(categories: string[]): Promise<void> {
    await set(STORAGE_KEYS.CATEGORIES, categories);
  },

  async getAccounts(): Promise<Account[]> {
    return (await get<Account[]>(STORAGE_KEYS.ACCOUNTS)) || [];
  },

  async saveAccounts(accounts: Account[]): Promise<void> {
    await set(STORAGE_KEYS.ACCOUNTS, accounts);
  },

  async getTransactions(): Promise<Transaction[]> {
    return (await get<Transaction[]>(STORAGE_KEYS.TRANSACTIONS)) || [];
  },

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    await set(STORAGE_KEYS.TRANSACTIONS, transactions);
  },

  async getInsights(): Promise<SavingsInsight[]> {
    return (await get<SavingsInsight[]>(STORAGE_KEYS.INSIGHTS)) || [];
  },

  async saveInsights(insights: SavingsInsight[]): Promise<void> {
    await set(STORAGE_KEYS.INSIGHTS, insights);
  },

  async clearAll(): Promise<void> {
    await del(STORAGE_KEYS.TRANSACTIONS);
    await del(STORAGE_KEYS.INSIGHTS);
    await del(STORAGE_KEYS.ACCOUNTS);
  }
};
