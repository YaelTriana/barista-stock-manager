import { z } from 'zod';
import DOMPurify from 'dompurify';

/** Zod transformer that sanitizes strings with DOMPurify */
const sanitized = z.string().transform((val) => DOMPurify.sanitize(val.trim()));

/** Zod schema for a Product */
export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: sanitized.pipe(z.string().min(1, 'El nombre es obligatorio')),
  category: sanitized.pipe(z.string().min(1, 'La categoría es obligatoria')),
  currentQuantity: z.number().min(0, 'La cantidad no puede ser negativa'),
  minThreshold: z.number().min(0, 'El umbral mínimo no puede ser negativo'),
  unit: sanitized.pipe(z.string().min(1, 'La unidad es obligatoria')),
  costPrice: z.number().min(0, 'El costo no puede ser negativo'),
});

/** Schema for creating a new product (auto-generates ID, starts at quantity 0) */
export const CreateProductSchema = ProductSchema.omit({ id: true, currentQuantity: true });

/** TypeScript type inferred from the Zod schema */
export type Product = z.infer<typeof ProductSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
