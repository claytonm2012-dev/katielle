/* =========================================================
   Firebase (Web SDK via ES Modules)
   - Requer: <script type="module" src="app.js"></script>
========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* =========================
   FIREBASE CONFIG (SEU)
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyC_7DoPLZ6I31ZgD6HRt-d2EKLnLzX-dU0",
  authDomain: "katielle-amaral.firebaseapp.com",
  projectId: "katielle-amaral",
  storageBucket: "katielle-amaral.firebasestorage.app",
  messagingSenderId: "297322700885",
  appId: "1:297322700885:web:6b7a55033e3a1ec680f4dc",
  measurementId: "G-QFQTN4YH72"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Auth secundário: criar aluno sem deslogar o admin
const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

/* =========================
   DEFAULT CONFIG
========================= */
const DEFAULT_GROUPS = ["Peitoral","Costas","Pernas","Ombros","Braços","Abdômen","Mobilidade","Alongamento"];
const DEFAULT_MODELS = ["A","B","C","D"];

/* =========================
   STATE
========================= */
let groups = [...DEFAULT_GROUPS];
let models = [...DEFAULT_MODELS];
let exercises = []; // {id, group, name, youtube}
let currentUser = null; // firebase user
let currentRole = null; // "admin" | "student"

/* =========================
   HELPERS
========================= */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

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

function normalizeEmail(userLike){
  const u = (userLike || "").trim().toLowerCase();
  if(!u) return "";
  // se já for email, ok
  if(u.includes("@")) return u;
  // transforma em email interno
  return `${u}@katielle.app`;
}

function youtubeToEmbed(url){
  if(!url) return "";
  const u = url.trim();
  if(u.includes("youtu.be/")) return "https://www.youtube.com/embed/" + u.split("youtu.be/")[1].split("?")[0];
  if(u.includes("watch?v=")) return "https://www.youtube.com/embed/" + u.split("watch?v=")[1].split("&")[0];
  if(u.includes("shorts/")) return "https://www.youtube.com/embed/" + u.split("shorts/")[1].split("?")[0];
  return "";
}

/* =========================
   FIRESTORE PATHS
========================= */
// config doc: app/config
const configRef = doc(db, "app", "config");
// users/{uid} => {role, name, expiresAt, planMonths, createdAt}
const userRef = (uid) => doc(db, "users", uid);
// exercises collection
const exercisesCol = collection(db, "exercises");
// plans/{uid} => { days: { "Segunda - A": [items...] } }
const plansRef = (uid) => doc(db, "plans", uid);

/* =========================
   FIRESTORE: CONFIG (groups/models)
========================= */
async function ensureConfig(){
  const snap = await getDoc(configRef);
  if(!snap.exists()){
    await setDoc(configRef, {
      groups: DEFAULT_GROUPS,
      models: DEFAULT_MODELS,
      createdAt: serverTimestamp()
    });
    groups = [...DEFAULT_GROUPS];
    models = [...DEFAULT_MODELS];
    return;
  }
  const data = snap.data() || {};
  groups = Array.isArray(data.groups) && data.groups.length ? data.groups : [...DEFAULT_GROUPS];
  models = Array.isArray(data.models) && data.models.length ? data.models : [...DEFAULT_MODELS];
}

async function saveConfig(){
  await setDoc(configRef, { groups, models }, { merge:true });
}

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
    videos:"Vídeos",
    meutreino:"Meu Treino"
  };
  $("#viewTitle").textContent = titles[v] || "Painel";
}

/* =========================
   SELECTS (groups/models)
========================= */
function fillGroups(){
  const exGroup=$("#exGroup");
  const filterGroup=$("#filterGroup");
  const planGroup=$("#planGroup");
  const studentFilter=$("#studentFilterGroup");

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
  if(studentFilter){
    studentFilter.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g=> studentFilter.innerHTML += `<option value="${g}">${g}</option>`);
  }
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

/* =========================
   DASHBOARD (contagens)
========================= */
function renderDashboardCounts({studentsCount=0, exercisesCount=0, blocksCount=0}={}){
  $("#dashStudents").textContent = studentsCount;
  $("#dashExercises").textContent = exercisesCount;
  $("#dashPlans").textContent = blocksCount;
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
   AUTH: LOGIN / LOGOUT
========================= */
async function loginAdmin(){
  const email = normalizeEmail($("#loginUser").value);
  const pass = ($("#loginPass").value || "").trim();
  if(!email || !pass) return setLoginMsg("Preencha usuário e senha");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function loginAluno(){
  const email = normalizeEmail($("#studentUserLogin").value);
  const pass = ($("#studentPassLogin").value || "").trim();
  if(!email || !pass) return setLoginMsg("Preencha usuário e senha");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function logout(){
  await signOut(auth);
}

/* =========================
   USERS / ROLES
   - users/{uid}.role define admin ou student
========================= */
async function getMyRole(uid){
  const snap = await getDoc(userRef(uid));
  if(!snap.exists()) return null;
  const data = snap.data() || {};
  return data.role || null;
}

async function ensureUserDocOnFirstLogin(u){
  // Se não existir doc, cria como "student" por padrão (depois você pode promover um admin)
  const ref = userRef(u.uid);
  const snap = await getDoc(ref);
  if(snap.exists()) return;
  await setDoc(ref, {
    role: "student",
    name: u.email || "Aluno",
    createdAt: serverTimestamp()
  });
}

/* =========================
   EXERCISES (Firestore)
========================= */
function listenExercises(){
  const qy = query(exercisesCol, orderBy("group"), orderBy("name"));
  return onSnapshot(qy, (snap)=>{
    exercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(currentRole==="admin") renderExercisesAdmin();
    if(currentRole==="student") renderStudentVideos();
    // atualiza dashboard
    renderDashboardAsync();
  });
}

async function addExercise(){
  const g=$("#exGroup").value;
  const n=$("#exName").value.trim();
  const y=$("#exYoutube").value.trim();

  if(!n) return setStatus("Digite o nome do exercício", false);

  try{
    await addDoc(exercisesCol, {
      group: g,
      name: n,
      youtube: y || "",
      createdAt: serverTimestamp()
    });
    $("#exName").value="";
    $("#exYoutube").value="";
    setStatus("Exercício adicionado", true);
  }catch{
    setStatus("Erro ao adicionar", false);
  }
}

async function updateExercise(id, patch){
  try{
    await updateDoc(doc(db, "exercises", id), patch);
    setStatus("Exercício atualizado", true);
  }catch{
    setStatus("Erro ao atualizar", false);
  }
}

async function deleteExercise(id){
  if(!confirm("Excluir exercício?")) return;
  try{
    await deleteDoc(doc(db, "exercises", id));
    setStatus("Exercício excluído", true);
  }catch{
    setStatus("Erro ao excluir", false);
  }
}

/* =========================
   ADMIN: EXERCISES TABLE (Editar/Excluir + URL rápido)
   - Sem mudar HTML: cria input de URL dentro da tabela
========================= */
function renderExercisesAdmin(){
  const tb = $("#exercisesTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  const f = $("#filterGroup")?.value || "ALL";
  const q = ($("#searchExercise")?.value || "").trim().toLowerCase();

  const filtered = exercises.filter(e =>
    (f==="ALL" || e.group===f) &&
    (e.name || "").toLowerCase().includes(q)
  );

  filtered.forEach(e=>{
    const has = e.youtube ? "OK" : "—";
    tb.innerHTML += `
      <tr>
        <td>${e.group || ""}</td>
        <td>${e.name || ""}</td>
        <td>${has}</td>
        <td style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn" type="button" data-edit="${e.id}">Editar</button>
          <button class="btn danger" type="button" data-del="${e.id}">Excluir</button>
          <input data-url="${e.id}" placeholder="Cole URL do YouTube" value="${(e.youtube||"").replaceAll('"','&quot;')}" style="height:40px; min-width:220px;">
          <button class="btn primary" type="button" data-saveurl="${e.id}">Salvar URL</button>
        </td>
      </tr>
    `;
  });

  // bind actions
  tb.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = ()=> deleteExercise(btn.dataset.del);
  });

  tb.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.edit;
      const ex = exercises.find(x=>x.id===id);
      if(!ex) return;

      const newName = (prompt("Nome do exercício:", ex.name || "") || "").trim();
      if(!newName) return;

      const newGroup = (prompt("Grupo (ex: Peitoral, Costas...):", ex.group || "") || "").trim() || ex.group;
      const newUrl  = (prompt("URL do YouTube (pode deixar vazio):", ex.youtube || "") || "").trim();

      updateExercise(id, { name: newName, group: newGroup, youtube: newUrl });
    };
  });

  tb.querySelectorAll("[data-saveurl]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.saveurl;
      const input = tb.querySelector(`[data-url="${id}"]`);
      const url = (input?.value || "").trim();
      updateExercise(id, { youtube: url });
    };
  });
}

/* =========================
   STUDENTS (Firestore)
   - Admin cria aluno: cria conta Auth + doc users/{uid}
   - Plano: expiresAt (timestamp ISO simplificado em string)
========================= */
function addMonthsISO(months){
  const d = new Date();
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString();
}
function daysLeft(iso){
  if(!iso) return 999999;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}
function fmtDate(iso){
  if(!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

async function createStudent(){
  const name = ($("#studentName").value || "").trim();
  const username = ($("#studentUser").value || "").trim().toLowerCase();
  const pass = ($("#studentPass").value || "").trim();
  const planMonths = Number($("#studentPlan").value);

  if(!name || !username || pass.length < 4){
    return setStatus("Dados inválidos (senha mínimo 4)", false);
  }

  const email = normalizeEmail(username);

  try{
    // cria conta do aluno usando auth secundário (não derruba o admin)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const uid = cred.user.uid;

    // cria perfil
    await setDoc(userRef(uid), {
      role: "student",
      name,
      username,
      planMonths,
      expiresAt: addMonthsISO(planMonths),
      createdAt: serverTimestamp()
    }, { merge:true });

    // cria treino vazio
    await setDoc(plansRef(uid), { days: {} }, { merge:true });

    // limpa inputs
    $("#studentName").value="";
    $("#studentUser").value="";
    $("#studentPass").value="";
    setStatus("Aluno criado (login pelo usuário/senha)", true);

    // fecha sessão do secundário por segurança
    await signOut(secondaryAuth);

    renderDashboardAsync();
    renderStudentsAsync();
  }catch(e){
    // erros comuns: email já existe
    setStatus("Erro: usuário já existe ou senha fraca", false);
  }
}

async function loadAllStudents(){
  const snap = await getDocs(collection(db, "users"));
  const list = snap.docs
    .map(d => ({ uid:d.id, ...d.data() }))
    .filter(u => u.role === "student")
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  return list;
}

async function renderStudentsAsync(){
  const tb = $("#studentsTable tbody");
  if(!tb) return;
  const students = await loadAllStudents();
  tb.innerHTML = "";

  students.forEach(s=>{
    const left = daysLeft(s.expiresAt);
    tb.innerHTML += `
      <tr>
        <td>${s.name || ""}</td>
        <td>${s.username || (s.email||"")}</td>
        <td>${s.planMonths || "—"}m</td>
        <td>${fmtDate(s.expiresAt)} (${left}d)</td>
        <td>${left>=0 ? "Ativo" : "Vencido"}</td>
        <td>
          <button class="btn danger" type="button" data-delst="${s.uid}">Excluir</button>
          <button class="btn" type="button" data-renew="${s.uid}">Renovar</button>
        </td>
      </tr>
    `;
  });

  tb.querySelectorAll("[data-delst]").forEach(btn=>{
    btn.onclick = async ()=>{
      const uid = btn.dataset.delst;
      if(!confirm("Excluir aluno (somente dados no Firestore)?")) return;
      try{
        // apaga perfil e treino (obs: não apaga conta do Auth, isso exige Admin SDK)
        await deleteDoc(userRef(uid));
        await deleteDoc(plansRef(uid));
        setStatus("Aluno removido (dados)", true);
        renderStudentsAsync();
        renderDashboardAsync();
      }catch{
        setStatus("Erro ao excluir", false);
      }
    };
  });

  tb.querySelectorAll("[data-renew]").forEach(btn=>{
    btn.onclick = async ()=>{
      const uid = btn.dataset.renew;
      const months = Number(prompt("Renovar por quantos meses? (3/6/12)", "3") || "0");
      if(!months) return;
      try{
        await updateDoc(userRef(uid), {
          planMonths: months,
          expiresAt: addMonthsISO(months)
        });
        setStatus("Plano renovado", true);
        renderStudentsAsync();
      }catch{
        setStatus("Erro ao renovar", false);
      }
    };
  });
}

/* =========================
   PLANS (Treinos) - Firestore
========================= */
async function loadStudentsForSelect(){
  const sel = $("#planStudent");
  if(!sel) return;

  const students = await loadAllStudents();
  sel.innerHTML = "";
  students.forEach(s=>{
    sel.innerHTML += `<option value="${s.uid}">${s.name || s.username || s.uid}</option>`;
  });
}

async function getPlanDays(uid){
  const snap = await getDoc(plansRef(uid));
  if(!snap.exists()) return {};
  const data = snap.data() || {};
  return data.days || {};
}

async function setPlanDays(uid, days){
  await setDoc(plansRef(uid), { days }, { merge:true });
}

function fillPlanExercises(){
  const g = $("#planGroup")?.value;
  const sel = $("#planExercise");
  if(!sel) return;
  sel.innerHTML = "";
  exercises
    .filter(e => e.group === g)
    .forEach(e => sel.innerHTML += `<option value="${e.id}">${e.name}</option>`);
}

async function addToPlan(){
  const uid = $("#planStudent").value;
  const day = $("#planDay").value;
  const exId = $("#planExercise").value;
  const ex = exercises.find(e=>e.id===exId);

  if(!uid || !day || !ex) return setStatus("Selecione aluno / dia / exercício", false);

  const days = await getPlanDays(uid);
  if(!days[day]) days[day] = [];

  days[day].push({
    id: crypto.randomUUID?.() || ("it_"+Date.now()),
    exerciseId: exId,
    group: ex.group,
    name: ex.name,
    youtube: ex.youtube || "",
    sets: $("#planSets").value || "3",
    reps: $("#planReps").value || "8-12",
    rest: $("#planRest").value || "60s",
    note: $("#planNote").value || ""
  });

  await setPlanDays(uid, days);
  setStatus("Adicionado no treino", true);
  renderPlansAdmin();
  renderDashboardAsync();
}

async function renderPlansAdmin(){
  const uid = $("#planStudent")?.value;
  const box = $("#planPreview");
  if(!box) return;
  box.innerHTML = "";

  if(!uid){
    box.innerHTML = `<div class="muted">Selecione um aluno.</div>`;
    return;
  }

  const days = await getPlanDays(uid);
  const keys = Object.keys(days || {});
  if(!keys.length){
    box.innerHTML = `<div class="muted">Nenhum treino criado para este aluno ainda.</div>`;
    return;
  }

  keys.forEach(day=>{
    const dayDiv = document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (days[day] || []).forEach(it=>{
      const item = document.createElement("div");
      item.className="item";
      const emb = youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${it.name}</b> (${it.group}) — ${it.sets}x${it.reps} • Descanso: ${it.rest}</div>
        ${it.note ? `<div class="muted">Obs: ${it.note}</div>` : ``}
        ${emb ? `<div class="video-box"><iframe src="${emb}" allowfullscreen></iframe></div>` : ``}
      `;
      dayDiv.appendChild(item);
    });
  });
}

async function clearDay(){
  const uid = $("#planStudent").value;
  const day = $("#planDay").value;
  if(!uid || !day) return setStatus("Selecione aluno e dia", false);

  const days = await getPlanDays(uid);
  if(!days[day]) return setStatus("Nada para limpar", false);
  if(!confirm(`Limpar treino de: ${day}?`)) return;

  delete days[day];
  await setPlanDays(uid, days);
  setStatus("Dia limpo", true);
  renderPlansAdmin();
  renderDashboardAsync();
}

async function clearAllPlans(){
  const uid = $("#planStudent").value;
  if(!uid) return setStatus("Selecione um aluno", false);
  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  await setPlanDays(uid, {});
  setStatus("Treinos apagados", true);
  renderPlansAdmin();
  renderDashboardAsync();
}

/* =========================
   STUDENT: Videos (Netflix-like simples)
   - Mostra por grupo, com cards clicáveis
   - Modal player
========================= */
function bindModal(){
  const modal = $("#videoModal");
  if(!modal) return;

  const closeAll = ()=>{
    $("#modalIframe").src = "";
    modal.classList.add("hidden");
  };

  $("#modalClose")?.addEventListener("click", closeAll);
  $("#modalX")?.addEventListener("click", closeAll);
}

function openVideoModal(title, youtubeUrl){
  const modal = $("#videoModal");
  if(!modal) return;
  const emb = youtubeToEmbed(youtubeUrl);
  $("#modalTitle").textContent = title || "Vídeo";
  $("#modalIframe").src = emb || "";
  modal.classList.remove("hidden");
}

function renderStudentWelcome(name){
  const title = $("#welcomeStudentTitle");
  const text  = $("#welcomeStudentText");
  if(title) title.textContent = `Bem-vindo(a), ${name || "Aluno(a)"}!`;
  if(text) text.textContent = `Comece por aqui: assista aos vídeos iniciais e depois explore os grupos abaixo. Use a busca para achar exercícios pelo nome.`;
}

function buildRow(title, items){
  // row estilo "carrossel" (só com CSS do seu lado; aqui vai o HTML)
  return `
    <div class="row-netflix">
      <div class="row-title">${title}</div>
      <div class="row-rail">
        ${items.join("")}
      </div>
    </div>
  `;
}

function videoCardHTML(ex){
  const has = !!(ex.youtube && youtubeToEmbed(ex.youtube));
  const badge = has ? `<span class="badge-ok">PLAY</span>` : `<span class="badge-miss">SEM VÍDEO</span>`;
  return `
    <button class="vcard" type="button" data-play="${ex.id}">
      <div class="vcard-top">
        <div class="vcard-name">${ex.name || ""}</div>
        <div class="vcard-group">${ex.group || ""}</div>
      </div>
      <div class="vcard-badge">${badge}</div>
    </button>
  `;
}

function renderStudentVideos(){
  const grid = $("#studentVideosGrid");
  if(!grid) return;

  const q = ($("#studentSearch")?.value || "").trim().toLowerCase();
  const gFilter = $("#studentFilterGroup")?.value || "ALL";

  // filtra
  const list = exercises.filter(ex=>{
    const okGroup = (gFilter === "ALL") || (ex.group === gFilter);
    const okName = (ex.name || "").toLowerCase().includes(q);
    return okGroup && okName;
  });

  // agrupa por grupo
  const byGroup = {};
  list.forEach(ex=>{
    byGroup[ex.group] = byGroup[ex.group] || [];
    byGroup[ex.group].push(ex);
  });

  // “Comece por aqui”: primeiros com vídeo
  const start = list.filter(ex=>ex.youtube).slice(0, 12).map(videoCardHTML);

  let html = "";
  if(start.length){
    html += buildRow("Comece por aqui", start);
  }

  groups.forEach(g=>{
    const arr = (byGroup[g] || []).map(videoCardHTML);
    if(arr.length) html += buildRow(g, arr);
  });

  if(!html){
    html = `<div class="muted">Nenhum vídeo encontrado.</div>`;
  }

  grid.innerHTML = html;

  // clique para abrir modal
  grid.querySelectorAll("[data-play]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.play;
      const ex = exercises.find(x=>x.id===id);
      if(!ex) return;
      if(!ex.youtube) return alert("Este exercício ainda não tem URL do YouTube.");
      openVideoModal(ex.name, ex.youtube);
    };
  });
}

/* =========================
   STUDENT: Meu Treino
========================= */
async function renderPlansStudent(){
  const box = $("#studentPlanPreview");
  if(!box) return;
  box.innerHTML = "";

  const uid = currentUser?.uid;
  if(!uid){
    box.innerHTML = `<div class="muted">Faça login.</div>`;
    return;
  }

  const days = await getPlanDays(uid);
  const keys = Object.keys(days || {});
  if(!keys.length){
    box.innerHTML = `<div class="muted">Seu treino ainda não foi criado.</div>`;
    return;
  }

  keys.forEach(day=>{
    const dayDiv = document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (days[day] || []).forEach(it=>{
      const item = document.createElement("div");
      item.className="item";
      const emb = youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${it.name}</b> (${it.group}) — ${it.sets}x${it.reps} • ${it.rest}</div>
        ${it.note ? `<div class="muted">Obs: ${it.note}</div>` : ``}
        ${emb ? `<div class="video-box"><iframe src="${emb}" allowfullscreen></iframe></div>` : ``}
      `;
      dayDiv.appendChild(item);
    });
  });
}

/* =========================
   DASHBOARD async (conta students/blocks)
========================= */
async function renderDashboardAsync(){
  if(currentRole !== "admin") return;

  const students = await loadAllStudents();
  const exCount = exercises.length;

  // conta blocos (dias)
  let blocks = 0;
  // não vamos ler todos os planos agora (ficaria pesado). Só estimativa simples.
  // Se quiser exato, eu faço depois com consulta agregada.
  // Aqui: mostra 0 ou algo básico.
  // Vamos deixar 0 por enquanto para não gastar leituras.
  blocks = 0;

  renderDashboardCounts({
    studentsCount: students.length,
    exercisesCount: exCount,
    blocksCount: blocks
  });
}

/* =========================
   MENU
========================= */
function bindMenu(){
  $$(".menu-item").forEach(btn=>{
    btn.onclick = async ()=>{
      const v = btn.dataset.view;
      showView(v);

      if(currentRole==="admin"){
        if(v==="dashboard") await renderDashboardAsync();
        if(v==="alunos") await renderStudentsAsync();
        if(v==="exercicios") renderExercisesAdmin();
        if(v==="treinos") await renderPlansAdmin();
      }else{
        if(v==="videos") renderStudentVideos();
        if(v==="meutreino") await renderPlansStudent();
      }
    };
  });
}

/* =========================
   INIT
========================= */
async function init(){
  bindLoginTabs();
  bindMenu();
  bindModal();

  // Binds login
  $("#btnLoginAdmin").onclick = loginAdmin;
  $("#btnLoginAluno").onclick = loginAluno;
  $("#btnLogout").onclick = logout;

  // Admin binds
  $("#btnAddStudent").onclick = createStudent;
  $("#btnAddExercise").onclick = addExercise;
  $("#filterGroup").onchange = renderExercisesAdmin;
  $("#searchExercise").oninput = renderExercisesAdmin;

  $("#planGroup").onchange = fillPlanExercises;
  $("#planStudent").onchange = renderPlansAdmin;
  $("#btnAddToPlan").onclick = addToPlan;
  $("#btnClearDay").onclick = clearDay;
  $("#btnClearAllPlans").onclick = clearAllPlans;

  // Student binds
  $("#studentSearch")?.addEventListener("input", renderStudentVideos);
  $("#studentFilterGroup")?.addEventListener("change", renderStudentVideos);

  // Carrega config (groups/models)
  await ensureConfig();
  fillGroups();
  fillPlanDays();

  // Observa auth
  let unsubExercises = null;

  onAuthStateChanged(auth, async (u)=>{
    currentUser = u;
    setLoginMsg("");

    if(!u){
      // mostra login
      $("#loginScreen").classList.remove("hidden");
      $("#app").classList.add("hidden");
      currentRole = null;
      if(unsubExercises){ unsubExercises(); unsubExercises = null; }
      return;
    }

    // garante doc do usuário
    await ensureUserDocOnFirstLogin(u);

    // role
    const role = await getMyRole(u.uid);
    currentRole = role || "student";

    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    // Listener exercises
    if(!unsubExercises) unsubExercises = listenExercises();

    if(currentRole === "admin"){
      $("#menuAluno").classList.add("hidden");
      $("#menuAdmin").classList.remove("hidden");
      $("#roleSub").textContent = "Administrador(a)";
      $("#welcomeLine").textContent = "Bem-vindo(a), Administrador(a).";

      // selects dependem de students/exercises
      await loadStudentsForSelect();
      fillPlanExercises();

      showView("dashboard");
      setStatus("OK", true);
      await renderDashboardAsync();
      await renderStudentsAsync();
      renderExercisesAdmin();
    }else{
      $("#menuAdmin").classList.add("hidden");
      $("#menuAluno").classList.remove("hidden");
      $("#roleSub").textContent = "Aluno";

      // perfil aluno
      const snap = await getDoc(userRef(u.uid));
      const me = snap.exists() ? (snap.data()||{}) : {};
      $("#welcomeLine").textContent = me.name ? `Olá, ${me.name}.` : "Olá!";
      renderStudentWelcome(me.name);

      // bloqueio por vencimento (se existir)
      if(me.expiresAt && daysLeft(me.expiresAt) < 0){
        alert("Seu plano está vencido. Fale com a administradora.");
        await logout();
        return;
      }

      showView("videos");
      renderStudentVideos();
      setStatus("OK", true);
    }
  });
}

init();

