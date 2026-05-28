'use server';

import { revalidatePath }  from 'next/cache';
import { getSupabaseServer } from '../../lib/supabaseServerClient';

// ── helpers ────────────────────────────────────────────────────────────────────

async function getAuthContext() {
  const supabase = getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Non authentifié');

  // Resolve business_id for the user (required FK on ai_conversations)
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  return { user, supabase, businessId: biz?.id as string | undefined };
}

// ── Types (returned to client) ─────────────────────────────────────────────────

export type Conversation = {
  id:         string;
  title:      string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id:              string;
  conversation_id: string;
  role:            'user' | 'assistant' | 'system';
  content:         string;
  tokens_used:     number | null;
  model:           string | null;
  created_at:      string;
};

// ── CONVERSATIONS CRUD ────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  const { user, supabase } = await getAuthContext();

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

export async function createConversation(title = 'Nouvelle analyse'): Promise<Conversation> {
  const { user, supabase, businessId } = await getAuthContext();

  if (!businessId) {
    // Create a stub business row so the FK constraint is satisfied
    const { data: newBiz, error: bizErr } = await supabase
      .from('businesses')
      .insert({ owner_id: user.id, name: 'Mon entreprise', exchange_rate: 130, default_currency: 'HTG' })
      .select('id')
      .single();
    if (bizErr) throw new Error(bizErr.message);

    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, business_id: newBiz.id, title })
      .select('id, title, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);

    revalidatePath('/ai-assistant');
    return data as Conversation;
  }

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: user.id, business_id: businessId, title })
    .select('id, title, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/ai-assistant');
  return data as Conversation;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { user, supabase } = await getAuthContext();

  const { error } = await supabase
    .from('ai_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/ai-assistant');
}

export async function deleteConversation(id: string): Promise<void> {
  const { user, supabase } = await getAuthContext();

  // Soft-delete
  const { error } = await supabase
    .from('ai_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/ai-assistant');
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { supabase } = await getAuthContext();

  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, conversation_id, role, content, tokens_used, model, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  meta?: { tokens_used?: number; model?: string },
): Promise<Message> {
  const { supabase } = await getAuthContext();

  // Bump conversation updated_at so it floats to top of list
  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      tokens_used: meta?.tokens_used ?? null,
      model:       meta?.model       ?? null,
    })
    .select('id, conversation_id, role, content, tokens_used, model, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data as Message;
}
