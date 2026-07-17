const cfg=window.ASK_JORDAN_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
const $=s=>document.querySelector(s);
let session=null,authMode='login',ads=[],editingAdId=null,currentDetail=null,currentImageIndex=0,isPublishing=false;
const phoneToEmail=p=>`${String(p).replace(/\D/g,'')}@users.askjordan.com`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=v=>Number(v)?`${Number(v).toLocaleString('ar-JO')} د.أ`:'السعر عند التواصل';
const waLink=p=>`https://wa.me/962${String(p||'').replace(/\D/g,'').replace(/^0/,'')}`;
const normalizeImage=x=>x?{...x,image_url:x.image_url||x.url||''}:x;
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
  $('#status').textContent=list.length?`وجدنا ${list.length} إعلان`:'لا توجد إعلانات مطابقة حاليًا';
  $('#results').innerHTML=list.length?list.map(a=>{const imgs=adImages(a),img=imgs[0]?.image_url;return `<article class="card" data-open-ad="${a.id}"><div class="card-media">${img?`<img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy">`:'<div class="placeholder">📦</div>'}${imgs.length>1?`<span class="image-count">📷 ${imgs.length}</span>`:''}</div><div class="card-body"><div class="card-head"><h3>${esc(a.title)}</h3><button class="share-icon" data-share-ad="${a.id}" aria-label="مشاركة">↗</button></div><div class="price">${money(a.price)}</div><div class="meta">📍 ${esc(a.governorate)}${a.area?` · ${esc(a.area)}`:''}</div><p class="desc">${esc(a.description)}</p><div class="card-actions"><a class="call" href="tel:${esc(a.phone)}" onclick="event.stopPropagation()">اتصال</a><a class="whatsapp" target="_blank" rel="noopener" href="${waLink(a.phone)}" onclick="event.stopPropagation()">واتساب</a></div></div></article>`}).join(''):'<div class="empty">ما في نتائج حاليًا. جرّب طلبًا أوسع.</div>';
  document.querySelectorAll('[data-open-ad]').forEach(c=>c.onclick=e=>{if(e.target.closest('a,button'))return;openDetails(Number(c.dataset.openAd))});
  document.querySelectorAll('[data-share-ad]').forEach(b=>b.onclick=e=>{e.stopPropagation();shareAd(Number(b.dataset.shareAd))});
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
  const stop=['بدي','بدّي','اريد','أريد','دور','دورلي','ابحث','عن','اقل','اكثر','من','في','على','دينار','داخل','تحت','فوق','حدود','بحدود','ما','يتجاوز','بسعر','سعر','لحد','الى','بين','و'];
  const stopN=stop.map(normalizeArabic);
  const govTokens=Object.values(governorateAliases).flat().map(normalizeArabic);
  const words=q.split(/\s+/).filter(w=>w.length>1&&!stopN.includes(w)&&!govTokens.includes(w)&&!/^(\d|الف|k)/i.test(w));
  return {raw,q,minPrice,maxPrice,gov,category,words};
}
function scoreAd(a,intent){
  const hay=normalizeArabic(`${a.title} ${a.category} ${a.governorate} ${a.area} ${a.description}`);
  let score=0;
  if(intent.category){if(normalizeArabic(a.category)===normalizeArabic(intent.category))score+=35;else if(hay.includes(normalizeArabic(intent.category)))score+=15;else return -1}
  if(intent.gov){if(normalizeArabic(a.governorate)===normalizeArabic(intent.gov))score+=30;else if(hay.includes(normalizeArabic(intent.gov)))score+=12;else return -1}
  const price=Number(a.price)||0;
  if(intent.maxPrice!==null&&price>0){if(price>intent.maxPrice)return -1;score+=12-Math.min(10,Math.round((intent.maxPrice-price)/Math.max(intent.maxPrice,1)*10))}
  if(intent.minPrice!==null&&price<intent.minPrice)return -1;
  for(const word of intent.words){const variants=expandWord(word);if(variants.some(v=>hay.includes(v)))score+=18;else if(word.length>=4&&variants.some(v=>hay.split(' ').some(t=>t.startsWith(v.slice(0,Math.max(3,v.length-1))))))score+=8;else score-=5}
  if(a.created_at)score+=Math.max(0,5-Math.floor((Date.now()-new Date(a.created_at))/86400000/7));
  return score;
}
function searchAds(raw){const intent=understandQuery(raw);return {intent,results:ads.map(a=>({a,score:scoreAd(a,intent)})).filter(x=>x.score>=0).sort((x,y)=>y.score-x.score).map(x=>x.a)}}
function intentSummary(intent){const parts=[];if(intent.words.length)parts.push(intent.words.join(' '));if(intent.category&&!parts.includes(intent.category))parts.push(intent.category);if(intent.gov)parts.push(`في ${intent.gov}`);if(intent.minPrice!==null&&intent.maxPrice!==null)parts.push(`بين ${money(intent.minPrice)} و${money(intent.maxPrice)}`);else if(intent.maxPrice!==null)parts.push(`حتى ${money(intent.maxPrice)}`);else if(intent.minPrice!==null)parts.push(`من ${money(intent.minPrice)}`);return parts.join(' · ')||intent.raw}
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
function resetAdForm(){editingAdId=null;$('#adDialogTitle').textContent='إضافة إعلان';$('#adSubmit').textContent='نشر الإعلان';$('#adImagesHint').hidden=true;$('#publishStatus').hidden=true;$('#adForm').reset()}
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
    setTimeout(()=>{form.reset();$('#adDialog').close();editingAdId=null;status.hidden=true;openDetails(ad.id)},500);
  }catch(error){console.error('Publish error:',error);showStatus(error?.message||'تعذر نشر الإعلان.','error')}
  finally{isPublishing=false;btn.disabled=false;btn.textContent=editingAdId?'حفظ التعديل':'نشر الإعلان'}
};
function openDetails(id){const a=ads.find(x=>Number(x.id)===Number(id));if(!a)return;currentDetail=a;currentImageIndex=0;renderDetail();history.replaceState(null,'',`#ad-${a.id}`);$('#detailsDialog').showModal()}
function renderDetail(){const a=currentDetail,imgs=adImages(a);$('#detailTitle').textContent=a.title;$('#detailPrice').textContent=money(a.price);$('#detailMeta').textContent=`${a.category} · ${a.governorate} · ${a.area}`;$('#detailDescription').textContent=a.description;$('#detailCall').href=`tel:${a.phone}`;$('#detailWhatsapp').href=waLink(a.phone);$('#detailCounter').textContent=imgs.length?`${currentImageIndex+1} / ${imgs.length}`:'';$('#detailImage').src=imgs[currentImageIndex]?.image_url||'';$('#detailImage').hidden=!imgs.length;$('#detailPlaceholder').hidden=!!imgs.length;$('#prevImage').hidden=imgs.length<2;$('#nextImage').hidden=imgs.length<2;document.title=`${a.title} | Ask Jordan`;const related=ads.filter(x=>x.id!==a.id&&(x.category===a.category||x.governorate===a.governorate)).slice(0,4);$('#relatedAds').innerHTML=related.length?related.map(x=>`<button type="button" data-related="${x.id}"><strong>${esc(x.title)}</strong><span>${money(x.price)} · ${esc(x.governorate)}</span></button>`).join(''):'<p>لا توجد إعلانات مشابهة حاليًا.</p>';document.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>openDetails(Number(b.dataset.related)))}
$('#prevImage').onclick=()=>{const n=adImages(currentDetail).length;if(!n)return;currentImageIndex=(currentImageIndex-1+n)%n;renderDetail()};
$('#nextImage').onclick=()=>{const n=adImages(currentDetail).length;if(!n)return;currentImageIndex=(currentImageIndex+1)%n;renderDetail()};
$('#detailShare').onclick=()=>shareAd(currentDetail.id);$('#detailsDialog').addEventListener('close',()=>{if(location.hash.startsWith('#ad-'))history.replaceState(null,'',location.pathname+location.search);document.title='Ask Jordan | اسأل السوق الأردني'});
async function shareAd(id){const a=ads.find(x=>Number(x.id)===Number(id));if(!a)return;const text=`${a.title}\n${money(a.price)}\n${a.governorate} - ${a.area}\n${location.origin}`;try{if(navigator.share)await navigator.share({title:a.title,text,url:location.origin});else{await navigator.clipboard.writeText(text);alert('تم نسخ تفاصيل الإعلان')}}catch(e){if(e.name!=='AbortError')alert('تعذر المشاركة')}}
$('#accountBtn').onclick=async()=>{if(!await requireAuth())return;const [{data:p},{data:mine,error}]=await Promise.all([sb.from('profiles').select('*').eq('id',session.user.id).single(),sb.from('ads').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false})]);if(error){alert(error.message);return}$('#identity').textContent=`${p?.name||'مستخدم'} · ${p?.phone||''}`;$('#myAds').innerHTML=mine?.length?mine.map(a=>`<div class="my-ad"><div><strong>${esc(a.title)}</strong><br><small>${esc(a.status)} · ${money(a.price)}</small></div><div class="my-ad-actions">${a.status==='active'?`<button class="ghost" data-edit="${a.id}">تعديل</button><button class="danger" data-delete="${a.id}">حذف</button>`:''}</div></div>`).join(''):'لا توجد إعلانات';document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف الإعلان؟'))return;const {error}=await sb.from('ads').update({status:'deleted'}).eq('id',b.dataset.delete).eq('user_id',session.user.id);if(error)alert(error.message);else{$('#accountDialog').close();await loadAds()}});document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const a=mine.find(x=>Number(x.id)===Number(b.dataset.edit));if(!a)return;editingAdId=a.id;const f=$('#adForm').elements;f.title.value=a.title;f.category.value=a.category;f.governorate.value=a.governorate;f.price.value=a.price;f.area.value=a.area;f.description.value=a.description;f.phone.value=a.phone;$('#adDialogTitle').textContent='تعديل الإعلان';$('#adSubmit').textContent='حفظ التعديل';$('#adImagesHint').hidden=false;$('#accountDialog').close();$('#adDialog').showModal()});$('#accountDialog').showModal()};
$('#logoutBtn').onclick=async()=>{await sb.auth.signOut();session=null;closeDialogs();alert('تم تسجيل الخروج')};
(async()=>{await refreshSession();await loadAds();const m=location.hash.match(/^#ad-(\d+)$/);if(m)openDetails(Number(m[1]))})();
