'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Randevou — les rendez-vous des services (F15)
//
// « Oublis et absences coûtent des créneaux, donc de l'argent » (§5.2). Un
// agenda simple, et le rappel la veille : un message poli, prérempli, qui part
// du WhatsApp du marchand en un tap — pas d'envoi automatique sans l'API
// WhatsApp Business, et c'est lui qui décide (§6 : « se ou ki deside »).
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { assertFeature } from '../../lib/entitlements';
import { buildWhatsAppLink } from '../../lib/whatsappReport';

export type AppointmentStatus = 'planned' | 'done' | 'no_show' | 'cancelled';

export type Appointment = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  service: string | null;
  startsAt: string;
  durationMin: number;
  status: AppointmentStatus;
  reminderSentAt: string | null;
  /** Le rappel prérempli, prêt à partir. */
  reminderLink: string;
};

const missingTable = (error: any) => error && ['42P01', 'PGRST205'].includes(error.code);
const NOT_READY = 'Les rendez-vous ne sont pas encore ouverts sur ce compte (mise à jour en attente).';

function reminderText(name: string, service: string | null, startsAt: string, business: string, timeZone: string): string {
  const when = new Date(startsAt);
  const day = when.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
  const hour = when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone });
  return `Bonjou ${name}, se ${business}. Nou raple w randevou w${service ? ` pou ${service}` : ''} ${day} a ${hour}. Si w pa ka vini, tanpri fè n konnen. Mèsi !`;
}

export async function listAppointments(): Promise<ActionResult<Appointment[]>> {
  return attempt(async () => {
    await assertFeature('appointments');
    const ctx = await getBusinessContext();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [{ data, error }, { data: biz }] = await Promise.all([
      ctx.supabase
        .from('appointments')
        .select('id, customer_name, customer_phone, service, starts_at, duration_min, status, reminder_sent_at')
        .eq('business_id', ctx.businessId)
        .neq('status', 'cancelled')
        .gte('starts_at', since)
        .order('starts_at')
        .limit(200),
      ctx.supabase.from('businesses').select('name, timezone').eq('id', ctx.businessId).maybeSingle(),
    ]);
    if (missingTable(error)) return [];
    if (error) throw error;
    const tz = biz?.timezone || 'America/Port-au-Prince';
    return (data ?? []).map((a: any) => ({
      id: a.id,
      customerName: a.customer_name,
      customerPhone: a.customer_phone,
      service: a.service,
      startsAt: a.starts_at,
      durationMin: a.duration_min,
      status: a.status,
      reminderSentAt: a.reminder_sent_at,
      reminderLink: buildWhatsAppLink(a.customer_phone, reminderText(a.customer_name, a.service, a.starts_at, biz?.name ?? '', tz)),
    }));
  });
}

export async function createAppointment(input: {
  customerName: string; customerPhone?: string; service?: string; startsAt: string; durationMin?: number;
}): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('appointments');
    const ctx = await getBusinessContext();
    if (!input.customerName?.trim()) throw new UserFacingError('Le nom du client est obligatoire.');
    const when = new Date(input.startsAt);
    if (Number.isNaN(when.getTime())) throw new UserFacingError('Choisissez le jour et l’heure.');
    const { error } = await ctx.supabase.from('appointments').insert({
      business_id:    ctx.businessId,
      customer_name:  input.customerName.trim().slice(0, 80),
      customer_phone: input.customerPhone?.trim() || null,
      service:        input.service?.trim() || null,
      starts_at:      when.toISOString(),
      duration_min:   Math.max(5, Math.min(600, Math.round(Number(input.durationMin ?? 30)))),
    });
    if (missingTable(error)) throw new UserFacingError(NOT_READY);
    if (error) throw error;
    revalidatePath('/rendez-vous');
  });
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('appointments');
    const ctx = await getBusinessContext();
    const { error } = await ctx.supabase.from('appointments').update({ status }).eq('id', id).eq('business_id', ctx.businessId);
    if (error) throw error;
    revalidatePath('/rendez-vous');
  });
}

/** Le marchand vient d'ouvrir le rappel dans WhatsApp : on le note, pour ne pas le relancer deux fois. */
export async function markReminderSent(id: string): Promise<ActionResult<void>> {
  return attempt(async () => {
    await assertFeature('appointments');
    const ctx = await getBusinessContext();
    const { error } = await ctx.supabase
      .from('appointments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id).eq('business_id', ctx.businessId);
    if (error) throw error;
  });
}
