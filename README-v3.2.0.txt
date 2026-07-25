Ask Jordan Core v3.1.0 — AI Seller Assistant B.5.1

الجديد:
- نقطة API جديدة: POST /api/ai/generate-ad
- تحويل وصف قصير إلى عنوان ووصف وتصنيف وسعر وموقع
- استخراج الماركة والموديل والحالة عند ذكرها فقط
- وسوم تلقائية
- Quality Score من 100 مع نصائح تحسين
- Fallback محلي عند تعطل OpenAI

التشغيل:
1) ارفع المشروع على Cloudflare Workers/Pages.
2) أضف OPENAI_API_KEY كـ Secret.
3) لا يوجد SQL جديد لهذا الإصدار.
