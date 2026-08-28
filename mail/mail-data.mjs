const MAIL_THREAD_COLUMNS =
  "id, subject, normalized_subject, last_message_at, created_at";

export async function fetchActiveThreads(supabase) {
  const { data, error } = await supabase
    .from("mail_threads")
    .select(MAIL_THREAD_COLUMNS)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
}

export async function updateThreadDeletedAt(supabase, threadId, deletedAt) {
  const { error } = await supabase
    .from("mail_threads")
    .update({ deleted_at: deletedAt })
    .eq("id", threadId);

  if (error) throw error;
}
