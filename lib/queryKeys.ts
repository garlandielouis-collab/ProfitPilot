// Centralised TanStack Query key factory
// Every key is a const tuple — fully type-safe, never duplicated

export const QK = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  currentUser: ()                      => ['current-user']                     as const,

  // ── Business / Settings ───────────────────────────────────────────────────
  businessProfile: (uid: string)       => ['business', uid]                    as const,
  userPrefs:       (uid: string)       => ['preferences', uid]                 as const,
  sessions:        (uid: string)       => ['sessions', uid]                    as const,
  paymentMethods:  (uid: string)       => ['payment-methods', uid]             as const,
  subscription:    (uid: string)       => ['subscription', uid]                as const,

  // ── AI Conversations ──────────────────────────────────────────────────────
  conversations:   (uid: string)       => ['conversations', uid]               as const,
  conversation:    (id: string)        => ['conversation', id]                 as const,
  messages:        (convId: string)    => ['messages', convId]                 as const,

  // ── Sales / CRM ───────────────────────────────────────────────────────────
  sales:           (uid: string, page: number) => ['sales', uid, page]         as const,
  invoice:         (num: string)       => ['invoice', num]                     as const,
  clientHistory:   (clientId: string)  => ['client-history', clientId]         as const,
  clients:         (uid: string)       => ['clients', uid]                     as const,

  // ── Products / Inventory ──────────────────────────────────────────────────
  products:        (uid: string)       => ['products', uid]                    as const,
  lowStock:        (uid: string)       => ['low-stock', uid]                   as const,
} as const;
