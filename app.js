/* =========================================================
   IDEIAS PLURIVET — lógica da aplicação
   ---------------------------------------------------------
   LIGAÇÃO AO GOOGLE SHEETS
   Cola aqui o endereço da Web App do Apps Script (termina em /exec).
   Enquanto estiver vazio, a app funciona em modo local:
   as sugestões ficam só no aparelho de quem as escreve.
   ========================================================= */
const API_URL = 'https://script.google.com/macros/s/AKfycbxK7...blá blá.../exec';

/* ---------- Colaboradores autorizados ---------- */
const authorizedCollaborators = [
 {name:"Adriano Policia", email:"apolicia@plurivet.pt"},
 {name:"Alicia Ferreira", email:"aferreira@plurivet.pt"},
 {name:"André Maia", email:"amaia@plurivet.pt"},
 {name:"Armazém", email:"armazem@plurivet.pt"},
 {name:"Beatriz Ferro", email:"bferro@plurivet.pt"},
 {name:"Dr. Nuno do Carmo", email:"ncarmo@plurivet.pt"},
 {name:"Engº Luis Gameiro", email:"lgameiro@plurivet.pt"},
 {name:"Engº Vasco Reis", email:"vreis@plurivet.pt"},
 {name:"Frederica Lima", email:"flima@plurivet.pt"},
 {name:"Frederica Lima", email:"fredericacndl@gmail.com"},
 {name:"Geral", email:"geral@plurivet.pt"},
 {name:"Iris Reto", email:"ireto@plurivet.pt"},
 {name:"Jaime Graça", email:"jgraca@plurivet.pt"},
 {name:"João Moura dos Santos", email:"jsantos@plurivet.pt"},
 {name:"José Assunção", email:"jassuncao@plurivet.pt"},
 {name:"José Gouveia", email:"jgouveia@plurivet.pt"},
 {name:"Manuel Pedras", email:"mpedras@plurivet.pt"},
 {name:"Mara Pereira", email:"mpereira@plurivet.pt"},
 {name:"Oficina (Henrique)", email:"oficina@plurivet.pt"},
 {name:"Patricia Simões", email:"psimoes@plurivet.pt"},
 {name:"Pedro Silva", email:"psilva@plurivet.pt"},
 {name:"Teresa Caetano", email:"tcaetano@plurivet.pt"},
 {name:"Teresa Rousseau", email:"trousseau@plurivet.pt"}
];
const ADMINS = ["flima@plurivet.pt", "fredericacndl@gmail.com"];

/* ---------- Guardar dados (localStorage com reserva em memória) ---------- */
const store = (()=>{
  let mem = {}, ok = false;
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); ok = true; }catch(e){ ok = false; }
  return {
    get(k){ try{ return ok ? localStorage.getItem(k) : (mem[k] ?? null); }catch(e){ return mem[k] ?? null; } },
    set(k,v){ try{ ok ? localStorage.setItem(k,v) : (mem[k]=v); }catch(e){ mem[k]=v; } }
  };
})();

const online = () => !!API_URL;

const seedIdeas = [
 {id:1,date:"2026-08-18",person:"Ana Silva",email:"",title:"Melhorar comunicação interna",area:"Recursos Humanos",status:"Em análise",description:"Criar um canal simples e regular para divulgar novidades, decisões e informação relevante a toda a equipa.",files:[]},
 {id:2,date:"2026-08-16",person:"João Costa",email:"",title:"Checklist de expedição",area:"Armazém / Logística",status:"Aprovada",description:"Disponibilizar uma checklist digital para reduzir esquecimentos e uniformizar o processo de expedição.",files:[]},
 {id:3,date:"2026-08-14",person:"Maria Santos",email:"",title:"Campanha de produtos",area:"Marketing",status:"Nova",description:"Criar uma campanha interna para dar maior destaque a determinados produtos e soluções.",files:[]}
];

let ideas = [];
let currentUser = null;
let pendingFiles = [];
let currentDetail = null;

function loadLocal(){
  try{ const raw = store.get('plurivet_ideias'); ideas = raw ? JSON.parse(raw) : seedIdeas.slice(); }
  catch(e){ ideas = seedIdeas.slice(); }
}
function saveLocal(){ try{ store.set('plurivet_ideias', JSON.stringify(ideas)); }catch(e){} }

/* ---------- Comunicação com o Google Sheets ---------- */
async function apiGet(){
  const r = await fetch(API_URL + '?action=list&t=' + Date.now());
  const d = await r.json();
  if(!d.ok) throw new Error(d.error || 'erro');
  return d.ideas;
}
async function apiPost(payload){
  // text/plain evita o pedido preflight, que o Apps Script não responde
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if(!d.ok) throw new Error(d.error || 'erro');
  return d;
}
async function refresh(silent){
  if(!online()) return;
  try{
    setSync('A sincronizar…');
    ideas = await apiGet();
    setSync('');
    renderEverything();
  }catch(e){
    setSync('Sem ligação ao servidor');
    if(!silent) toast('Não foi possível ligar ao servidor. Verifica a internet.');
  }
}
function setSync(msg){
  const el = document.getElementById('syncState');
  if(el) el.textContent = msg;
}

/* ---------- Utilitários ---------- */
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate = s => { const [y,m,d]=String(s).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
const statusClass = s => s==="Nova"?"new" : s==="Em análise"?"review" : (s==="Aprovada"||s==="Implementada")?"approved" : "rejected";
const isAdmin = () => !!currentUser && ADMINS.includes(currentUser.email);
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),3600); }
function busy(on){ document.body.style.cursor = on ? 'progress' : ''; }

/* ---------- Sessão ---------- */
async function enterApp(){
  const raw = document.getElementById('loginEmail').value.trim().toLowerCase();
  const user = authorizedCollaborators.find(x=>x.email===raw);
  if(!user){ toast('Email não reconhecido. Utilize o seu email profissional Plurivet.'); return; }
  currentUser = user;
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userNameSide').textContent = user.name;
  document.getElementById('userRoleSide').textContent = isAdmin() ? 'Administração' : 'Colaborador';
  document.getElementById('userAvatar').textContent = user.name.replace(/[^\p{L}\s]/gu,'').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  document.getElementById('currentUserEmail').textContent = user.email;
  document.getElementById('homeLead').textContent = 'Bem-vindo/a, '+user.name+'. Partilha uma sugestão para melhorar a Plurivet.';
  document.getElementById('allIdeasNav').style.display = isAdmin() ? '' : 'none';
  document.getElementById('adminNav').style.display = isAdmin() ? '' : 'none';
  document.getElementById('localNotice').style.display = online() ? 'none' : '';
  store.set('plurivet_user', user.email);

  if(online()){ ideas = []; renderEverything(); await refresh(); }
  else { loadLocal(); renderEverything(); }
  showScreen('home', document.querySelector('.nav button[data-screen="home"]'));
}
function logout(){
  currentUser=null; pendingFiles=[]; ideas=[];
  store.set('plurivet_user','');
  document.getElementById('app').style.display='none';
  document.getElementById('login').style.display='grid';
  document.getElementById('loginEmail').value='';
  document.getElementById('attachmentPreview').innerHTML='';
}
function showScreen(id, btn){
  if((id==='allIdeas'||id==='admin') && !isAdmin()){ toast('Esta área está disponível apenas para a administração.'); return; }
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const target = btn || document.querySelector('.nav button[data-screen="'+id+'"]');
  document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));
  if(target) target.classList.add('active');
  window.scrollTo({top:0});
}

/* ---------- Anexos ---------- */
function readFile(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(file); });
}
// Reduz fotografias de telemóvel antes de enviar (poupa dados e tempo)
function shrinkImage(dataUrl, max=1600, quality=0.82){
  return new Promise(res=>{
    const img = new Image();
    img.onload = ()=>{
      let {width:w, height:h} = img;
      if(Math.max(w,h) > max){ const k = max/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k); }
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      try{ res(cv.toDataURL('image/jpeg', quality)); }catch(e){ res(dataUrl); }
    };
    img.onerror = ()=>res(dataUrl);
    img.src = dataUrl;
  });
}
async function handleAttachments(input){
  const files = [...input.files];
  input.value='';
  for(const file of files){
    if(file.size > 15*1024*1024){ toast('O ficheiro '+file.name+' é demasiado grande (máx. 15 MB).'); continue; }
    let data = await readFile(file);
    if(file.type.startsWith('image/')) data = await shrinkImage(data);
    pendingFiles.push({name:file.name, type:file.type, data, url: file.type.startsWith('image/') ? data : null});
    renderPending();
  }
}
function renderPending(){
  document.getElementById('attachmentPreview').innerHTML = pendingFiles.map((f,i)=> f.url
    ? `<div class="att-item"><img class="thumb" src="${f.url}" alt="${esc(f.name)}"><button class="rm" onclick="removePending(${i})" aria-label="Remover">×</button></div>`
    : `<div class="file-pill">📎 ${esc(f.name)}<button onclick="removePending(${i})" aria-label="Remover">×</button></div>`
  ).join('');
}
function removePending(i){ pendingFiles.splice(i,1); renderPending(); }

/* ---------- Nova ideia ---------- */
async function submitIdea(){
  const btn = document.getElementById('submitBtn');
  const title = document.getElementById('ideaTitle').value.trim();
  const text  = document.getElementById('ideaText').value.trim();
  const area  = document.getElementById('ideaArea').value || 'Outro';
  if(!title || !text){ toast('Preenche o título e a descrição.'); return; }

  const idea = {
    id: Date.now(), date: new Date().toISOString().slice(0,10),
    person: currentUser.name, email: currentUser.email,
    title, area, status:'Nova', description: text,
    files: pendingFiles.map(f=>({name:f.name, type:f.type, data:f.data}))
  };

  if(online()){
    btn.disabled = true; btn.textContent = 'A enviar…'; busy(true);
    try{
      const res = await apiPost({action:'create', idea});
      ideas = res.ideas || ideas;
    }catch(e){
      btn.disabled=false; btn.textContent='Enviar ideia'; busy(false);
      toast('Não foi possível enviar. Verifica a internet e tenta outra vez — o texto foi mantido.');
      return;
    }
    btn.disabled=false; btn.textContent='Enviar ideia'; busy(false);
  } else {
    idea.files = pendingFiles.map(f=>({name:f.name, type:f.type, url:f.url}));
    ideas.unshift(idea); saveLocal();
  }

  document.getElementById('ideaTitle').value='';
  document.getElementById('ideaText').value='';
  document.getElementById('ideaArea').value='';
  pendingFiles=[]; renderPending();
  renderEverything();
  toast('Sugestão enviada. Obrigada, '+currentUser.name.split(' ')[0]+'!');
  showScreen('mine');
}

/* ---------- Listagens ---------- */
function renderEverything(){ populatePersonFilter(); renderMine(); renderAll(); renderAdmin(); renderMetrics(); }
function renderMetrics(){
  const mine = ideas.filter(x=>x.email===currentUser?.email);
  document.getElementById('mTotal').textContent = mine.length;
  document.getElementById('mReview').textContent = mine.filter(x=>x.status==='Em análise').length;
  document.getElementById('mDone').textContent = mine.filter(x=>x.status==='Implementada').length;
  document.getElementById('aTotal').textContent = ideas.length;
  document.getElementById('aPending').textContent = ideas.filter(x=>x.status==='Nova'||x.status==='Em análise').length;
  document.getElementById('aDone').textContent = ideas.filter(x=>x.status==='Implementada').length;
}
const sorted = arr => arr.slice().sort((a,b)=> String(b.date).localeCompare(String(a.date)) || b.id-a.id);
const emptyRow = (cols,msg) => `<tr><td colspan="${cols}"><div class="empty">${msg}</div></td></tr>`;

function renderMine(){
  const rows = sorted(ideas.filter(x=>x.email===currentUser?.email));
  document.getElementById('mineBody').innerHTML = rows.length ? rows.map(x=>`
    <tr><td>${formatDate(x.date)}</td><td><b>${esc(x.title)}</b></td><td>${esc(x.area)}</td>
    <td><span class="badge ${statusClass(x.status)}">${x.status}</span></td>
    <td><button class="btn btn-outline" onclick="openDetail(${x.id})">Ver</button></td></tr>`).join('')
    : emptyRow(5,'Ainda não enviaste nenhuma sugestão. Começa por “Nova ideia”.');
}
function renderAll(){
  const t=(document.getElementById('allTitleFilter').value||'').toLowerCase();
  const a=document.getElementById('allAreaFilter').value;
  const p=document.getElementById('allPersonFilter').value;
  const rows = sorted(ideas).filter(x=>(!t||x.title.toLowerCase().includes(t))&&(!a||x.area===a)&&(!p||x.person===p));
  document.getElementById('allIdeasBody').innerHTML = rows.length ? rows.map(x=>`
    <tr><td>${formatDate(x.date)}</td><td>${esc(x.person)}</td><td><b>${esc(x.title)}</b></td><td>${esc(x.area)}</td>
    <td><span class="badge ${statusClass(x.status)}">${x.status}</span></td>
    <td><button class="btn btn-outline" onclick="openDetail(${x.id})">Ver</button></td></tr>`).join('')
    : emptyRow(6,'Não existem sugestões que correspondam aos filtros.');
}
function clearAllFilters(){
  document.getElementById('allTitleFilter').value='';
  document.getElementById('allAreaFilter').value='';
  document.getElementById('allPersonFilter').value='';
  renderAll();
}
function populatePersonFilter(){
  const s=document.getElementById('allPersonFilter'); const keep=s.value;
  s.innerHTML='<option value="">Todos os colaboradores</option>';
  [...new Set(ideas.map(x=>x.person))].sort((a,b)=>a.localeCompare(b,'pt')).forEach(p=>{
    const o=document.createElement('option'); o.value=p; o.textContent=p; s.appendChild(o);
  });
  s.value=keep;
}
function renderAdmin(){
  const q=(document.getElementById('adminSearch').value||'').toLowerCase();
  const st=document.getElementById('adminStatus').value;
  const rows = sorted(ideas).filter(x=>(!st||x.status===st)&&(!q||(x.title+' '+x.person+' '+x.area+' '+x.description).toLowerCase().includes(q)));
  document.getElementById('adminBody').innerHTML = rows.length ? rows.map(x=>`
    <tr><td>${formatDate(x.date)}</td><td>${esc(x.person)}</td><td><b>${esc(x.title)}</b></td><td>${esc(x.area)}</td>
    <td><span class="badge ${statusClass(x.status)}">${x.status}</span></td>
    <td><button class="btn btn-outline" onclick="openDetail(${x.id})">Ver</button></td></tr>`).join('')
    : emptyRow(6,'Não existem sugestões que correspondam à pesquisa.');
  renderMetrics();
}

/* ---------- Detalhe ---------- */
function openDetail(id){
  const x = ideas.find(i=>String(i.id)===String(id)); if(!x) return;
  currentDetail = x.id;
  document.getElementById('detailTitle').textContent = x.title;
  document.getElementById('detailMeta').innerHTML =
    `<span class="badge ${statusClass(x.status)}">${x.status}</span>
     <span class="badge neutral">${esc(x.area)}</span>
     <span class="badge neutral">${esc(x.person)}</span>
     <span class="badge neutral">${formatDate(x.date)}</span>`;
  document.getElementById('detailDescription').textContent = x.description;
  document.getElementById('detailAttachments').innerHTML = (x.files||[]).map(f=> (f.url && /^(data:image|https?:)/.test(f.url) && (f.type||'').startsWith('image/'))
    ? `<a href="${f.url}" target="_blank" rel="noopener"><img class="thumb" src="${f.url}" alt="${esc(f.name)}"></a>`
    : `<a class="file-pill" href="${f.url||'#'}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a>`).join('');
  document.getElementById('detailActions').style.display = isAdmin() ? 'flex' : 'none';
  document.getElementById('detailModal').classList.add('open');
}
function closeDetail(){ document.getElementById('detailModal').classList.remove('open'); currentDetail=null; }
async function setDetailStatus(s){
  const x = ideas.find(i=>i.id===currentDetail); if(!x) return;
  const before = x.status;
  x.status = s;
  closeDetail(); renderEverything();
  if(online()){
    try{ await apiPost({action:'status', id:x.id, status:s, by:currentUser.email}); }
    catch(e){ x.status = before; renderEverything(); toast('Não foi possível guardar o novo estado. Tenta outra vez.'); return; }
  } else saveLocal();
  toast('Estado atualizado para: '+s);
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDetail(); });

/* ---------- Exportar ---------- */
function exportCSV(){
  const head=['Data','Colaborador','Email','Sugestão','Área','Estado','Descrição'];
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=[head.join(';')].concat(sorted(ideas).map(x=>[formatDate(x.date),x.person,x.email,x.title,x.area,x.status,x.description].map(q).join(';'))).join('\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download='ideias_plurivet.csv'; a.click(); URL.revokeObjectURL(url);
  toast('Ficheiro CSV exportado.');
}

document.getElementById('fileInput').addEventListener('change', e=>handleAttachments(e.target));
document.getElementById('cameraInput').addEventListener('change', e=>handleAttachments(e.target));
document.getElementById('loginEmail').value = store.get('plurivet_user') || '';

/* ---------- Instalação da app (PWA) ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('installBar').classList.add('show');
});
function installApp(){
  if(!deferredPrompt){ toast('Abre esta página no Chrome ou no Safari para instalar.'); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.finally(()=>{
    deferredPrompt=null;
    document.getElementById('installBar').classList.remove('show');
  });
}
window.addEventListener('appinstalled', ()=>{
  document.getElementById('installBar').classList.remove('show');
  toast('App instalada. Já a podes abrir a partir do ecrã principal.');
});
(function(){
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if(iOS && !standalone) document.getElementById('iosHint').classList.add('show');
})();

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
// Atualiza a lista quando se volta à app
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && currentUser) refresh(true); });
