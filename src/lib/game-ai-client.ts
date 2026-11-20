import { ensureUser, getSupabase } from "@/lib/supabase";

type GameAiErrorBody = { error?: string };

async function postWithToken(accessToken: string, payload: unknown) {
  return fetch("/api/game-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload)
  });
}

export async function requestGameAi<T>(payload: unknown): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("إعداد Supabase غير مكتمل. راجع ملف .env.local.");

  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
  let sessionError: Error | null = null;
  try {
    await ensureUser();
    const result = await supabase.auth.getSession();
    session = result.data.session;
    sessionError = result.error;
  } catch (cause) {
    if (cause instanceof TypeError) throw new Error("تعذّر الاتصال بخدمة تسجيل الدخول في Supabase. تأكّد من الإنترنت ورابط المشروع في ملف .env.local.");
    throw cause;
  }
  if (sessionError || !session?.access_token) throw new Error("تعذّر تجهيز جلسة اللاعب. حدّث الصفحة وجرّب مرة أخرى.");

  let accessToken = session.access_token;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) throw new Error("انتهت جلسة اللاعب. حدّث الصفحة وسجّل دخولك من جديد.");
    accessToken = data.session.access_token;
  }

  let response: Response;
  try {
    response = await postWithToken(accessToken, payload);
    if (response.status === 401) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session?.access_token) {
        const body = await response.json().catch(() => ({})) as GameAiErrorBody;
        throw new Error(body.error ?? "انتهت جلسة اللاعب. حدّث الصفحة وحاول مرة أخرى.");
      }
      response = await postWithToken(data.session.access_token, payload);
    }
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    throw new Error("تعذّر الاتصال بخادم اللعبة. تأكّد من اتصال الإنترنت ورابط Supabase في ملف .env.local.");
  }

  const body = await response.json().catch(() => ({})) as T & GameAiErrorBody;
  if (!response.ok) throw new Error(body.error ?? "تعذّر تشغيل الذكاء الاصطناعي. جرّب مرة أخرى.");
  return body as T;
}
