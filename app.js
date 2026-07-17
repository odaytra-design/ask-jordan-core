const cfg=window.ASK_JORDAN_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
const $=s=>document.querySelector(s);
let session=null,authMode='login',ads=[],editingAdId=null,currentDetail=null,currentImageIndex=0,isPublishing=false;
let favorites=new Set(JSON.parse(localStorage.getItem('askJordanFavorites')||'[]').map(Number));
let analytics=JSON.parse(localStorage.getItem('askJordanAnalytics')||'{}');
const phoneToEmail=p=>`${String(p).replace(/\D/g,'')}@users.askjordan.com`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=v=>Number(v)?`${Number(v).toLocaleString('ar-JO')} د.أ`:'السعر عند التواصل';
const waLink=p=>`https://wa.me/962${String(p||'').replace(/\D/g,'').replace(/^0/,'')}`;
const normalizeImage=x=>x?{...x,image_url:x.image_url||x.url||''}:x;
const AD_DRAFT_KEY='askJordanAdDraftV160';
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
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
async function refreshSession(){const {data}=await sb.auth.getSession();session=data.session;return session}
async function requireAuth(){await refreshSession();if(!session){setAuthMode('login');$('#authDialog').showModal();return false}return true}
function setAuthMode(m){authMode=m;const s=m==='signup';$('#authTitle').textContent=s?'إنشاء حساب':'تسجيل الدخول';$('#authSubmit').textContent=s?'إنشاء الحساب':'دخول';$('#toggleAuth').textContent=s?'لدي حساب':'إنشاء حساب جديد';$('#nameField').hidden=!s}
$('#toggleAuth').onclick=()=>setAuthMode(authMode==='login'?'signup':'login');
$('#authForm').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),phone=String(d.get('phone')).replace(/\D/g,''),password=String(d.get('password')),email=phoneToEmail(phone);let r;if(authMode==='signup'){r=await sb.auth.signUp({email,password,options:{data:{phone,name:String(d.get('name')||'')}}})}else{r=await sb.auth.signInWithPassword({email,password})}if(r.error){alert(r.error.message);return}await refreshSession();closeDialogs();e.currentTarget.reset();alert(authMode==='signup'?'تم إنشاء الحساب':'تم تسجيل الدخول')};
async function fetchImages(){const {data,error}=await sb.from('ad_images').select('*').order('sort_order',{ascending:true});if(error){console.warn('Images load:',error.message);return []}return (data||[]).map(normalizeImage)}
async function loadAds(){
  $('#status').textContent='جاري تحميل الإعلانات...';
  const [{data:adRows,error:adError},images]=await Promise.all([
    sb.from('ads').select('*').eq('status','active').order('created_at',{ascending:false}).limit(200),
    fetchImages()
  ]);
  if(adError){$('#status').textContent=adError.message;return}
  const byAd=new Map();for(const img of images){if(!byAd.has(String(img.ad_id)))byAd.set(String(img.ad_id),[]);byAd.get(String(img.ad_id)).push(img)}
  ads=(adRows||[]).map(a=>({...a,ad_images:byAd.get(String(a.id))||[]}));
  renderAds(ads)
}
function adImages(a){return [...(a.ad_images||[])].map(normalizeImage).filter(x=>x.image_url).sort((x,y)=>(x.sort_order||0)-(y.sort_order||0))}
function renderAds(list){
  window.__lastRenderedAds=list;
  $('#status').textContent=list.length?`وجدنا ${list.length} إعلان`:'لا توجد إعلانات مطابقة حاليًا';
  $('#results').innerHTML=list.length?list.map(a=>{
    const imgs=adImages(a),img=imgs[0]?.image_url,fav=isFavorite(a.id);
    return `<article class="card" data-open-ad="${a.id}"><div class="card-media">${img?`<img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy">`:'<div class="placeholder">📦</div>'}${imgs.length>1?`<span class="image-count">📷 ${imgs.length}</span>`:''}<button type="button" class="favorite-btn ${fav?'active':''}" data-favorite-ad="${a.id}" aria-label="حفظ الإعلان">${fav?'♥':'♡'}</button></div><div class="card-body"><div class="card-head"><h3>${esc(a.title)}</h3><button class="share-icon" data-share-ad="${a.id}" aria-label="مشاركة">↗</button></div><div class="price">${money(a.price)}</div><div class="meta">📍 ${esc(a.governorate)}${a.area?` · ${esc(a.area)}`:''}</div><p class="desc">${esc(a.description)}</p><div class="card-actions"><a class="call" href="tel:${esc(a.phone)}" data-track-call="${a.id}" onclick="event.stopPropagation()">اتصال</a><a class="whatsapp" target="_blank" rel="noopener" href="${waLink(a.phone)}" data-track-wa="${a.id}" onclick="event.stopPropagation()">واتساب</a></div></div></article>`;
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
  const stop=['موديل','سنة','سنه','بدي','بدّي','اريد','أريد','دور','دورلي','ابحث','عن','اقل','اكثر','من','في','على','دينار','داخل','تحت','فوق','حدود','بحدود','ما','يتجاوز','بسعر','سعر','لحد','الى','بين','و'];
  const stopN=stop.map(normalizeArabic);
  const govTokens=Object.values(governorateAliases).flat().map(normalizeArabic);
  const words=q.split(/\s+/).filter(w=>w.length>1&&!stopN.includes(w)&&!govTokens.includes(w)&&!/^(\d|الف|k)/i.test(w));
  return {raw,q,minPrice,maxPrice,gov,category,year,words};
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
  for(const word of intent.words){const variants=expandWord(word);if(variants.some(v=>hay.includes(v)))score+=18;else if(word.length>=4&&variants.some(v=>hay.split(' ').some(t=>t.startsWith(v.slice(0,Math.max(3,v.length-1))))))score+=8;else score-=5}
  if(a.created_at)score+=Math.max(0,5-Math.floor((Date.now()-new Date(a.created_at))/86400000/7));
  return score;
}
function searchAds(raw){const intent=understandQuery(raw);return {intent,results:ads.map(a=>({a,score:scoreAd(a,intent)})).filter(x=>x.score>=0).sort((x,y)=>y.score-x.score).map(x=>x.a)}}
function intentSummary(intent){const parts=[];if(intent.words.length)parts.push(intent.words.join(' '));if(intent.category&&!parts.includes(intent.category))parts.push(intent.category);if(intent.gov)parts.push(`في ${intent.gov}`);if(intent.year)parts.push(`موديل ${intent.year}`);if(intent.minPrice!==null&&intent.maxPrice!==null)parts.push(`بين ${money(intent.minPrice)} و${money(intent.maxPrice)}`);else if(intent.maxPrice!==null)parts.push(`حتى ${money(intent.maxPrice)}`);else if(intent.minPrice!==null)parts.push(`من ${money(intent.minPrice)}`);return parts.join(' · ')||intent.raw}
function suggestionButtons(intent){
  const items=[];
  if(intent.maxPrice!==null)items.push({label:'وسّع السعر 20%',q:intent.raw.replace(/\d+(?:[.,]\d+)?\s*(?:الف|k)?/i,String(Math.round(intent.maxPrice*1.2)))})
  if(intent.gov)items.push({label:'كل الأردن',q:intent.raw.replace(new RegExp(governorateAliases[intent.gov].join('|'),'i'),'')})
  if(intent.words.length>1)items.push({label:'بحث أوسع',q:intent.words.slice(0,-1).join(' ')})
  return items.slice(0,3).map(x=>`<button type="button" class="suggestion-chip" data-search-suggestion="${esc(x.q.trim())}">${esc(x.label)}</button>`).join('');
}
function runSmartSearch(raw){
  const {intent,results}=searchAds(raw);const reply=$('#assistantReply');reply.hidden=false;
  reply.innerHTML=results.length?`فهمت طلبك: <strong>${esc(intentSummary(intent))}</strong><br>رتبت لك <strong>${results.length}</strong> إعلانًا من الأكثر تطابقًا للأقل.`:`لم أجد تطابقًا دقيقًا لـ <strong>${esc(intentSummary(intent))}</strong>.<div class="suggestion-row">${suggestionButtons(intent)}</div>`;
  renderAds(results);
  document.querySelectorAll('[data-search-suggestion]').forEach(b=>b.onclick=()=>{$('#searchInput').value=b.dataset.searchSuggestion;$('#searchForm').requestSubmit()});
}
$('#searchForm').onsubmit=e=>{e.preventDefault();const raw=$('#searchInput').value.trim();if(!raw)return;const bubble=document.createElement('div');bubble.className='user-bubble';bubble.textContent=raw;$('#conversation').insertBefore(bubble,$('#assistantReply'));$('#searchInput').value='';runSmartSearch(raw)};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('#searchInput').value=b.dataset.prompt;$('#searchForm').requestSubmit()});
function resetAdForm(){editingAdId=null;$('#adDialogTitle').textContent='إضافة إعلان';$('#adSubmit').textContent='نشر الإعلان';$('#adImagesHint').hidden=true;$('#publishStatus').hidden=true;$('#adForm').reset();$('#imagePreview').innerHTML='';$('#sellerAssistantStatus').textContent='';restoreAdDraft()}
$('#generateAdBtn').onclick=()=>{const text=$('#sellerPrompt').value.trim(),status=$('#sellerAssistantStatus');if(!text){status.textContent='اكتب وصفًا سريعًا للإعلان أولًا.';return}const r=buildSmartAd(text),e=$('#adForm').elements;e.title.value=r.title;e.category.value=r.category;if(r.price)e.price.value=r.price;if(r.governorate)e.governorate.value=r.governorate;if(r.area)e.area.value=r.area;e.description.value=r.description;status.textContent='تمت تعبئة الإعلان. راجع البيانات ثم انشر.';saveAdDraft()};
$('#clearDraftBtn').onclick=()=>{clearAdDraft();$('#adForm').reset();$('#sellerAssistantStatus').textContent='تم مسح المسودة.'};
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
  $('#myAds').innerHTML=own.length?own.map(a=>{const x=adAnalytics(a.id);return `<div class="my-ad"><div><strong>${esc(a.title)}</strong><br><small>${esc(a.status)} · ${money(a.price)} · 👁 ${x.views} · واتساب ${x.whatsapp}</small></div><div class="my-ad-actions">${a.status==='active'?`<button class="ghost" data-edit="${a.id}">تعديل</button><button class="danger" data-delete="${a.id}">حذف</button>`:''}</div></div>`}).join(''):'لا توجد إعلانات';
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف الإعلان؟'))return;const {error}=await sb.from('ads').update({status:'deleted'}).eq('id',b.dataset.delete).eq('user_id',session.user.id);if(error)alert(error.message);else{$('#accountDialog').close();await loadAds()}});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const a=own.find(x=>Number(x.id)===Number(b.dataset.edit));if(!a)return;editingAdId=a.id;const f=$('#adForm').elements;f.title.value=a.title;f.category.value=a.category;f.governorate.value=a.governorate;f.price.value=a.price;f.area.value=a.area;f.description.value=a.description;f.phone.value=a.phone;$('#adDialogTitle').textContent='تعديل الإعلان';$('#adSubmit').textContent='حفظ التعديل';$('#adImagesHint').hidden=false;$('#accountDialog').close();$('#adDialog').showModal()});
  $('#accountDialog').showModal()
};
$('#logoutBtn').onclick=async()=>{await sb.auth.signOut();session=null;closeDialogs();alert('تم تسجيل الخروج')};
(async()=>{await refreshSession();await loadAds();const m=location.hash.match(/^#ad-(\d+)$/);if(m)openDetails(Number(m[1]))})();
