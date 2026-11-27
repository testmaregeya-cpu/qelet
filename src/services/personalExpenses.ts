import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '../lib/supabase';
import type {
  PersonalCategory,
  PersonalCategoryDraft,
  PersonalExpense,
  PersonalExpenseDraft,
} from '../types/personalExpense';
import {
  cachePersonalCategories,
  cachePersonalExpenses,
  getCachedPersonalCategories,
  getCachedPersonalExpenses,
} from './offlineStorage';
import {
  enqueueOfflinePersonalExpense,
  flushOfflinePersonalExpenses,
  isLikelyNetworkError,
  type FlushResult,
  type OfflinePersonalExpenseMutation,
} from './offlineQueue';

export async function fetchPersonalCategories(userId: string): Promise<PersonalCategory[]> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('personal_categories')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
      .returns<PersonalCategory[]>();

    if (error) {
      throw new Error(error.message);
    }

    const categories = data ?? [];
    await cachePersonalCategories(userId, categories);
    return categories;
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      const cached = await getCachedPersonalCategories<PersonalCategory>(userId);
      if (cached) {
        return cached;
      }
    }
    throw err;
  }
}

export async function createPersonalCategory(
  userId: string,
  draft: PersonalCategoryDraft
): Promise<PersonalCategory> {
  const cleanName = draft.name.trim();
  if (!cleanName) {
    throw new Error('Category name is required');
  }

  const supabase = getSupabaseClient();
  const payload = {
    user_id: userId,
    name: cleanName,
    icon: draft.icon ?? 'tag',
    color: draft.color ?? '#0284C7',
    bg_color: draft.bgColor ?? '#E0F2FE',
  };

  try {
    const { data, error } = await supabase
      .from('personal_categories')
      .insert(payload)
      .select()
      .single<PersonalCategory>();

    if (error) {
      throw new Error(error.message);
    }

    const cached = (await getCachedPersonalCategories<PersonalCategory>(userId)) ?? [];
    const nextCached = [
      ...cached.filter((c) => c.name.toLowerCase() !== data.name.toLowerCase()),
      data,
    ];
    nextCached.sort((a, b) => a.name.localeCompare(b.name));
    await cachePersonalCategories(userId, nextCached);

    return data;
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      const localCat: PersonalCategory = {
        id: `local_cat_${Date.now()}`,
        user_id: userId,
        name: cleanName,
        icon: draft.icon ?? 'tag',
        color: draft.color ?? '#0284C7',
        bg_color: draft.bgColor ?? '#E0F2FE',
        created_at: new Date().toISOString(),
      };
      const cached = (await getCachedPersonalCategories<PersonalCategory>(userId)) ?? [];
      const nextCached = [
        ...cached.filter((c) => c.name.toLowerCase() !== localCat.name.toLowerCase()),
        localCat,
      ];
      nextCached.sort((a, b) => a.name.localeCompare(b.name));
      await cachePersonalCategories(userId, nextCached);
      return localCat;
    }
    throw err;
  }
}

export async function fetchPersonalExpenses(userId: string): Promise<PersonalExpense[]> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('personal_expenses')
      .select('*')
      .eq('user_id', userId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .returns<PersonalExpense[]>();

    if (error) {
      throw new Error(error.message);
    }

    const expenses = data ?? [];
    await cachePersonalExpenses(userId, expenses);
    return expenses;
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      const cached = await getCachedPersonalExpenses<PersonalExpense>(userId);
      if (cached) {
        return cached;
      }
    }
    throw err;
  }
}

export async function createPersonalExpense(
  userId: string,
  draft: PersonalExpenseDraft
): Promise<PersonalExpense> {
  if (draft.amountSantim <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  if (!draft.title.trim()) {
    throw new Error('Title is required');
  }

  const clientRequestId = draft.clientRequestId ?? Crypto.randomUUID();
  const supabase = getSupabaseClient();

  const insertPayload = {
    user_id: userId,
    amount_santim: draft.amountSantim,
    category: draft.category,
    title: draft.title.trim(),
    note: (draft.note ?? '').trim(),
    expense_date: draft.expenseDate,
    payment_method: draft.paymentMethod,
    client_request_id: clientRequestId,
  };

  try {
    const { data, error } = await supabase
      .from('personal_expenses')
      .insert(insertPayload)
      .select()
      .single<PersonalExpense>();

    if (error) {
      throw new Error(error.message);
    }

    const cached = (await getCachedPersonalExpenses<PersonalExpense>(userId)) ?? [];
    await cachePersonalExpenses(userId, [data, ...cached.filter((c) => c.id !== data.id)]);

    return data;
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      const optimisticEntry: PersonalExpense = {
        id: `local_${clientRequestId}`,
        user_id: userId,
        amount_santim: draft.amountSantim,
        category: draft.category,
        title: draft.title.trim(),
        note: (draft.note ?? '').trim(),
        expense_date: draft.expenseDate,
        payment_method: draft.paymentMethod,
        client_request_id: clientRequestId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await enqueueOfflinePersonalExpense({
        id: Crypto.randomUUID(),
        userId,
        createdAt: new Date().toISOString(),
        payload: {
          userId,
          amountSantim: draft.amountSantim,
          category: draft.category,
          title: draft.title.trim(),
          note: (draft.note ?? '').trim(),
          expenseDate: draft.expenseDate,
          paymentMethod: draft.paymentMethod,
          clientRequestId,
        },
      });

      const cached = (await getCachedPersonalExpenses<PersonalExpense>(userId)) ?? [];
      await cachePersonalExpenses(userId, [optimisticEntry, ...cached]);

      return optimisticEntry;
    }

    throw err;
  }
}

export async function updatePersonalExpense(
  userId: string,
  id: string,
  patch: Partial<PersonalExpenseDraft>
): Promise<PersonalExpense> {
  const supabase = getSupabaseClient();

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.amountSantim !== undefined) {
    if (patch.amountSantim <= 0) throw new Error('Amount must be greater than zero');
    updatePayload.amount_santim = patch.amountSantim;
  }
  if (patch.category !== undefined) updatePayload.category = patch.category;
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new Error('Title is required');
    updatePayload.title = patch.title.trim();
  }
  if (patch.note !== undefined) updatePayload.note = patch.note.trim();
  if (patch.expenseDate !== undefined) updatePayload.expense_date = patch.expenseDate;
  if (patch.paymentMethod !== undefined) updatePayload.payment_method = patch.paymentMethod;

  const { data, error } = await supabase
    .from('personal_expenses')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single<PersonalExpense>();

  if (error) {
    throw new Error(error.message);
  }

  const cached = (await getCachedPersonalExpenses<PersonalExpense>(userId)) ?? [];
  await cachePersonalExpenses(
    userId,
    cached.map((c) => (c.id === id ? data : c))
  );

  return data;
}

export async function deletePersonalExpense(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('personal_expenses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }

  const cached = (await getCachedPersonalExpenses<PersonalExpense>(userId)) ?? [];
  await cachePersonalExpenses(
    userId,
    cached.filter((c) => c.id !== id)
  );
}

export async function syncPersonalExpensesQueue(userId: string): Promise<FlushResult> {
  const supabase = getSupabaseClient();

  return flushOfflinePersonalExpenses(userId, async (mutation: OfflinePersonalExpenseMutation) => {
    const payload = mutation.payload;
    const { data, error } = await supabase
      .from('personal_expenses')
      .upsert(
        {
          user_id: payload.userId,
          amount_santim: payload.amountSantim,
          category: payload.category,
          title: payload.title,
          note: payload.note ?? '',
          expense_date: payload.expenseDate,
          payment_method: payload.paymentMethod,
          client_request_id: payload.clientRequestId,
        },
        { onConflict: 'user_id, client_request_id' }
      )
      .select()
      .single<PersonalExpense>();

    if (error) {
      throw new Error(error.message);
    }

    const cached = (await getCachedPersonalExpenses<PersonalExpense>(userId)) ?? [];
    const optimisticId = `local_${payload.clientRequestId}`;
    const nextCached = cached.map((c) => (c.id === optimisticId ? data : c));
    if (!nextCached.some((c) => c.id === data.id)) {
      nextCached.unshift(data);
    }
    await cachePersonalExpenses(userId, nextCached);
  });
}
