import { createClient } from "@supabase/supabase-js";
import { answerStartsWithLetter, ARABIC_LETTERS } from "@/lib/game";

type JudgeVerdict = "valid" | "invalid" | "uncertain";
type GameAiRequest =
  | { mode: "judge"; letter: string; category: string; answer: string }
  | { mode: "opponent"; letter: string; categories: Array<{ id: string; label: string }>; difficulty: "casual" | "clever" | "playful" };

const requestTimestamps = new Map<string, number[]>();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function allowedRequest(userId: string) {
  const now = Date.now();
  const recent = (requestTimestamps.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 12) return false;
  recent.push(now);
  requestTimestamps.set(userId, recent);
  if (requestTimestamps.size > 2000) {
    for (const [id, timestamps] of requestTimestamps) {
      if (!timestamps.some((time) => now - time < 60_000)) requestTimestamps.delete(id);
    }
  }
  return true;
}

function parseRequest(input: unknown): GameAiRequest | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  if (body.mode === "judge") {
    if (typeof body.letter !== "string" || !ARABIC_LETTERS.includes(body.letter)) return null;
    if (typeof body.category !== "string" || body.category.trim().length < 1 || body.category.length > 40) return null;
    if (typeof body.answer !== "string" || body.answer.trim().length < 1 || body.answer.length > 80) return null;
    return { mode: "judge", letter: body.letter, category: body.category.trim(), answer: body.answer.trim() };
  }
  if (body.mode === "opponent") {
    if (typeof body.letter !== "string" || !ARABIC_LETTERS.includes(body.letter)) return null;
    if (!Array.isArray(body.categories) || body.categories.length < 1 || body.categories.length > 10) return null;
    const categories = body.categories.map((category) => {
      if (!category || typeof category !== "object") return null;
      const candidate = category as Record<string, unknown>;
      if (typeof candidate.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(candidate.id)) return null;
      if (typeof candidate.label !== "string" || candidate.label.trim().length < 1 || candidate.label.length > 28) return null;
      return { id: candidate.id, label: candidate.label.trim() };
    });
    if (categories.some((category) => category === null)) return null;
    if (new Set(categories.map((category) => category!.id)).size !== categories.length) return null;
    if (body.difficulty !== "casual" && body.difficulty !== "clever" && body.difficulty !== "playful") return null;
    return { mode: "opponent", letter: body.letter, categories: categories as Array<{ id: string; label: string }>, difficulty: body.difficulty };
  }
  return null;
}

function completionText(response: Record<string, unknown>) {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") return "";
  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "";
  const messageBody = message as Record<string, unknown>;
  const content = messageBody.content ?? messageBody.reasoning_content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
    ? [(part as Record<string, unknown>).text as string] : []).join("");
}

function instructions(request: GameAiRequest) {
  if (request.mode === "judge") {
    return "أنت حكم مساعد في لعبة أتوبيس كومبليت عربية. قيّم هل الإجابة تناسب الفئة فعلًا، مع قبول الأسماء الشائعة والألفاظ العربية المفهومة واللهجات المصرية والعربية. لا ترفض الكلمة لمجرد اختلاف كتابتها أو ندرتها إذا كانت معقولة. حرف البداية يجري فحصه مسبقًا. إذا لم تكن متأكدًا من معنى الكلمة أو صلاحيتها فأرجع uncertain وثقة منخفضة. اكتب سببًا قصيرًا ومحترمًا بالعربية. رأيك اقتراح فقط؛ اللاعبون هم أصحاب القرار النهائي. أخرج JSON صالحًا فقط بالمفاتيح verdict وconfidence وreason، من غير نص إضافي أو علامات تنسيق.";
  }
  const style = request.difficulty === "casual" ? "اختر إجابات مألوفة وبسيطة." : request.difficulty === "clever" ? "اختر إجابات ذكية ومتنوعة، لكن معروفة وصحيحة." : "اختر إجابات صحيحة مع لمسة مرحة من دون إجابات مختلقة.";
  return `أنت منافس تدريب في لعبة أتوبيس كومبليت. ${style} أعد إجابة واحدة صحيحة لكل فئة مطلوبة. يجب أن تبدأ كل إجابة بالحرف المحدد حرفيًا بعد تطبيع أشكال الألف العربية. لا تكتب أسماء الفئات في نص الإجابة ولا تضف شرحًا. أخرج JSON صالحًا فقط بالمفتاح answers، ومصفوفة عناصرها categoryId وanswer، من غير نص إضافي أو علامات تنسيق.`;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !supabaseUrl || !supabaseKey) return json({ error: "سجّل دخول اللاعب أولًا لتشغيل ميزات الذكاء الاصطناعي." }, 401);

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return json({ error: "انتهت جلسة اللاعب. حدّث الصفحة وجرّب مرة تانية." }, 401);
  if (!allowedRequest(user.id)) return json({ error: "استخدمت الحكم الذكي مرات كتير بسرعة. استنى دقيقة وجرب تاني." }, 429);

  let input: unknown;
  try {
    const bodyText = await request.text();
    if (bodyText.length > 8_000) return json({ error: "الطلب أكبر من المسموح." }, 413);
    input = JSON.parse(bodyText);
  } catch {
    return json({ error: "تعذر قراءة الطلب." }, 400);
  }
  const payload = parseRequest(input);
  if (!payload) return json({ error: "بيانات الحكم غير مكتملة أو غير صالحة." }, 400);

  if (payload.mode === "judge" && !answerStartsWithLetter(payload.answer, payload.letter)) {
    return json({ verdict: "invalid" satisfies JudgeVerdict, confidence: 1, reason: `الإجابة لازم تبدأ بحرف ${payload.letter}.` });
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) return json({ error: "الحكم الذكي غير مفعّل بعد. أضف CLOUDFLARE_API_TOKEN وCLOUDFLARE_ACCOUNT_ID في إعدادات Environment Variables في Vercel." }, 503);

  const details = payload.mode === "judge"
    ? { task: "judge", letter: payload.letter, category: payload.category, answer: payload.answer }
    : { task: "opponent", letter: payload.letter, categories: payload.categories, difficulty: payload.difficulty };
  try {
    const modelResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        model: process.env.CLOUDFLARE_AI_MODEL || "@cf/qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: instructions(payload) },
          { role: "user", content: JSON.stringify(details) }
        ],
        // Qwen's reasoning tokens count toward this limit. Keep enough room for
        // its internal reasoning and the final JSON, especially for category lists.
        max_completion_tokens: payload.mode === "judge" ? 600 : 1_200,
        reasoning_effort: "low",
        temperature: payload.mode === "judge" ? 0.2 : 0.7,
        stream: false,
        store: false
      }),
      signal: AbortSignal.timeout(45_000)
    });
    if (!modelResponse.ok) {
      if (modelResponse.status === 429 || modelResponse.status === 403) {
        return json({ error: "وصلت للحد المجاني أو مفتاح Cloudflare مش مفعّل لـ Workers AI. راجع الخطة والصلاحيات وحاول بكرة." }, 502);
      }
      return json({ error: "تعذر تشغيل Qwen الآن. راجع Account ID ومفتاح Cloudflare." }, 502);
    }
    const responseBody = await modelResponse.json() as Record<string, unknown>;
    const text = completionText(responseBody);
    if (!text) {
      const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
      const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
      const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : "unknown";
      console.error("Workers AI returned no completion text", { finishReason, model: process.env.CLOUDFLARE_AI_MODEL || "@cf/qwen/qwen3.8-27b" });
      return json({ error: "المنافس الذكي ماكملش إجابته. جرّب تاني؛ لو استمرت المشكلة راجع حد الاستخدام في Cloudflare." }, 502);
    }
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const result = JSON.parse(jsonText) as Record<string, unknown>;

    if (payload.mode === "judge") {
      const allowedVerdicts: JudgeVerdict[] = ["valid", "invalid", "uncertain"];
      if (!allowedVerdicts.includes(result.verdict as JudgeVerdict) || typeof result.confidence !== "number" || typeof result.reason !== "string") {
        return json({ error: "نتيجة الحكم غير مكتملة. جرّب تاني." }, 502);
      }
      const confidence = Math.min(1, Math.max(0, result.confidence));
      const verdict = confidence < .68 ? "uncertain" : result.verdict as JudgeVerdict;
      return json({ verdict, confidence, reason: result.reason.slice(0, 180) });
    }

    const generated = Array.isArray(result.answers) ? result.answers : [];
    const answerMap: Record<string, string> = Object.fromEntries(payload.categories.map((category) => [category.id, ""]));
    for (const item of generated) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.categoryId !== "string" || typeof candidate.answer !== "string" || !(candidate.categoryId in answerMap)) continue;
      const answer = candidate.answer.trim().slice(0, 80);
      if (answerStartsWithLetter(answer, payload.letter)) answerMap[candidate.categoryId] = answer;
    }
    return json({ answers: answerMap, model: process.env.CLOUDFLARE_AI_MODEL || "@cf/qwen/qwen3.8-27b" });
  } catch {
    return json({ error: "حصلت مشكلة في الاتصال بالحكم الذكي. جرّب تاني بعد لحظة." }, 502);
  }
}
