'use server';

import { revalidatePath }    from 'next/cache';
import { getSupabaseServer } from '../../lib/supabaseServerClient';

// â”€â”€ Auth helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getAuthContext() {
  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Non authentifiÃ©');
  return { user, supabase };
}

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Conversations CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  try {
    console.log('[createConversation] starting, title =', title);
    const supabase = await getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    console.log('[createConversation] auth result:', { userId: user?.id, authErr: authErr?.message });

    if (authErr || !user) throw new Error(authErr?.message ?? 'Non authentifié');

    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, title })
      .select('id, title, created_at, updated_at')
      .single();

    console.log('[createConversation] insert result:', { data, error: error?.message });

    if (error) throw new Error(error.message);

    revalidatePath('/ai-assistant');
    return data as Conversation;
  } catch (e: any) {
    console.error('[createConversation] ERROR:', e.message, e.stack);
    if (e.code === '42501' || e.message?.includes('permission denied') || e.message?.includes('violates row-level security')) {
      throw new Error(`RLS: ${e.message}`);
    }
    throw e;
  }
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
  const { error } = await supabase
    .from('ai_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/ai-assistant');
}

// â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  role:           'user' | 'assistant',
  content:        string,
  meta?:          { tokens_used?: number; model?: string },
): Promise<Message> {
  const { supabase } = await getAuthContext();

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

