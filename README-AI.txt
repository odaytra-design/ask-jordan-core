Ask Jordan AI final integration

Cloudflare secret required:
OPENAI_API_KEY

Optional runtime variable:
OPENAI_MODEL=gpt-4o-mini

Health check:
GET /api/ai

Expected response includes keyConfigured:true.
Search requests return source:"openai" and model when OpenAI responds successfully.
