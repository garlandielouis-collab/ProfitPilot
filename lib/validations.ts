import { z } from 'zod';

// ── Business Profile ──────────────────────────────────────────────────────────

export const businessProfileSchema = z.object({
  name:          z.string().min(1, 'Le nom est requis').max(100),
  sector:        z.string().max(60).optional().or(z.literal('')),
  phone:         z.string().max(20).optional().or(z.literal('')),
  address:       z.string().max(200).optional().or(z.literal('')),
  website:       z.string().url('URL invalide').optional().or(z.literal('')),
  tax_id:        z.string().max(50).optional().or(z.literal('')),
  exchange_rate: z.coerce.number().positive('Le taux doit être > 0').max(9999),
  default_currency: z.enum(['HTG', 'USD']),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

// ── User Preferences ─────────────────────────────────────────────────────────

export const userPreferencesSchema = z.object({
  language:               z.enum(['fr', 'ht']),
  currency:               z.enum(['HTG', 'USD']),
  dark_mode:              z.boolean(),
  notifications_enabled:  z.boolean(),
  auto_save:              z.boolean(),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;

// ── Conversation ─────────────────────────────────────────────────────────────

export const newConversationSchema = z.object({
  title: z.string().min(1).max(120).default('Nouvelle analyse'),
});

// ── Invoice ───────────────────────────────────────────────────────────────────

export const invoiceItemSchema = z.object({
  product_id:   z.string().uuid().optional(),
  product_name: z.string().min(1),
  quantity:     z.coerce.number().int().positive(),
  unit_price:   z.coerce.number().nonnegative(),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  tax_pct:      z.coerce.number().min(0).max(100).default(0),
});

export const invoiceSchema = z.object({
  client_id:      z.string().uuid().optional(),
  client_name:    z.string().max(120).optional(),
  currency:       z.enum(['HTG', 'USD']).default('HTG'),
  payment_method: z.string().optional(),
  notes:          z.string().max(500).optional(),
  due_at:         z.string().optional(),   // ISO date string
  items:          z.array(invoiceItemSchema).min(1, 'Au moins un article requis'),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
