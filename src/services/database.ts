import { supabase } from '../lib/supabase';

// ──────────────────────────────────────────
// Types matching the DB schema
// ──────────────────────────────────────────

export interface DbConversation {
  id: string;
  user_id: string;
  title: string;
  pdf_name: string | null;
  timestamp: string | null;
  created_at?: string;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  type: string | null;
  quiz_questions: any | null;
  quiz_answers: any | null;
  quiz_result: any | null;
  flashcards: any | null;
  flashcard_index: number;
  created_at?: string;
}

// ──────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────

export async function saveConversation(
  userId: string,
  conversation: {
    id: string;
    title: string;
    pdfName: string;
    timestamp: string;
  }
): Promise<void> {
  const { error } = await supabase.from('conversations').upsert(
    {
      id: conversation.id,
      user_id: userId,
      title: conversation.title,
      pdf_name: conversation.pdfName === 'No PDF selected' ? null : conversation.pdfName,
      timestamp: conversation.timestamp
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('Failed to save conversation:', error.message);
    throw error;
  }
}

export async function deleteConversationFromDb(
  userId: string,
  conversationId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to delete conversation:', error.message);
    throw error;
  }
}

export async function clearMessagesFromDb(
  userId: string,
  conversationId: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to clear messages:', error.message);
    throw error;
  }
}

// ──────────────────────────────────────────
// Messages
// ──────────────────────────────────────────

export async function saveMessage(
  userId: string,
  conversationId: string,
  message: {
    id: string;
    role: string;
    content: string;
    type?: string | null;
    quizQuestions?: any;
    quizAnswers?: any;
    quizResult?: any;
    flashcards?: any;
    flashcardIndex?: number;
  }
): Promise<void> {
  const { error } = await supabase.from('messages').upsert(
    {
      id: message.id,
      conversation_id: conversationId,
      user_id: userId,
      role: message.role,
      content: message.content,
      type: message.type || null,
      quiz_questions: message.quizQuestions || null,
      quiz_answers: message.quizAnswers || null,
      quiz_result: message.quizResult || null,
      flashcards: message.flashcards || null,
      flashcard_index: message.flashcardIndex || 0
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('Failed to save message:', error.message);
    throw error;
  }
}

export async function updateMessageInDb(
  userId: string,
  messageId: string,
  updates: Record<string, any>
): Promise<void> {
  // Map frontend field names to DB column names
  const dbUpdates: Record<string, any> = {};
  if ('quizAnswers' in updates) dbUpdates.quiz_answers = updates.quizAnswers;
  if ('quizResult' in updates) dbUpdates.quiz_result = updates.quizResult;
  if ('flashcardIndex' in updates) dbUpdates.flashcard_index = updates.flashcardIndex;

  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase
    .from('messages')
    .update(dbUpdates)
    .eq('id', messageId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update message:', error.message);
  }
}

// ──────────────────────────────────────────
// Load all user data
// ──────────────────────────────────────────

export async function loadUserConversations(
  userId: string
): Promise<{ conversations: DbConversation[]; messages: DbMessage[] }> {
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (convError) {
    console.error('Failed to load conversations:', convError.message);
    return { conversations: [], messages: [] };
  }

  if (!conversations || conversations.length === 0) {
    return { conversations: [], messages: [] };
  }

  const conversationIds = conversations.map((c) => c.id);

  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (msgError) {
    console.error('Failed to load messages:', msgError.message);
    return { conversations, messages: [] };
  }

  return {
    conversations: conversations as DbConversation[],
    messages: (messages || []) as DbMessage[]
  };
}

// ──────────────────────────────────────────
// Profile
// ──────────────────────────────────────────

export async function updateProfile(
  userId: string,
  data: { display_name?: string; avatar_url?: string }
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('Failed to update profile:', error.message);
    throw error;
  }
}

export async function getUserConversationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to count conversations:', error.message);
    return 0;
  }
  return count || 0;
}
