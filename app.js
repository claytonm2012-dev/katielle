/* ========= CONFIG ========= */
// Troque aqui a senha do ADM (recomendado)
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "The152max@"; // <- altere se quiser

/* ========= STORAGE KEYS ========= */
const KEY_EX = "consultoria_exercises_v1";
const KEY_ST = "consultoria_students_v1";
const KEY_PL = "consultoria_plans_v1";
const KEY_AUTH = "consultoria_auth_v1";
const KEY_GROUPS = "consultoria_groups_v1";

/* ========= STATE ========= */
let groups = ["Peitoral","Costas","Pernas","Ombros","Braços","Abdômen"];
let exercises = []; // {id,group,name,youtube}
let students = [];  // {id,name,planMonths,expiresAt,createdAt}
let plans = {};     // { [studentId]: { [dayName]: [items...] } }
                   // item: { id, exerciseId, group, name, youtube, sets, reps, rest, note }

/* ========= HELPERS ========= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function uid(prefix="id"){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function nowISO(){ return new Date().toISOString(); }
function addMonths(date, months){
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}
function fmtDate(iso){
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
function daysLeft(iso){
  const diff = new Date(iso) - new Date();
  return Math.ceil(diff / (1000*60*60*24));
}
function setStatus(msg, ok=true){
  const pill = $("#statusPill");
  pill.textContent = msg;
  pill.style.borderColor = ok ? "rgba(24,195,125,.35)" : "rgba(229,9,20,.55)";
  pill.style.background = ok ? "rgba(24,195,125,.12)" : "rgba(229,9,20,.12)";
  pill.style.color = ok ? "#18c37d" : "#ffb9bd";
}

function saveAll(){
  localStorage.setItem(KEY_GROUPS, JSON.stringify(groups));
  localStorage.setItem(KEY_EX, JSON.stringify(exercises));
  localStorage.setItem(KEY_ST, JSON.stringify(students));
  localStorage.setItem(KEY_PL, JSON.stringify(plans));
}
function loadAll(){
  const g = localStorage.getItem(KEY_GROUPS);
  const ex = localStorage.getItem(KEY_EX);
  const st = localStorage.getItem(KEY_ST);
  const pl = localStorage.getItem(KEY_PL);

  if (g) groups = JSON.parse(g);
  if (ex) exercises = JSON.parse(ex);
  if (st) students = JSON.parse(st);
  if (pl) plans = JSON.parse(pl);
}

async function loadDefaultsIfEmpty(){
  // Se já tiver dados, não sobrescreve
  if (localStorage.getItem(KEY_EX)) return;

  try{
    const res = await fetch("data.json", { cache: "no-store" });
    if(!res.ok) throw new Error("Falha ao ler data.json");
    const json = await res.json();

    if (Array.isArray(json.groups) && json.groups.length) groups = json.groups;
    if (Array.isArray(json.exercises)) exercises = json.exercises;

    saveAll();
  }catch(e){
    // Se falhar, segue com groups padrão e lista vazia
    if(!exercises.length) exercises = [];
    saveAll();
  }
}

/* ========= AUTH ========= */
function isAuthed(){
  return localStorage.getItem(KEY_AUTH) === "1";
}
function setAuthed(v){
  localStorage.setItem(KEY_AUTH, v ? "1" : "0");
}
function logout(){
  setAuthed(false);
  $("#app").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}

/* ========= NAV ========= */
function showView(view){
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");

  $$(".menu-item").forEach(b => b.classList.remove("active"));
  document.querySelector(`.menu-item[data-view="${view}"]`).classList.add("active");

  const titles = {
    dashboard: "Painel Administrativo",
    alunos: "Alunos",
    exercicios: "Exercícios",
    treinos: "Treinos",
    backup: "Backup"
  };
  $("#viewTitle").textContent = titles[view] || "Painel";
}

/* ========= RENDER: DASH ========= */
function renderDashboard(){
  $("#dashStudents").textContent = students.length;

  $("#dashExercises").textContent = exercises.length;

  // conta dias/planos
  let totalDays = 0;
  Object.values(plans).forEach(byDay=>{
    totalDays += Object.keys(byDay || {}).length;
  });
  $("#dashPlans").textContent = totalDays;
}

/* ========= RENDER: STUDENTS ========= */
function renderStudents(){
  const tbody = $("#studentsTable tbody");
  tbody.innerHTML = "";

  const sorted = [...students].sort((a,b)=> a.name.localeCompare(b.name,"pt-BR"));
  sorted.forEach(s=>{
    const left = daysLeft(s.expiresAt);
    const active = left >= 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${s.planMonths} meses</td>
      <td>${fmtDate(s.expiresAt)} <span class="muted small">(${left}d)</span></td>
      <td>${active ? `<span class="tag ok">Ativo</span>` : `<span class="tag bad">Vencido</span>`}</td>
      <td class="right">
        <button class="icon-btn" data-act="renew" data-id="${s.id}">Renovar</button>
        <button class="icon-btn" data-act="del" data-id="${s.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "del") deleteStudent(id);
      if (act === "renew") renewStudent(id);
    });
  });

  // Select do aluno em Treinos
  fillStudentsSelect();
}

/* ========= STUDENTS CRUD ========= */
function addStudent(){
  const name = $("#studentName").value.trim();
  const planMonths = Number($("#studentPlan").value);

  if (!name) return setStatus("Informe o nome do aluno", false);

  const createdAt = nowISO();
  const expiresAt = addMonths(new Date(), planMonths).toISOString();

  students.push({ id: uid("st"), name, planMonths, createdAt, expiresAt });
  saveAll();

  $("#studentName").value = "";
  setStatus("Aluno adicionado", true);
  renderStudents();
  renderDashboard();
}

function deleteStudent(id){
  if(!confirm("Excluir aluno? Isso apaga também os treinos dele.")) return;

  students = students.filter(s=>s.id!==id);
  delete plans[id];
  saveAll();

  setStatus("Aluno excluído", true);
  renderStudents();
  renderPlansPreview(); // se estiver aberto
  renderDashboard();
}

function renewStudent(id){
  const s = students.find(x=>x.id===id);
  if(!s) return;

  const months = prompt("Renovar por quantos meses? (3 / 6 / 12)", String(s.planMonths)) || "";
  const m = Number(months);
  if(![3,6,12].includes(m)) return setStatus("Valor inválido. Use 3, 6 ou 12.", false);

  s.planMonths = m;
  s.expiresAt = addMonths(new Date(), m).toISOString();
  saveAll();

  setStatus("Plano renovado", true);
  renderStudents();
}

/* ========= EXERCISES ========= */
function fillGroupsSelects(){
  const exGroup = $("#exGroup");
  const planGroup = $("#planGroup");
  const filterGroup = $("#filterGroup");
  const editGroup = $("#editGroup");

  [exGroup, planGroup, editGroup].forEach(sel=>{
    sel.innerHTML = "";
    groups.forEach(g=>{
      const o = document.createElement("option");
      o.value = g; o.textContent = g;
      sel.appendChild(o);
    });
  });

  filterGroup.innerHTML = "";
  const all = document.createElement("option");
  all.value = "__ALL__";
  all.textContent = "Todos os grupos";
  filterGroup.appendChild(all);
  groups.forEach(g=>{
    const o = document.createElement("option");
    o.value = g; o.textContent = g;
    filterGroup.appendChild(o);
  });
}

function renderExercises(){
  const tbody = $("#exercisesTable tbody");
  tbody.innerHTML = "";

  const filter = $("#filterGroup").value || "__ALL__";
  const q = ($("#searchExercise").value || "").trim().toLowerCase();

  let list = [...exercises];
  if (filter !== "__ALL__") list = list.filter(e=>e.group===filter);
  if (q) list = list.filter(e=> (e.name||"").toLowerCase().includes(q));

  list.sort((a,b)=> a.group.localeCompare(b.group,"pt-BR") || a.name.localeCompare(b.name,"pt-BR"));

  list.forEach(e=>{
    const has = (e.youtube||"").trim().length > 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.group)}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${has ? `<a class="link" href="${escapeAttr(e.youtube)}" target="_blank" rel="noopener">Abrir</a>` : `<span class="muted">—</span>`}</td>
      <td class="right">
        <button class="icon-btn" data-act="edit" data-id="${e.id}">Editar</button>
        <button class="icon-btn" data-act="del" data-id="${e.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "del") deleteExercise(id);
      if (act === "edit") openEditExercise(id);
    });
  });

  // Atualiza o select de exercício nos treinos
  fillPlanExerciseSelect();
  renderDashboard();
}

function addExercise(){
  const group = $("#exGroup").value;
  const name = $("#exName").value.trim();
  const youtube = $("#exYoutube").value.trim();

  if (!name) return setStatus("Digite o nome do exercício", false);

  exercises.push({ id: uid("ex"), group, name, youtube });
  saveAll();

  $("#exName").value = "";
  $("#exYoutube").value = "";
  setStatus("Exercício adicionado", true);
  renderExercises();
}

function deleteExercise(id){
  if(!confirm("Excluir exercício?")) return;

  exercises = exercises.filter(e=>e.id!==id);

  // também remove do treino onde estiver
  Object.keys(plans).forEach(stId=>{
    const byDay = plans[stId] || {};
    Object.keys(byDay).forEach(day=>{
      byDay[day] = (byDay[day]||[]).filter(it=>it.exerciseId!==id);
    });
  });

  saveAll();
  setStatus("Exercício excluído", true);
  renderExercises();
  renderPlansPreview();
}

/* ========= EDIT MODAL ========= */
let editingExerciseId = null;

function openEditExercise(id){
  const e = exercises.find(x=>x.id===id);
  if(!e) return;

  editingExerciseId = id;
  $("#editGroup").value = e.group;
  $("#editName").value = e.name || "";
  $("#editYoutube").value = e.youtube || "";

  $("#modal").classList.remove("hidden");
}
function closeModal(){
  $("#modal").classList.add("hidden");
  editingExerciseId = null;
}
function saveEditExercise(){
  const e = exercises.find(x=>x.id===editingExerciseId);
  if(!e) return;

  e.group = $("#editGroup").value;
  e.name = $("#editName").value.trim();
  e.youtube = $("#editYoutube").value.trim();

  if(!e.name) return setStatus("Nome do exercício não pode ficar vazio", false);

  // Atualiza nos planos (para manter nome e grupo sincronizados)
  Object.keys(plans).forEach(stId=>{
    const byDay = plans[stId] || {};
    Object.keys(byDay).forEach(day=>{
      (byDay[day]||[]).forEach(it=>{
        if(it.exerciseId === e.id){
          it.group = e.group;
          it.name = e.name;
          it.youtube = e.youtube;
        }
      });
    });
  });

  saveAll();
  setStatus("Exercício atualizado", true);
  closeModal();
  renderExercises();
  renderPlansPreview();
}
function deleteFromModal(){
  if(!editingExerciseId) return;
  closeModal();
  deleteExercise(editingExerciseId);
}

/* ========= PLANS / TREINOS ========= */
function fillStudentsSelect(){
  const sel = $("#planStudent");
  sel.innerHTML = "";

  const sorted = [...students].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  sorted.forEach(s=>{
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });

  renderPlansPreview();
}

function fillPlanExerciseSelect(){
  const group = $("#planGroup").value;
  const sel = $("#planExercise");
  sel.innerHTML = "";

  const list = exercises.filter(e=>e.group===group).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  list.forEach(e=>{
    const o = document.createElement("option");
    o.value = e.id;
    o.textContent = e.name;
    sel.appendChild(o);
  });
}

function addToPlan(){
  const studentId = $("#planStudent").value;
  if(!studentId) return setStatus("Cadastre um aluno primeiro", false);

  const day = $("#planDay").value;
  const group = $("#planGroup").value;
  const exerciseId = $("#planExercise").value;
  const ex = exercises.find(e=>e.id===exerciseId);

  if(!ex) return setStatus("Selecione um exercício", false);

  const sets = String($("#planSets").value || "").trim();
  const reps = String($("#planReps").value || "").trim();
  const rest = String($("#planRest").value || "").trim();
  const note = String($("#planNote").value || "").trim();

  if(!plans[studentId]) plans[studentId] = {};
  if(!plans[studentId][day]) plans[studentId][day] = [];

  plans[studentId][day].push({
    id: uid("it"),
    exerciseId: ex.id,
    group,
    name: ex.name,
    youtube: ex.youtube,
    sets: sets || "3",
    reps: reps || "8-12",
    rest: rest || "60s",
    note
  });

  saveAll();
  setStatus("Adicionado ao treino", true);

  $("#planReps").value = "";
  $("#planRest").value = "";
  $("#planNote").value = "";

  renderPlansPreview();
  renderDashboard();
}

function renderPlansPreview(){
  const wrap = $("#planPreview");
  if(!wrap) return;

  const studentId = $("#planStudent").value;
  if(!studentId){
    wrap.innerHTML = `<div class="muted">Cadastre um aluno para montar o treino.</div>`;
    return;
  }

  const byDay = plans[studentId] || {};
  const days = Object.keys(byDay);

  if(!days.length){
    wrap.innerHTML = `<div class="muted">Nenhum treino criado para este aluno ainda.</div>`;
    return;
  }

  // ordem amigável
  const order = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo","A","B","C","D"];
  days.sort((a,b)=> order.indexOf(a) - order.indexOf(b));

  wrap.innerHTML = "";
  days.forEach(day=>{
    const items = byDay[day] || [];
    const box = document.createElement("div");
    box.className = "plan-day";

    const htmlItems = items.map((it, idx)=>`
      <div class="plan-item">
        <div>
          <div><b>${escapeHtml(it.name)}</b> <span class="muted">(${escapeHtml(it.group)})</span></div>
          <div class="muted">${it.youtube ? `<a class="link" target="_blank" rel="noopener" href="${escapeAttr(it.youtube)}">ver vídeo</a>` : "sem vídeo"}</div>
        </div>
        <div><span class="muted">Séries</span><br><b>${escapeHtml(it.sets)}</b></div>
        <div><span class="muted">Reps</span><br><b>${escapeHtml(it.reps)}</b></div>
        <div><span class="muted">Desc</span><br><b>${escapeHtml(it.rest)}</b></div>
        <div class="muted">${escapeHtml(it.note || "")}</div>
        <div class="row gap">
          <button class="icon-btn" data-act="up" data-day="${escapeAttr(day)}" data-id="${it.id}">↑</button>
          <button class="icon-btn" data-act="down" data-day="${escapeAttr(day)}" data-id="${it.id}">↓</button>
          <button class="icon-btn" data-act="del" data-day="${escapeAttr(day)}" data-id="${it.id}">✕</button>
        </div>
      </div>
    `).join("");

    box.innerHTML = `
      <div class="row between">
        <h4>${escapeHtml(day)}</h4>
        <span class="muted">${items.length} exercício(s)</span>
      </div>
      ${htmlItems}
    `;
    wrap.appendChild(box);
  });

  wrap.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.dataset.act;
      const day = btn.dataset.day;
      const id = btn.dataset.id;
      if(act==="del") removePlanItem(studentId, day, id);
      if(act==="up") movePlanItem(studentId, day, id, -1);
      if(act==="down") movePlanItem(studentId, day, id, +1);
    });
  });
}

function removePlanItem(studentId, day, itemId){
  const list = (plans[studentId]?.[day]) || [];
  plans[studentId][day] = list.filter(it=>it.id!==itemId);

  if(plans[studentId][day].length === 0){
    delete plans[studentId][day];
  }
  saveAll();
  setStatus("Item removido", true);
  renderPlansPreview();
  renderDashboard();
}

function movePlanItem(studentId, day, itemId, dir){
  const list = (plans[studentId]?.[day]) || [];
  const i = list.findIndex(it=>it.id===itemId);
  if(i<0) return;
  const j = i + dir;
  if(j<0 || j>=list.length) return;

  const tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;

  plans[studentId][day] = list;
  saveAll();
  renderPlansPreview();
}

function clearDay(){
  const studentId = $("#planStudent").value;
  const day = $("#planDay").value;
  if(!studentId) return;

  if(!confirm(`Limpar o dia "${day}" deste aluno?`)) return;

  if(plans[studentId]) delete plans[studentId][day];
  saveAll();
  setStatus("Dia limpo", true);
  renderPlansPreview();
  renderDashboard();
}

function clearAllPlans(){
  const studentId = $("#planStudent").value;
  if(!studentId) return;

  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  delete plans[studentId];
  saveAll();
  setStatus("Treinos apagados", true);
  renderPlansPreview();
  renderDashboard();
}

/* ========= BACKUP ========= */
function exportJSON(){
  const payload = {
    version: 1,
    exportedAt: nowISO(),
    groups,
    exercises,
    students,
    plans
  };
  const text = JSON.stringify(payload, null, 2);
  $("#backupText").value = text;

  // download automático
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_consultoria_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  setStatus("Backup exportado", true);
}

function importJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const obj = JSON.parse(reader.result);

      if(!obj || obj.version !== 1) throw new Error("Arquivo inválido");
      groups = obj.groups || groups;
      exercises = obj.exercises || [];
      students = obj.students || [];
      plans = obj.plans || {};

      saveAll();

      setStatus("Backup importado", true);
      fillGroupsSelects();
      renderExercises();
      renderStudents();
      renderPlansPreview();
      renderDashboard();
    }catch(e){
      setStatus("Falha ao importar JSON", false);
    }
  };
  reader.readAsText(file);
}

/* ========= SAFE HTML ========= */
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("`",""); }

/* ========= INIT ========= */
function bindEvents(){
  // Login
  $("#btnLogin").addEventListener("click", ()=>{
    const u = ($("#loginUser").value || "").trim();
    const p = ($("#loginPass").value || "").trim();

    if(u === ADMIN_USER && p === ADMIN_PASSWORD){
      setAuthed(true);
      $("#loginMsg").textContent = "";
      $("#loginScreen").classList.add("hidden");
      $("#app").classList.remove("hidden");
      setStatus("Logado", true);
      bootAppUI();
    }else{
      $("#loginMsg").textContent = "Usuário ou senha inválidos.";
      setStatus("Erro", false);
    }
  });

  $("#btnLogout").addEventListener("click", logout);

  // Menu
  $$(".menu-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      showView(btn.dataset.view);
      // render por view
      if(btn.dataset.view==="dashboard") renderDashboard();
      if(btn.dataset.view==="alunos") renderStudents();
      if(btn.dataset.view==="exercicios") renderExercises();
      if(btn.dataset.view==="treinos") renderPlansPreview();
    });
  });

  // Atalhos
  $$("[data-go]").forEach(b=>{
    b.addEventListener("click", ()=> showView(b.dataset.go));
  });

  // Alunos
  $("#btnAddStudent").addEventListener("click", addStudent);

  // Exercícios
  $("#btnAddExercise").addEventListener("click", addExercise);
  $("#filterGroup").addEventListener("change", renderExercises);
  $("#searchExercise").addEventListener("input", renderExercises);

  // Modal
  $("#btnCloseModal").addEventListener("click", closeModal);
  $("#btnSaveExercise").addEventListener("click", saveEditExercise);
  $("#btnDeleteExercise").addEventListener("click", deleteFromModal);
  $("#modal").addEventListener("click", (e)=>{
    if(e.target.id==="modal") closeModal();
  });

  // Treinos
  $("#planGroup").addEventListener("change", ()=> {
    fillPlanExerciseSelect();
  });
  $("#planStudent").addEventListener("change", renderPlansPreview);
  $("#planDay").addEventListener("change", renderPlansPreview);
  $("#btnAddToPlan").addEventListener("click", addToPlan);
  $("#btnClearDay").addEventListener("click", clearDay);
  $("#btnClearAllPlans").addEventListener("click", clearAllPlans);

  // Backup
  $("#btnExport").addEventListener("click", exportJSON);
  $("#importFile").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSON(f);
    e.target.value = "";
  });
}

function bootAppUI(){
  // selects
  fillGroupsSelects();
  fillStudentsSelect();
  fillPlanExerciseSelect();

  // render geral
  renderDashboard();
  renderStudents();
  renderExercises();
  renderPlansPreview();

  showView("dashboard");
}

(async function init(){
  bindEvents();
  loadAll();
  await loadDefaultsIfEmpty();

  // Se já estava logado
  if(isAuthed()){
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setStatus("OK", true);
    bootAppUI();
  }else{
    $("#loginScreen").classList.remove("hidden");
    $("#app").classList.add("hidden");
  }
})();

