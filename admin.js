<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>لوحة إدارة Ask Jordan</title>
  <link rel="stylesheet" href="/admin.css" />
</head>
<body>
  <div id="loginView" class="login-view">
    <form id="loginForm" class="login-card">
      <div class="brand-mark">JO</div>
      <h1>دخول لوحة الإدارة</h1>
      <p>استخدم حساب المشرف المسجّل في Ask Jordan.</p>
      <label>رقم الهاتف<input name="phone" inputmode="tel" autocomplete="username" placeholder="00962..." required /></label>
      <label>كلمة المرور<input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">دخول</button>
      <p id="loginStatus" class="status" hidden></p>
      <a href="/">العودة للموقع</a>
    </form>
  </div>

  <div id="adminView" class="admin-shell" hidden>
    <aside class="sidebar">
      <a href="/admin" class="brand"><span>JO</span><div><strong>Ask Jordan</strong><small>CONTROL CENTER</small></div></a>
      <nav id="nav">
        <button class="active" data-section="dashboard">▦ <span>لوحة القيادة</span></button>
        <button data-section="users">👥 <span>المستخدمون</span></button>
        <button data-section="ads">📢 <span>الإعلانات</span></button>
        <button data-section="reports">🚨 <span>البلاغات</span></button>
        <button data-section="promotions">💎 <span>طلبات الترويج</span></button>
        <button data-section="ai">🤖 <span>الذكاء الاصطناعي</span></button>
      </nav>
      <div class="sidebar-bottom">
        <a href="/">← العودة للموقع</a>
        <button id="logoutBtn">تسجيل الخروج</button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div><small>ASK JORDAN CONTROL CENTER</small><h1 id="pageTitle">لوحة القيادة</h1><p id="pageSubtitle">نظرة مباشرة على حالة المنصة.</p></div>
        <div class="top-actions"><span id="adminIdentity">ADMIN</span><button id="refreshBtn">↻ تحديث</button></div>
      </header>

      <section id="dashboardSection" class="page-section active">
        <div id="alertStrip" class="alert-strip" hidden></div>
        <div id="stats" class="stats"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
        <div class="grid">
          <article class="card wide"><div class="card-head"><div><h2>آخر النشاطات</h2><p>أحدث العمليات المسجّلة</p></div></div><div id="activity" class="list"></div></article>
          <article class="card"><div class="card-head"><div><h2>المحافظات</h2><p>توزيع الإعلانات الحالية</p></div></div><div id="governorates" class="ranking"></div></article>
          <article class="card"><div class="card-head"><div><h2>حالة الذكاء الاصطناعي</h2><p>اتصال OpenAI</p></div></div><div id="aiHealth"></div></article>
        </div>
      </section>

      <section id="usersSection" class="page-section"><div class="section-head"><h2>المستخدمون</h2><input id="userSearch" placeholder="بحث بالاسم أو الرقم" /></div><div id="usersList" class="table-list"></div></section>
      <section id="adsSection" class="page-section"><div class="section-head"><h2>الإعلانات</h2><input id="adSearch" placeholder="بحث بعنوان الإعلان" /></div><div id="adsList" class="table-list"></div></section>
      <section id="reportsSection" class="page-section"><div class="section-head"><h2>البلاغات</h2></div><div id="reportsList" class="table-list"></div></section>
      <section id="promotionsSection" class="page-section"><div class="section-head"><h2>طلبات الترويج</h2></div><div id="promotionsList" class="table-list"></div></section>
      <section id="aiSection" class="page-section"><div class="section-head"><h2>مركز الذكاء الاصطناعي</h2></div><div class="card"><div id="aiCenter"></div></div></section>
    </main>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/config.js"></script>
  <script src="/admin.js"></script>
</body>
</html>
