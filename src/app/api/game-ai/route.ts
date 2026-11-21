import { createClient } from "@supabase/supabase-js";
import { answerStartsWithLetter, ARABIC_LETTERS } from "@/lib/game";

type JudgeVerdict = "valid" | "invalid" | "uncertain";
type JudgeItem = { id: string; category: string; answer: string };
type GameAiRequest =
  | { mode: "judge"; letter: string; category: string; answer: string }
  | { mode: "batch_judge"; letter: string; items: JudgeItem[] }
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
  if (body.mode === "batch_judge") {
    if (typeof body.letter !== "string" || !ARABIC_LETTERS.includes(body.letter)) return null;
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25) return null;
    const items = body.items.map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(candidate.id)) return null;
      if (typeof candidate.category !== "string" || candidate.category.trim().length < 1 || candidate.category.length > 40) return null;
      if (typeof candidate.answer !== "string" || candidate.answer.length > 80) return null;
      return { id: candidate.id, category: candidate.category.trim(), answer: candidate.answer.trim() };
    });
    if (items.some((item) => item === null)) return null;
    return { mode: "batch_judge", letter: body.letter, items: items as JudgeItem[] };
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
    return "أنت حكم مساعد في لعبة أتوبيس كومبليت عربية. قيّم هل الإجابة تناسب الفئة فعلًا، مع قبول الأسماء الشائعة والألفاظ العربية المفهومة واللهجات المصرية والعربية. لا ترفض الكلمة لمجرد اختلاف كتابتها أو ندرتها إذا كانت معقولة ومفهومة. حرف البداية يجري فحصه مسبقًا. اكتب سببًا قصيرًا بالعربية. أخرج JSON صالحًا فقط بالمفاتيح: verdict (إما 'valid' إذا كانت صحيحة، أو 'invalid' إذا كانت خاطئة وغير مناسبة للفئة، أو 'uncertain' إذا لم تكن متأكدًا) و confidence (رقم بين 0 و 1) و reason (نص توضيحي قصير بالعربية)، من غير نص إضافي أو علامات تنسيق خارج كود الـ JSON.";
  }
  if (request.mode === "batch_judge") {
    return "أنت حكم ذكي في لعبة أتوبيس كومبليت العربية. مهمتك تقييم إجابات اللاعب للتأكد من صحتها ومناسبتها للفئة المحددة.\nاقبل الأسماء الشائعة والألفاظ العربية المعروفة واللهجات المصرية والعربية. لا ترفض الكلمة لاختلاف طريقة كتابتها إذا كانت معقولة ومفهومة.\nارفض الإجابة إذا كانت لا تنتمي للفئة إطلاقاً (مثل كتابة اسم جماد في خانة حيوان، أو اسم شخص في خانة نبات، أو حروف عشوائية غير مفهومة، أو كلمة ليس لها معنى).\nالحرف المطلوب تم فحصه مسبقاً، ركّز على مطابقة المعنى للفئة.\nأخرج JSON صالحاً فقط بالمفتاح judgments وهو مصفوفة عناصرها:\n- id: نفس المعرف الممرر\n- verdict: إما 'valid' (صحيحة وتناسب الفئة) أو 'invalid' (خاطئة أو لا تناسب الفئة)\n- reason: سبب قصير وموجز بالعربية\nلا تخرج أي نص أو شرح خارج الـ JSON.";
  }
  const style = request.difficulty === "casual"
    ? "اختر إجابات مألوفة وبسيطة."
    : request.difficulty === "clever"
      ? "العب بمستوى ذكي وصعب: فضّل إجابة دقيقة وأقل شيوعًا لكل فئة، وتجنّب أول إجابة تقليدية تخطر بالبال. استخدم معلومات وأسماء حقيقية ومعروفة، ولا تخترع كلمات أو أسماء لمجرد مطابقة الحرف. فكّر في صحة الفئة والحرف قبل الإجابة. إذا لم تجد إجابة موثوقة، أعد نصًا فارغًا لهذه الفئة بدل التخمين."
      : "اختر إجابات صحيحة مع لمسة مرحة من دون إجابات مختلقة.";
  return `أنت منافس تدريب في لعبة أتوبيس كومبليت. ${style} أعد إجابة واحدة فقط لكل فئة مطلوبة. يجب أن تبدأ كل إجابة بالحرف المحدد حرفيًا بعد تطبيع أشكال الألف العربية. طابق معنى الفئة بدقة؛ الإجابة الصعبة لا تُقبل إذا كانت خاطئة. لا تكتب أسماء الفئات في نص الإجابة ولا تضف شرحًا. أخرج JSON صالحًا فقط بالمفتاح answers، ومصفوفة عناصرها categoryId وanswer، من غير نص إضافي أو علامات تنسيق.`;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !supabaseUrl || !supabaseKey) return json({ error: "سجّل دخول اللاعب أولًا لتشغيل ميزات الذكاء الاصطناعي." }, 401);

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError) {
    if (authError.status === 401 || authError.status === 403) return json({ error: "انتهت جلسة اللاعب. حدّث الصفحة وجرّب مرة أخرى." }, 401);
    console.error("Supabase session verification failed", { status: authError.status, code: authError.code });
    return json({ error: "تعذّر الاتصال بخدمة تسجيل الدخول في Supabase. تحقّق من الإنترنت وإعدادات المشروع ثم جرّب مرة أخرى." }, 503);
  }
  if (!user) return json({ error: "انتهت جلسة اللاعب. حدّث الصفحة وجرّب مرة أخرى." }, 401);
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

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return json({ error: "الحكم الذكي غير مفعّل بعد. أضف GROQ_API_KEY في إعدادات Environment Variables في Vercel." }, 503);

  const details = payload.mode === "judge"
    ? { task: "judge", letter: payload.letter, category: payload.category, answer: payload.answer }
    : payload.mode === "batch_judge"
      ? { task: "batch_judge", letter: payload.letter, items: payload.items }
      : { task: "opponent", letter: payload.letter, categories: payload.categories, difficulty: payload.difficulty };
  try {
    const groqModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
    const modelResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: "system", content: instructions(payload) },
          { role: "user", content: JSON.stringify(details) }
        ],
        max_tokens: 800,
        temperature: payload.mode === "judge" ? 0.2 : payload.mode === "batch_judge" ? 0.1 : payload.difficulty === "clever" ? 0.4 : 0.7,
        stream: false
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!modelResponse.ok) {
      const errText = await modelResponse.text().catch(() => "");
      console.error("Groq API error:", modelResponse.status, errText);
      if (modelResponse.status === 429 || modelResponse.status === 403) {
        return json({ error: "وصلت للحد المجاني أو مفتاح Groq مش صالح. راجع المفتاح والحد المسموح وحاول تاني." }, 502);
      }
      return json({ error: "تعذر تشغيل Groq الآن. راجع GROQ_API_KEY أو اسم النموذج." }, 502);
    }
    const responseBody = await modelResponse.json() as Record<string, unknown>;
    const text = completionText(responseBody);
    if (!text) {
      const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
      const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
      const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : "unknown";
      console.error("Groq returned no completion text", { finishReason, model: groqModel });
      return json({ error: "المنافس الذكي ماكملش إجابته. جرّب تاني؛ لو استمرت المشكلة راجع حد الاستخدام في Groq." }, 502);
    }
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const result = JSON.parse(jsonText) as Record<string, unknown>;

    if (payload.mode === "judge") {
      const rawVerdict = String(result.verdict ?? "").toLowerCase().trim();
      let verdict: JudgeVerdict = "uncertain";
      if (["valid", "accept", "accepted", "true", "correct", "صحيح", "مقبول"].includes(rawVerdict)) {
        verdict = "valid";
      } else if (["invalid", "reject", "rejected", "false", "incorrect", "wrong", "غير صحيح", "مرفوض", "خطأ"].includes(rawVerdict)) {
        verdict = "invalid";
      } else if (rawVerdict === "uncertain" || rawVerdict === "غير متأكد") {
        verdict = "uncertain";
      }

      const rawConfidence = typeof result.confidence === "number" ? result.confidence : parseFloat(String(result.confidence || "0.85")) || 0.85;
      const confidence = Math.min(1, Math.max(0, rawConfidence));
      const reason = typeof result.reason === "string" && result.reason.trim()
        ? result.reason.trim().slice(0, 180)
        : verdict === "valid" ? "إجابة مقبولة ومناسبة للفئة." : "الإجابة لا تناسب الفئة.";

      const finalVerdict = confidence < 0.6 ? "uncertain" : verdict;
      return json({ verdict: finalVerdict, confidence, reason });
    }

    if (payload.mode === "batch_judge") {
      const generated = Array.isArray(result.judgments) ? result.judgments : [];
      const judgmentsMap: Record<string, { verdict: "valid" | "invalid"; reason: string }> = {};

      for (const item of payload.items) {
        const starts = answerStartsWithLetter(item.answer, payload.letter);
        judgmentsMap[item.id] = {
          verdict: starts ? "valid" : "invalid",
          reason: starts ? "إجابة مقبولة" : `لا تبدأ بحرف ${payload.letter}`
        };
      }

      for (const item of generated) {
        if (!item || typeof item !== "object") continue;
        const candidate = item as Record<string, unknown>;
        if (typeof candidate.id !== "string" || !(candidate.id in judgmentsMap)) continue;
        const rawVerdict = String(candidate.verdict ?? "").toLowerCase().trim();
        const isValid = ["valid", "accept", "accepted", "true", "correct", "صحيح", "مقبول"].includes(rawVerdict);
        const reason = typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 180) : "";
        judgmentsMap[candidate.id] = {
          verdict: isValid ? "valid" : "invalid",
          reason: reason || (isValid ? "إجابة صحيحة ومناسبة للفئة" : "غير مناسبة للفئة")
        };
      }

      return json({ judgments: judgmentsMap, model: groqModel });
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
    return json({ answers: answerMap, model: groqModel });
  } catch {
    return json({ error: "حصلت مشكلة في الاتصال بالحكم الذكي. جرّب تاني بعد لحظة." }, 502);
  }
}
