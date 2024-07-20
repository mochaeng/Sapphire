import { z } from 'zod';

export const loginFormSchema = z.object({
	username: z.string().min(2).max(50)
});

export type LoginFormSchema = typeof loginFormSchema;
