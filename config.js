(() => {
  const cfg = window.ASK_JORDAN_CONFIG || {};
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const $ = (s) => document.querySelector(s);
  const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => `${Number(n||0).toLocaleString('ar-JO')} د.أ`;
  const phoneToEmail = phone => `${String(phone||'').replace(/\D/g,'')}@users.askjordan.com`;
  let session=null, profile=null, cache={profiles:[],ads:[],reports:[],promotions:[]};

  const titles={dashboard:['لوحة القيادة','نظرة مباشرة على حالة المنصة.'],users:['المستخدمون','إدارة حسابات المنصة وصلاحياتها.'],ads:['الإعلانات','مراجعة حالات الإعلانات وإدارتها.'],reports:['البلاغات','متابعة البلاغات المفتوحة.'],promotions:['طلبات الترويج','مراجعة الطلبات المدفوعة والمعلقة.'],ai:['مركز الذكاء الاصطناعي','حالة خدمات الذكاء الاصطناعي.']};

  async function getProfile(userId){
    const {data,error}=await sb.from('profiles').select('*').eq('id',userId).maybeSingle();
    if(error) throw error; return data;
  }
  function showLogin(message=''){$('#adminView').hidden=true;$('#loginView').hidden=false;$('#loginStatus').hidden=!message;$('#loginStatus').textContent=message}
  function showAdmin(){$('#loginView').hidden=true;$('#adminView').hidden=false;$('#adminIdentity').textContent=profile?.name||profile?.phone||'ADMIN'}
  async function boot(){
    const {data}=await sb.auth.getSession(); session=data.session;
    if(!session){showLogin();return}
    try{profile=await getProfile(session.user.id)}catch(e){showLogin(e.message);return}
    if(profile?.role!=='admin'){await sb.auth.signOut();showLogin('هذا الحساب لا يملك صلاحية مشرف.');return}
    showAdmin();await loadAll();
  }
  async function loadAll(){
    $('#stats').innerHTML='<div class="skeleton"></div>'.repeat(4);
    const [p,a,r,pr,m]=await Promise.all([
      sb.from('profiles').select('*').order('created_at',{ascending:false}).limit(500),
      sb.from('ads').select('*').order('created_at',{ascending:false}).limit(500),
      sb.from('reports').select('*').order('created_at',{ascending:false}).limit(300),
      sb.from('promotion_requests').select('*').order('created_at',{ascending:false}).limit(300),
      sb.from('messages').select('*',{count:'exact',head:true})
    ]);
    const error=p.error||a.error||r.error||pr.error;
    if(error){$('#stats').innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}
    cache={profiles:p.data||[],ads:a.data||[],reports:r.data||[],promotions:pr.data||[]};
    renderDashboard(m.count||0);renderUsers();renderAds();renderReports();renderPromotions();checkAI();
  }
  function stat(label,value,meta){return `<article class="stat"><small>${esc(label)}</small><strong>${Number(value||0).toLocaleString('ar-JO')}</strong><span>${esc(meta)}</span></article>`}
  function renderDashboard(messageCount){
    const today=new Date().toISOString().slice(0,10);
    const active=cache.ads.filter(x=>x.status==='active').length;
    const openReports=cache.reports.filter(x=>x.status==='open').length;
    const pending=cache.promotions.filter(x=>x.status==='pending').length;
    const revenue=cache.promotions.filter(x=>x.status==='approved').reduce((s,x)=>s+Number(x.amount||0),0);
    $('#stats').innerHTML=stat('المستخدمون',cache.profiles.length,`${cache.profiles.filter(x=>String(x.created_at||'').startsWith(today)).length} اليوم`)+stat('الإعلانات النشطة',active,`${cache.ads.length} إجمالي`)+stat('الرسائل',messageCount,'إجمالي الرسائل')+`<article class="stat"><small>الإيراد المؤكد</small><strong>${money(revenue)}</strong><span>طلبات ترويج معتمدة</span></article>`;
    const alerts=[];if(openReports)alerts.push(`${openReports} بلاغ مفتوح`);if(pending)alerts.push(`${pending} طلب ترويج معلق`);$('#alertStrip').hidden=!alerts.length;$('#alertStrip').textContent=alerts.length?`يحتاج انتباهك: ${alerts.join(' · ')}`:'';
    const acts=[];cache.ads.slice(0,6).forEach(x=>acts.push({at:x.created_at,title:'إعلان جديد',text:x.title}));cache.profiles.slice(0,5).forEach(x=>acts.push({at:x.created_at,title:'مستخدم جديد',text:x.name||x.phone||'حساب'}));cache.reports.slice(0,5).forEach(x=>acts.push({at:x.created_at,title:'بلاغ جديد',text:x.reason||`إعلان #${x.ad_id}`}));acts.sort((x,y)=>new Date(y.at||0)-new Date(x.at||0));$('#activity').innerHTML=acts.slice(0,10).map(x=>`<div class="row"><div><strong>${esc(x.title)}</strong><small>${esc(x.text||'')}</small></div><span class="badge">${x.at?new Date(x.at).toLocaleDateString('ar-JO'):'—'}</span></div>`).join('')||'<p>لا توجد نشاطات.</p>';
    const counts={};cache.ads.forEach(x=>{const g=x.governorate||'غير محدد';counts[g]=(counts[g]||0)+1});const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7),max=rows[0]?.[1]||1;$('#governorates').innerHTML=rows.map(([g,n])=>`<div><span><strong>${esc(g)}</strong><small>${n}</small></span><div class="bar"><i style="width:${n/max*100}%"></i></div></div>`).join('')||'<p>لا توجد بيانات.</p>';
  }
  function renderUsers(filter=''){const f=filter.trim().toLowerCase();const rows=cache.profiles.filter(x=>!f||String(x.name||'').toLowerCase().includes(f)||String(x.phone||'').includes(f));$('#usersList').innerHTML=rows.map(x=>`<div class="row"><div><strong>${esc(x.name||'مستخدم')}</strong><small>${esc(x.phone||'بدون رقم')} · ${x.role==='admin'?'مشرف':'مستخدم'}</small></div><span class="badge">${esc(x.role||'user')}</span></div>`).join('')||'<p>لا نتائج.</p>'}
  function renderAds(filter=''){const f=filter.trim().toLowerCase();const rows=cache.ads.filter(x=>!f||String(x.title||'').toLowerCase().includes(f));$('#adsList').innerHTML=rows.map(x=>`<div class="row"><div><strong>${esc(x.title||`إعلان #${x.id}`)}</strong><small>${esc(x.governorate||'')} · ${money(x.price)} · ${esc(x.status||'')}</small></div><div class="actions">${x.status!=='active'?`<button class="primary" data-ad-status="${x.id}" data-status="active">نشر</button>`:''}${x.status==='active'?`<button class="danger" data-ad-status="${x.id}" data-status="deleted">إخفاء</button><button data-ad-status="${x.id}" data-status="sold">مباع</button>`:''}</div></div>`).join('')||'<p>لا نتائج.</p>';bindActions()}
  function renderReports(){$('#reportsList').innerHTML=cache.reports.map(x=>`<div class="row"><div><strong>${esc(x.reason||'بلاغ')}</strong><small>إعلان #${x.ad_id} · ${esc(x.status||'open')}</small></div><div class="actions">${x.status==='open'?`<button class="primary" data-report-status="${x.id}" data-status="reviewed">تمت المراجعة</button><button data-report-status="${x.id}" data-status="dismissed">رفض</button>`:''}</div></div>`).join('')||'<p>لا توجد بلاغات.</p>';bindActions()}
  function renderPromotions(){$('#promotionsList').innerHTML=cache.promotions.map(x=>`<div class="row"><div><strong>طلب ترويج #${x.id}</strong><small>إعلان #${x.ad_id} · ${money(x.amount)} · ${esc(x.status||'')}</small></div><div class="actions">${x.status==='pending'?`<button class="primary" data-promo-status="${x.id}" data-status="approved">قبول</button><button class="danger" data-promo-status="${x.id}" data-status="rejected">رفض</button>`:''}</div></div>`).join('')||'<p>لا توجد طلبات.</p>';bindActions()}
  async function checkAI(){const started=performance.now();try{const res=await fetch('/api/ai');const data=await res.json();const ms=Math.round(performance.now()-started);const html=`<p class="${data.ok?'ok':'bad'}">${data.ok?'● الخدمة تعمل':'● الخدمة متوقفة'}</p><p>زمن الاستجابة: ${ms} ms</p><p>المفتاح: ${data.keyConfigured?'معدّ':'غير معدّ'}</p>`;$('#aiHealth').innerHTML=html;$('#aiCenter').innerHTML=html}catch(e){$('#aiHealth').innerHTML=$('#aiCenter').innerHTML=`<p class="bad">${esc(e.message)}</p>`}}
  function bindActions(){
    document.querySelectorAll('[data-ad-status]').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('ads').update({status:b.dataset.status,updated_at:new Date().toISOString()}).eq('id',Number(b.dataset.adStatus));if(error)alert(error.message);else loadAll()});
    document.querySelectorAll('[data-report-status]').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('reports').update({status:b.dataset.status,reviewed_at:new Date().toISOString(),reviewed_by:session.user.id}).eq('id',Number(b.dataset.reportStatus));if(error)alert(error.message);else loadAll()});
    document.querySelectorAll('[data-promo-status]').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('promotion_requests').update({status:b.dataset.status,reviewed_at:new Date().toISOString(),reviewed_by:session.user.id}).eq('id',Number(b.dataset.promoStatus));if(error)alert(error.message);else loadAll()});
  }
  function openSection(name){document.querySelectorAll('.page-section').forEach(x=>x.classList.toggle('active',x.id===`${name}Section`));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.section===name));$('#pageTitle').textContent=titles[name][0];$('#pageSubtitle').textContent=titles[name][1]}
  $('#nav').onclick=e=>{const b=e.target.closest('button[data-section]');if(b)openSection(b.dataset.section)};
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),phone=String(d.get('phone')||'').replace(/\D/g,''),password=String(d.get('password')||'');$('#loginStatus').hidden=false;$('#loginStatus').textContent='جاري تسجيل الدخول...';const {data,error}=await sb.auth.signInWithPassword({email:phoneToEmail(phone),password});if(error){showLogin(error.message);return}session=data.session;profile=await getProfile(session.user.id);if(profile?.role!=='admin'){await sb.auth.signOut();showLogin('الحساب ليس مشرفًا.');return}history.replaceState(null,'','/admin');showAdmin();await loadAll()};
  $('#logoutBtn').onclick=async()=>{await sb.auth.signOut();session=null;profile=null;history.replaceState(null,'','/admin/login');showLogin('تم تسجيل الخروج.')};
  $('#refreshBtn').onclick=loadAll;$('#userSearch').oninput=e=>renderUsers(e.target.value);$('#adSearch').oninput=e=>renderAds(e.target.value);
  boot();
})();
