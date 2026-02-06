/* =========================
   CONFIG
========================= */
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "The152max@";

/* =========================
   STORAGE KEYS
========================= */
const KEY_GROUPS = "consultoria_groups_v6";
const KEY_EXERCISES = "consultoria_exercises_v6";
const KEY_STUDENTS = "consultoria_students_v6";
const KEY_PLANS = "consultoria_plans_v6";
const KEY_MODELS = "consultoria_models_v6";
const KEY_AUTH = "consultoria_auth_v6";

/* =========================
   STATE
========================= */
let groups = ["Peitoral","Costas","Pernas","Ombros","Braços","Abdômen","Mobilidade","Alongamento"];
let exercises = [];     // {id, group, name, youtube}
let students = [];      // {id, name, username, passHash, planMonths, createdAt, expiresAt}
let plans = {};         // { [studentId]: { [dayBlock]: [items...] } }
let models = ["A","B","C","D"];

/* =========================
   HELPERS
========================= */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function uid(prefix="id"){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function nowISO(){ return new Date().toISOString(); }
function addMonths(date, months){
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}
function fmtDate(iso){ return new Date(iso).toLocaleDateString("pt-BR"); }
function daysLeft(iso){ return Math.ceil((new Date(iso) - new Date()) / 86400000); }

function setStatus(msg, ok=true){
  const pill = $("#statusPill");
  if(!pill) return;
  pill.textContent = msg;
  pill.style.color = ok ? "#18c37d" : "#ffb9bd";
}
function setLoginMsg(msg){
  const el = $("#loginMsg");
  if(el) el.textContent = msg;
}

function youtubeToEmbed(url){
  if(!url) return "";
  const u = url.trim();
  if(u.includes("youtu.be/")) return "https://www.youtube.com/embed/" + u.split("youtu.be/")[1].split("?")[0];
  if(u.includes("watch?v=")) return "https://www.youtube.com/embed/" + u.split("watch?v=")[1].split("&")[0];
  if(u.includes("shorts/")) return "https://www.youtube.com/embed/" + u.split("shorts/")[1].split("?")[0];
  return "";
}

// evita HTML quebrar na grid do aluno
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   HASH
========================= */
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2,"0"))
    .join("");
}

/* =========================
   STORAGE
========================= */
function saveAll(){
  localStorage.setItem(KEY_GROUPS, JSON.stringify(groups));
  localStorage.setItem(KEY_EXERCISES, JSON.stringify(exercises));
  localStorage.setItem(KEY_STUDENTS, JSON.stringify(students));
  localStorage.setItem(KEY_PLANS, JSON.stringify(plans));
  localStorage.setItem(KEY_MODELS, JSON.stringify(models));
}

function loadAll(){
  if(localStorage.getItem(KEY_GROUPS)) groups = JSON.parse(localStorage.getItem(KEY_GROUPS));
  if(localStorage.getItem(KEY_EXERCISES)) exercises = JSON.parse(localStorage.getItem(KEY_EXERCISES));
  if(localStorage.getItem(KEY_STUDENTS)) students = JSON.parse(localStorage.getItem(KEY_STUDENTS));
  if(localStorage.getItem(KEY_PLANS)) plans = JSON.parse(localStorage.getItem(KEY_PLANS));
  if(localStorage.getItem(KEY_MODELS)) models = JSON.parse(localStorage.getItem(KEY_MODELS));
}

async function loadDefaultsIfEmpty(){
  // só carrega data.json se for a primeira vez (sem exercises no localStorage)
  if(localStorage.getItem(KEY_EXERCISES)) return;
  try{
    const res = await fetch("data.json", { cache:"no-store" });
    const json = await res.json();
    if(Array.isArray(json.groups) && json.groups.length) groups = json.groups;
    if(Array.isArray(json.exercises)){
      exercises = json.exercises.map(e=>({
        id: uid("ex"),
        group: e.group,
        name: e.name,
        youtube: e.youtube || ""
      }));
    }
    saveAll();
  }catch{
    saveAll();
  }
}

/* =========================
   AUTH
========================= */
function setAuth(obj){ localStorage.setItem(KEY_AUTH, JSON.stringify(obj)); }
function getAuth(){ const raw = localStorage.getItem(KEY_AUTH); return raw ? JSON.parse(raw) : null; }
function logout(){ localStorage.removeItem(KEY_AUTH); location.reload(); }

/* =========================
   UI NAV
========================= */
function showView(v){
  $$(".view").forEach(x=>x.classList.add("hidden"));
  $("#view-"+v)?.classList.remove("hidden");

  $$(".menu-item").forEach(b=>b.classList.remove("active"));
  document.querySelector(`.menu-item[data-view="${v}"]`)?.classList.add("active");

  const titles={
    dashboard:"Dashboard",
    alunos:"Alunos",
    exercicios:"Exercícios",
    treinos:"Treinos",
    backup:"Backup",
    videos:"Vídeos",            // ✅ novo
    meutreino:"Meu Treino"
  };
  $("#viewTitle").textContent = titles[v] || "Painel";
}

/* =========================
   DASHBOARD
========================= */
function renderDashboard(){
  $("#dashStudents").textContent = students.length;
  $("#dashExercises").textContent = exercises.length;

  let d=0;
  Object.values(plans).forEach(p=> d += Object.keys(p||{}).length);
  $("#dashPlans").textContent = d;
}

/* =========================
   SELECTS
========================= */
function fillGroups(){
  const exGroup=$("#exGroup");
  const filterGroup=$("#filterGroup");
  const planGroup=$("#planGroup");

  if(exGroup){
    exGroup.innerHTML="";
    groups.forEach(g=> exGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
  if(planGroup){
    planGroup.innerHTML="";
    groups.forEach(g=> planGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
  if(filterGroup){
    filterGroup.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g=> filterGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
}

function fillStudentsSelect(){
  const sel=$("#planStudent");
  if(!sel) return;
  sel.innerHTML="";
  students.forEach(s=> sel.innerHTML += `<option value="${s.id}">${s.name}</option>`);
}

function fillPlanDays(){
  const sel=$("#planDay");
  if(!sel) return;
  const days=["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
  sel.innerHTML="";
  days.forEach(d=>{
    models.forEach(m=>{
      sel.innerHTML += `<option value="${d} - ${m}">${d} - ${m}</option>`;
    });
  });
  // também permite escolher só o modelo (sem dia)
  models.forEach(m=> sel.innerHTML += `<option value="${m}">${m}</option>`);
}

function fillPlanExercises(){
  const g = $("#planGroup").value;
  const sel = $("#planExercise");
  sel.innerHTML="";
  exercises.filter(e=>e.group===g).forEach(e=>{
    sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
  });
}

/* =========================
   LOGIN TABS
========================= */
function bindLoginTabs(){
  $("#tabAdmin").onclick=()=>{
    $("#tabAdmin").classList.add("active");
    $("#tabAluno").classList.remove("active");
    $("#formAdmin").classList.remove("hidden");
    $("#formAluno").classList.add("hidden");
    setLoginMsg("");
  };
  $("#tabAluno").onclick=()=>{
    $("#tabAluno").classList.add("active");
    $("#tabAdmin").classList.remove("active");
    $("#formAluno").classList.remove("hidden");
    $("#formAdmin").classList.add("hidden");
    setLoginMsg("");
  };
}

/* =========================
   LOGIN ACTIONS
========================= */
async function loginAdmin(){
  const u=$("#loginUser").value.trim();
  const p=$("#loginPass").value.trim();
  if(u===ADMIN_USER && p===ADMIN_PASSWORD){
    setAuth({ role:"admin" });
    location.reload();
  }else{
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function loginAluno(){
  const u=$("#studentUserLogin").value.trim().toLowerCase();
  const p=$("#studentPassLogin").value.trim();

  const s = students.find(st=>st.username===u);
  if(!s) return setLoginMsg("Aluno não encontrado");
  if(daysLeft(s.expiresAt) < 0) return setLoginMsg("Plano vencido");

  const h = await sha256(p);
  if(h !== s.passHash) return setLoginMsg("Senha incorreta");

  setAuth({ role:"student", studentId:s.id });
  location.reload();
}

/* =========================
   STUDENTS
========================= */
async function addStudent(){
  const name=$("#studentName").value.trim();
  const user=$("#studentUser").value.trim().toLowerCase();
  const pass=$("#studentPass").value.trim();
  const plan=Number($("#studentPlan").value);

  if(!name||!user||pass.length<4) return setStatus("Dados inválidos",false);
  if(students.some(s=>s.username===user)) return setStatus("Usuário já existe",false);

  students.push({
    id:uid("st"),
    name,
    username:user,
    passHash: await sha256(pass),
    planMonths:plan,
    createdAt:nowISO(),
    expiresAt:addMonths(new Date(), plan).toISOString()
  });

  $("#studentName").value="";
  $("#studentUser").value="";
  $("#studentPass").value="";

  saveAll();
  setStatus("Aluno criado",true);
  renderStudents();
  fillStudentsSelect();
  renderDashboard();
}

function renderStudents(){
  const tb=$("#studentsTable tbody");
  tb.innerHTML="";
  students.forEach(s=>{
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.username)}</td>
        <td>${s.planMonths}m</td>
        <td>${fmtDate(s.expiresAt)} (${daysLeft(s.expiresAt)}d)</td>
        <td>${daysLeft(s.expiresAt)>=0 ? "Ativo" : "Vencido"}</td>
        <td><button class="btn danger" type="button" onclick="deleteStudent('${s.id}')">Excluir</button></td>
      </tr>`;
  });
}
window.deleteStudent = function(id){
  if(!confirm("Excluir aluno?")) return;
  students = students.filter(s=>s.id!==id);
  delete plans[id];
  saveAll();
  renderStudents();
  fillStudentsSelect();
  renderDashboard();
};

/* =========================
   EXERCISES
========================= */
function addExercise(){
  const g=$("#exGroup").value;
  const n=$("#exName").value.trim();
  const y=$("#exYoutube").value.trim();
  if(!n) return setStatus("Digite o nome do exercício",false);

  exercises.push({ id:uid("ex"), group:g, name:n, youtube:y });

  $("#exName").value="";
  $("#exYoutube").value="";
  saveAll();
  setStatus("Exercício adicionado",true);
  renderExercises();
  renderDashboard();
  renderVideosStudent(); // ✅ atualiza tela de vídeos do aluno se estiver aberta
}

function renderExercises(){
  const tb=$("#exercisesTable tbody");
  tb.innerHTML="";
  const f=$("#filterGroup").value;
  const q=$("#searchExercise").value.trim().toLowerCase();

  exercises
    .filter(e => (f==="ALL" || e.group===f) && e.name.toLowerCase().includes(q))
    .forEach(e=>{
      tb.innerHTML += `
        <tr>
          <td>${escapeHtml(e.group)}</td>
          <td>${escapeHtml(e.name)}</td>
          <td>${e.youtube ? "Embed" : "—"}</td>
          <td><button class="btn danger" type="button" onclick="deleteExercise('${e.id}')">Excluir</button></td>
        </tr>`;
    });

  // atualiza lista do treino também
  fillPlanExercises();
}

window.deleteExercise = function(id){
  if(!confirm("Excluir exercício?")) return;
  exercises = exercises.filter(e=>e.id!==id);

  // remove dos treinos
  Object.values(plans).forEach(p=>{
    Object.keys(p).forEach(day=>{
      p[day] = p[day].filter(it=>it.exerciseId!==id);
    });
  });

  saveAll();
  renderExercises();
  renderDashboard();
  renderVideosStudent(); // ✅ atualiza tela de vídeos do aluno
};

/* =========================
   BULK ADD (consertado)
========================= */
function bindBulk(){
  $("#btnBulkToggle").onclick = ()=> $("#bulkBox").classList.toggle("hidden");
  $("#btnBulkCancel").onclick = ()=>{
    $("#bulkBox").classList.add("hidden");
    $("#bulkText").value="";
  };

  $("#btnBulkSave").onclick = ()=>{
    const g=$("#exGroup").value;
    const lines=$("#bulkText").value
      .split("\n")
      .map(l=>l.trim())
      .filter(Boolean);

    if(!lines.length) return setStatus("Cole 1 exercício por linha",false);

    let count=0;
    lines.forEach(name=>{
      const exists = exercises.some(e=> e.group===g && e.name.toLowerCase()===name.toLowerCase());
      if(!exists){
        exercises.push({ id:uid("ex"), group:g, name, youtube:"" });
        count++;
      }
    });

    saveAll();
    $("#bulkText").value="";
    $("#bulkBox").classList.add("hidden");
    setStatus(`Lote salvo: ${count} exercícios`,true);
    renderExercises();
    renderDashboard();
    renderVideosStudent(); // ✅
  };
}

/* =========================
   MODELS
========================= */
function addModel(){
  const m = (prompt("Novo modelo (ex: E, Upper, Lower):") || "").trim();
  if(!m) return;
  if(models.includes(m)) return setStatus("Modelo já existe",false);
  models.push(m);
  saveAll();
  fillPlanDays();
  setStatus("Modelo adicionado",true);
}

/* =========================
   PLANS
========================= */
function addToPlan(){
  const sid=$("#planStudent").value;
  const day=$("#planDay").value;
  const exId=$("#planExercise").value;
  const ex=exercises.find(e=>e.id===exId);

  if(!sid || !day || !ex) return setStatus("Selecione aluno / dia / exercício",false);

  if(!plans[sid]) plans[sid]={};
  if(!plans[sid][day]) plans[sid][day]=[];

  plans[sid][day].push({
    id:uid("it"),
    exerciseId:ex.id,
    group:ex.group,
    name:ex.name,
    youtube:ex.youtube,
    sets:$("#planSets").value || "3",
    reps:$("#planReps").value || "8-12",
    rest:$("#planRest").value || "60s",
    note:$("#planNote").value || ""
  });

  saveAll();
  setStatus("Adicionado no treino",true);
  renderPlansAdmin();
  renderDashboard();
}

function renderPlansAdmin(){
  const sid=$("#planStudent").value;
  const box=$("#planPreview");
  box.innerHTML="";

  if(!sid){
    box.innerHTML = `<div class="muted">Selecione um aluno.</div>`;
    return;
  }
  if(!plans[sid] || !Object.keys(plans[sid]).length){
    box.innerHTML = `<div class="muted">Nenhum treino criado para este aluno ainda.</div>`;
    return;
  }

  Object.keys(plans[sid]).forEach(day=>{
    const dayDiv=document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${escapeHtml(day)}</b>`;
    box.appendChild(dayDiv);

    plans[sid][day].forEach(it=>{
      const item=document.createElement("div");
      item.className="item";
      const emb=youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${escapeHtml(it.name)}</b> (${escapeHtml(it.group)}) — ${escapeHtml(it.sets)}x${escapeHtml(it.reps)} • Descanso: ${escapeHtml(it.rest)}</div>
        ${it.note ? `<div class="muted">Obs: ${escapeHtml(it.note)}</div>` : ``}
        ${emb ? `<div class="video-box"><iframe src="${emb}" allowfullscreen></iframe></div>` : ``}
      `;
      dayDiv.appendChild(item);
    });
  });
}

function renderPlansStudent(){
  const auth=getAuth();
  const sid=auth?.studentId;
  const box=$("#studentPlanPreview");
  box.innerHTML="";

  if(!sid || !plans[sid] || !Object.keys(plans[sid]).length){
    box.innerHTML = `<div class="muted">Seu treino ainda não foi criado.</div>`;
    return;
  }

  Object.keys(plans[sid]).forEach(day=>{
    const dayDiv=document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${escapeHtml(day)}</b>`;
    box.appendChild(dayDiv);

    plans[sid][day].forEach(it=>{
      const item=document.createElement("div");
      item.className="item";
      const emb=youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${escapeHtml(it.name)}</b> (${escapeHtml(it.group)}) — ${escapeHtml(it.sets)}x${escapeHtml(it.reps)} • ${escapeHtml(it.rest)}</div>
        ${it.note ? `<div class="muted">Obs: ${escapeHtml(it.note)}</div>` : ``}
        ${emb ? `<div class="video-box"><iframe src="${emb}" allowfullscreen></iframe></div>` : ``}
      `;
      dayDiv.appendChild(item);
    });
  });
}

function clearDay(){
  const sid=$("#planStudent").value;
  const day=$("#planDay").value;
  if(!sid || !day || !plans[sid] || !plans[sid][day]) return setStatus("Nada para limpar",false);
  if(!confirm(`Limpar treino de: ${day}?`)) return;

  delete plans[sid][day];
  saveAll();
  setStatus("Dia limpo",true);
  renderPlansAdmin();
  renderDashboard();
}

function clearAllPlans(){
  const sid=$("#planStudent").value;
  if(!sid) return setStatus("Selecione um aluno",false);
  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  delete plans[sid];
  saveAll();
  setStatus("Treinos apagados",true);
  renderPlansAdmin();
  renderDashboard();
}

/* =========================
   VÍDEOS (ALUNO) ✅ NOVO
========================= */
function fillStudentGroups(){
  const sel = $("#studentFilterGroup");
  if(!sel) return;
  sel.innerHTML = `<option value="ALL">Todos</option>`;
  groups.forEach(g => sel.innerHTML += `<option value="${g}">${g}</option>`);
}

function renderVideosStudent(){
  const grid = $("#studentVideosGrid");
  if(!grid) return;

  const q = ($("#studentSearch")?.value || "").trim().toLowerCase();
  const g = ($("#studentFilterGroup")?.value || "ALL");

  const list = exercises
    .filter(e => (g==="ALL" || e.group===g) && e.name.toLowerCase().includes(q))
    .sort((a,b)=> a.name.localeCompare(b.name, "pt-BR"));

  if(!list.length){
    grid.innerHTML = `<div class="muted">Nenhum exercício encontrado.</div>`;
    return;
  }

  grid.innerHTML = list.map(e=>{
    const emb = youtubeToEmbed(e.youtube);
    return `
      <div class="card">
        <div class="card-title">${escapeHtml(e.name)}</div>
        <div class="muted">${escapeHtml(e.group)}</div>
        ${emb
          ? `<div class="video-box"><iframe src="${emb}" allowfullscreen></iframe></div>`
          : (e.youtube
              ? `<a class="btn primary" target="_blank" rel="noopener" href="${e.youtube}">Abrir no YouTube</a>`
              : `<div class="muted">Sem vídeo cadastrado.</div>`
            )
        }
      </div>
    `;
  }).join("");
}

function bindStudentVideos(){
  const s = $("#studentSearch");
  const f = $("#studentFilterGroup");
  if(s) s.oninput = renderVideosStudent;
  if(f) f.onchange = renderVideosStudent;
}

/* =========================
   BACKUP (textarea)
========================= */
function exportBackup(){
  const data = {
    exportedAt: nowISO(),
    groups, exercises, students, plans, models
  };
  $("#backupText").value = JSON.stringify(data, null, 2);
  setStatus("Backup exportado no textarea",true);
}

function importBackupFromTextarea(){
  const txt = $("#backupText").value.trim();
  if(!txt) return setStatus("Cole o backup no textarea",false);

  try{
    const data = JSON.parse(txt);
    if(data.groups) groups = data.groups;
    if(data.exercises) exercises = data.exercises;
    if(data.students) students = data.students;
    if(data.plans) plans = data.plans;
    if(data.models) models = data.models;

    saveAll();
    setStatus("Backup importado",true);

    // atualiza UI
    fillGroups();
    fillStudentGroups();     // ✅
    fillStudentsSelect();
    fillPlanDays();
    renderDashboard();
    renderStudents();
    renderExercises();
    renderPlansAdmin();
    renderVideosStudent();   // ✅
  }catch{
    setStatus("Backup inválido",false);
  }
}

/* =========================
   MENU
========================= */
function bindMenu(){
  $$(".menu-item").forEach(btn=>{
    btn.onclick=()=>{
      showView(btn.dataset.view);
      const auth=getAuth();

      if(auth?.role==="admin"){
        if(btn.dataset.view==="dashboard") renderDashboard();
        if(btn.dataset.view==="alunos") renderStudents();
        if(btn.dataset.view==="exercicios") renderExercises();
        if(btn.dataset.view==="treinos") renderPlansAdmin();
      }else{
        if(btn.dataset.view==="videos") renderVideosStudent();     // ✅
        if(btn.dataset.view==="meutreino") renderPlansStudent();
      }
    };
  });
}

/* =========================
   INIT
========================= */
async function init(){
  loadAll();
  await loadDefaultsIfEmpty();

  fillGroups();
  fillStudentGroups();      // ✅
  fillStudentsSelect();
  fillPlanDays();

  bindLoginTabs();
  bindBulk();
  bindMenu();
  bindStudentVideos();      // ✅

  // binds gerais
  $("#btnLoginAdmin").onclick = loginAdmin;
  $("#btnLoginAluno").onclick = loginAluno;
  $("#btnLogout").onclick = logout;

  $("#btnAddStudent").onclick = addStudent;
  $("#btnAddExercise").onclick = addExercise;
  $("#filterGroup").onchange = renderExercises;
  $("#searchExercise").oninput = renderExercises;

  $("#planGroup").onchange = fillPlanExercises;
  $("#planStudent").onchange = renderPlansAdmin;
  $("#btnAddModel").onclick = addModel;
  $("#btnAddToPlan").onclick = addToPlan;

  $("#btnClearDay").onclick = clearDay;
  $("#btnClearAllPlans").onclick = clearAllPlans;

  $("#btnExport").onclick = exportBackup;

  // IMPORT por arquivo (opcional) + textarea
  $("#importFile").onchange = async ()=>{
    const f=$("#importFile").files[0];
    if(!f) return;
    const txt = await f.text();
    $("#backupText").value = txt;
    setStatus("Arquivo carregado no textarea. Clique Exportar/Importar pelo texto.", true);
  };

  // (Importar pelo textarea com Ctrl+Enter)
  $("#backupText").addEventListener("keydown",(e)=>{
    if(e.ctrlKey && e.key==="Enter") importBackupFromTextarea();
  });

  // AUTH
  const auth = getAuth();
  if(!auth){
    $("#loginScreen").classList.remove("hidden");
    $("#app").classList.add("hidden");
    return;
  }

  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");

  if(auth.role==="admin"){
    $("#menuAluno").classList.add("hidden");
    $("#menuAdmin").classList.remove("hidden");
    $("#roleSub").textContent="Administrador(a)";
    $("#welcomeLine").textContent="Bem-vindo(a), Administrador(a).";
    showView("dashboard");
    renderDashboard();
    renderStudents();
    renderExercises();
    fillPlanExercises();
  }else{
    $("#menuAdmin").classList.add("hidden");
    $("#menuAluno").classList.remove("hidden");
    $("#roleSub").textContent="Aluno";
    const st = students.find(s=>s.id===auth.studentId);
    $("#welcomeLine").textContent = st ? `Olá, ${st.name}.` : "Olá!";

    // ✅ AGORA O ALUNO ENTRA DIRETO EM VÍDEOS
    showView("videos");
    renderVideosStudent();
  }
}

init();

