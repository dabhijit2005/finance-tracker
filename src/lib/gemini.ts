/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionCategory, SavingsInsight, AccountType, Account } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ParsedStatement {
  transactions: Transaction[];
  accountInfo?: {
    name?: string;
    type?: AccountType;
    lastFour?: string;
  };
}

export const GeminiService = {
  async parseStatement(text: string): Promise<ParsedStatement> {
    const prompt = `
      Extract individual transactions and account information from the following Indian bank/credit card statement text.
      The currency is Indian Rupees (INR).
      
      CRITICAL INSTRUCTIONS:
      1. Extract ONLY individual line-item transactions.
      2. IGNORE "Total Payment Due", "Balance", "Opening Balance", or "Closing Balance" lines.
      3. IGNORE "Payment Received", "Credit Card Payment", or any entry that represents paying off the credit card bill itself, as this is a transfer, not new spending/income.
      4. Categorize each transaction strictly into exactly one of these: Housing, Food & Dining, Shopping, Entertainment, Utilities, Health, Personal, Vacation & Stays, Fuel, Investment, Salary, Dividends, Interest, Transfer, Income, Cashback, Other.
      5. Amounts: Spending is usually marked as "Dr" or "Debit". Refunds/Reversals/Cashback are marked as "Cr" or "Credit".
      6. Map "Dr" transactions to POSITIVE amounts (spending).
      7. Map "Cr" transactions to NEGATIVE amounts (refunds/income/cashback).
      8. Account Detection: Look for the bank name (e.g. HDFC, ICICI, SBI), card type (Visa, Mastercard, Amex), and the last 4 digits of the account/card number.
      9. Income & Cashback Logic: 
         - Use "Transfer" for internal moves between bank accounts, card payments, or withdrawals (look for: "Transfer", "TRF", "SELF", "OWN ACC").
         - Use "Cashback" category ONLY for reward points redemption or merchant-specific cashback.
         - Use "Salary" for payroll/salary credits.
         - Use "Interest" for bank interest credits.
         - Use "Dividends" for stock/mutual fund dividend payouts.
         - Use "Income" for any other non-reward credits that don't fit the above.
         - NEVER tag reward-based credits as "Income", "Salary", or "Interest".
      
      Look for common Indian transaction patterns: UPI/REV, NEFT, IMPS, POS, or merchant names like Zomato, Swiggy, Amazon, Uber, etc.
      
      Statement Text:
      ${text}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING, description: "ISO date string or YYYY-MM-DD" },
                    description: { type: Type.STRING },
                    amount: { type: Type.NUMBER, description: "Positive for spending, negative for income/refund" },
                    category: { 
                      type: Type.STRING, 
                      description: "One of the predefined categories",
                      enum: ["Housing", "Food & Dining", "Shopping", "Entertainment", "Utilities", "Health", "Personal", "Vacation & Stays", "Fuel", "Investment", "Salary", "Dividends", "Interest", "Transfer", "Income", "Cashback", "Other"]
                    }
                  },
                  required: ["date", "description", "amount", "category"]
                }
              },
              accountInfo: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "E.g. HDFC Credit Card" },
                  type: { type: Type.STRING, description: "Savings or Credit Card" },
                  lastFour: { type: Type.STRING, description: "Last 4 digits of account" }
                }
              }
            },
            required: ["transactions"]
          }
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      const transactions = (parsed.transactions || []).map((t: any) => ({
        ...t,
        id: crypto.randomUUID(),
        accountId: 'default' // Will be updated by caller
      }));

      return {
        transactions,
        accountInfo: parsed.accountInfo
      };
    } catch (error) {
      console.error("AI Parsing Error:", error);
      throw new Error("Failed to parse statement. Please try again.");
    }
  },

  async getSavingsInsights(transactions: Transaction[], accounts: Account[]): Promise<SavingsInsight[]> {
    if (transactions.length === 0) return [];

    const summary = transactions.slice(0, 50).map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      return `${t.date}: ${t.description} - $${t.amount} (${t.category}) [on ${acc?.name || 'Unknown'}]`;
    }).join('\n');

    const accountSpecs = accounts.map(a => `- ${a.name} (${a.type}): ${a.cashbackRate}% cashback`).join('\n');
    
    const prompt = `
      Based on the following spending patterns and available credit cards/accounts, suggest 3 actionable ways to save money OR optimize for more cashback.
      
      Available Accounts & Benefits:
      ${accountSpecs}

      Spending Summary:
      ${summary}

      RULES FOR OPTIMIZATION:
      1. CRITICAL: Compare actual card usage vs potential usage of other available cards.
      2. If the user spent on a card with 1% cashback but has another card with 5% (even if it's a different brand, assume based on general knowledge if common categories like Zomato/Amazon are involved), highlight it.
      3. Look for "Brand Mismatch": e.g., if they used an Amex on a merchant that typically has an HDFC 10X offer.
      4. Suggest switching recurring payments to the highest-yielding card.
      5. Identify "Dead Weight" spending: High expenses on low-reward instruments.
      
      Output exactly 3 highly specific suggestions. Include an estimated monthly monetary gain.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                potentialSavings: { type: Type.NUMBER }
              },
              required: ["title", "suggestion", "potentialSavings"]
            }
          }
        }
      });

      return JSON.parse(response.text || "[]");
    } catch (error) {
      console.error("AI Insight Error:", error);
      return [];
    }
  },

  async askAboutSpending(question: string, transactions: Transaction[], accounts: Account[]): Promise<string> {
    if (transactions.length === 0) return "I don't have enough data to answer that yet. Please upload a statement first.";

    const summary = transactions.slice(0, 100).map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      return `${t.date}: ${t.description} - ${t.amount} (${t.category}) [on ${acc?.name || 'Unknown'}]`;
    }).join('\n');

    const accountSpecs = accounts.map(a => `- ${a.name} (${a.type}): ${a.cashbackRate}% cashback`).join('\n');
    
    const prompt = `
      The user is asking a question about their spending or financial activity.
      
      Available Accounts & Benefits:
      ${accountSpecs}

      Recent Transactions (Last 100):
      ${summary}

      User Question: "${question}"

      Instructions:
      1. Be concise and conversational.
      2. Use the provided transaction data to answer accurately.
      3. If they ask about "where did I spend most", "how much on food", etc., calculate it from the list.
      4. If they ask for advice, use the card benefits to suggest better payment methods.
      5. Keep the tone helpful and professional.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      return response.text || "I'm sorry, I couldn't generate a response.";
    } catch (error) {
      console.error("AI Chat Error:", error);
      return "I encountered an error while processing your question.";
    }
  }
};
