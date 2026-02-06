/* =========================================================
   APP.JS - Plataforma Katielle Amaral (Firebase)
   - Auth + Firestore
   - Admin: alunos, exercícios, treinos
   - Aluno: carrossel Netflix + setas + modal vídeo

   IMPORTANTE:
   No index: <script type="module" src="app.js"></script>
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
  onSnapshot
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

// Auth secundário: criar aluno sem deslogar admin
const secondaryApp = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

/* =========================
   DEFAULT CONFIG
========================= */
const DEFAULT_GROUPS = [
  "Comece por aqui",
  "Alongamento",
  "Mobilidade",
  "Peitoral",
  "Costas",
  "Pernas",
  "Ombros",
  "Braços",
  "Abdômen"
];
const DEFAULT_MODELS = ["A","B","C","D"];

/* =========================
   STATE
========================= */
let groups = [...DEFAULT_GROUPS];
let models = [...DEFAULT_MODELS];
let exercises = []; // {id, group, name, youtube}
let currentUser = null;
let currentRole = null;

/* =========================
   HELPERS
========================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function safeGet(selector){
  return $(selector) || null;
}

function setStatus(msg, ok=true){
  const pill = safeGet("#statusPill");
  if(!pill) return;
  pill.textContent = msg;
  pill.style.color = ok ? "#18c37d" : "#ffb9bd";
}

function setLoginMsg(msg){
  const el = safeGet("#loginMsg");
  if(el) el.textContent = msg || "";
}

function friendlyErr(e){
  const code = e?.code || "";
  if(code === "permission-denied") return "Sem permissão (regras do Firestore).";
  if(code === "unauthenticated") return "Você precisa estar logado.";
  return "Falha ao atualizar.";
}

function normalizeEmail(userLike){
  const u = (userLike || "").trim().toLowerCase();
  if(!u) return "";
  if(u.includes("@")) return u;
  return `${u}@katielle.app`;
}

/* =========================================================
   YOUTUBE -> EMBED (ACEITA shorts / watch / youtu.be / embed)
========================================================= */
function youtubeToEmbed(url){
  if(!url) return "";
  let u = String(url).trim().replace(/\s+/g, "");

  if(u.includes("youtube.com/embed/")) return u;

  if(u.includes("youtube.com/shorts/")){
    const id = u.split("youtube.com/shorts/")[1].split("?")[0].split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  if(u.includes("youtu.be/")){
    const id = u.split("youtu.be/")[1].split("?")[0].split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  if(u.includes("watch?v=")){
    const id = u.split("watch?v=")[1].split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  // se colarem só o ID
  if(u.length >= 8 && u.length <= 20 && !u.includes("/") && !u.includes(".")){
    return `https://www.youtube.com/embed/${u}`;
  }

  return "";
}

/* =========================
   FIRESTORE PATHS
========================= */
const configRef = doc(db, "app", "config");
const userRef = (uid) => doc(db, "users", uid);
const exercisesCol = collection(db, "exercises");
const plansRef = (uid) => doc(db, "plans", uid);

/* =========================
   CONFIG (groups/models)
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

/* =========================
   UI NAV
========================= */
function showView(v){
  $$(".view").forEach(x => x.classList.add("hidden"));
  safeGet("#view-"+v)?.classList.remove("hidden");

  $$(".menu-item").forEach(b => b.classList.remove("active"));
  document.querySelector(`.menu-item[data-view="${v}"]`)?.classList.add("active");

  const titles = {
    dashboard:"Dashboard",
    alunos:"Alunos",
    exercicios:"Exercícios",
    treinos:"Treinos",
    backup:"Backup",
    videos:"Vídeos",
    meutreino:"Meu Treino"
  };
  const t = safeGet("#viewTitle");
  if(t) t.textContent = titles[v] || "Painel";
}

/* =========================
   SELECTS
========================= */
function fillGroups(){
  const exGroup = safeGet("#exGroup");
  const filterGroup = safeGet("#filterGroup");
  const planGroup = safeGet("#planGroup");
  const studentFilter = safeGet("#studentFilterGroup");

  if(exGroup){
    exGroup.innerHTML="";
    groups.forEach(g => exGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
  if(planGroup){
    planGroup.innerHTML="";
    groups.forEach(g => planGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
  if(filterGroup){
    filterGroup.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g => filterGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
  if(studentFilter){
    studentFilter.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g => studentFilter.innerHTML += `<option value="${g}">${g}</option>`);
  }
}

function fillPlanDays(){
  const sel = safeGet("#planDay");
  if(!sel) return;

  const days=["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
  sel.innerHTML="";
  days.forEach(d=>{
    models.forEach(m=>{
      sel.innerHTML += `<option value="${d} - ${m}">${d} - ${m}</option>`;
    });
  });
  models.forEach(m => sel.innerHTML += `<option value="${m}">${m}</option>`);
}

/* =========================
   LOGIN TABS
========================= */
function bindLoginTabs(){
  const tabAdmin = safeGet("#tabAdmin");
  const tabAluno = safeGet("#tabAluno");
  const formAdmin = safeGet("#formAdmin");
  const formAluno = safeGet("#formAluno");

  if(tabAdmin) tabAdmin.onclick=()=>{
    tabAdmin.classList.add("active");
    tabAluno?.classList.remove("active");
    formAdmin?.classList.remove("hidden");
    formAluno?.classList.add("hidden");
    setLoginMsg("");
  };

  if(tabAluno) tabAluno.onclick=()=>{
    tabAluno.classList.add("active");
    tabAdmin?.classList.remove("active");
    formAluno?.classList.remove("hidden");
    formAdmin?.classList.add("hidden");
    setLoginMsg("");
  };
}

/* =========================
   AUTH: LOGIN / LOGOUT
========================= */
async function loginAdmin(){
  const email = normalizeEmail(safeGet("#loginUser")?.value);
  const pass = (safeGet("#loginPass")?.value || "").trim();
  if(!email || !pass) return setLoginMsg("Preencha usuário e senha");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    console.error(e);
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function loginAluno(){
  const email = normalizeEmail(safeGet("#studentUserLogin")?.value);
  const pass = (safeGet("#studentPassLogin")?.value || "").trim();
  if(!email || !pass) return setLoginMsg("Preencha usuário e senha");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    console.error(e);
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function logout(){
  await signOut(auth);
}

/* =========================
   USERS / ROLES
========================= */
async function ensureUserDocOnFirstLogin(u){
  const ref = userRef(u.uid);
  const snap = await getDoc(ref);
  if(snap.exists()) return;
  await setDoc(ref, {
    role: "student",
    name: u.email || "Aluno",
    createdAt: serverTimestamp()
  });
}

async function getMyRole(uid){
  const snap = await getDoc(userRef(uid));
  if(!snap.exists()) return null;
  return (snap.data() || {}).role || null;
}

/* =========================
   EXERCISES (SEM orderBy -> não exige índice)
========================= */
function listenExercises(){
  return onSnapshot(exercisesCol, (snap)=>{
    exercises = snap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));

    // ordena no JS (mais estável)
    exercises.sort((a,b)=>{
      const g = (a.group||"").localeCompare(b.group||"");
      if(g!==0) return g;
      return (a.name||"").localeCompare(b.name||"");
    });

    if(currentRole==="admin") renderExercisesAdmin();
    if(currentRole==="student") renderStudentVideos();
  }, (err)=>{
    console.error("listenExercises:", err);
    setStatus("Erro ao carregar exercícios (Firestore)", false);
  });
}

async function addExercise(){
  const g = safeGet("#exGroup")?.value || groups[0] || "Geral";
  const n = (safeGet("#exName")?.value || "").trim();
  const y = (safeGet("#exYoutube")?.value || "").trim();

  if(!n) return setStatus("Digite o nome do exercício", false);
  if(y && !youtubeToEmbed(y)){
    setStatus("Cole um link válido do YouTube (watch/youtu.be/shorts)", false);
    return;
  }

  try{
    await addDoc(exercisesCol, {
      group: g,
      name: n,
      youtube: y || "",
      createdAt: serverTimestamp()
    });

    if(safeGet("#exName")) safeGet("#exName").value="";
    if(safeGet("#exYoutube")) safeGet("#exYoutube").value="";
    setStatus("Exercício adicionado", true);
  }catch(e){
    console.error(e);
    setStatus(friendlyErr(e), false);
  }
}

async function updateExercise(id, patch){
  try{
    await updateDoc(doc(db, "exercises", id), patch);
    setStatus("Atualizado", true);
  }catch(e){
    console.error(e);
    setStatus(friendlyErr(e), false);
    alert(`${friendlyErr(e)}\n\nMotivo: ${e?.code || "erro"}`);
  }
}

async function deleteExercise(id){
  if(!confirm("Excluir exercício?")) return;
  try{
    await deleteDoc(doc(db, "exercises", id));
    setStatus("Excluído", true);
  }catch(e){
    console.error(e);
    setStatus(friendlyErr(e), false);
  }
}

/* =========================
   BULK (lote)
========================= */
function bindBulk(){
  const toggle = safeGet("#btnBulkToggle");
  const box = safeGet("#bulkBox");
  const cancel = safeGet("#btnBulkCancel");
  const save = safeGet("#btnBulkSave");
  const text = safeGet("#bulkText");
  if(!toggle || !box || !cancel || !save || !text) return;

  toggle.onclick=()=> box.classList.toggle("hidden");
  cancel.onclick=()=>{
    box.classList.add("hidden");
    text.value="";
  };

  save.onclick=async ()=>{
    const g = safeGet("#exGroup")?.value || groups[0] || "Geral";
    const lines = text.value.split("\n").map(l=>l.trim()).filter(Boolean);
    if(!lines.length) return setStatus("Cole 1 exercício por linha", false);

    let count=0;
    for(const name of lines){
      const exists = exercises.some(e =>
        (e.group===g) && ((e.name||"").toLowerCase()===name.toLowerCase())
      );
      if(!exists){
        await addDoc(exercisesCol, { group:g, name, youtube:"", createdAt: serverTimestamp() });
        count++;
      }
    }
    text.value="";
    box.classList.add("hidden");
    setStatus(`Lote salvo: ${count}`, true);
  };
}

/* =========================
   ADMIN: TABELA EXERCÍCIOS
========================= */
function renderExercisesAdmin(){
  const tb = safeGet("#exercisesTable tbody");
  if(!tb) return;

  const f = safeGet("#filterGroup")?.value || "ALL";
  const q = (safeGet("#searchExercise")?.value || "").trim().toLowerCase();

  const filtered = exercises.filter(e =>
    (f==="ALL" || e.group===f) &&
    ((e.name||"").toLowerCase().includes(q))
  );

  tb.innerHTML = "";

  if(!filtered.length){
    tb.innerHTML = `<tr><td colspan="4" class="muted">Nenhum exercício encontrado.</td></tr>`;
    return;
  }

  filtered.forEach(e=>{
    const ok = !!youtubeToEmbed(e.youtube || "");
    tb.innerHTML += `
      <tr>
        <td>${e.group || ""}</td>
        <td>${e.name || ""}</td>
        <td>${ok ? "OK" : "—"}</td>
        <td style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn" type="button" data-edit="${e.id}">Editar</button>
          <button class="btn danger" type="button" data-del="${e.id}">Excluir</button>
          <input data-url="${e.id}" placeholder="Cole URL do YouTube"
            value="${String(e.youtube||"").replaceAll('"',"&quot;")}"
            style="height:40px; min-width:220px;">
          <button class="btn primary" type="button" data-saveurl="${e.id}">Salvar URL</button>
        </td>
      </tr>
    `;
  });

  tb.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick=()=> deleteExercise(btn.dataset.del);
  });

  tb.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick=()=>{
      const id = btn.dataset.edit;
      const ex = exercises.find(x=>x.id===id);
      if(!ex) return;

      const newName = (prompt("Nome:", ex.name||"")||"").trim();
      if(!newName) return;

      const newGroup = (prompt("Grupo:", ex.group||"")||"").trim() || ex.group;
      const newUrl = (prompt("URL YouTube (watch/youtu.be/shorts) ou vazio:", ex.youtube||"")||"").trim();

      if(newUrl && !youtubeToEmbed(newUrl)){
        alert("Link inválido. Use watch?v= ou youtu.be ou shorts.");
        return;
      }
      updateExercise(id, { name:newName, group:newGroup, youtube:newUrl });
    };
  });

  tb.querySelectorAll("[data-saveurl]").forEach(btn=>{
    btn.onclick=()=>{
      const id = btn.dataset.saveurl;
      const input = tb.querySelector(`[data-url="${id}"]`);
      const url = (input?.value || "").trim();

      if(url && !youtubeToEmbed(url)){
        alert("Link inválido. Use watch?v= ou youtu.be ou shorts.");
        return;
      }
      updateExercise(id, { youtube: url });
    };
  });
}
/* =========================
   STUDENTS
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
  const name = (safeGet("#studentName")?.value || "").trim();
  const username = (safeGet("#studentUser")?.value || "").trim().toLowerCase();
  const pass = (safeGet("#studentPass")?.value || "").trim();
  const planMonths = Number(safeGet("#studentPlan")?.value || "3");

  if(!name || !username || pass.length < 4){
    return setStatus("Dados inválidos (senha mínimo 4)", false);
  }

  const email = normalizeEmail(username);

  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const uid = cred.user.uid;

    await setDoc(userRef(uid), {
      role: "student",
      name,
      username,
      planMonths,
      expiresAt: addMonthsISO(planMonths),
      createdAt: serverTimestamp()
    }, { merge:true });

    await setDoc(plansRef(uid), { days:{} }, { merge:true });

    if(safeGet("#studentName")) safeGet("#studentName").value="";
    if(safeGet("#studentUser")) safeGet("#studentUser").value="";
    if(safeGet("#studentPass")) safeGet("#studentPass").value="";

    await signOut(secondaryAuth);
    setStatus("Aluno criado ✅", true);

    await renderStudentsAsync();
    await loadStudentsForSelect();
  }catch(e){
    console.error(e);
    setStatus(friendlyErr(e), false);
    alert(`${friendlyErr(e)}\n\nMotivo: ${e?.code || "erro"}`);
  }
}

async function loadAllStudents(){
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map(d => ({ uid:d.id, ...(d.data()||{}) }))
    .filter(u => u.role === "student")
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""));
}

async function renderStudentsAsync(){
  const tb = safeGet("#studentsTable tbody");
  if(!tb) return;

  const students = await loadAllStudents();
  tb.innerHTML = "";

  students.forEach(s=>{
    const left = daysLeft(s.expiresAt);
    tb.innerHTML += `
      <tr>
        <td>${s.name || ""}</td>
        <td>${s.username || ""}</td>
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
      if(!confirm("Excluir aluno (dados Firestore)?")) return;
      try{
        await deleteDoc(userRef(uid));
        await deleteDoc(plansRef(uid));
        setStatus("Aluno removido", true);
        await renderStudentsAsync();
        await loadStudentsForSelect();
      }catch(e){
        console.error(e);
        setStatus(friendlyErr(e), false);
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
        await renderStudentsAsync();
      }catch(e){
        console.error(e);
        setStatus(friendlyErr(e), false);
      }
    };
  });
}

/* =========================
   TREINOS (PLANS)
========================= */
async function loadStudentsForSelect(){
  const sel = safeGet("#planStudent");
  if(!sel) return;

  const students = await loadAllStudents();
  sel.innerHTML="";
  students.forEach(s=>{
    sel.innerHTML += `<option value="${s.uid}">${s.name || s.username || s.uid}</option>`;
  });
}

async function getPlanDays(uid){
  const snap = await getDoc(plansRef(uid));
  if(!snap.exists()) return {};
  return (snap.data()||{}).days || {};
}

async function setPlanDays(uid, days){
  await setDoc(plansRef(uid), { days }, { merge:true });
}

function fillPlanExercises(){
  const g = safeGet("#planGroup")?.value;
  const sel = safeGet("#planExercise");
  if(!sel) return;

  sel.innerHTML="";
  exercises
    .filter(e=>e.group===g)
    .forEach(e=>{
      sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
    });
}

async function addToPlan(){
  const uid = safeGet("#planStudent")?.value;
  const day = safeGet("#planDay")?.value;
  const exId = safeGet("#planExercise")?.value;
  const ex = exercises.find(e=>e.id===exId);

  if(!uid || !day || !ex) return setStatus("Selecione aluno / dia / exercício", false);

  const days = await getPlanDays(uid);
  if(!days[day]) days[day] = [];

  days[day].push({
    id: (crypto.randomUUID?.() || ("it_"+Date.now())),
    exerciseId: exId,
    group: ex.group,
    name: ex.name,
    youtube: ex.youtube || "",
    sets: safeGet("#planSets")?.value || "3",
    reps: safeGet("#planReps")?.value || "8-12",
    rest: safeGet("#planRest")?.value || "60s",
    note: safeGet("#planNote")?.value || ""
  });

  await setPlanDays(uid, days);
  setStatus("Adicionado no treino", true);
  await renderPlansAdmin();
}

async function renderPlansAdmin(){
  const uid = safeGet("#planStudent")?.value;
  const box = safeGet("#planPreview");
  if(!box) return;
  box.innerHTML="";

  if(!uid){
    box.innerHTML = `<div class="muted">Selecione um aluno.</div>`;
    return;
  }

  const days = await getPlanDays(uid);
  const keys = Object.keys(days || {});
  if(!keys.length){
    box.innerHTML = `<div class="muted">Nenhum treino criado.</div>`;
    return;
  }

  keys.forEach(day=>{
    const dayDiv = document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (days[day]||[]).forEach(it=>{
      const emb = youtubeToEmbed(it.youtube);
      const item = document.createElement("div");
      item.className="item";
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
  const uid = safeGet("#planStudent")?.value;
  const day = safeGet("#planDay")?.value;
  if(!uid || !day) return setStatus("Selecione aluno e dia", false);

  const days = await getPlanDays(uid);
  if(!days[day]) return setStatus("Nada para limpar", false);
  if(!confirm(`Limpar treino de: ${day}?`)) return;

  delete days[day];
  await setPlanDays(uid, days);
  setStatus("Dia limpo", true);
  await renderPlansAdmin();
}

async function clearAllPlans(){
  const uid = safeGet("#planStudent")?.value;
  if(!uid) return setStatus("Selecione um aluno", false);
  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  await setPlanDays(uid, {});
  setStatus("Treinos apagados", true);
  await renderPlansAdmin();
}
/* =========================
   ALUNO: MODAL + CARROSSEL (com SETAS)
========================= */
function bindModal(){
  const modal = safeGet("#videoModal");
  if(!modal) return;

  const closeAll = ()=>{
    const iframe = safeGet("#modalIframe");
    if(iframe) iframe.src="";
    modal.classList.add("hidden");
  };

  safeGet("#modalClose")?.addEventListener("click", closeAll);
  safeGet("#modalX")?.addEventListener("click", closeAll);
}

function openVideoModal(title, url){
  const modal = safeGet("#videoModal");
  if(!modal) return;

  const iframe = safeGet("#modalIframe");
  const t = safeGet("#modalTitle");
  const emb = youtubeToEmbed(url);

  if(t) t.textContent = title || "Vídeo";
  if(iframe) iframe.src = emb || "";

  modal.classList.remove("hidden");
}

function renderStudentWelcome(name){
  const title = safeGet("#welcomeStudentTitle");
  const text = safeGet("#welcomeStudentText");
  if(title) title.textContent = `Bem-vindo(a), ${name || "Aluno(a)"}!`;
  if(text) text.textContent =
    `Explore os grupos abaixo. Use a busca para achar exercícios pelo nome.`;
}

/* ---------- CARROSSEL + SETAS ---------- */
function buildRow(rowTitle, itemsHTML, railId){
  // usa as classes do seu CSS: row-netflix / row-rail / vcard
  // e adiciona setas (usa .carousel-btn que você já tem no CSS)
  return `
    <div class="row-netflix">
      <div class="row-title">${rowTitle}</div>

      <button class="carousel-btn left" type="button" data-scroll-left="${railId}">‹</button>
      <button class="carousel-btn right" type="button" data-scroll-right="${railId}">›</button>

      <div class="row-rail" id="${railId}">
        ${itemsHTML}
      </div>
    </div>
  `;
}

function videoCardHTML(ex){
  const playable = !!youtubeToEmbed(ex.youtube || "");
  const badge = playable
    ? `<span class="badge-ok">PLAY</span>`
    : `<span class="badge-miss">SEM VÍDEO</span>`;

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

function bindCarouselArrows(container){
  // scroll suave por “página”
  container.querySelectorAll("[data-scroll-left]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-scroll-left");
      const rail = document.getElementById(id);
      if(!rail) return;
      const step = Math.max(260, rail.clientWidth * 0.8);
      rail.scrollBy({ left: -step, behavior: "smooth" });
    };
  });

  container.querySelectorAll("[data-scroll-right]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-scroll-right");
      const rail = document.getElementById(id);
      if(!rail) return;
      const step = Math.max(260, rail.clientWidth * 0.8);
      rail.scrollBy({ left: step, behavior: "smooth" });
    };
  });
}

function renderStudentVideos(){
  const grid = safeGet("#studentVideosGrid");
  if(!grid) return;

  const q = (safeGet("#studentSearch")?.value || "").trim().toLowerCase();
  const gFilter = safeGet("#studentFilterGroup")?.value || "ALL";

  const list = exercises.filter(ex=>{
    const okGroup = (gFilter === "ALL") || (ex.group === gFilter);
    const okName  = (ex.name || "").toLowerCase().includes(q);
    return okGroup && okName;
  });

  // agrupa por grupo
  const byGroup = {};
  list.forEach(ex=>{
    const g = ex.group || "Outros";
    byGroup[g] = byGroup[g] || [];
    byGroup[g].push(ex);
  });

  // ✅ “Comece por aqui”:
  // - prioriza os que têm vídeo válido
  // - se NÃO tiver nenhum vídeo, ainda mostra 12 primeiros (pra não “sumir”)
  const withVideo = list.filter(ex => !!youtubeToEmbed(ex.youtube || ""));
  const startPick = (withVideo.length ? withVideo : list).slice(0, 12);
  const startCards = startPick.map(videoCardHTML).join("");

  let html = "";
  if(startCards){
    html += buildRow("Comece por aqui", startCards, "rail_start");
  }

  // carrosséis por grupo (mesmo sem vídeo)
  groups.forEach((g, idx)=>{
    const arr = (byGroup[g] || []).map(videoCardHTML).join("");
    if(arr){
      html += buildRow(g, arr, `rail_${idx}`);
    }
  });

  if(!html){
    grid.innerHTML = `<div class="muted">Nenhum exercício encontrado.</div>`;
    return;
  }

  grid.innerHTML = html;

  // setas
  bindCarouselArrows(grid);

  // clique nos cards
  grid.querySelectorAll("[data-play]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-play");
      const ex = exercises.find(x=>x.id===id);
      if(!ex) return;

      const emb = youtubeToEmbed(ex.youtube || "");
      if(!emb){
        alert("Este exercício ainda não tem URL do YouTube.");
        return;
      }
      openVideoModal(ex.name, ex.youtube);
    };
  });
}

/* =========================
   ALUNO: MEU TREINO
========================= */
async function renderPlansStudent(){
  const box = safeGet("#studentPlanPreview");
  if(!box) return;
  box.innerHTML="";

  const uid = currentUser?.uid;
  if(!uid){
    box.innerHTML = `<div class="muted">Faça login.</div>`;
    return;
  }

  const days = await getPlanDays(uid);
  const keys = Object.keys(days||{});
  if(!keys.length){
    box.innerHTML = `<div class="muted">Seu treino ainda não foi criado.</div>`;
    return;
  }

  keys.forEach(day=>{
    const dayDiv = document.createElement("div");
    dayDiv.className="day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (days[day]||[]).forEach(it=>{
      const emb = youtubeToEmbed(it.youtube);
      const item = document.createElement("div");
      item.className="item";
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
   MENU
========================= */
function bindMenu(){
  $$(".menu-item").forEach(btn=>{
    btn.onclick = async ()=>{
      const v = btn.dataset.view;
      showView(v);

      if(currentRole==="admin"){
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
   INIT (final)
========================= */
async function init(){
  bindLoginTabs();
  bindMenu();
  bindModal();
  bindBulk();

  safeGet("#btnLoginAdmin") && (safeGet("#btnLoginAdmin").onclick = loginAdmin);
  safeGet("#btnLoginAluno") && (safeGet("#btnLoginAluno").onclick = loginAluno);
  safeGet("#btnLogout") && (safeGet("#btnLogout").onclick = logout);

  safeGet("#btnAddStudent") && (safeGet("#btnAddStudent").onclick = createStudent);
  safeGet("#btnAddExercise") && (safeGet("#btnAddExercise").onclick = addExercise);

  safeGet("#filterGroup") && (safeGet("#filterGroup").onchange = renderExercisesAdmin);
  safeGet("#searchExercise") && (safeGet("#searchExercise").oninput = renderExercisesAdmin);

  safeGet("#planGroup") && (safeGet("#planGroup").onchange = fillPlanExercises);
  safeGet("#planStudent") && (safeGet("#planStudent").onchange = renderPlansAdmin);

  safeGet("#btnAddToPlan") && (safeGet("#btnAddToPlan").onclick = addToPlan);
  safeGet("#btnClearDay") && (safeGet("#btnClearDay").onclick = clearDay);
  safeGet("#btnClearAllPlans") && (safeGet("#btnClearAllPlans").onclick = clearAllPlans);

  safeGet("#studentSearch")?.addEventListener("input", renderStudentVideos);
  safeGet("#studentFilterGroup")?.addEventListener("change", renderStudentVideos);

  await ensureConfig();
  fillGroups();
  fillPlanDays();

  let unsubExercises = null;

  onAuthStateChanged(auth, async (u)=>{
    currentUser = u;
    setLoginMsg("");

    if(!u){
      safeGet("#loginScreen")?.classList.remove("hidden");
      safeGet("#app")?.classList.add("hidden");
      currentRole = null;

      if(unsubExercises){ unsubExercises(); unsubExercises=null; }
      return;
    }

    await ensureUserDocOnFirstLogin(u);
    currentRole = (await getMyRole(u.uid)) || "student";

    safeGet("#loginScreen")?.classList.add("hidden");
    safeGet("#app")?.classList.remove("hidden");

    if(!unsubExercises) unsubExercises = listenExercises();

    if(currentRole === "admin"){
      safeGet("#menuAluno")?.classList.add("hidden");
      safeGet("#menuAdmin")?.classList.remove("hidden");
      safeGet("#roleSub") && (safeGet("#roleSub").textContent = "Administrador(a)");
      safeGet("#welcomeLine") && (safeGet("#welcomeLine").textContent = "Bem-vindo(a), Administrador(a).");

      await loadStudentsForSelect();
      fillPlanExercises();

      showView("dashboard");
      setStatus("OK", true);

      await renderStudentsAsync();
      renderExercisesAdmin();
    }else{
      safeGet("#menuAdmin")?.classList.add("hidden");
      safeGet("#menuAluno")?.classList.remove("hidden");
      safeGet("#roleSub") && (safeGet("#roleSub").textContent = "Aluno");

      const snap = await getDoc(userRef(u.uid));
      const me = snap.exists() ? (snap.data()||{}) : {};
      safeGet("#welcomeLine") && (safeGet("#welcomeLine").textContent = me.name ? `Olá, ${me.name}.` : "Olá!");
      renderStudentWelcome(me.name);

      if(me.expiresAt && daysLeft(me.expiresAt) < 0){
        alert("Seu plano está vencido. Fale com a administradora.");
        await logout();
        return;
      }

      showView("videos");
      setStatus("OK", true);
      renderStudentVideos();
    }
  });
}

init();
