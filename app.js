/* =========================
   CONFIGURAÇÃO
========================= */
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "150423";

/* =========================
   STORAGE KEYS (versão segura)
========================= */
const KEY_GROUPS = "consultoria_groups_v6";
const KEY_EXERCISES = "consultoria_exercises_v6";
const KEY_STUDENTS = "consultoria_students_v6";
const KEY_PLANS = "consultoria_plans_v6";
const KEY_MODELS = "consultoria_models_v6";
const KEY_AUTH = "consultoria_auth_v6";

/* =========================
   ESTADO
========================= */
let groups = [
  "Peitoral","Costas","Pernas","Ombros",
  "Braços","Abdômen","Mobilidade","Alongamento"
];

let exercises = []; 
// { id, group, name, youtube }

let students = [];  
// { id, name, username, passHash, planMonths, createdAt, expiresAt }

let plans = {};     
// { [studentId]: { [dayBlock]: [items...] } }

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

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function daysLeft(iso){
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   STATUS / MENSAGENS
========================= */
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

/* =========================
   YOUTUBE EMBED
========================= */
function youtubeToEmbed(url){
  if(!url) return "";
  const u = url.trim();
  if(u.includes("youtu.be/")){
    return "https://www.youtube.com/embed/" + u.split("youtu.be/")[1].split("?")[0];
  }
  if(u.includes("watch?v=")){
    return "https://www.youtube.com/embed/" + u.split("watch?v=")[1].split("&")[0];
  }
  if(u.includes("shorts/")){
    return "https://www.youtube.com/embed/" + u.split("shorts/")[1].split("?")[0];
  }
  return "";
}

/* =========================
   HASH (senha aluno)
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
  if(localStorage.getItem(KEY_GROUPS))
    groups = JSON.parse(localStorage.getItem(KEY_GROUPS));
  if(localStorage.getItem(KEY_EXERCISES))
    exercises = JSON.parse(localStorage.getItem(KEY_EXERCISES));
  if(localStorage.getItem(KEY_STUDENTS))
    students = JSON.parse(localStorage.getItem(KEY_STUDENTS));
  if(localStorage.getItem(KEY_PLANS))
    plans = JSON.parse(localStorage.getItem(KEY_PLANS));
  if(localStorage.getItem(KEY_MODELS))
    models = JSON.parse(localStorage.getItem(KEY_MODELS));
}

/* =========================
   DATA.JSON (carrega só 1x)
========================= */
async function loadDefaultsIfEmpty(){
  if(localStorage.getItem(KEY_EXERCISES)) return;

  try{
    const res = await fetch("data.json",{cache:"no-store"});
    const json = await res.json();

    if(json.groups) groups = json.groups;
    if(json.exercises){
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
   LOGIN / AUTH
========================= */
function setAuth(obj){
  localStorage.setItem(KEY_AUTH, JSON.stringify(obj));
}
function getAuth(){
  const raw = localStorage.getItem(KEY_AUTH);
  return raw ? JSON.parse(raw) : null;
}
function logout(){
  localStorage.removeItem(KEY_AUTH);
  location.reload();
}

async function loginAdmin(){
  const u = $("#loginUser").value.trim();
  const p = $("#loginPass").value.trim();

  if(u === ADMIN_USER && p === ADMIN_PASSWORD){
    setAuth({ role:"admin" });
    location.reload();
  }else{
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function loginAluno(){
  const u = $("#studentUserLogin").value.trim().toLowerCase();
  const p = $("#studentPassLogin").value.trim();

  const s = students.find(st=>st.username === u);
  if(!s) return setLoginMsg("Aluno não encontrado");
  if(daysLeft(s.expiresAt) < 0) return setLoginMsg("Plano vencido");

  const h = await sha256(p);
  if(h !== s.passHash) return setLoginMsg("Senha incorreta");

  setAuth({ role:"student", studentId:s.id });
  location.reload();
}

/* =========================
   UI NAV
========================= */
function showView(v){
  $$(".view").forEach(x=>x.classList.add("hidden"));
  $("#view-"+v).classList.remove("hidden");

  $$(".menu-item").forEach(b=>b.classList.remove("active"));
  document.querySelector(`[data-view="${v}"]`)?.classList.add("active");
}

/* =========================
   DASHBOARD
========================= */
function renderDashboard(){
  $("#dashStudents").textContent = students.length;
  $("#dashExercises").textContent = exercises.length;

  let d=0;
  Object.values(plans).forEach(p=> d+=Object.keys(p).length);
  $("#dashPlans").textContent = d;
}

/* =========================
   SELECTS
========================= */
function fillGroups(){
  const sels = ["exGroup","planGroup","filterGroup"];
  sels.forEach(id=>{
    const s = $("#"+id);
    if(!s) return;
    s.innerHTML="";
    if(id==="filterGroup"){
      s.innerHTML += `<option value="ALL">Todos</option>`;
    }
    groups.forEach(g=>{
      s.innerHTML += `<option value="${g}">${g}</option>`;
    });
  });
}

function fillPlanDays(){
  const sel = $("#planDay");
  sel.innerHTML="";
  const days = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
  days.forEach(d=>{
    models.forEach(m=>{
      sel.innerHTML += `<option>${d} - ${m}</option>`;
    });
  });
  models.forEach(m=> sel.innerHTML += `<option>${m}</option>`);
}

function fillStudentsSelect(){
  const sel = $("#planStudent");
  sel.innerHTML="";
  students.forEach(s=>{
    sel.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });
}

/* =========================
   STUDENTS
========================= */
async function addStudent(){
  const name = $("#studentName").value.trim();
  const user = $("#studentUser").value.trim().toLowerCase();
  const pass = $("#studentPass").value.trim();
  const plan = Number($("#studentPlan").value);

  if(!name||!user||pass.length<4) return setStatus("Dados inválidos",false);
  if(students.some(s=>s.username===user)) return setStatus("Usuário existe",false);

  students.push({
    id: uid("st"),
    name,
    username:user,
    passHash: await sha256(pass),
    planMonths:plan,
    createdAt: nowISO(),
    expiresAt: addMonths(new Date(),plan).toISOString()
  });
  saveAll();
  setStatus("Aluno criado",true);
  renderStudents();
  fillStudentsSelect();
  renderDashboard();
}

function renderStudents(){
  const tb = $("#studentsTable tbody");
  tb.innerHTML="";
  students.forEach(s=>{
    tb.innerHTML += `
      <tr>
        <td>${s.name}</td>
        <td>${s.username}</td>
        <td>${s.planMonths}m</td>
        <td>${fmtDate(s.expiresAt)}</td>
        <td>${daysLeft(s.expiresAt)>=0?"Ativo":"Vencido"}</td>
        <td>
          <button onclick="deleteStudent('${s.id}')">Excluir</button>
        </td>
      </tr>`;
  });
}

function deleteStudent(id){
  if(!confirm("Excluir aluno?")) return;
  students = students.filter(s=>s.id!==id);
  delete plans[id];
  saveAll();
  renderStudents();
  fillStudentsSelect();
  renderDashboard();
}
/* =========================
   EXERCISES
========================= */
function renderExercises(){
  const tb = $("#exercisesTable tbody");
  tb.innerHTML="";
  const f = $("#filterGroup").value;
  const q = $("#searchExercise").value.toLowerCase();

  exercises
    .filter(e=> (f==="ALL"||e.group===f) && e.name.toLowerCase().includes(q))
    .forEach(e=>{
      tb.innerHTML += `
        <tr>
          <td>${e.group}</td>
          <td>${e.name}</td>
          <td>${e.youtube?"Embed":"—"}</td>
          <td>
            <button onclick="deleteExercise('${e.id}')">Excluir</button>
          </td>
        </tr>`;
    });
}

function addExercise(){
  const g = $("#exGroup").value;
  const n = $("#exName").value.trim();
  const y = $("#exYoutube").value.trim();
  if(!n) return;
  exercises.push({ id:uid("ex"), group:g, name:n, youtube:y });
  saveAll();
  $("#exName").value="";
  $("#exYoutube").value="";
  renderExercises();
  renderDashboard();
}

function deleteExercise(id){
  if(!confirm("Excluir exercício?")) return;
  exercises = exercises.filter(e=>e.id!==id);
  Object.values(plans).forEach(p=>{
    Object.keys(p).forEach(d=>{
      p[d]=p[d].filter(i=>i.exerciseId!==id);
    });
  });
  saveAll();
  renderExercises();
}

/* =========================
   BULK ADD (corrigido)
========================= */
function bindBulk(){
  $("#btnBulkToggle").onclick = ()=> $("#bulkBox").classList.toggle("hidden");
  $("#btnBulkCancel").onclick = ()=> $("#bulkBox").classList.add("hidden");

  $("#btnBulkSave").onclick = ()=>{
    const g = $("#exGroup").value;
    const lines = $("#bulkText").value.split("\n").map(l=>l.trim()).filter(Boolean);
    let count=0;
    lines.forEach(l=>{
      if(!exercises.some(e=>e.group===g && e.name.toLowerCase()===l.toLowerCase())){
        exercises.push({ id:uid("ex"), group:g, name:l, youtube:"" });
        count++;
      }
    });
    saveAll();
    $("#bulkText").value="";
    $("#bulkBox").classList.add("hidden");
    setStatus(`Lote: ${count} exercícios`,true);
    renderExercises();
  };
}

/* =========================
   PLANS
========================= */
function fillPlanExercises(){
  const g = $("#planGroup").value;
  const sel = $("#planExercise");
  sel.innerHTML="";
  exercises.filter(e=>e.group===g).forEach(e=>{
    sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
  });
}

function addToPlan(){
  const sid = $("#planStudent").value;
  const day = $("#planDay").value;
  const exId = $("#planExercise").value;
  const ex = exercises.find(e=>e.id===exId);
  if(!sid||!ex) return;

  if(!plans[sid]) plans[sid]={};
  if(!plans[sid][day]) plans[sid][day]=[];

  plans[sid][day].push({
    id:uid("it"),
    exerciseId:ex.id,
    group:ex.group,
    name:ex.name,
    youtube:ex.youtube,
    sets:$("#planSets").value,
    reps:$("#planReps").value,
    rest:$("#planRest").value,
    note:$("#planNote").value
  });
  saveAll();
  renderPlans();
}

function renderPlans(){
  const sid = $("#planStudent").value;
  const box = $("#planPreview");
  box.innerHTML="";
  if(!sid||!plans[sid]) return;

  Object.keys(plans[sid]).forEach(d=>{
    box.innerHTML += `<h4>${d}</h4>`;
    plans[sid][d].forEach(it=>{
      const emb = youtubeToEmbed(it.youtube);
      box.innerHTML += `
        <div>
          <b>${it.name}</b> (${it.group}) - ${it.sets}x${it.reps}
          ${emb?`<iframe width="100%" height="200" src="${emb}" allowfullscreen></iframe>`:""}
        </div>`;
    });
  });
}

/* =========================
   MODELS
========================= */
function addModel(){
  const m = prompt("Novo modelo (ex: E, Upper, Lower)");
  if(!m||models.includes(m)) return;
  models.push(m);
  saveAll();
  fillPlanDays();
}

/* =========================
   INIT
========================= */
async function init(){
  loadAll();
  await loadDefaultsIfEmpty();

  fillGroups();
  fillPlanDays();
  fillStudentsSelect();
  bindBulk();

  const auth = getAuth();
  if(auth){
    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    if(auth.role==="admin"){
      $("#menuAluno").classList.add("hidden");
      $("#menuAdmin").classList.remove("hidden");
      showView("dashboard");
      renderDashboard();
      renderStudents();
      renderExercises();
    }else{
      $("#menuAdmin").classList.add("hidden");
      $("#menuAluno").classList.remove("hidden");
      showView("meutreino");
      renderPlans();
    }
  }

  $("#btnLoginAdmin").onclick = loginAdmin;
  $("#btnLoginAluno").onclick = loginAluno;
  $("#btnLogout").onclick = logout;

  $("#btnAddStudent").onclick = addStudent;
  $("#btnAddExercise").onclick = addExercise;
  $("#filterGroup").onchange = renderExercises;
  $("#searchExercise").oninput = renderExercises;

  $("#planGroup").onchange = fillPlanExercises;
  $("#btnAddToPlan").onclick = addToPlan;
  $("#btnAddModel").onclick = addModel;
}

init();




