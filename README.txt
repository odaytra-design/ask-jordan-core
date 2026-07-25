Ask Jordan v2.4.1 — Cloudflare Workers + GitHub

هذه النسخة مهيأة لمشروع Workers المنشور من GitHub.

الملفات المهمة:
- src/index.js: Worker API + تقديم ملفات الموقع
- public/: واجهة الموقع
- wrangler.jsonc: إعداد Worker وStatic Assets

متغير Cloudflare السري المطلوب:
OPENAI_API_KEY

اختبار بعد النشر:
1) افتح https://YOUR-WORKER.workers.dev/api/ai
2) يجب أن يظهر JSON يحتوي:
   "ok": true
   "runtime": "Cloudflare Workers"

ملاحظة: لا تضع مفتاح OpenAI داخل GitHub أو config.js.
