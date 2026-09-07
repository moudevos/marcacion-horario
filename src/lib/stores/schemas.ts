import { z } from "zod";

const storeBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(20, "El código admite como máximo 20 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "Usa solo letras, números, guion o guion bajo")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  address: z.string().trim().max(250, "La dirección admite como máximo 250 caracteres"),
  active: z.boolean(),
});

export const createStoreSchema = storeBaseSchema;

export const updateStoreSchema = storeBaseSchema.extend({
  id: z.string().uuid(),
});

export const storeIdSchema = z.string().uuid();

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
