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

// ✅ "Comece por aqui" (procura por palavras no nome do exercício)
const START_HERE = ["Aquecimento","Mobilidade","Alongamento","Prancha","Agachamento","Flexão"];

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
function youtubeId(url){
  if(!url) return "";
  const u = url.trim();
  if(u.includes("youtu.be/")) return u.split("youtu.be/")[1].split("?")[0];
  if(u.includes("watch?v=")) return u.split("watch?v=")[1].split("&")[0];
  if(u.includes("shorts/")) return u.split("shorts/")[1].split("?")[0];
  return "";
}
function youtubeThumb(url){
  const id = youtubeId(url);
  if(!id) return "";
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
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
    meutreino:"Meu Treino",
    videos:"Vídeos"
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
  const studentFilterGroup=$("#studentFilterGroup");

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
  if(studentFilterGroup){
    studentFilterGroup.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g=> studentFilterGroup.innerHTML += `<option value="${g}">${g}</option>`);
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
  models.forEach(m=> sel.innerHTML += `<option value="${m}">${m}</option>`);
}

function fillPlanExercises(){
  const g = $("#planGroup")?.value;
  const sel = $("#planExercise");
  if(!sel || !g) return;
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
  setStatus("Aluno criado ✅",true);
  renderStudents();
  fillStudentsSelect();
  renderDashboard();
}

function renderStudents(){
  const tb=$("#studentsTable tbody");
  if(!tb) return;
  tb.innerHTML="";
  students.forEach(s=>{
    tb.innerHTML += `
      <tr>
        <td>${s.name}</td>
        <td>${s.username}</td>
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
   EXERCISES (ADM)
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
  setStatus("Exercício adicionado ✅",true);
  renderExercises();
  renderDashboard();
}

function renderExercises(){
  const tb=$("#exercisesTable tbody");
  if(!tb) return;

  tb.innerHTML="";
  const f=$("#filterGroup").value;
  const q=$("#searchExercise").value.trim().toLowerCase();

  exercises
    .filter(e => (f==="ALL" || e.group===f) && e.name.toLowerCase().includes(q))
    .forEach(e=>{
      const hasVideo = !!youtubeToEmbed(e.youtube);
      tb.innerHTML += `
        <tr>
          <td>${e.group}</td>
          <td>${e.name}</td>
          <td>${hasVideo ? "OK" : "—"}</td>
          <td>
            <button class="btn" type="button" onclick="editExercise('${e.id}')">Editar</button>
            <button class="btn danger" type="button" onclick="deleteExercise('${e.id}')">Excluir</button>
          </td>
        </tr>`;
    });

  fillPlanExercises();
}

window.deleteExercise = function(id){
  if(!confirm("Excluir exercício?")) return;
  exercises = exercises.filter(e=>e.id!==id);

  // remove do treino
  Object.values(plans).forEach(p=>{
    Object.keys(p).forEach(day=>{
      p[day] = (p[day]||[]).filter(it=>it.exerciseId!==id);
    });
  });

  saveAll();
  setStatus("Exercício excluído ✅", true);
  renderExercises();
  renderDashboard();
};

window.editExercise = function(id){
  const ex = exercises.find(e => e.id === id);
  if(!ex) return;

  const newName = (prompt("Editar nome do exercício:", ex.name) || "").trim();
  if(!newName) return;

  const newYoutube = (prompt("Editar link do YouTube (pode deixar vazio):", ex.youtube || "") || "").trim();

  ex.name = newName;
  ex.youtube = newYoutube;

  // atualiza nos treinos já criados
  Object.values(plans).forEach(p=>{
    Object.keys(p || {}).forEach(day=>{
      (p[day] || []).forEach(it=>{
        if(it.exerciseId === id){
          it.name = newName;
          it.youtube = newYoutube;
          it.group = ex.group;
        }
      });
    });
  });

  saveAll();
  setStatus("Exercício editado ✅", true);
  renderExercises();
  renderDashboard();

  if(!$("#view-treinos")?.classList.contains("hidden")) renderPlansAdmin();
  if(!$("#view-videos")?.classList.contains("hidden")) renderVideosStudent();
};

/* =========================
   BULK ADD
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
    setStatus(`Lote salvo: ${count} exercícios ✅`,true);
    renderExercises();
    renderDashboard();
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
  setStatus("Modelo adicionado ✅",true);
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
  setStatus("Adicionado no treino ✅",true);
  renderPlansAdmin();
  renderDashboard();
}

function renderPlansAdmin(){
  const sid=$("#planStudent")?.value;
  const box=$("#planPreview");
  if(!box) return;

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
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (plans[sid][day]||[]).forEach(it=>{
      const item=document.createElement("div");
      item.className="item";
      const emb=youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${it.name}</b> (${it.group}) — ${it.sets}x${it.reps} • Descanso: ${it.rest}</div>
        ${it.note ? `<div class="muted">Obs: ${it.note}</div>` : ``}
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
  if(!box) return;

  box.innerHTML="";

  if(!sid || !plans[sid] || !Object.keys(plans[sid]).length){
    box.innerHTML = `<div class="muted">Seu treino ainda não foi criado.</div>`;
    return;
  }

  Object.keys(plans[sid]).forEach(day=>{
    const dayDiv=document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (plans[sid][day]||[]).forEach(it=>{
      const item=document.createElement("div");
      item.className="item";
      const emb=youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${it.name}</b> (${it.group}) — ${it.sets}x${it.reps} • ${it.rest}</div>
        ${it.note ? `<div class="muted">Obs: ${it.note}</div>` : ``}
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
  setStatus("Dia limpo ✅",true);
  renderPlansAdmin();
  renderDashboard();
}

function clearAllPlans(){
  const sid=$("#planStudent").value;
  if(!sid) return setStatus("Selecione um aluno",false);
  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  delete plans[sid];
  saveAll();
  setStatus("Treinos apagados ✅",true);
  renderPlansAdmin();
  renderDashboard();
}

/* =========================
   VÍDEOS (ALUNO) Netflix + Comece por aqui
========================= */
function renderVideosStudent(){
  const q = ($("#studentSearch")?.value || "").trim().toLowerCase();
  const gFilter = $("#studentFilterGroup")?.value || "ALL";
  const grid = $("#studentVideosGrid");
  if(!grid) return;

  $("#view-videos")?.classList.add("netflix-page");

  // ✅ recepção com nome
  const auth = getAuth();
  const st = students.find(s=>s.id===auth?.studentId);
  const welcomeTitle = $("#welcomeStudentTitle");
  const welcomeText  = $("#welcomeStudentText");
  if(welcomeTitle) welcomeTitle.textContent = st ? `Bem-vindo(a), ${st.name}!` : "Bem-vindo(a)!";
  if(welcomeText) welcomeText.textContent = "Comece por aqui: assista aos vídeos iniciais e depois explore os grupos abaixo.";

  grid.innerHTML = "";

  const isStartHere = (ex) => START_HERE.some(s => ex.name.toLowerCase().includes(s.toLowerCase()));

  const rows = document.createElement("div");
  rows.className = "rows";
  grid.appendChild(rows);

  // 1) Comece por aqui
  const startFiltered = exercises.filter(ex=>{
    if(!isStartHere(ex)) return false;
    if(gFilter !== "ALL" && ex.group !== gFilter) return false;
    if(q && !ex.name.toLowerCase().includes(q)) return false;
    return true;
  });

  if(startFiltered.length){
    const row = document.createElement("div");
    row.innerHTML = `
      <div class="nx-row-title">Comece por aqui</div>
      <div class="nx-track"></div>
    `;
    rows.appendChild(row);

    const track = row.querySelector(".nx-track");

    startFiltered.forEach(ex=>{
      const thumb = youtubeThumb(ex.youtube);

      const card = document.createElement("div");
      card.className = "nx-card";
      card.onclick = ()=> openVideoModal(ex);

      card.innerHTML = `
        ${thumb
          ? `<img class="nx-thumb" src="${thumb}" alt="thumb">`
          : `<div class="nx-thumb" style="display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-weight:700;">SEM VÍDEO</div>`
        }
        <div class="nx-meta">
          <div class="nx-name">${ex.name}</div>
          <div class="nx-sub">${ex.youtube ? "Toque para assistir" : "Vídeo não cadastrado"}</div>
        </div>
      `;
      track.appendChild(card);
    });
  }

  // 2) Grupos normais
  const byGroup = {};
  exercises.forEach(ex=>{
    if(gFilter !== "ALL" && ex.group !== gFilter) return;
    if(q && !ex.name.toLowerCase().includes(q)) return;
    if(isStartHere(ex)) return; // evita duplicar

    if(!byGroup[ex.group]) byGroup[ex.group] = [];
    byGroup[ex.group].push(ex);
  });

  const groupsSorted = Object.keys(byGroup);

  if(!groupsSorted.length && !startFiltered.length){
    rows.innerHTML = `<div class="muted">Nenhum exercício encontrado.</div>`;
    return;
  }

  groupsSorted.forEach(group=>{
    const list = byGroup[group];
    if(!list.length) return;

    const row = document.createElement("div");
    row.innerHTML = `
      <div class="nx-row-title">${group}</div>
      <div class="nx-track"></div>
    `;
    rows.appendChild(row);

    const track = row.querySelector(".nx-track");

    list.forEach(ex=>{
      const thumb = youtubeThumb(ex.youtube);

      const card = document.createElement("div");
      card.className = "nx-card";
      card.onclick = ()=> openVideoModal(ex);

      card.innerHTML = `
        ${thumb
          ? `<img class="nx-thumb" src="${thumb}" alt="thumb">`
          : `<div class="nx-thumb" style="display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-weight:700;">SEM VÍDEO</div>`
        }
        <div class="nx-meta">
          <div class="nx-name">${ex.name}</div>
          <div class="nx-sub">${ex.youtube ? "Toque para assistir" : "Vídeo não cadastrado"}</div>
        </div>
      `;
      track.appendChild(card);
    });
  });
}

/* =========================
   MODAL PLAYER
========================= */
function openVideoModal(ex){
  const modal = $("#videoModal");
  const iframe = $("#modalIframe");
  const title = $("#modalTitle");
  if(!modal || !iframe || !title) return;

  title.textContent = ex.name;

  const emb = youtubeToEmbed(ex.youtube);
  iframe.src = emb ? (emb + "?autoplay=1&rel=0") : "";

  modal.classList.remove("hidden");
}
function closeVideoModal(){
  const modal = $("#videoModal");
  const iframe = $("#modalIframe");
  if(iframe) iframe.src = "";
  if(modal) modal.classList.add("hidden");
}

/* =========================
   BACKUP
========================= */
function exportBackup(){
  const data = { exportedAt: nowISO(), groups, exercises, students, plans, models };
  $("#backupText").value = JSON.stringify(data, null, 2);
  setStatus("Backup exportado ✅",true);
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
        if(btn.dataset.view==="videos") renderVideosStudent();
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
  fillStudentsSelect();
  fillPlanDays();

  bindLoginTabs();
  bindBulk();
  bindMenu();

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

  // IMPORT opcional
  $("#importFile").onchange = async ()=>{
    const f=$("#importFile").files[0];
    if(!f) return;
    const txt = await f.text();
    $("#backupText").value = txt;
    setStatus("Arquivo carregado no textarea ✅", true);
  };

  // fechar modal (seguro: só se existir)
  const mc = $("#modalClose");
  const mx = $("#modalX");
  if(mc) mc.onclick = closeVideoModal;
  if(mx) mx.onclick = closeVideoModal;

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

    // abre em vídeos
    showView("videos");
    renderVideosStudent();

    // busca e filtro no aluno
    const ss = $("#studentSearch");
    const sf = $("#studentFilterGroup");
    if(ss) ss.oninput = renderVideosStudent;
    if(sf) sf.onchange = renderVideosStudent;
  }
}

init();



