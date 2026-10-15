'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { adminCreateTask, adminDeleteTask, adminSetTaskStatus } from '@/lib/api/tasks';
import type { TaskStatus } from '@/lib/api/types';
import { formObject, type FormState } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';

function revalidateTasks(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

const taskSchema = z.object({
  title: requiredString(200),
  description: z
    .string()
    .trim()
    .max(10000, 'tooLong')
    .transform((value) => (value === '' ? null : value)),
});

export async function createTaskAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = taskSchema.safeParse(formObject(formData, ['title', 'description']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminCreateTask(projectId, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateTasks(locale);
  return { status: 'idle' };
}

export async function setTaskStatusAction(
  locale: AppLocale,
  projectId: string,
  taskId: string,
  status: TaskStatus,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminSetTaskStatus(projectId, taskId, status);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateTasks(locale);
  return { status: 'idle' };
}

export async function deleteTaskAction(
  locale: AppLocale,
  projectId: string,
  taskId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminDeleteTask(projectId, taskId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateTasks(locale);
  return { status: 'idle' };
}
