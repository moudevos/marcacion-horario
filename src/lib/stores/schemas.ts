import { z } from "zod";

const storeFieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "El código debe tener al menos 2 caracteres")
    .max(20, "El código admite como máximo 20 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "Usa solo letras, números, guion o guion bajo")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  address: z.string().trim().max(250, "La dirección admite como máximo 250 caracteres"),
  latitude: z.number().min(-90, "Latitud inválida").max(90, "Latitud inválida").nullable(),
  longitude: z.number().min(-180, "Longitud inválida").max(180, "Longitud inválida").nullable(),
  attendanceRadiusMeters: z.number().int().min(20, "El radio mínimo es 20 m").max(1000, "El radio máximo es 1000 m").default(100),
  active: z.boolean(),
});

function validateLocation(
  value: { latitude: number | null; longitude: number | null },
  ctx: z.RefinementCtx,
) {
  if ((value.latitude === null) !== (value.longitude === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "La ubicación requiere latitud y longitud",
    });
    ctx.addIssue({
      code: "custom",
      path: ["longitude"],
      message: "La ubicación requiere latitud y longitud",
    });
  }
}

export const createStoreSchema = storeFieldsSchema.superRefine(validateLocation);

export const updateStoreSchema = storeFieldsSchema
  .extend({ id: z.string().uuid() })
  .superRefine(validateLocation);

export const storeIdSchema = z.string().uuid();

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
