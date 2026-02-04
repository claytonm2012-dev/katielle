/* ========= CONFIG ========= */
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "The152max@"; // sua senha ADM

/* ========= STORAGE KEYS ========= */
const KEY_EX = "consultoria_exercises_v2";
const KEY_ST = "consultoria_students_v2";
const KEY_PL = "consultoria_plans_v2";
const KEY_AUTH = "consultoria_auth_v2";
const KEY_GROUPS = "consultoria_groups_v2";

/* ========= STATE ========= */
let groups = ["Peitoral","Costas","Pernas","Ombros","Braços","Abdômen"];
let exercises = []; // {id,group,name,youtube}
let students = [];  // {id,name,username,passHash,planMonths,expiresAt,createdAt}
let plans = {};     // { [studentId]: { [dayName]: [items...] } }

/* ========= DOM ========= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ========= HELPERS ========= */
function uid(prefix="id"){ return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }
function nowISO(){ return new Date().toISOString(); }
function addMonths(date, months){ const d = new Date(date); d.setMonth(d.getMonth()+Number(months)); return d; }
function fmtDate(iso){
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
function daysLeft(iso){
  const diff = new Date(iso) - new Date();
  return Math.ceil(diff/(1000*60*60*24));
}
function setStatus(msg, ok=true){
  const pill = $("#statusPill");
  if(!pill) return;
  pill.textContent = msg;
  pill.style.borderColor = ok ? "rgba(24,195,125,.35)" : "rgba(229,9,20,.55)";
  pill.style.background = ok ? "rgba(24,195,125,.12)" : "rgba(229,9,20,.12)";
  pill.style.color = ok ? "#18c37d" : "#ffb9bd";
}
function setLoginMsg(text, ok=false){
  const el = $("#loginMsg");
  if(!el) return;
  el.textContent = text;
  el.style.color = ok ? "#18c37d" : "#ffb9bd";
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("`",""); }

/* ========= YOUTUBE EMBED (NOVO) ========= */
function youtubeToEmbed(url){
  if(!url) return "";
  const u = String(url).trim();

  // youtu.be/ID
  if(u.includes("youtu.be/")){
    const id = u.split("youtu.be/")[1].split("?")[0].split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  // youtube.com/watch?v=ID
  if(u.includes("watch?v=")){
    const id = u.split("watch?v=")[1].split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  // shorts
  if(u.includes("youtube.com/shorts/")){
    const id = u.split("youtube.com/shorts/")[1].split("?")[0].split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  // already embed
  if(u.includes("/embed/")) return u;

  return "";
}

/* ========= HASH (senha do aluno) ========= */
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ========= STORAGE ========= */
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
  if (localStorage.getItem(KEY_EX)) return;
  try{
    const res = await fetch("data.json", { cache: "no-store" });
    const json = await res.json();
    if (Array.isArray(json.groups) && json.groups.length) groups = json.groups;
    if (Array.isArray(json.exercises)) exercises = json.exercises;
    saveAll();
  }catch{
    saveAll();
  }
}

/* ========= AUTH =========
   auth = { role: "admin" | "student", studentId?: string, username?: string }
*/
function getAuth(){
  const raw = localStorage.getItem(KEY_AUTH);
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch{ return null; }
}
function setAuth(obj){
  localStorage.setItem(KEY_AUTH, JSON.stringify(obj));
}
function clearAuth(){
  localStorage.removeItem(KEY_AUTH);
}
function logout(){
  clearAuth();
  $("#app").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
  setLoginMsg("", true);
}

/* ========= UI NAV ========= */
function showView(view){
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");

  const menu = !$("#menuAdmin").classList.contains("hidden") ? "#menuAdmin" : "#menuAluno";
  document.querySelectorAll(`${menu} .menu-item`).forEach(b=> b.classList.remove("active"));
  const active = document.querySelector(`${menu} .menu-item[data-view="${view}"]`);
  if(active) active.classList.add("active");

  const titles = {
    dashboard:"Painel Administrativo",
    alunos:"Alunos",
    exercicios:"Exercícios",
    treinos:"Treinos",
    backup:"Backup",
    meutreino:"Meu Treino"
  };
  $("#viewTitle").textContent = titles[view] || "Painel";
}

/* ========= DASH ========= */
function renderDashboard(){
  $("#dashStudents").textContent = students.length;
  $("#dashExercises").textContent = exercises.length;
  let totalDays = 0;
  Object.values(plans).forEach(byDay => totalDays += Object.keys(byDay || {}).length);
  $("#dashPlans").textContent = totalDays;
}

/* ========= GROUPS SELECTS ========= */
function fillGroupsSelects(){
  const exGroup = $("#exGroup");
  const planGroup = $("#planGroup");
  const filterGroup = $("#filterGroup");
  const editGroup = $("#editGroup");

  [exGroup, planGroup, editGroup].forEach(sel=>{
    if(!sel) return;
    sel.innerHTML = "";
    groups.forEach(g=>{
      const o = document.createElement("option");
      o.value = g; o.textContent = g;
      sel.appendChild(o);
    });
  });

  if(filterGroup){
    filterGroup.innerHTML = "";
    const all = document.createElement("option");
    all.value = "__ALL__"; all.textContent = "Todos os grupos";
    filterGroup.appendChild(all);
    groups.forEach(g=>{
      const o = document.createElement("option");
      o.value = g; o.textContent = g;
      filterGroup.appendChild(o);
    });
  }
}

/* ========= STUDENTS ========= */
function renderStudents(){
  const tbody = $("#studentsTable tbody");
  tbody.innerHTML = "";

  const sorted = [...students].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  sorted.forEach(s=>{
    const left = daysLeft(s.expiresAt);
    const active = left >= 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td><span class="tag">${escapeHtml(s.username)}</span></td>
      <td>${s.planMonths} meses</td>
      <td>${fmtDate(s.expiresAt)} <span class="muted small">(${left}d)</span></td>
      <td>${active ? `<span class="tag ok">Ativo</span>` : `<span class="tag bad">Vencido</span>`}</td>
      <td class="right">
        <button class="icon-btn" data-act="reset" data-id="${s.id}">Nova senha</button>
        <button class="icon-btn" data-act="renew" data-id="${s.id}">Renovar</button>
        <button class="icon-btn" data-act="del" data-id="${s.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if(act==="del") deleteStudent(id);
      if(act==="renew") renewStudent(id);
      if(act==="reset") await resetStudentPassword(id);
    });
  });

  fillStudentsSelect();
}

async function addStudent(){
  const name = $("#studentName").value.trim();
  const planMonths = Number($("#studentPlan").value);
  const username = $("#studentUser").value.trim().toLowerCase();
  const pass = $("#studentPass").value.trim();

  if(!name) return setStatus("Informe o nome do aluno", false);
  if(!username) return setStatus("Crie o usuário do aluno", false);
  if(!pass || pass.length < 4) return setStatus("Senha do aluno deve ter pelo menos 4 caracteres", false);

  if(students.some(s=>s.username===username)){
    return setStatus("Esse usuário já existe. Use outro.", false);
  }

  const passHash = await sha256(pass);
  const createdAt = nowISO();
  const expiresAt = addMonths(new Date(), planMonths).toISOString();

  students.push({ id: uid("st"), name, username, passHash, planMonths, createdAt, expiresAt });
  saveAll();

  $("#studentName").value = "";
  $("#studentUser").value = "";
  $("#studentPass").value = "";

  setStatus("Aluno criado com login", true);
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
  renderDashboard();
  renderPlansPreview();
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

async function resetStudentPassword(id){
  const s = students.find(x=>x.id===id);
  if(!s) return;
  const newPass = prompt("Digite a NOVA senha do aluno (mínimo 4 caracteres):") || "";
  if(newPass.trim().length < 4) return setStatus("Senha inválida.", false);
  s.passHash = await sha256(newPass.trim());
  saveAll();
  setStatus("Senha do aluno atualizada", true);
}

function fillStudentsSelect(){
  const sel = $("#planStudent");
  if(!sel) return;
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

/* ========= EXERCISES ========= */
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
    const has = (e.youtube||"").trim().length>0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.group)}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${has ? `<span class="tag">OK</span>` : `<span class="muted">—</span>`}</td>
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
      if(act==="del") deleteExercise(id);
      if(act==="edit") openEditExercise(id);
    });
  });

  fillPlanExerciseSelect();
  renderDashboard();
}

function addExercise(){
  const group = $("#exGroup").value;
  const name = $("#exName").value.trim();
  const youtube = $("#exYoutube").value.trim();
  if(!name) return setStatus("Digite o nome do exercício", false);

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
  if(!e.name) return setStatus("Nome não pode ficar vazio", false);

  Object.keys(plans).forEach(stId=>{
    const byDay = plans[stId] || {};
    Object.keys(byDay).forEach(day=>{
      (byDay[day]||[]).forEach(it=>{
        if(it.exerciseId===e.id){
          it.group=e.group; it.name=e.name; it.youtube=e.youtube;
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

/* ========= PLANS ========= */
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

  const sets = String($("#planSets").value || "3").trim();
  const reps = String($("#planReps").value || "8-12").trim();
  const rest = String($("#planRest").value || "60s").trim();
  const note = String($("#planNote").value || "").trim();

  if(!plans[studentId]) plans[studentId] = {};
  if(!plans[studentId][day]) plans[studentId][day] = [];

  plans[studentId][day].push({
    id: uid("it"),
    exerciseId: ex.id,
    group,
    name: ex.name,
    youtube: ex.youtube,
    sets, reps, rest, note
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

  wrap.innerHTML = buildPlanHTML(studentId, true);
  attachPlanButtons(studentId, wrap);
}

/* ========= AQUI FOI A MUDANÇA DO VÍDEO (NOVO) ========= */
function buildPlanHTML(studentId, withButtons){
  const byDay = plans[studentId] || {};
  const days = Object.keys(byDay);

  if(!days.length) return `<div class="muted">Nenhum treino criado para este aluno ainda.</div>`;

  const order = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo","A","B","C","D"];
  days.sort((a,b)=> order.indexOf(a) - order.indexOf(b));

  return days.map(day=>{
    const items = byDay[day] || [];
    const itemsHtml = items.map(it=>{
      const embed = youtubeToEmbed(it.youtube);
      return `
        <div class="plan-item">
          <div>
            <div><b>${escapeHtml(it.name)}</b> <span class="muted">(${escapeHtml(it.group)})</span></div>
            <div class="muted">
              ${
                embed
                  ? `<div class="video-box"><iframe src="${escapeAttr(embed)}" frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe></div>`
                  : (it.youtube ? `<span class="tag">link inválido</span>` : `<span class="muted">sem vídeo</span>`)
              }
            </div>
          </div>
          <div><span class="muted">Séries</span><br><b>${escapeHtml(it.sets)}</b></div>
          <div><span class="muted">Reps</span><br><b>${escapeHtml(it.reps)}</b></div>
          <div><span class="muted">Desc</span><br><b>${escapeHtml(it.rest)}</b></div>
          <div class="muted">${escapeHtml(it.note || "")}</div>
          <div class="row gap">
            ${
              withButtons
                ? `<button class="icon-btn" data-act="up" data-day="${escapeAttr(day)}" data-id="${it.id}">↑</button>
                   <button class="icon-btn" data-act="down" data-day="${escapeAttr(day)}" data-id="${it.id}">↓</button>
                   <button class="icon-btn" data-act="del" data-day="${escapeAttr(day)}" data-id="${it.id}">✕</button>`
                : ``
            }
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="plan-day">
        <div class="row between wrap gap">
          <h4>${escapeHtml(day)}</h4>
          <span class="muted">${items.length} exercício(s)</span>
        </div>
        ${itemsHtml}
      </div>
    `;
  }).join("");
}

function attachPlanButtons(studentId, wrap){
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
  const list = plans[studentId]?.[day] || [];
  plans[studentId][day] = list.filter(it=>it.id!==itemId);
  if(plans[studentId][day].length===0) delete plans[studentId][day];
  saveAll();
  setStatus("Item removido", true);
  renderPlansPreview();
  renderDashboard();
}

function movePlanItem(studentId, day, itemId, dir){
  const list = plans[studentId]?.[day] || [];
  const i = list.findIndex(it=>it.id===itemId);
  const j = i + dir;
  if(i<0 || j<0 || j>=list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
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

/* ========= STUDENT VIEW ========= */
function renderStudentPlan(studentId){
  const wrap = $("#studentPlanPreview");
  if(!wrap) return;
  wrap.innerHTML = buildPlanHTML(studentId, false); // com vídeo embutido também
}

/* ========= BACKUP ========= */
function exportJSON(){
  const payload = { version: 2, exportedAt: nowISO(), groups, exercises, students, plans };
  const text = JSON.stringify(payload, null, 2);
  $("#backupText").value = text;

  const blob = new Blob([text], { type:"application/json" });
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
      if(!obj || obj.version !== 2) throw new Error("Arquivo inválido");
      groups = obj.groups || groups;
      exercises = obj.exercises || [];
      students = obj.students || [];
      plans = obj.plans || {};
      saveAll();
      setStatus("Backup importado", true);
      bootAppUI(getAuth());
    }catch{
      setStatus("Falha ao importar JSON", false);
    }
  };
  reader.readAsText(file);
}

/* ========= LOGIN TABS ========= */
function setupLoginTabs(){
  const tabAdmin = $("#tabAdmin");
  const tabAluno = $("#tabAluno");
  const formAdmin = $("#formAdmin");
  const formAluno = $("#formAluno");

  tabAdmin.addEventListener("click", ()=>{
    tabAdmin.classList.add("active");
    tabAluno.classList.remove("active");
    formAdmin.classList.remove("hidden");
    formAluno.classList.add("hidden");
    setLoginMsg("");
  });

  tabAluno.addEventListener("click", ()=>{
    tabAluno.classList.add("active");
    tabAdmin.classList.remove("active");
    formAluno.classList.remove("hidden");
    formAdmin.classList.add("hidden");
    setLoginMsg("");
  });
}

/* ========= AUTH BOOT ========= */
function applyRoleUI(auth){
  const role = auth?.role;

  if(role === "admin"){
    $("#menuAdmin").classList.remove("hidden");
    $("#menuAluno").classList.add("hidden");
    $("#roleSub").textContent = "Administrador";
    $("#welcomeLine").textContent = `Bem-vindo(a), Administrador(a).`;
    showView("dashboard");
  }else{
    $("#menuAdmin").classList.add("hidden");
    $("#menuAluno").classList.remove("hidden");
    $("#roleSub").textContent = "Aluno";
    const st = students.find(s=>s.id===auth.studentId);
    $("#welcomeLine").textContent = st ? `Olá, ${st.name}.` : "Olá!";
    showView("meutreino");
  }
}

function bootAppUI(auth){
  fillGroupsSelects();
  fillStudentsSelect();
  fillPlanExerciseSelect();

  renderDashboard();
  renderStudents();
  renderExercises();
  renderPlansPreview();

  applyRoleUI(auth);

  if(auth?.role === "student"){
    renderStudentPlan(auth.studentId);
  }
}

/* ========= LOGIN ACTIONS ========= */
async function loginAdmin(){
  const u = ($("#loginUser").value||"").trim();
  const p = ($("#loginPass").value||"").trim();

  if(u === ADMIN_USER && p === ADMIN_PASSWORD){
    const auth = { role:"admin", username:u };
    setAuth(auth);
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setStatus("Logado (ADM)", true);
    setLoginMsg("", true);
    bootAppUI(auth);
  }else{
    setLoginMsg("Usuário ou senha inválidos.");
  }
}

async function loginAluno(){
  const user = ($("#studentUserLogin").value||"").trim().toLowerCase();
  const pass = ($("#studentPassLogin").value||"").trim();
  if(!user || !pass) return setLoginMsg("Preencha usuário e senha do aluno.");

  const st = students.find(s=>s.username===user);
  if(!st) return setLoginMsg("Aluno não encontrado. Verifique o usuário.");

  const left = daysLeft(st.expiresAt);
  if(left < 0) return setLoginMsg("Acesso vencido. Fale com o ADM.");

  const hash = await sha256(pass);
  if(hash !== st.passHash) return setLoginMsg("Senha do aluno incorreta.");

  const auth = { role:"student", studentId: st.id, username: st.username };
  setAuth(auth);

  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  setStatus("Logado (Aluno)", true);
  setLoginMsg("", true);
  bootAppUI(auth);
}

/* ========= EVENTS ========= */
function bindEvents(){
  setupLoginTabs();

  $("#btnLoginAdmin").addEventListener("click", loginAdmin);
  $("#btnLoginAluno").addEventListener("click", loginAluno);

  $("#btnLogout").addEventListener("click", logout);

  $$("#menuAdmin .menu-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      showView(btn.dataset.view);
      if(btn.dataset.view==="dashboard") renderDashboard();
      if(btn.dataset.view==="alunos") renderStudents();
      if(btn.dataset.view==="exercicios") renderExercises();
      if(btn.dataset.view==="treinos") renderPlansPreview();
    });
  });
  $$("#menuAluno .menu-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      showView(btn.dataset.view);
      const auth = getAuth();
      if(auth?.role==="student") renderStudentPlan(auth.studentId);
    });
  });

  $("#btnAddStudent").addEventListener("click", addStudent);

  $("#btnAddExercise").addEventListener("click", addExercise);
  $("#filterGroup").addEventListener("change", renderExercises);
  $("#searchExercise").addEventListener("input", renderExercises);

  $("#btnCloseModal").addEventListener("click", closeModal);
  $("#btnSaveExercise").addEventListener("click", saveEditExercise);
  $("#btnDeleteExercise").addEventListener("click", deleteFromModal);
  $("#modal").addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

  $("#planGroup").addEventListener("change", fillPlanExerciseSelect);
  $("#planStudent").addEventListener("change", renderPlansPreview);
  $("#planDay").addEventListener("change", renderPlansPreview);
  $("#btnAddToPlan").addEventListener("click", addToPlan);
  $("#btnClearDay").addEventListener("click", clearDay);
  $("#btnClearAllPlans").addEventListener("click", clearAllPlans);

  $("#btnExport").addEventListener("click", exportJSON);
  $("#importFile").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSON(f);
    e.target.value = "";
  });
}

/* ========= INIT ========= */
(async function init(){
  bindEvents();
  loadAll();
  await loadDefaultsIfEmpty();

  const auth = getAuth();
  if(auth){
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setStatus("OK", true);
    bootAppUI(auth);
  }else{
    $("#loginScreen").classList.remove("hidden");
    $("#app").classList.add("hidden");
  }
})();


