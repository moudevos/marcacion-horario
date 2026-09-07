import { z } from "zod";
import { APP_ROLES, EMPLOYEE_POSITIONS, WORKER_TYPES } from "@/types/domain";

const roleSchema = z.enum(APP_ROLES);
const positionSchema = z.enum(EMPLOYEE_POSITIONS);
const workerTypeSchema = z.enum(WORKER_TYPES);

const personalBaseSchema = z.object({
  fullName: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(120),
  email: z.string().trim().email("Ingresa un correo válido").transform((value) => value.toLowerCase()),
  dni: z.string().trim().regex(/^\d{8}$/, "El DNI debe tener exactamente 8 dígitos"),
  role: roleSchema,
  position: positionSchema,
  storeIds: z.array(z.string().uuid()).max(100).transform((ids) => [...new Set(ids)]),
  active: z.boolean(),
});

function validateStoreRequirement(
  value: { role: (typeof APP_ROLES)[number]; position: (typeof EMPLOYEE_POSITIONS)[number]; storeIds: string[] },
  ctx: z.RefinementCtx,
) {
  if (value.role !== "superuser" && value.position !== "rh" && value.storeIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["storeIds"],
      message: "Este cargo requiere al menos una tienda asignada",
    });
  }
}

export const createPersonalSchema = personalBaseSchema
  .extend({
    workerType: workerTypeSchema,
    password: z.string().min(8, "La contraseña temporal debe tener al menos 8 caracteres").max(128),
  })
  .superRefine(validateStoreRequirement);

export const updatePersonalSchema = personalBaseSchema
  .extend({
    id: z.string().uuid(),
    workerType: workerTypeSchema.nullable(),
    password: z
      .string()
      .max(128)
      .refine((value) => value.length === 0 || value.length >= 8, "La nueva contraseña debe tener al menos 8 caracteres"),
  })
  .superRefine(validateStoreRequirement);

export const personalIdSchema = z.string().uuid();

export type CreatePersonalInput = z.infer<typeof createPersonalSchema>;
export type UpdatePersonalInput = z.infer<typeof updatePersonalSchema>;
