'use strict';
/* M2 cloud bridge: the V3.6 portfolio engine remains authoritative for all calculations.
 * No Shioaji keys, no simulated 'live' data, no auto-order, no sending emails.
 */
(() => {
  const $c = id => document.getElementById(id);
  const CFG = 'princess_mobile_public_config_m2';
  const clone = x => JSON.parse(JSON.stringify(x));
  const codes = ['0050','00646'];
  let db = null, owner = null, rev = null, lastSaved = null, queue = Promise.resolve(), busy = false;
  let authListener = null, loggedUserId = null, marketTimer = null;
  const cloud = {ready:false, confirmedState:null, save: save};
  window.prCloud = cloud;
  const msg = text => { $c('cloudGateMessage').textContent = text || ''; };
  const topStatus = text => { $c('cloudSyncStatus').textContent = text; };
  const showGate = key => {
    $c('cloudGate').hidden = false;
    for (const id of ['cloudConfigView','cloudLoginView','cloudFirstView','cloudBusyView']) $c(id).hidden = id !== key;
  };
  const config = () => { try {return JSON.parse(localStorage.getItem(CFG)||'null')}catch{return null} };
  function publicConfigValid(url, key) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) throw Error('請輸入 Supabase 專案 URL。');
    if (typeof key !== 'string' || key.length < 22 || (/^sb_secret_/i.test(key)) || key.includes('service_role')) throw Error('僅能使用 publishable／anon 公開金鑰，不能輸入 secret/service_role。');
    if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) throw Error('公開金鑰格式不符合預期。');
  }
  function cfgUI() {
    showGate('cloudConfigView');
    const c=config(); if (c) {$c('cloudUrl').value=c.url||''; $c('cloudPublicKey').value=c.key||'';}
  }
  function saveStatus(text) { topStatus(text); $c('modeBadge').textContent = text; }
  function sanitized(payload) {
    const x=clone(payload);
    // Authoritative intraday market readings are ephemeral; only manual reference prices are persisted.
    const refs={};
    for (const sym of codes) {
      const q=x.quotes?.[sym];
      if (q && q.source !== 'authorized_cloud' && q.price>0) refs[sym]=q;
    }
    x.quotes=refs;
    return x;
  }
  async function save(next) {
    if (!cloud.ready || !owner) throw Error('私人帳本尚未登入或載入。');
    const payload = sanitized(next);
    const stateAudit=inspectState(payload);
    if (stateAudit.errors.length) throw Error('帳務驗證未通過：'+stateAudit.errors.slice(0,3).join('；'));
    const pending=queue.then(async () => {
      if (!cloud.ready || !owner) throw Error('登入狀態已變更，未執行寫入。');
      busy = true;
      document.body.classList.add('cloud-saving');
      saveStatus('☁️ 正在儲存雲端帳本…');
      try {
        const {data,error}=await db.rpc('save_princess_state',{p_payload:payload,p_expected_revision:rev});
        if (error) {
          if (/version_conflict|40001/i.test(error.message||'') || error.code==='40001') {
            throw Error('其他裝置已經修改帳本。此裝置的變更未儲存，請按「重新同步」取得最新資料，避免覆蓋。');
          }
          throw error;
        }
        rev=Number(data);
        cloud.confirmedState=clone(payload);
        lastSaved=clone(payload);
        saveStatus('☁️ 雲端同步完成 · 版本 '+rev);
      } finally {
        busy = false;
        document.body.classList.remove('cloud-saving');
      }
    });
    queue=pending.catch(()=>{});
    return pending;
  }
  async function bootWithConfig() {
    const c=config();
    if (!c) return cfgUI();
    try {
      publicConfigValid(c.url,c.key);
      if (!window.supabase?.createClient) throw Error('Supabase 連線元件未載入，請檢查網路或廣告攔截設定。');
      db=window.supabase.createClient(c.url.replace(/\/$/,''),c.key,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
      showGate('cloudBusyView'); msg('正在確認登入狀態…');
      const {data,error}=await db.auth.getSession(); if(error)throw error;
      await applySession(data.session);
      authListener=db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>applySession(session).catch(e=>{showGate('cloudLoginView');msg(e.message)}),0)});
    } catch(e) {cfgUI();msg('連線設定有問題：'+e.message)}
  }
  async function applySession(session) {
    const id=session?.user?.id||null;
    if(id===loggedUserId && (cloud.ready || (!id&&$c('cloudLoginView').hidden===false))) return;
    loggedUserId=id;
    if (!id) {
      cloud.ready=false;owner=null;rev=null;st=defaultState();
      clearMarket();
      if(marketTimer){clearInterval(marketTimer);marketTimer=null}
      showGate('cloudLoginView');
      saveStatus('☁️ 尚未登入');
      $c('cloudUserLabel').textContent='';
      return;
    }
    owner=id; cloud.ready=false;
    $c('cloudUserLabel').textContent=session.user.email||'已登入';
    await loadRemote();
  }
  async function loadRemote() {
    if(!owner||!db) return;
    if(busy) {msg('正在儲存中，不能重新載入。');return;}
    showGate('cloudBusyView'); msg('讀取私人帳本…');
    const {data,error}=await db.from('portfolio_states').select('payload,revision').eq('user_id',owner).maybeSingle();
    if(error){showGate('cloudBusyView');msg('雲端讀取失敗：'+error.message+'。請先檢查是否執行 SQL，勿在此狀態新增資料。');return}
    if(!data){rev=null;cloud.ready=false;showGate('cloudFirstView');msg('雲端沒有帳本。請選擇從備份還原或建立空白帳本。');return}
    const x=data.payload;
    const audit=inspectState(x);
    if(audit.errors.length){showGate('cloudBusyView');msg('雲端帳本驗證不通過：'+audit.errors.slice(0,3).join('；')+'。沒有覆蓋資料。');return}
    rev=Number(data.revision);
    st=clone(x);
    cloud.confirmedState=clone(x);
    lastSaved=clone(x);
    cloud.ready=true;
    $c('cloudGate').hidden=true;
    refresh();
    window.prLoadNotify?.();
    saveStatus('☁️ 雲端同步完成 · 版本 '+rev);
    if(marketTimer)clearInterval(marketTimer);
    marketTimer=setInterval(()=>{if(!document.hidden)readMarket().catch(console.warn)},30000);
    await readMarket();
  }
  async function initFirst(x) {
    if(!owner||cloud.ready) return;
    const audit=inspectState(x);if(audit.errors.length)throw Error('備份未通過核對：'+audit.errors.slice(0,4).join('；'));
    showGate('cloudBusyView');msg('第一次建立雲端帳本…');
    const payload=sanitized(x);
    const {data,error}=await db.rpc('save_princess_state',{p_payload:payload,p_expected_revision:null});
    if(error){showGate('cloudFirstView');throw Error('建立失敗（不會覆蓋既有雲端帳本）：'+error.message)}
    rev=Number(data); // Cloud is initialized only after server confirms save.
    await loadRemote();
  }
  function ageMinutes(iso) {const t=Date.parse(iso);return Number.isFinite(t)?(Date.now()-t)/60000:Infinity;}
  function taiwanMarketHours() {
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
    const p=Object.fromEntries(parts.map(a=>[a.type,a.value]));
    if(['Sat','Sun'].includes(p.weekday))return false;
    const hh=Number(p.hour)%24, mm=Number(p.minute);
    return hh*60+mm>=9*60 && hh*60+mm<=13*60+30;
  }
  function clearMarket() {
    for (const sym of codes) {
      if(st?.quotes?.[sym]?.source==='authorized_cloud') delete st.quotes[sym];
      if(window.daughterBarsCache?.[sym]?.cloudAuthorized) delete window.daughterBarsCache[sym];
    }
    const c=$c('cloudMarketCards'); if(c)c.textContent='未取得有效正式行情，不產生即時買入訊號。';
  }
  function fmtTime(iso) {if(!iso)return '尚無資料';return new Date(iso).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}
  async function readMarket() {
    if(!cloud.ready||!db||!owner)return;
    const {data,error}=await db.from('market_snapshots').select('*').in('symbol',codes);
    const root=$c('cloudMarketCards');root.replaceChildren();
    if(error) {
      $c('cloudMarketState').textContent='讀取失敗';
      root.textContent='行情資料庫讀取失敗：'+error.message;
      clearMarket();return;
    }
    const map=Object.fromEntries((data||[]).map(x=>[x.symbol,x]));
    let usable=0;
    for(const sym of codes){
      const q=map[sym];
      const t=q?.source_time||null, delay=ageMinutes(t);
      // Protect against future-dated, delayed, simulated, or stale data and stale completed bars.
      const authorized=q?.source_kind==='production_authorized';
      const fresh=authorized&&delay>=-1&&delay<=3;
      const marketOpen=taiwanMarketHours();
      const canSignal=fresh&&marketOpen&&q?.daily_completed===true&&q?.hourly_completed===true&&
          [q.last_price,q.daily_k,q.hourly_k,q.highest_10d].every(x=>Number.isFinite(Number(x))&&x!==null)&&Number(q.highest_10d)>0;
      const box=document.createElement('div');box.className='cloud-quote-card';
      const title=document.createElement('strong');title.textContent=sym+'｜'+(sym==='0050'?'台灣50':'S&P500');
      const price=document.createElement('div');price.className='cloud-price';price.textContent=authorized&&q?.last_price>0?'NT$ '+Number(q.last_price).toLocaleString('zh-TW',{maximumFractionDigits:4}):'—';
      const kd=document.createElement('div');kd.className='help';kd.textContent=authorized&&q?.daily_k!=null&&q?.hourly_k!=null?`日 K ${Number(q.daily_k).toFixed(1)}｜60 分 K ${Number(q.hourly_k).toFixed(1)}`:'KD 尚未有正式授權資料';
      const state=document.createElement('span');state.className='cloud-tag';state.textContent=!q?'尚無雲端行情':!authorized?'非正式授權行情':!marketOpen?'非交易時段／最後參考價':!fresh?'行情過期，禁止訊號':!canSignal?'K 線未完成或欄位不足':'正式行情有效，可分析候選買點';
      const stamp=document.createElement('div');stamp.className='help';stamp.textContent='來源時間：'+fmtTime(t)+(q?.source_kind?'｜'+q.source_kind:'');
      box.append(title,price,kd,state,stamp);
      if(canSignal){
        usable++;
        const x={symbol:sym,price:Number(q.last_price),kdD:{k:Number(q.daily_k),d:Number(q.daily_d??q.daily_k)},kdH:{k:Number(q.hourly_k),d:Number(q.hourly_d??q.hourly_k)},highest:Number(q.highest_10d),stamp:fmtTime(t),source:'授權雲端行情',daily:[],hourly:[],cloudAuthorized:true};
        window.daughterBarsCache[sym]=x;
        st.quotes[sym]={price:Number(q.last_price),date:new Date(t).toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).replace(' ','T'),source:'authorized_cloud'};
        const z=smartStrategy(sym,x),r=document.createElement('div');r.className='cloud-signal';r.textContent=`${z.level} 級｜本次規則試算 ${money(z.grossSuggestion)}（待回測、非委託）`;box.append(r);
      }else{
        if(st.quotes[sym]?.source==='authorized_cloud')delete st.quotes[sym];
        if(window.daughterBarsCache?.[sym]?.cloudAuthorized)delete window.daughterBarsCache[sym];
      }
      root.append(box);
    }
    $c('cloudMarketState').textContent=usable?usable+' 檔正式行情可分析':'無可用即時買點';
    if(usable){const current=$c('autoSymbol').value;if(window.daughterBarsCache?.[current]?.cloudAuthorized)window.prSelectCached(current);}
    renderHome();
  }
  // Mobile-specific event handlers. Every ledger change remains controlled by V3.6's validation.
  $c('cloudSetupBtn').onclick=()=>{
    try {
      const url=$c('cloudUrl').value.trim(),key=$c('cloudPublicKey').value.trim();publicConfigValid(url,key);
      localStorage.setItem(CFG,JSON.stringify({url:url.replace(/\/$/,''),key}));location.reload();
    }catch(e){msg(e.message)}
  };
  $c('cloudChangeConfig').onclick=()=>{if(confirm('更換公開雲端專案？此操作不會刪除既有雲端資料。')){localStorage.removeItem(CFG);location.reload()}};
  $c('cloudLoginBtn').onclick=async()=>{
    const email=$c('cloudEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return msg('請輸入有效的 Email');
    try{const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;msg('登入連結已寄出，請到你的 Email 信箱點選連結。')}
    catch(e){msg('寄送失敗：'+e.message)}
  };
  $c('cloudImportFirst').onchange=async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    try{
      if(file.size>2e6)throw Error('備份超過 2MB，請先檢查內容。');
      const parsed=JSON.parse(await file.text()); const audit=inspectState(parsed);
      if(audit.errors.length)throw Error(audit.errors.join('；'));
      if(!confirm(`即將匯入 ${parsed.events.length} 筆交易、${parsed.snaps.length} 個行情快照到目前登入的私人雲端帳本，確定嗎？`))return;
      await initFirst(parsed);
    }catch(e){showGate('cloudFirstView');msg('匯入未完成：'+e.message)}
    finally{ev.target.value=''}
  };
  $c('cloudCreateEmpty').onclick=async()=>{
    if(!confirm('確認以全新空白帳本開始？如果之前有交易紀錄，請選 JSON 還原。'))return;
    try{await initFirst(defaultState())}catch(e){showGate('cloudFirstView');msg(e.message)}
  };
  async function logout(){if(!db)return;cloud.ready=false;await db.auth.signOut();owner=null;rev=null;loggedUserId=null;location.reload()}
  $c('cloudFirstLogout').onclick=logout;
  $c('cloudLogout').onclick=logout;
  $c('cloudReload').onclick=async()=>{
    if(!cloud.ready)return; if(!confirm('重新讀取雲端資料，會捨棄此裝置任何尚未同步的變更。確定嗎？'))return;
    try{await loadRemote()}catch(e){msg('同步失敗：'+e.message)}
  };
  $c('cloudMarketRefresh').onclick=async()=>{try{await readMarket()}catch(e){$c('cloudMarketState').textContent='行情更新失敗：'+e.message}};
  // Never start market polling before authenticated portfolio successfully loads.
  cfgUI();
  bootWithConfig();
})();
