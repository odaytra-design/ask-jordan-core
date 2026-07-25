Ask Jordan v3.6.1 — Admin Route & Login

رابط لوحة الإدارة بعد النشر:
/admin
أو:
/admin/login

الدخول يستخدم نفس رقم الهاتف وكلمة المرور في Ask Jordan.
يجب أن تكون قيمة role في جدول public.profiles للحساب هي admin.

لمنح حسابك صلاحية Admin من Supabase SQL Editor:
update public.profiles
set role = 'admin'
where phone = '07XXXXXXXX';

استبدل الرقم برقم حسابك كما هو محفوظ في profiles.
لا يوجد Migration إجباري إذا كان عمود role موجودًا مسبقًا.
