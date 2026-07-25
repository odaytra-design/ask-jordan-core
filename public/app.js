const cfg=window.ASK_JORDAN_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
const $=s=>document.querySelector(s);
let session=null,currentProfile=null,authMode='login',ads=[],editingAdId=null,currentDetail=null,currentImageIndex=0,isPublishing=false;
let favorites=new Set(JSON.parse(localStorage.getItem('askJordanFavorites')||'[]').map(Number));
let analytics=JSON.parse(localStorage.getItem('askJordanAnalytics')||'{}');
let buyerFlow={active:false,intent:null,step:null};
let sellerFlow={active:false,step:null,data:{}};
const phoneToEmail=p=>`${String(p).replace(/\D/g,'')}@users.askjordan.com`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=v=>Number(v)?`${Number(v).toLocaleString('ar-JO')} د.أ`:'السعر عند التواصل';
const waLink=p=>`https://wa.me/962${String(p||'').replace(/\D/g,'').replace(/^0/,'')}`;
const normalizeImage=x=>x?{...x,image_url:x.image_url||x.url||''}:x;
const AD_DRAFT_KEY='askJordanAdDraftV160';
const PAYMENT_PHONE='0776275911';
const PROMOTION_PLANS={day:{label:'يوم واحد',amount:1,days:1},week:{label:'أسبوع',amount:5,days:7},month:{label:'شهر',amount:15,days:30}};
function detectCategoryFromText(text){
  const q=normalizeArabic(text);
  return Object.entries(categoryAliases).find(([,words])=>words.some(w=>q.includes(normalizeArabic(w))))?.[0]||'متفرقات';
}
function detectGovernorateFromText(text){
  const q=normalizeArabic(text);
  return Object.entries(governorateAliases).find(([,aliases])=>aliases.some(a=>q.includes(normalizeArabic(a))))?.[0]||'';
}
function detectPriceFromText(text){
  const q=normalizeArabic(text);
  const m=q.match(/(?:ب|بسعر|سعره|السعر|مطلوب)\s*([\d.,]+\s*(?:الف|k)?)/i)||q.match(/([\d.,]+\s*(?:الف|k)?)\s*(?:دينار|د\.?ا)/i);
  return m?parseCompactNumber(m[1]):null;
}
function buildSmartAd(text){
  const clean=String(text||'').trim();
  const category=detectCategoryFromText(clean),governorate=detectGovernorateFromText(clean),price=detectPriceFromText(clean);
  let title=clean.replace(/^(بدي|بدّي|اريد|أريد)\s+(ابيع|أبيع|بيع)\s*/i,'').split(/[،,.\n]/)[0].trim();
  title=title.replace(/(?:ب|بسعر|سعره|السعر|مطلوب)\s*[\d.,]+\s*(?:الف|k)?\s*(?:دينار|د\.?ا)?/ig,'').replace(/\s+(في|من)\s+(عمان|عمّان|اربد|إربد|الزرقاء|زرقاء|البلقاء|السلط|المفرق|جرش|عجلون|مادبا|الكرك|الطفيلة|معان|العقبة).*$/i,'').trim();
  if(title.length>100)title=title.slice(0,100).trim();
  if(!title)title=category==='متفرقات'?'منتج للبيع':category.replace(/ات$/,'');
  const areaMatch=clean.match(/(?:في|من)\s+(?:عمان|عمّان|اربد|إربد|الزرقاء|زرقاء|البلقاء|السلط|المفرق|جرش|عجلون|مادبا|الكرك|الطفيلة|معان|العقبة)\s+([^،,.\n]{2,30})/i);
  const area=areaMatch?.[1]?.replace(/^(منطقه|منطقة|حي)\s*/i,'').trim()||'';
  const description=clean.length<35?`${title} بحالة جيدة. للتواصل والاستفسار عبر الهاتف أو واتساب.`:clean;
  return {title,category,price:price||'',governorate,area,description};
}
function saveAdDraft(){
  const form=$('#adForm');if(!form)return;
  const e=form.elements;
  const draft={prompt:$('#sellerPrompt')?.value||'',title:e.title?.value||'',category:e.category?.value||'',price:e.price?.value||'',governorate:e.governorate?.value||'',area:e.area?.value||'',description:e.description?.value||'',phone:e.phone?.value||''};
  localStorage.setItem(AD_DRAFT_KEY,JSON.stringify(draft));
}
function restoreAdDraft(){
  try{const d=JSON.parse(localStorage.getItem(AD_DRAFT_KEY)||'null');if(!d)return false;const e=$('#adForm').elements;$('#sellerPrompt').value=d.prompt||'';for(const k of ['title','category','price','governorate','area','description','phone'])if(e[k]&&d[k]!==undefined)e[k].value=d[k];return true}catch{return false}
}
function clearAdDraft(){localStorage.removeItem(AD_DRAFT_KEY);$('#sellerPrompt').value='';$('#imagePreview').innerHTML='';}
function renderImagePreview(files){
  const box=$('#imagePreview');if(!box)return;box.innerHTML='';
  [...files].slice(0,5).forEach(file=>{const url=URL.createObjectURL(file),item=document.createElement('div');item.className='image-preview-item';item.innerHTML=`<img src="${url}" alt="معاينة"><span>${esc(file.name)}</span>`;box.appendChild(item)});
}
const saveFavorites=()=>localStorage.setItem('askJordanFavorites',JSON.stringify([...favorites]));
const isFavorite=id=>favorites.has(Number(id));
const saveAnalytics=()=>localStorage.setItem('askJordanAnalytics',JSON.stringify(analytics));
function trackAdAction(id,action){
  id=String(id);analytics[id]=analytics[id]||{views:0,whatsapp:0,calls:0,shares:0};
  analytics[id][action]=(analytics[id][action]||0)+1;saveAnalytics();
}
function adAnalytics(id){return analytics[String(id)]||{views:0,whatsapp:0,calls:0,shares:0}}
function toggleFavorite(id){
  id=Number(id);
  if(isFavorite(id))favorites.delete(id);else favorites.add(id);
  saveFavorites();
  renderAds(window.__lastRenderedAds||ads);
  if(currentDetail&&Number(currentDetail.id)===id)updateDetailFavorite();
}
function updateDetailFavorite(){
  const btn=$('#detailFavorite');
  if(!btn||!currentDetail)return;
  const active=isFavorite(currentDetail.id);
  btn.textContent=active?'♥ محفوظ':'♡ حفظ';
  btn.classList.toggle('active',active);
}
function animateNumber(el,target){
  if(!el)return;const start=Number(el.textContent.replace(/\D/g,''))||0,duration=700,t0=performance.now();
  const tick=now=>{const p=Math.min(1,(now-t0)/duration),v=Math.round(start+(target-start)*(1-Math.pow(1-p,3)));el.textContent=v.toLocaleString('ar-JO');if(p<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)
}
async function loadPublicStats(countVisit=false){
  try{
    if(countVisit)await sb.rpc('increment_site_visit');
    const {data,error}=await sb.rpc('get_public_stats');if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;if(!row)return;
    animateNumber($('#visitCount'),Number(row.visits)||0);animateNumber($('#searchCount'),Number(row.searches)||0);animateNumber($('#userCount'),Number(row.users)||0);animateNumber($('#activeAdCount'),Number(row.active_ads)||0);
  }catch(error){console.warn('Public stats:',error.message)}
}
function isFeatured(a){return a.featured_until&&new Date(a.featured_until)>new Date()}
function renderFeaturedAds(){
  const featured=ads.filter(isFeatured).sort((a,b)=>new Date(b.featured_until)-new Date(a.featured_until)).slice(0,6),section=$('#featuredSection');
  if(!section)return;section.hidden=!featured.length;if(!featured.length)return;
  $('#featuredAds').innerHTML=featured.map(a=>{const img=adImages(a)[0]?.image_url;return `<article class="card featured-card" data-featured-open="${a.id}"><span class="featured-badge">⭐ مميز</span><div class="card-media">${featured?'<span class="featured-badge">⭐ مميز</span>':''}${img?`<img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy">`:'<div class="placeholder">📦</div>'}</div><div class="card-body"><h3>${esc(a.title)}</h3><div class="price">${money(a.price)}</div><div class="meta">📍 ${esc(a.governorate)}${a.area?` · ${esc(a.area)}`:''}</div></div></article>`}).join('');
  document.querySelectorAll('[data-featured-open]').forEach(c=>c.onclick=()=>openDetails(Number(c.dataset.featuredOpen)));
}
function openPromotionDialog(ad){
  $('#promotionAdId').value=ad.id;$('#promotionAdTitle').value=ad.title;$('#promotionStatus').hidden=true;$('#promotionDialog').showModal();
}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
async function refreshSession(){const {data}=await sb.auth.getSession();session=data.session;if(!session){currentProfile=null;updateAdminButton();return null}const {data:profile}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();currentProfile=profile||null;updateAdminButton();return session}
function isAdmin(){return currentProfile?.role==='admin'}
function updateAdminButton(){const btn=$('#adminBtn');if(btn)btn.hidden=!isAdmin()}
async function requireAuth(){await refreshSession();if(!session){setAuthMode('login');$('#authDialog').showModal();return false}return true}
async function requireAdmin(){await refreshSession();if(!session){setAuthMode('login');$('#authDialog').showModal();return false}if(!isAdmin()){alert('هذه الصفحة مخصصة للمشرف فقط.');return false}return true}
function setAuthMode(m){authMode=m;const s=m==='signup';$('#authTitle').textContent=s?'إنشاء حساب':'تسجيل الدخول';$('#authSubmit').textContent=s?'إنشاء الحساب':'دخول';$('#toggleAuth').textContent=s?'لدي حساب':'إنشاء حساب جديد';$('#nameField').hidden=!s}
$('#toggleAuth').onclick=()=>setAuthMode(authMode==='login'?'signup':'login');
$('#authForm').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),phone=String(d.get('phone')).replace(/\D/g,''),password=String(d.get('password')),email=phoneToEmail(phone);let r;if(authMode==='signup'){r=await sb.auth.signUp({email,password,options:{data:{phone,name:String(d.get('name')||'')}}})}else{r=await sb.auth.signInWithPassword({email,password})}if(r.error){alert(r.error.message);return}await refreshSession();closeDialogs();e.currentTarget.reset();alert(authMode==='signup'?'تم إنشاء الحساب':'تم تسجيل الدخول')};
async function fetchImages(){const {data,error}=await sb.from('ad_images').select('*').order('sort_order',{ascending:true});if(error){console.warn('Images load:',error.message);return []}return (data||[]).map(normalizeImage)}
let liveActivityOffset=0,liveActivityTimer=null;
function renderLiveActivity(){
  const section=$('#liveActivitySection'),box=$('#liveActivity');if(!section||!box)return;
  const recent=ads.slice(0,9);section.hidden=!recent.length;if(!recent.length)return;
  const now=Date.now(),visible=[];for(let i=0;i<Math.min(3,recent.length);i++)visible.push(recent[(liveActivityOffset+i)%recent.length]);
  box.innerHTML=visible.map((a,i)=>{const mins=Math.max(1,Math.floor((now-new Date(a.created_at||now).getTime())/60000));const label=mins<60?`قبل ${mins} دقيقة`:mins<1440?`قبل ${Math.floor(mins/60)} ساعة`:'اليوم';return `<button type="button" class="activity-item activity-enter" data-activity-ad="${a.id}"><span class="activity-icon">${i%2?'🔎':'✨'}</span><span><strong>${i===0?'وصل الآن':'إعلان جديد'}: ${esc(a.title)}</strong><small>${esc(a.governorate)} · ${label}</small></span></button>`}).join('');
  document.querySelectorAll('[data-activity-ad]').forEach(b=>b.onclick=()=>openDetails(Number(b.dataset.activityAd)));
  clearInterval(liveActivityTimer);if(recent.length>3)liveActivityTimer=setInterval(()=>{liveActivityOffset=(liveActivityOffset+1)%recent.length;renderLiveActivity()},6500);
}
async function loadAds(){
  $('#status').textContent='جاري تحميل الإعلانات...';
  const [{data:adRows,error:adError},images]=await Promise.all([
    sb.from('ads').select('*').eq('status','active').order('created_at',{ascending:false}).limit(200),
    fetchImages()
  ]);
  if(adError){$('#status').textContent=adError.message;return}
  const byAd=new Map();for(const img of images){if(!byAd.has(String(img.ad_id)))byAd.set(String(img.ad_id),[]);byAd.get(String(img.ad_id)).push(img)}
  ads=(adRows||[]).map(a=>({...a,ad_images:byAd.get(String(a.id))||[]})).sort((a,b)=>(isFeatured(b)-isFeatured(a))||new Date(b.created_at)-new Date(a.created_at));
  renderFeaturedAds();renderLiveActivity();renderAds(ads);loadPublicStats(false)
}
function adImages(a){return [...(a.ad_images||[])].map(normalizeImage).filter(x=>x.image_url).sort((x,y)=>(x.sort_order||0)-(y.sort_order||0))}
function renderAds(list){
  window.__lastRenderedAds=list;
  $('#status').textContent=list.length?`وجدنا ${list.length} إعلان`:'لا توجد إعلانات مطابقة حاليًا';
  $('#results').innerHTML=list.length?list.map(a=>{
    const imgs=adImages(a),img=imgs[0]?.image_url,fav=isFavorite(a.id),featured=isFeatured(a);
    return `<article class="card ${featured?'featured-card':''}" data-open-ad="${a.id}"><div class="card-media">${featured?'<span class="featured-badge">⭐ مميز</span>':''}${img?`<img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy">`:'<div class="placeholder">📦</div>'}${imgs.length>1?`<span class="image-count">📷 ${imgs.length}</span>`:''}<button type="button" class="favorite-btn ${fav?'active':''}" data-favorite-ad="${a.id}" aria-label="حفظ الإعلان">${fav?'♥':'♡'}</button></div><div class="card-body"><div class="card-head"><h3>${esc(a.title)}</h3><button class="share-icon" data-share-ad="${a.id}" aria-label="مشاركة">↗</button></div><div class="price">${money(a.price)}</div><div class="meta">📍 ${esc(a.governorate)}${a.area?` · ${esc(a.area)}`:''}</div><p class="desc">${esc(a.description)}</p><div class="card-actions"><a class="call" href="tel:${esc(a.phone)}" data-track-call="${a.id}" onclick="event.stopPropagation()">اتصال</a><a class="whatsapp" target="_blank" rel="noopener" href="${waLink(a.phone)}" data-track-wa="${a.id}" onclick="event.stopPropagation()">واتساب</a></div></div></article>`;
  }).join(''):'<div class="empty">ما في نتائج حاليًا. جرّب طلبًا أوسع.</div>';
  document.querySelectorAll('[data-open-ad]').forEach(c=>c.onclick=e=>{if(e.target.closest('a,button'))return;openDetails(Number(c.dataset.openAd))});
  document.querySelectorAll('[data-share-ad]').forEach(b=>b.onclick=e=>{e.stopPropagation();shareAd(Number(b.dataset.shareAd))});
  document.querySelectorAll('[data-favorite-ad]').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleFavorite(Number(b.dataset.favoriteAd))});
  document.querySelectorAll('[data-track-call]').forEach(a=>a.onclick=()=>trackAdAction(a.dataset.trackCall,'calls'));
  document.querySelectorAll('[data-track-wa]').forEach(a=>a.onclick=()=>trackAdAction(a.dataset.trackWa,'whatsapp'));
}
const governorates=['عمان','إربد','الزرقاء','البلقاء','المفرق','جرش','عجلون','مادبا','الكرك','الطفيلة','معان','العقبة'];
const governorateAliases={
  'عمان':['عمان','عمّان','amman'],
  'إربد':['إربد','اربد','irbid'],
  'الزرقاء':['الزرقاء','زرقاء','zarqa'],
  'البلقاء':['البلقاء','بلقاء','السلط','salt'],
  'المفرق':['المفرق','مفرق','mafraq'],
  'جرش':['جرش','jerash'],
  'عجلون':['عجلون','ajloun'],
  'مادبا':['مادبا','madaba'],
  'الكرك':['الكرك','كرك','karak'],
  'الطفيلة':['الطفيلة','طفيلة','tafilah'],
  'معان':['معان','maan'],
  'العقبة':['العقبة','عقبة','aqaba']
};
const categoryAliases={
  'سيارات':['سيارة','سيارات','سياره','مركبة','مركبات','تويوتا','كيا','هونداي','هيونداي','مرسيدس','bmw'],
  'موبايلات':['ايفون','آيفون','iphone','سامسونج','samsung','هاتف','موبايل','جوال','شاومي','xiaomi'],
  'عقارات':['شقة','شقق','بيت','منزل','أرض','ارض','عقار','عقارات','إيجار','ايجار','محل','مكتب'],
  'وظائف':['وظيفة','وظائف','شغل','عمل','موظف','موظفة'],
  'أثاث':['أثاث','اثاث','كنبايات','كنب','غرفة نوم','طاولة','خزانة'],
  'أجهزة كهربائية':['ثلاجة','غسالة','مكيف','تلفزيون','شاشة','أجهزة','اجهزة','فرن'],
  'خدمات':['خدمة','خدمات','صيانة','تنظيف','نقل','دهان','كهربجي','سباك']
};
const synonymGroups=[
  ['ايفون','آيفون','iphone'],['سامسونج','samsung'],['سيارة','سيارات','سياره'],['شقة','شقق','شقه'],
  ['موبايل','جوال','هاتف'],['إيجار','ايجار'],['أرض','ارض'],['أجهزة','اجهزة']
];
function normalizeArabic(v=''){
  return String(v).toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[^\u0600-\u06FFa-z0-9.\s]/gi,' ').replace(/\s+/g,' ').trim();
}
function parseCompactNumber(raw){
  const s=String(raw).toLowerCase().replace(/,/g,'').trim();
  const m=s.match(/(\d+(?:\.\d+)?)\s*(الف|ألف|k)?/i);if(!m)return null;
  let n=Number(m[1]);if(m[2])n*=1000;return Number.isFinite(n)?n:null;
}
function expandWord(word){
  const n=normalizeArabic(word);const group=synonymGroups.find(g=>g.some(x=>normalizeArabic(x)===n));return group?group.map(normalizeArabic):[n];
}
function understandQuery(raw){
  const q=normalizeArabic(raw);
  const between=q.match(/(?:بين|من)\s*([\d.,]+\s*(?:الف|k)?)\s*(?:و|الى|ل)\s*([\d.,]+\s*(?:الف|k)?)/i);
  const maxM=q.match(/(?:اقل من|تحت|لحد|حده|حدود|ما يتجاوز|بسقف)\s*([\d.,]+\s*(?:الف|k)?)/i);
  const minM=q.match(/(?:اكثر من|فوق|يبدا من)\s*([\d.,]+\s*(?:الف|k)?)/i);
  let minPrice=between?parseCompactNumber(between[1]):minM?parseCompactNumber(minM[1]):null;
  let maxPrice=between?parseCompactNumber(between[2]):maxM?parseCompactNumber(maxM[1]):null;
  if(minPrice!==null&&maxPrice!==null&&minPrice>maxPrice)[minPrice,maxPrice]=[maxPrice,minPrice];
  const gov=Object.entries(governorateAliases).find(([,aliases])=>aliases.some(a=>q.includes(normalizeArabic(a))))?.[0]||null;
  const category=Object.entries(categoryAliases).find(([,words])=>words.some(w=>q.includes(normalizeArabic(w))))?.[0]||null;
  const yearMatch=q.match(/\b(19[8-9]\d|20[0-3]\d)\b/);
  const year=yearMatch?Number(yearMatch[1]):null;
  const transmission=/\b(اوتوماتيك|اوتوماتك|اتوماتيك|automatic)\b/.test(q)?'أوتوماتيك':/\b(عادي|يدوي|manual)\b/.test(q)?'عادي':null;
  const stop=['موديل','سنة','سنه','بدي','بدّي','اريد','أريد','دور','دورلي','ابحث','عن','اقل','اكثر','من','في','على','دينار','داخل','تحت','فوق','حدود','بحدود','ما','يتجاوز','بسعر','سعر','لحد','الى','بين','و'];
  const stopN=stop.map(normalizeArabic);
  const govTokens=Object.values(governorateAliases).flat().map(normalizeArabic);
  const words=q.split(/\s+/).filter(w=>w.length>1&&!stopN.includes(w)&&!govTokens.includes(w)&&!/^(\d|الف|k)/i.test(w));
  return {raw,q,minPrice,maxPrice,gov,category,year,transmission,words};
}
function scoreAd(a,intent){
  const hay=normalizeArabic(`${a.title} ${a.category} ${a.governorate} ${a.area} ${a.description}`);
  let score=0;
  if(intent.category){if(normalizeArabic(a.category)===normalizeArabic(intent.category))score+=35;else if(hay.includes(normalizeArabic(intent.category)))score+=15;else return -1}
  if(intent.gov){if(normalizeArabic(a.governorate)===normalizeArabic(intent.gov))score+=30;else if(hay.includes(normalizeArabic(intent.gov)))score+=12;else return -1}
  const price=Number(a.price)||0;
  if(intent.maxPrice!==null&&price>0){if(price>intent.maxPrice)return -1;score+=12-Math.min(10,Math.round((intent.maxPrice-price)/Math.max(intent.maxPrice,1)*10))}
  if(intent.minPrice!==null&&price<intent.minPrice)return -1;
  if(intent.year){if(hay.includes(String(intent.year)))score+=28;else return -1}
  if(intent.transmission){const variants=intent.transmission==='أوتوماتيك'?['اوتوماتيك','اوتوماتك','اتوماتيك','automatic']:['عادي','يدوي','manual'];if(variants.some(v=>hay.includes(normalizeArabic(v))))score+=24;else return -1}
  for(const word of intent.words){const variants=expandWord(word);if(variants.some(v=>hay.includes(v)))score+=18;else if(word.length>=4&&variants.some(v=>hay.split(' ').some(t=>t.startsWith(v.slice(0,Math.max(3,v.length-1))))))score+=8;else score-=5}
  if(a.created_at)score+=Math.max(0,5-Math.floor((Date.now()-new Date(a.created_at))/86400000/7));
  return score;
}
function searchAdsFromIntent(intent){return {intent,results:ads.map(a=>({a,score:scoreAd(a,intent)})).filter(x=>x.score>=0).sort((x,y)=>y.score-x.score).map(x=>x.a)}}
function searchAds(raw){return searchAdsFromIntent(understandQuery(raw))}
async function callAskJordanAI(mode,text){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,text}),signal:controller.signal});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok||!payload.ok)throw new Error(payload.error||`AI HTTP ${r.status}`);
    return {...payload.data,__source:payload.source||'unknown',__model:payload.model||''};
  }finally{clearTimeout(timer)}
}
function mergeAIIntent(raw,ai){
  const local=understandQuery(raw),words=Array.isArray(ai?.keywords)?ai.keywords.map(normalizeArabic).filter(Boolean):[];
  return {...local,category:ai?.category||local.category,gov:ai?.governorate||local.gov,minPrice:Number.isFinite(Number(ai?.minPrice))?Number(ai.minPrice):local.minPrice,maxPrice:Number.isFinite(Number(ai?.maxPrice))?Number(ai.maxPrice):local.maxPrice,year:Number.isFinite(Number(ai?.year))?Number(ai.year):local.year,transmission:ai?.transmission||local.transmission,words:words.length?words:local.words,aiSummary:ai?.summary||'',aiReply:ai?.assistantReply||'',aiSource:ai?.__source||''};
}
function intentSummary(intent){const parts=[];if(intent.words.length)parts.push(intent.words.join(' '));if(intent.category&&!parts.includes(intent.category))parts.push(intent.category);if(intent.gov)parts.push(`في ${intent.gov}`);if(intent.year)parts.push(`موديل ${intent.year}`);if(intent.transmission)parts.push(intent.transmission);if(intent.minPrice!==null&&intent.maxPrice!==null)parts.push(`بين ${money(intent.minPrice)} و${money(intent.maxPrice)}`);else if(intent.maxPrice!==null)parts.push(`حتى ${money(intent.maxPrice)}`);else if(intent.minPrice!==null)parts.push(`من ${money(intent.minPrice)}`);return parts.join(' · ')||intent.raw}
function suggestionButtons(intent){
  const items=[];
  if(intent.maxPrice!==null)items.push({label:'وسّع السعر 20%',q:intent.raw.replace(/\d+(?:[.,]\d+)?\s*(?:الف|k)?/i,String(Math.round(intent.maxPrice*1.2)))})
  if(intent.gov)items.push({label:'كل الأردن',q:intent.raw.replace(new RegExp(governorateAliases[intent.gov].join('|'),'i'),'')})
  if(intent.words.length>1)items.push({label:'بحث أوسع',q:intent.words.slice(0,-1).join(' ')})
  return items.slice(0,3).map(x=>`<button type="button" class="suggestion-chip" data-search-suggestion="${esc(x.q.trim())}">${esc(x.label)}</button>`).join('');
}
async function runSmartSearch(raw,precomputedIntent=null,aiAlreadyUsed=false){
  sb.rpc('increment_search_count').then(()=>loadPublicStats(false)).catch(()=>{});
  const reply=$('#assistantReply');reply.hidden=false;reply.textContent='جاري فهم طلبك بالذكاء الاصطناعي...';
  let intent=precomputedIntent,usedAI=aiAlreadyUsed;
  if(!intent){
    try{const ai=await callAskJordanAI('search',raw);intent=mergeAIIntent(raw,ai);usedAI=true;console.info('Ask Jordan AI search active',ai)}
    catch(error){console.warn('AI fallback:',error.message);intent=understandQuery(raw)}
  }
  const {results}=searchAdsFromIntent(intent);
  const badge=usedAI?' <span class="ai-live-badge">AI</span>':'';
  const aiIntro=usedAI&&intent.aiReply?`${esc(intent.aiReply)}${badge}`:`فهمت طلبك${badge}: <strong>${esc(intent.aiSummary||intentSummary(intent))}</strong>`;
  reply.innerHTML=results.length?`${aiIntro}<br>وجدت ورتبت لك <strong>${results.length}</strong> إعلانًا من الأكثر تطابقًا للأقل.`:`${aiIntro}<br>لكن ما لقيت إعلانًا مطابقًا حاليًا.<div class="suggestion-row">${suggestionButtons(intent)}</div>`;
  renderAds(results);
  document.querySelectorAll('[data-search-suggestion]').forEach(b=>b.onclick=()=>{$('#searchInput').value=b.dataset.searchSuggestion;$('#searchForm').requestSubmit()});
}
function appendBuyerMessage(text,kind='assistant'){
  const box=$('#buyerConversation');if(!box)return;
  const msg=document.createElement('div');msg.className=`buyer-message ${kind}`;msg.innerHTML=kind==='assistant'?text:esc(text);box.appendChild(msg);box.scrollTop=box.scrollHeight;
}
function setBuyerChoices(items=[]){
  const box=$('#buyerChoices');if(!box)return;box.hidden=!items.length;
  box.innerHTML=items.map(x=>`<button type="button" data-buyer-choice="${esc(x.value)}">${esc(x.label)}</button>`).join('');
  box.querySelectorAll('[data-buyer-choice]').forEach(b=>b.onclick=()=>handleBuyerInput(b.dataset.buyerChoice,true));
}
function resetBuyerFlow(showGreeting=true){
  buyerFlow={active:false,intent:null,step:null};setBuyerChoices([]);$('#resetBuyerFlow').hidden=true;
  if(showGreeting){$('#buyerConversation').innerHTML='<div class="buyer-message assistant">مرحبًا 👋 اكتب ما تبحث عنه، مثل: <strong>بدي سيارة</strong>.</div>'}
}
function intentToQuery(intent){
  const parts=[];
  if(intent.words?.length)parts.push(intent.words.join(' '));else if(intent.category)parts.push(intent.category);
  if(intent.year)parts.push(String(intent.year));if(intent.transmission)parts.push(intent.transmission);if(intent.maxPrice!==null)parts.push(`أقل من ${intent.maxPrice}`);if(intent.minPrice!==null)parts.push(`أكثر من ${intent.minPrice}`);if(intent.gov)parts.push(`في ${intent.gov}`);
  return parts.join(' ').trim();
}
function askNextBuyerQuestion(){
  const intent=buyerFlow.intent;
  $('#resetBuyerFlow').hidden=false;
  if(!intent.category){buyerFlow.step='category';appendBuyerMessage('شو نوع الشيء اللي بتدور عليه؟');setBuyerChoices(Object.keys(categoryAliases).map(x=>({label:x,value:x})));return}
  if(!intent.gov){buyerFlow.step='gov';appendBuyerMessage('ممتاز 👌 بأي محافظة بدك تبحث؟');setBuyerChoices(governorates.map(x=>({label:x,value:x})));return}
  if(intent.category==='سيارات'&&!intent.transmission){buyerFlow.step='transmission';appendBuyerMessage('بدك السيارة أوتوماتيك ولا عادي؟');setBuyerChoices([{label:'أوتوماتيك',value:'أوتوماتيك'},{label:'عادي',value:'عادي'},{label:'ما بفرق',value:'ما بفرق'}]);return}
  if(intent.maxPrice===null&&intent.minPrice===null&&['سيارات','موبايلات','عقارات','أثاث','أجهزة كهربائية'].includes(intent.category)){buyerFlow.step='price';appendBuyerMessage('شو أعلى ميزانية مناسبة إلك؟ اكتب الرقم بالدينار، أو اختر بدون تحديد.');setBuyerChoices([{label:'بدون تحديد سعر',value:'بدون تحديد'},{label:'أقل من 300',value:'300'},{label:'أقل من 1000',value:'1000'},{label:'أقل من 10000',value:'10000'}]);return}
  buyerFlow.step='done';setBuyerChoices([]);const query=intentToQuery(intent);appendBuyerMessage(`تمام، ببحث لك عن: <strong>${esc(intentSummary(intent))}</strong>`);runSmartSearch(query);document.querySelector('#conversation')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function mergeBuyerAnswer(raw){
  const answer=understandQuery(raw),intent=buyerFlow.intent;
  if(buyerFlow.step==='category')intent.category=answer.category||Object.keys(categoryAliases).find(x=>normalizeArabic(x)===normalizeArabic(raw))||intent.category;
  else if(buyerFlow.step==='gov')intent.gov=answer.gov||governorates.find(x=>normalizeArabic(x)===normalizeArabic(raw))||intent.gov;
  else if(buyerFlow.step==='transmission'){intent.transmission=/فرق/.test(raw)?null:(answer.transmission||raw);}
  else if(buyerFlow.step==='price'){
    if(normalizeArabic(raw).includes('بدون تحديد')){intent.maxPrice=null;intent.minPrice=null;intent.skipPrice=true}
    else{const n=parseCompactNumber(raw);if(n!==null)intent.maxPrice=n}
  }
  if(answer.words?.length&&buyerFlow.step!=='category'&&buyerFlow.step!=='gov')intent.words=[...new Set([...(intent.words||[]),...answer.words])];
}
async function handleBuyerInput(raw,fromChoice=false){
  raw=String(raw||'').trim();if(!raw)return;
  appendBuyerMessage(raw,'user');$('#searchInput').value='';
  const normalized=normalizeArabic(raw);
  if(/\b(ابيع|بيع|اعرض|انشر)\b/.test(normalized)||normalized==='بدي ابيع'){
    appendBuyerMessage('أكيد 👍 افتح لك نموذج الإعلان، ومساعد البيع سيعبّيه معك.');setBuyerChoices([]);if(await requireAuth()){$('#heroAddBtn').click()}return;
  }
  if(buyerFlow.active&&buyerFlow.step!=='done'){mergeBuyerAnswer(raw);askNextBuyerQuestion();return}
  let intent,usedAI=false;
  appendBuyerMessage('لحظة، بفهم طلبك بالذكاء الاصطناعي...');
  try{
    const ai=await callAskJordanAI('search',raw);
    intent=mergeAIIntent(raw,ai);
    usedAI=true;
    console.info('Ask Jordan AI buyer flow active',ai);
  }catch(error){
    console.warn('AI buyer-flow fallback:',error.message);
    intent=understandQuery(raw);
    appendBuyerMessage('خدمة الذكاء غير متاحة مؤقتًا، بكمل معك بالنظام المحلي.');
  }
  buyerFlow={active:true,intent,step:null};$('#resetBuyerFlow').hidden=false;
  const enoughDetail=Boolean(intent.category&&intent.gov&&(intent.maxPrice!==null||intent.minPrice!==null||!['سيارات','موبايلات','عقارات','أثاث','أجهزة كهربائية'].includes(intent.category)));
  if(enoughDetail){appendBuyerMessage(`فهمت طلبك${usedAI?' بالذكاء الاصطناعي':''}: <strong>${esc(intent.aiSummary||intentSummary(intent))}</strong>`);buyerFlow.step='done';runSmartSearch(raw,intent,usedAI);document.querySelector('#conversation')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  askNextBuyerQuestion();
}
$('#searchForm').onsubmit=e=>{e.preventDefault();handleBuyerInput($('#searchInput').value)};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>handleBuyerInput(b.dataset.prompt,true));
$('#resetBuyerFlow').onclick=()=>{resetBuyerFlow(true);$('#searchInput').focus()};
function appendSellerMessage(text,kind='assistant'){
  const box=$('#sellerConversation');if(!box)return;const m=document.createElement('div');m.className=`seller-message ${kind}`;m.innerHTML=kind==='assistant'?text:esc(text);box.appendChild(m);box.scrollTop=box.scrollHeight;
}
function setSellerChoices(items=[]){
  const box=$('#sellerChoices');if(!box)return;box.innerHTML=items.map(x=>`<button type="button" data-seller-choice="${esc(x.value)}">${esc(x.label)}</button>`).join('');
  box.querySelectorAll('[data-seller-choice]').forEach(b=>b.onclick=()=>handleSellerWizardAnswer(b.dataset.sellerChoice));
}
function resetSellerWizard(){
  sellerFlow={active:true,step:'title',data:{}};
  if($('#sellerConversation'))$('#sellerConversation').innerHTML='<div class="seller-message assistant">شو بدك تبيع اليوم؟</div>';
  setSellerChoices([{label:'📱 موبايل',value:'موبايل'},{label:'🚗 سيارة',value:'سيارة'},{label:'🏠 عقار',value:'عقار'},{label:'🪑 أثاث',value:'أثاث'}]);
  if($('#sellerWizardInput')){$('#sellerWizardInput').value='';$('#sellerWizardInput').placeholder='مثال: آيفون 14 برو'}
}
function wizardCategory(value){return detectCategoryFromText(value)||'متفرقات'}
function finishSellerWizard(){
  const e=$('#adForm').elements,d=sellerFlow.data;
  e.title.value=d.title||'';e.category.value=d.category||wizardCategory(d.title||'');e.price.value=d.price||'';if(d.governorate)e.governorate.value=d.governorate;e.area.value=d.area||'';e.description.value=d.description||`${d.title||'المنتج'} بحالة جيدة. للتواصل والاستفسار عبر الهاتف أو واتساب.`;
  appendSellerMessage('تم تجهيز الإعلان ✅ راجع البيانات والصور ثم اضغط <strong>نشر الإعلان</strong>.');setSellerChoices([]);sellerFlow.step='done';saveAdDraft();
}
function handleSellerWizardAnswer(raw){
  const value=String(raw||'').trim();if(!value||sellerFlow.step==='done')return;appendSellerMessage(value,'user');const input=$('#sellerWizardInput');if(input)input.value='';
  const d=sellerFlow.data;
  if(sellerFlow.step==='title'){
    d.title=value;d.category=wizardCategory(value);sellerFlow.step='price';appendSellerMessage('كم السعر؟ اكتب الرقم أو اختر قابل للتفاوض.');setSellerChoices([{label:'قابل للتفاوض',value:'قابل للتفاوض'},{label:'50 د.أ',value:'50'},{label:'100 د.أ',value:'100'},{label:'500 د.أ',value:'500'}]);if(input)input.placeholder='مثال: 450';return;
  }
  if(sellerFlow.step==='price'){
    d.price=/تفاوض/.test(value)?'':parseCompactNumber(value)||'';sellerFlow.step='governorate';appendSellerMessage('بأي محافظة؟');setSellerChoices(governorates.map(g=>({label:g,value:g})));if(input)input.placeholder='اكتب المحافظة';return;
  }
  if(sellerFlow.step==='governorate'){
    d.governorate=detectGovernorateFromText(value)||value;sellerFlow.step='area';appendSellerMessage('شو المنطقة أو الحي؟');setSellerChoices([]);if(input)input.placeholder='مثال: الحي الشرقي';return;
  }
  if(sellerFlow.step==='area'){
    d.area=value;sellerFlow.step='description';appendSellerMessage('احكيلي أهم التفاصيل والحالة.');setSellerChoices([{label:'جديد',value:'جديد ولم يُستخدم'},{label:'مستعمل بحالة ممتازة',value:'مستعمل بحالة ممتازة'},{label:'بحالة جيدة',value:'بحالة جيدة'}]);if(input)input.placeholder='مثال: نظيف جدًا ومعه الكرتونة';return;
  }
  if(sellerFlow.step==='description'){d.description=value;finishSellerWizard()}
}
function resetAdForm(){editingAdId=null;$('#adDialogTitle').textContent='إضافة إعلان';$('#adSubmit').textContent='نشر الإعلان';$('#adImagesHint').hidden=true;$('#publishStatus').hidden=true;$('#adForm').reset();$('#imagePreview').innerHTML='';$('#sellerAssistantStatus').textContent='';restoreAdDraft();resetSellerWizard()}
$('#generateAdBtn').onclick=async()=>{const text=$('#sellerPrompt').value.trim(),status=$('#sellerAssistantStatus'),btn=$('#generateAdBtn');if(!text){status.textContent='اكتب وصفًا سريعًا للإعلان أولًا.';return}btn.disabled=true;status.textContent='جاري تجهيز الإعلان بالذكاء الاصطناعي...';try{let r;try{r=await callAskJordanAI('ad',text);console.info('Ask Jordan AI ad active',r)}catch(error){console.warn('AI ad fallback:',error.message);r=buildSmartAd(text);status.textContent='تمت التعبئة بالنظام المحلي لأن خدمة الذكاء غير متاحة مؤقتًا.'}const e=$('#adForm').elements;e.title.value=r.title||'';if(r.category&&[...e.category.options].some(o=>o.value===r.category))e.category.value=r.category;if(r.price!==null&&r.price!==undefined)e.price.value=r.price;if(r.governorate&&[...e.governorate.options].some(o=>o.value===r.governorate))e.governorate.value=r.governorate;if(r.area)e.area.value=r.area;e.description.value=r.description||text;if(!status.textContent.includes('النظام المحلي'))status.textContent='تمت تعبئة الإعلان بالذكاء الاصطناعي. راجع البيانات ثم انشر.';saveAdDraft()}catch(error){status.textContent=error.message||'تعذر تجهيز الإعلان.'}finally{btn.disabled=false}};
$('#clearDraftBtn').onclick=()=>{clearAdDraft();$('#adForm').reset();$('#sellerAssistantStatus').textContent='تم مسح المسودة.'};
$('#sellerWizardSend').onclick=()=>handleSellerWizardAnswer($('#sellerWizardInput').value);
$('#sellerWizardInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();handleSellerWizardAnswer(e.currentTarget.value)}};
$('#adImagesInput').addEventListener('change',e=>renderImagePreview(e.target.files));
$('#adForm').addEventListener('input',()=>{clearTimeout(window.__draftTimer);window.__draftTimer=setTimeout(saveAdDraft,350)});
$('#addBtn').onclick=async()=>{if(!await requireAuth())return;resetAdForm();const {data:p}=await sb.from('profiles').select('phone').eq('id',session.user.id).single();$('#adForm').elements.phone.value=p?.phone||'';$('#adDialog').showModal()};
async function insertImageRow(row){let r=await sb.from('ad_images').insert({...row,image_url:row.image_url});if(!r.error)return r; if(/image_url/i.test(r.error.message||'')){const {image_url,...rest}=row;return await sb.from('ad_images').insert({...rest,url:image_url})}return r}
async function uploadImages(adId,files){let uploaded=0;for(let i=0;i<files.length;i++){const f=files[i];if(f.size>5*1024*1024)throw new Error(`الصورة ${f.name} أكبر من 5MB`);const ext=(f.name.split('.').pop()||'jpg').toLowerCase(),path=`${session.user.id}/${adId}/${crypto.randomUUID()}.${ext}`;const up=await sb.storage.from('ad-images').upload(path,f,{cacheControl:'3600',upsert:false});if(up.error)throw up.error;const {data:urlData}=sb.storage.from('ad-images').getPublicUrl(path);const imageRow={ad_id:adId,image_url:urlData.publicUrl,sort_order:i};const saved=await insertImageRow(imageRow);if(saved.error)throw saved.error;uploaded++}return uploaded}
async function verifyAd(adId){const {data,error}=await sb.from('ads').select('*').eq('id',adId).eq('status','active').single();if(error||!data)throw new Error('تم إرسال الطلب لكن لم يتم تأكيد حفظ الإعلان. حاول مرة أخرى.');return data}
$('#adForm').onsubmit=async e=>{
  e.preventDefault();if(isPublishing)return;if(!await requireAuth())return;
  const form=e.currentTarget,btn=$('#adSubmit'),status=$('#publishStatus');
  const showStatus=(text,type='')=>{status.hidden=false;status.textContent=text;status.className=`publish-status ${type}`.trim()};
  isPublishing=true;btn.disabled=true;showStatus('جاري حفظ الإعلان...');
  try{
    const d=new FormData(form);const payload={user_id:session.user.id,title:String(d.get('title')).trim(),category:String(d.get('category')),price:Number(d.get('price'))||0,governorate:String(d.get('governorate')),area:String(d.get('area')).trim(),description:String(d.get('description')).trim(),phone:String(d.get('phone')).trim(),status:'active'};
    if(!payload.title||!payload.category||!payload.governorate||!payload.area||!payload.description||!payload.phone)throw new Error('أكمل جميع الحقول المطلوبة.');
    let r;if(editingAdId)r=await sb.from('ads').update(payload).eq('id',editingAdId).eq('user_id',session.user.id).select('*').single();else r=await sb.from('ads').insert(payload).select('*').single();
    if(r.error)throw r.error;const ad=r.data;if(!ad?.id)throw new Error('لم يرجع رقم الإعلان من قاعدة البيانات.');
    const files=[...form.elements.images.files].slice(0,5);if(files.length){showStatus('تم حفظ الإعلان، جاري رفع الصور...');await uploadImages(ad.id,files)}
    await verifyAd(ad.id);showStatus('تم نشر الإعلان وظهر في السوق.','success');await loadAds();
    const published=ads.find(x=>Number(x.id)===Number(ad.id));if(!published)throw new Error('تم حفظ الإعلان لكن لم يظهر في النتائج بعد. حدّث الصفحة.');
    setTimeout(()=>{form.reset();clearAdDraft();$('#adDialog').close();editingAdId=null;status.hidden=true;openDetails(ad.id)},500);
  }catch(error){console.error('Publish error:',error);showStatus(error?.message||'تعذر نشر الإعلان.','error')}
  finally{isPublishing=false;btn.disabled=false;btn.textContent=editingAdId?'حفظ التعديل':'نشر الإعلان'}
};
async function openSellerProfile(userId){
  const dialog=$('#sellerDialog');
  $('#sellerName').textContent='جاري تحميل بيانات البائع...';
  $('#sellerMeta').textContent='';$('#sellerActions').innerHTML='';$('#sellerAds').innerHTML='';dialog.showModal();
  const [{data:profile,error:profileError},{data:sellerRows,error:adsError}]=await Promise.all([sb.from('profiles').select('*').eq('id',userId).single(),sb.from('ads').select('*').eq('user_id',userId).eq('status','active').order('created_at',{ascending:false})]);
  if(profileError&&profileError.code!=='PGRST116')console.warn('Seller profile:',profileError.message);
  if(adsError){$('#sellerName').textContent='تعذر تحميل البائع';$('#sellerAds').textContent=adsError.message;return}
  const name=profile?.name||'مستخدم Ask Jordan';const phone=profile?.phone||sellerRows?.[0]?.phone||'';
  $('#sellerName').textContent=name;const joined=profile?.created_at?new Date(profile.created_at).toLocaleDateString('ar-JO',{year:'numeric',month:'long'}):'';
  $('#sellerMeta').textContent=`${sellerRows?.length||0} إعلان نشط${joined?` · عضو منذ ${joined}`:''}`;
  $('#sellerActions').innerHTML=phone?`<a href="tel:${esc(phone)}">اتصال</a><a href="${waLink(phone)}" target="_blank" rel="noopener">واتساب</a>`:'';
  $('#sellerAds').innerHTML=sellerRows?.length?sellerRows.map(a=>`<button type="button" class="seller-ad-item" data-seller-ad="${a.id}"><strong>${esc(a.title)}</strong><span>${money(a.price)} · ${esc(a.governorate)}</span></button>`).join(''):'<p>لا توجد إعلانات نشطة لهذا البائع.</p>';
  document.querySelectorAll('[data-seller-ad]').forEach(b=>b.onclick=()=>{dialog.close();openDetails(Number(b.dataset.sellerAd))});
}

function openDetails(id){const a=ads.find(x=>Number(x.id)===Number(id));if(!a)return;currentDetail=a;currentImageIndex=0;trackAdAction(a.id,'views');renderDetail();history.replaceState(null,'',`#ad-${a.id}`);$('#detailsDialog').showModal()}
function renderDetail(){const a=currentDetail,imgs=adImages(a);$('#detailTitle').textContent=a.title;$('#detailPrice').textContent=money(a.price);const stats=adAnalytics(a.id);$('#detailMeta').textContent=`${a.category} · ${a.governorate} · ${a.area} · 👁 ${stats.views}`;$('#detailDescription').textContent=a.description;$('#detailCall').href=`tel:${a.phone}`;$('#detailWhatsapp').href=waLink(a.phone);$('#detailCounter').textContent=imgs.length?`${currentImageIndex+1} / ${imgs.length}`:'';$('#detailImage').src=imgs[currentImageIndex]?.image_url||'';$('#detailImage').hidden=!imgs.length;$('#detailPlaceholder').hidden=!!imgs.length;$('#prevImage').hidden=imgs.length<2;$('#nextImage').hidden=imgs.length<2;document.title=`${a.title} | Ask Jordan`;const related=ads.filter(x=>x.id!==a.id&&(x.category===a.category||x.governorate===a.governorate)).slice(0,4);$('#relatedAds').innerHTML=related.length?related.map(x=>`<button type="button" data-related="${x.id}"><strong>${esc(x.title)}</strong><span>${money(x.price)} · ${esc(x.governorate)}</span></button>`).join(''):'<p>لا توجد إعلانات مشابهة حاليًا.</p>';document.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>openDetails(Number(b.dataset.related)));updateDetailFavorite()}
$('#prevImage').onclick=()=>{const n=adImages(currentDetail).length;if(!n)return;currentImageIndex=(currentImageIndex-1+n)%n;renderDetail()};
$('#nextImage').onclick=()=>{const n=adImages(currentDetail).length;if(!n)return;currentImageIndex=(currentImageIndex+1)%n;renderDetail()};
$('#detailCall').onclick=()=>trackAdAction(currentDetail.id,'calls');$('#detailWhatsapp').onclick=()=>trackAdAction(currentDetail.id,'whatsapp');$('#detailShare').onclick=()=>shareAd(currentDetail.id);$('#detailFavorite').onclick=()=>toggleFavorite(currentDetail.id);$('#detailSeller').onclick=()=>openSellerProfile(currentDetail.user_id);$('#detailsDialog').addEventListener('close',()=>{if(location.hash.startsWith('#ad-'))history.replaceState(null,'',location.pathname+location.search);document.title='Ask Jordan | اسأل السوق الأردني'});
async function shareAd(id){trackAdAction(id,'shares');const a=ads.find(x=>Number(x.id)===Number(id));if(!a)return;const text=`${a.title}\n${money(a.price)}\n${a.governorate} - ${a.area}\n${location.origin}`;try{if(navigator.share)await navigator.share({title:a.title,text,url:location.origin});else{await navigator.clipboard.writeText(text);alert('تم نسخ تفاصيل الإعلان')}}catch(e){if(e.name!=='AbortError')alert('تعذر المشاركة')}}
$('#accountBtn').onclick=async()=>{
  if(!await requireAuth())return;
  const [{data:p},{data:mine,error}]=await Promise.all([
    sb.from('profiles').select('*').eq('id',session.user.id).single(),
    sb.from('ads').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false})
  ]);
  if(error){alert(error.message);return}
  $('#identity').textContent=`${p?.name||'مستخدم'} · ${p?.phone||''}`;
  const own=mine||[],activeCount=own.filter(a=>a.status==='active').length;
  const totals=own.reduce((sum,a)=>{const x=adAnalytics(a.id);sum.views+=x.views;sum.whatsapp+=x.whatsapp;sum.calls+=x.calls;sum.shares+=x.shares;return sum},{views:0,whatsapp:0,calls:0,shares:0});
  $('#sellerDashboard').innerHTML=`<div><strong>${activeCount}</strong><span>إعلانات نشطة</span></div><div><strong>${totals.views}</strong><span>مشاهدات</span></div><div><strong>${totals.whatsapp}</strong><span>نقرات واتساب</span></div><div><strong>${totals.calls}</strong><span>نقرات اتصال</span></div>`;
  const favAds=ads.filter(a=>isFavorite(a.id));
  $('#favoriteSummary').textContent=favAds.length?`لديك ${favAds.length} إعلان محفوظ`:'لا توجد إعلانات محفوظة';
  $('#favoriteAds').innerHTML=favAds.length?favAds.map(a=>`<button type="button" class="favorite-account-item" data-favorite-open="${a.id}"><strong>${esc(a.title)}</strong><span>${money(a.price)} · ${esc(a.governorate)}</span></button>`).join(''):'<p class="hint">احفظ أي إعلان من زر القلب وسيظهر هنا.</p>';
  document.querySelectorAll('[data-favorite-open]').forEach(b=>b.onclick=()=>{$('#accountDialog').close();openDetails(Number(b.dataset.favoriteOpen))});
  $('#myAds').innerHTML=own.length?own.map(a=>{const x=adAnalytics(a.id);return `<div class="my-ad"><div><strong>${esc(a.title)}</strong><br><small>${esc(a.status)} · ${money(a.price)} · 👁 ${x.views} · واتساب ${x.whatsapp}</small></div><div class="my-ad-actions">${a.status==='active'?`<button class="promote-btn" data-promote="${a.id}">روّج إعلانك</button><button class="ghost" data-edit="${a.id}">تعديل</button><button class="danger" data-delete="${a.id}">حذف</button>`:''}</div></div>`}).join(''):'لا توجد إعلانات';
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف الإعلان؟'))return;const {error}=await sb.from('ads').update({status:'deleted'}).eq('id',b.dataset.delete).eq('user_id',session.user.id);if(error)alert(error.message);else{$('#accountDialog').close();await loadAds()}});
  document.querySelectorAll('[data-promote]').forEach(b=>b.onclick=()=>{const a=own.find(x=>Number(x.id)===Number(b.dataset.promote));if(a){$('#accountDialog').close();openPromotionDialog(a)}});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const a=own.find(x=>Number(x.id)===Number(b.dataset.edit));if(!a)return;editingAdId=a.id;const f=$('#adForm').elements;f.title.value=a.title;f.category.value=a.category;f.governorate.value=a.governorate;f.price.value=a.price;f.area.value=a.area;f.description.value=a.description;f.phone.value=a.phone;$('#adDialogTitle').textContent='تعديل الإعلان';$('#adSubmit').textContent='حفظ التعديل';$('#adImagesHint').hidden=false;$('#accountDialog').close();$('#adDialog').showModal()});
  $('#accountDialog').showModal()
};

$('#promotionForm').onsubmit=async e=>{
  e.preventDefault();if(!await requireAuth())return;const d=new FormData(e.currentTarget),adId=Number(d.get('ad_id')),plan=d.get('plan'),cfgPlan=PROMOTION_PLANS[plan],status=$('#promotionStatus');
  status.hidden=false;status.className='publish-status';status.textContent='جاري إرسال الطلب...';
  const {error}=await sb.from('promotion_requests').insert({ad_id:adId,user_id:session.user.id,plan,amount:cfgPlan.amount,status:'pending'});
  if(error){status.className='publish-status error';status.textContent=error.message;return}
  status.className='publish-status success';status.textContent='تم إرسال الطلب. سيفتح واتساب لإتمام الدفع.';
  const ad=ads.find(x=>Number(x.id)===adId),msg=`طلب ترويج إعلان في Ask Jordan%0Aالإعلان: ${encodeURIComponent(ad?.title||adId)}%0Aالباقة: ${encodeURIComponent(cfgPlan.label)}%0Aالمبلغ: ${cfgPlan.amount} دينار%0Aرقم الطلب سيتم مراجعته من لوحة الإدارة.`;
  setTimeout(()=>window.open(waLink(PAYMENT_PHONE)+`?text=${msg}`,'_blank','noopener'),350);
};
async function reportCurrentAd(){
  if(!currentDetail)return;
  if(!await requireAuth())return;
  const reason=prompt('اكتب سبب البلاغ باختصار:','محتوى غير مناسب');
  if(!reason?.trim())return;
  const {error}=await sb.from('reports').insert({ad_id:currentDetail.id,reporter_id:session.user.id,reason:reason.trim(),status:'open'});
  if(error){alert(error.message);return}
  alert('تم إرسال البلاغ للمراجعة. شكرًا لك.');
}
function adminStat(label,value){return `<div><strong>${Number(value||0).toLocaleString('ar-JO')}</strong><span>${esc(label)}</span></div>`}
function statusLabel(status){return ({active:'نشط',sold:'مباع',deleted:'محذوف'}[status]||status)}
function reportStatusLabel(status){return ({open:'مفتوح',reviewed:'تمت المراجعة',dismissed:'مرفوض'}[status]||status)}
async function openAdminPanel(){
  if(!await requireAdmin())return;
  const dialog=$('#adminDialog');dialog.showModal();
  $('#adminStats').innerHTML='<p>جاري تحميل الإحصاءات...</p>';
  $('#adminPromotions').innerHTML=(promotions||[]).length?(promotions||[]).map(r=>{const ad=(allAds||[]).find(a=>Number(a.id)===Number(r.ad_id)),plan=PROMOTION_PLANS[r.plan]||{label:r.plan,days:1};return `<div class="admin-row"><div><strong>${esc(ad?.title||`إعلان #${r.ad_id}`)}</strong><small>${esc(plan.label)} · ${money(r.amount)} · ${esc(r.status)}</small></div><div class="admin-row-actions">${r.status==='pending'?`<button type="button" class="primary" data-promotion-approve="${r.id}" data-ad="${r.ad_id}" data-days="${plan.days}">تأكيد الدفع</button><button type="button" class="danger" data-promotion-reject="${r.id}">رفض</button>`:'<span class="promotion-chip">${esc(r.status)}</span>'}</div></div>`}).join(''):'<p>لا توجد طلبات ترويج.</p>';
  $('#adminAds').innerHTML='';$('#adminReports').innerHTML='';$('#adminUsers').innerHTML='';$('#adminPromotions').innerHTML='';
  const [{data:allAds,error:adsError},{data:profiles,error:profilesError},{data:reports,error:reportsError},{data:promotions,error:promotionsError}]=await Promise.all([
    sb.from('ads').select('*').order('created_at',{ascending:false}).limit(500),
    sb.from('profiles').select('id,name,phone,role,created_at').order('created_at',{ascending:false}).limit(500),
    sb.from('reports').select('id,ad_id,reporter_id,reason,status,created_at').order('created_at',{ascending:false}).limit(500),
    sb.from('promotion_requests').select('*').order('created_at',{ascending:false}).limit(500)
  ]);
  const error=adsError||profilesError||reportsError||promotionsError;if(error){$('#adminStats').innerHTML=`<p class="admin-error">${esc(error.message)}</p>`;return}
  const active=(allAds||[]).filter(a=>a.status==='active').length,deleted=(allAds||[]).filter(a=>a.status==='deleted').length,openReports=(reports||[]).filter(r=>r.status==='open').length,revenue=(promotions||[]).filter(x=>x.status==='approved').reduce((n,x)=>n+Number(x.amount||0),0);
  $('#adminStats').innerHTML=adminStat('إعلانات نشطة',active)+adminStat('إعلانات محذوفة',deleted)+adminStat('المستخدمون',(profiles||[]).length)+adminStat('بلاغات مفتوحة',openReports)+`<div class="revenue-stat"><strong>${money(revenue)}</strong><span>إيراد مؤكد</span></div>`;
  $('#adminAds').innerHTML=(allAds||[]).length?(allAds||[]).map(a=>`<div class="admin-row"><div><strong>${esc(a.title)}</strong><small>${esc(a.governorate)} · ${money(a.price)} · ${statusLabel(a.status)}</small></div><div class="admin-row-actions"><button type="button" data-admin-open="${a.id}" class="ghost">فتح</button>${a.status!=='active'?`<button type="button" data-admin-status="${a.id}" data-status="active" class="ghost">إعادة نشر</button>`:''}${a.status==='active'?`<button type="button" data-admin-status="${a.id}" data-status="deleted" class="danger">إخفاء</button><button type="button" data-admin-status="${a.id}" data-status="sold" class="ghost">مباع</button>`:''}</div></div>`).join(''):'<p>لا توجد إعلانات.</p>';
  $('#adminReports').innerHTML=(reports||[]).length?(reports||[]).map(r=>{const ad=(allAds||[]).find(a=>Number(a.id)===Number(r.ad_id));return `<div class="admin-row"><div><strong>${esc(ad?.title||`إعلان #${r.ad_id}`)}</strong><small>${esc(r.reason)} · ${reportStatusLabel(r.status)}</small></div><div class="admin-row-actions"><button type="button" data-admin-open="${r.ad_id}" class="ghost">فتح الإعلان</button>${r.status==='open'?`<button type="button" data-report-status="${r.id}" data-status="reviewed" class="primary">تمت المراجعة</button><button type="button" data-report-status="${r.id}" data-status="dismissed" class="ghost">رفض البلاغ</button>`:''}</div></div>`}).join(''):'<p>لا توجد بلاغات.</p>';
  $('#adminUsers').innerHTML=(profiles||[]).length?(profiles||[]).map(p=>`<div class="admin-row"><div><strong>${esc(p.name||'مستخدم')}</strong><small>${esc(p.phone||'بدون رقم')} · ${p.role==='admin'?'مشرف':'مستخدم'} · ${p.created_at?new Date(p.created_at).toLocaleDateString('ar-JO'):''}</small></div>${p.role==='admin'?'<span class="admin-badge">مشرف</span>':''}</div>`).join(''):'<p>لا يوجد مستخدمون.</p>';
  bindAdminActions();
}
function bindAdminActions(){
  document.querySelectorAll('[data-admin-open]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.adminOpen),a=ads.find(x=>Number(x.id)===id);if(a){$('#adminDialog').close();openDetails(id)}else alert('هذا الإعلان غير ظاهر للعامة حاليًا. استخدم إدارة الحالة من اللوحة.')});
  document.querySelectorAll('[data-admin-status]').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.adminStatus),status=b.dataset.status;if(!confirm(`تغيير حالة الإعلان إلى ${statusLabel(status)}؟`))return;const {error}=await sb.from('ads').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else{await loadAds();await openAdminPanel()}});
  document.querySelectorAll('[data-promotion-approve]').forEach(b=>b.onclick=async()=>{if(!confirm('تأكيد الدفع وتفعيل الإعلان المميز؟'))return;const until=new Date(Date.now()+Number(b.dataset.days)*86400000).toISOString();const {error:e1}=await sb.from('ads').update({featured_until:until}).eq('id',Number(b.dataset.ad));if(e1){alert(e1.message);return}const {error:e2}=await sb.from('promotion_requests').update({status:'approved',reviewed_at:new Date().toISOString(),reviewed_by:session.user.id}).eq('id',Number(b.dataset.promotionApprove));if(e2)alert(e2.message);else{await loadAds();await openAdminPanel()}});
  document.querySelectorAll('[data-promotion-reject]').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('promotion_requests').update({status:'rejected',reviewed_at:new Date().toISOString(),reviewed_by:session.user.id}).eq('id',Number(b.dataset.promotionReject));if(error)alert(error.message);else await openAdminPanel()});
  document.querySelectorAll('[data-report-status]').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('reports').update({status:b.dataset.status,reviewed_at:new Date().toISOString(),reviewed_by:session.user.id}).eq('id',Number(b.dataset.reportStatus));if(error)alert(error.message);else await openAdminPanel()});
}
$('#heroAddBtn').onclick=()=>$('#addBtn').click();
$('#showAllAdsBtn').onclick=()=>document.getElementById('conversation').scrollIntoView({behavior:'smooth'});
$('#adminBtn').onclick=openAdminPanel;
$('#detailReport').onclick=reportCurrentAd;

$('#logoutBtn').onclick=async()=>{await sb.auth.signOut();session=null;currentProfile=null;updateAdminButton();closeDialogs();alert('تم تسجيل الخروج')};
(async()=>{await loadPublicStats(true);await refreshSession();await loadAds();const m=location.hash.match(/^#ad-(\d+)$/);if(m)openDetails(Number(m[1]))})();
