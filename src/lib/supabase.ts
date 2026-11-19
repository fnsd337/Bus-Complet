import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function ensureUser() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("أضف إعدادات Supabase لتفعيل اللعب أونلاين.");
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session?.user) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error("تعذر بدء جلسة لاعب. تأكد من تفعيل Anonymous Sign-Ins في Supabase.");
  if (!data.user) throw new Error("تعذر إنشاء جلسة اللاعب.");
  return data.user;
}
