const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

function parseJsonText(text) {
  const clean = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("تعذر قراءة نتيجة الذكاء الاصطناعي.");
  }
}

async function callOpenAI(env, instructions, input) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY غير مضاف في Cloudflare Secrets.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      instructions,
      input,
      max_output_tokens: 700,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }
  return parseJsonText(extractOutputText(payload));
}

async function handleAI(request, env) {
  if (request.method === "GET") {
    return json({
      ok: true,
      service: "Ask Jordan AI",
      runtime: "Cloudflare Workers",
      keyConfigured: Boolean(env.OPENAI_API_KEY),
    });
  }
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON غير صالح" }, 400);
  }

  const mode = body?.mode;
  const text = String(body?.text || "").trim().slice(0, 2500);
  if (!text) return json({ ok: false, error: "النص مطلوب" }, 400);

  try {
    if (mode === "search") {
      const data = await callOpenAI(
        env,
        `أنت محلل بحث لمنصة إعلانات أردنية. افهم اللهجة العربية والأخطاء الإملائية. أعد JSON فقط دون Markdown بالشكل التالي:
{"category":null,"governorate":null,"minPrice":null,"maxPrice":null,"year":null,"transmission":null,"keywords":[],"summary":"","assistantReply":""}
القيم المسموحة للتصنيف: سيارات، موبايلات، عقارات، وظائف، أثاث، أجهزة كهربائية، خدمات، متفرقات.
المحافظات: عمان، إربد، الزرقاء، البلقاء، المفرق، جرش، عجلون، مادبا، الكرك، الطفيلة، معان، العقبة.
transmission إما أوتوماتيك أو عادي أو null. الأسعار أرقام بالدينار الأردني. لا تخترع معلومة غير موجودة.
assistantReply رد عربي أردني طبيعي وقصير للمستخدم يوضح أنك فهمت طلبه وما الذي ستبحث عنه، دون الادعاء بوجود نتائج لم ترها.`,
        text,
      );
      return json({ ok: true, mode, source: "openai", model: env.OPENAI_MODEL || "gpt-4o-mini", data });
    }

    if (mode === "agent") {
      const candidates = Array.isArray(body?.candidates) ? body.candidates.slice(0, 15).map((ad) => ({
        id: ad?.id,
        title: String(ad?.title || "").slice(0, 140),
        category: String(ad?.category || "").slice(0, 60),
        governorate: String(ad?.governorate || "").slice(0, 60),
        area: String(ad?.area || "").slice(0, 80),
        price: Number(ad?.price) || null,
        description: String(ad?.description || "").slice(0, 350),
      })) : [];
      const intent = body?.intent && typeof body.intent === "object" ? body.intent : {};
      const data = await callOpenAI(
        env,
        `أنت وكيل شراء ذكي لمنصة إعلانات أردنية اسمها Ask Jordan. ستستلم طلب المستخدم وفلاتر مفهومة وقائمة إعلانات حقيقية من المنصة. أعد JSON فقط دون Markdown بالشكل:
{"assistantReply":"","rankedIds":[],"suggestedQuery":""}
رتّب فقط IDs الموجودة في القائمة من الأنسب إلى الأقل مناسبة. لا تخترع إعلانات أو أسعارًا أو مواصفات. إذا كانت القائمة فارغة، اشرح بلطف أنه لا توجد نتيجة واقترح توسيعًا منطقيًا واحدًا في suggestedQuery. إذا وجدت نتائج، اذكر عددها وعرّف أفضل خيار أو خيارين اعتمادًا على البيانات المتاحة فقط، ووضّح سبب الاختيار بجملة قصيرة. استخدم لهجة عربية أردنية طبيعية ومختصرة. لا تقل إنك تواصلت مع البائع. rankedIds يجب أن يحتوي أرقام IDs فقط. suggestedQuery يكون فارغًا عند عدم الحاجة.`,
        JSON.stringify({ userRequest: text, intent, candidates }),
      );
      const allowed = new Set(candidates.map((x) => String(x.id)));
      data.rankedIds = Array.isArray(data.rankedIds) ? data.rankedIds.filter((id) => allowed.has(String(id))) : [];
      data.assistantReply = String(data.assistantReply || "").slice(0, 1200);
      data.suggestedQuery = String(data.suggestedQuery || "").slice(0, 300);
      return json({ ok: true, mode, source: "openai", model: env.OPENAI_MODEL || "gpt-4o-mini", data });
    }

    if (mode === "ad") {
      const data = await callOpenAI(
        env,
        `أنت مساعد كتابة إعلانات لمنصة أردنية. أعد JSON فقط دون Markdown بالشكل:
{"title":"","category":"متفرقات","price":null,"governorate":"","area":"","description":""}
اكتب عنوانًا واضحًا ووصفًا عربيًا طبيعيًا دون ادعاءات مخترعة. التصنيف من: سيارات، موبايلات، عقارات، وظائف، أثاث، أجهزة كهربائية، خدمات، متفرقات. السعر رقم بالدينار أو null. حافظ على المعلومات التي قدمها المستخدم فقط.`,
        text,
      );
      return json({ ok: true, mode, source: "openai", model: env.OPENAI_MODEL || "gpt-4o-mini", data });
    }

    return json({ ok: false, error: "mode يجب أن يكون search أو agent أو ad" }, 400);
  } catch (error) {
    console.error("Ask Jordan AI error", error);
    return json({ ok: false, error: error?.message || "تعذر الاتصال بالذكاء الاصطناعي" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ai" || url.pathname === "/api/ai/") {
      return handleAI(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
