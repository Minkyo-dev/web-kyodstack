"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as household from "../services/household.service";
import * as accounts from "../services/account.service";
import * as categories from "../services/category.service";
import * as transactions from "../services/transaction.service";
import {
  createAccountSchema,
  createCategorySchema,
  createHouseholdSchema,
  createTransactionSchema,
  dayTransactionsSchema,
  deleteTransactionSchema,
  emptySchema,
  joinHouseholdSchema,
  renameHouseholdSchema,
  reorderSchema,
  setActiveSchema,
  updateAccountSchema,
  updateCategorySchema,
  updateDisplayNameSchema,
  updateTransactionSchema,
} from "../schemas/finance.schema";

const done = <T>(value: T) => {
  revalidatePath("/finance", "layout");
  return value;
};

// ------------------------------------------------------------------ household

export async function createHouseholdAction(input: unknown) {
  return runAction("finance.household.create", createHouseholdSchema, input, async (data, ctx) =>
    done(await household.createHousehold(ctx, data)),
  );
}

export async function joinHouseholdAction(input: unknown) {
  return runAction("finance.household.join", joinHouseholdSchema, input, async (data, ctx) =>
    done(await household.joinHousehold(ctx, data)),
  );
}

export async function renameHouseholdAction(input: unknown) {
  return runAction("finance.household.rename", renameHouseholdSchema, input, async (data, ctx) =>
    done(await household.renameHousehold(ctx, data.name)),
  );
}

export async function updateDisplayNameAction(input: unknown) {
  return runAction("finance.member.rename", updateDisplayNameSchema, input, async (data, ctx) =>
    done(await household.updateDisplayName(ctx, data.displayName)),
  );
}

export async function rotateInviteCodeAction() {
  return runAction("finance.household.rotate_code", emptySchema, {}, async (_data, ctx) =>
    done(await household.rotateInviteCode(ctx)),
  );
}

// ------------------------------------------------------------------ accounts

export async function createAccountAction(input: unknown) {
  return runAction("finance.account.create", createAccountSchema, input, async (data, ctx) =>
    done(await accounts.createAccount(ctx, data)),
  );
}

export async function updateAccountAction(input: unknown) {
  return runAction("finance.account.update", updateAccountSchema, input, async (data, ctx) =>
    done(await accounts.updateAccount(ctx, data)),
  );
}

export async function setAccountActiveAction(input: unknown) {
  return runAction("finance.account.archive", setActiveSchema, input, async (data, ctx) =>
    done(await accounts.setAccountActive(ctx, data)),
  );
}

export async function reorderAccountsAction(input: unknown) {
  return runAction("finance.account.reorder", reorderSchema, input, async (data, ctx) =>
    done(await accounts.reorderAccounts(ctx, data)),
  );
}

// ------------------------------------------------------------------ categories

export async function createCategoryAction(input: unknown) {
  return runAction("finance.category.create", createCategorySchema, input, async (data, ctx) =>
    done(await categories.createCategory(ctx, data)),
  );
}

export async function updateCategoryAction(input: unknown) {
  return runAction("finance.category.update", updateCategorySchema, input, async (data, ctx) =>
    done(await categories.updateCategory(ctx, data)),
  );
}

export async function setCategoryActiveAction(input: unknown) {
  return runAction("finance.category.archive", setActiveSchema, input, async (data, ctx) =>
    done(await categories.setCategoryActive(ctx, data)),
  );
}

export async function reorderCategoriesAction(input: unknown) {
  return runAction("finance.category.reorder", reorderSchema, input, async (data, ctx) =>
    done(await categories.reorderCategories(ctx, data)),
  );
}

// ------------------------------------------------------------------ transactions

export async function createTransactionAction(input: unknown) {
  return runAction("finance.transaction.create", createTransactionSchema, input, async (data, ctx) =>
    done(await transactions.createTransaction(ctx, data)),
  );
}

export async function updateTransactionAction(input: unknown) {
  return runAction("finance.transaction.update", updateTransactionSchema, input, async (data, ctx) =>
    done(await transactions.updateTransaction(ctx, data)),
  );
}

export async function deleteTransactionAction(input: unknown) {
  return runAction("finance.transaction.delete", deleteTransactionSchema, input, async (data, ctx) =>
    done(await transactions.deleteTransaction(ctx, data.transactionId)),
  );
}

/** Read: the Day Drawer fetches a day's rows when it opens (spec §28). */
export async function getDayTransactionsAction(input: unknown) {
  return runAction("finance.transaction.by_date", dayTransactionsSchema, input, async (data, ctx) =>
    transactions.getTransactionsByDate(ctx, data.date),
  );
}
