import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

const scheduleEntrySchema = z
  .object({
    employeeId: z.string().uuid(),
    workDate: z.string().regex(datePattern),
    mode: z.enum(["OFF", "A", "C", "AC", "CUSTOM"]),
    startTime: z.string(),
    endTime: z.string(),
    breakMinutes: z.number().int().min(0).max(240),
    toleranceMinutes: z.number().int().min(0).max(180),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "OFF") return;
    if (!timePattern.test(value.startTime) || !timePattern.test(value.endTime)) {
      ctx.addIssue({ code: "custom", message: "Las horas deben tener formato HH:mm" });
      return;
    }
    if (value.endTime <= value.startTime) {
      ctx.addIssue({ code: "custom", message: "La salida debe ser posterior al ingreso" });
    }
  });

export const saveWeeklyScheduleSchema = z.object({
  storeId: z.string().uuid(),
  weekStart: z.string().regex(datePattern),
  entries: z.array(scheduleEntrySchema).max(2000),
});

export type SaveWeeklyScheduleInput = z.infer<typeof saveWeeklyScheduleSchema>;
