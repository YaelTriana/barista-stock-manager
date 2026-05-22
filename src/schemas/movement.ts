import { z } from 'zod';
import DOMPurify from 'dompurify';

/** Zod transformer that sanitizes strings with DOMPurify */
const sanitized = z.string().transform((val) => DOMPurify.sanitize(val.trim()));

/** Movement type: inventory in or out */
export const MovementTypeSchema = z.enum(['in', 'out']);

/** Zod schema for a Movement */
export const MovementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: sanitized.pipe(z.string().min(1)),
  type: MovementTypeSchema,
  quantity: z.number().positive('La cantidad debe ser positiva'),
  date: z.string().datetime({ message: 'Fecha en formato ISO inválida' }),
  cost: z.number().min(0, 'El costo no puede ser negativo'),
  // Phase 2 — optional for backward compatibility with existing data
  registeredBy: z.string().optional(),
  category: z.string().optional(),
});

/** TypeScript types inferred from Zod schemas */
export type Movement = z.infer<typeof MovementSchema>;
export type MovementType = z.infer<typeof MovementTypeSchema>;
