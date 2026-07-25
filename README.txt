ASK JORDAN — Worker + OpenAI

هيكل الرفع إلى جذر GitHub:
public/
src/index.js
wrangler.jsonc
package.json

Cloudflare deploy command:
npx wrangler deploy

المتغير السري المطلوب:
OPENAI_API_KEY

اختبار الخدمة بعد النشر:
GET /api/ai
يجب أن يعيد keyConfigured: true

لا تضع مفتاح OpenAI داخل GitHub أو config.js.
