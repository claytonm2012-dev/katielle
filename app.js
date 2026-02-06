/* =========================================================
   APP.JS - Plataforma (Firebase)
   - Auth + Firestore
   - Admin: alunos, exercícios, treinos
   - Aluno: carrossel netflix + modal vídeo
   IMPORTANTE:
   - No index: <script type="module" src="app.js"></script>
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

// Auth secundário (para criar aluno sem deslogar admin)
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
let currentUser = null;
let currentRole = null;

/* =========================
   HELPERS
========================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function safeEl(sel){
  try { return $(sel) || null; } catch { return null; }
}

function setStatus(msg, ok=true){
  const pill = safeEl("#statusPill");
  if(!pill) return;
  pill.textContent = msg;
  pill.style.color = ok ? "#18c37d" : "#ffb9bd";
}

function setLoginMsg(msg){
  const el = safeEl("#loginMsg");
  if(!el) return;
  el.textContent = msg || "";
}

function normalizeEmail(userLike){
  const u = (userLike || "").trim().toLowerCase();
  if(!u) return "";
  if(u.includes("@")) return u;
  return `${u}@katielle.app`;
}

/* =========================================================
   YOUTUBE -> EMBED (SEM SHORTS)
   Aceita:
   - youtube.com/watch?v=ID
   - youtu.be/ID
   Rejeita shorts automaticamente
========================================================= */
function youtubeToEmbed(url){
  if(!url) return "";
  const u = String(url).trim().replace(/\s+/g, "");

  if(u.includes("shorts/")) return ""; // NÃO aceitar shorts (como você pediu)

  // se já for embed:
  if(u.includes("youtube.com/embed/")) return u;

  // youtu.be/ID
  if(u.includes("youtu.be/")){
    const id = u.split("youtu.be/")[1]?.split("?")[0]?.split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  // watch?v=ID
  if(u.includes("watch?v=")){
    const id = u.split("watch?v=")[1]?.split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }

  return "";
}

/* =========================
   FIRESTORE PATHS
========================= */
const configRef    = doc(db, "app", "config");
const userRef      = (uid) => doc(db, "users", uid);
const exercisesCol = collection(db, "exercises");
const plansRef     = (uid) => doc(db, "plans", uid);

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
  safeEl("#view-"+v)?.classList.remove("hidden");

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
  const titleEl = safeEl("#viewTitle");
  if(titleEl) titleEl.textContent = titles[v] || "Painel";
}

/* =========================
   SELECTS
========================= */
function fillGroups(){
  const exGroup = safeEl("#exGroup");
  const filterGroup = safeEl("#filterGroup");
  const planGroup = safeEl("#planGroup");
  const studentFilter = safeEl("#studentFilterGroup");

  if(exGroup){
    exGroup.innerHTML = "";
    groups.forEach(g => exGroup.innerHTML += `<option value="${g}">${g}</option>`);
  }
  if(planGroup){
    planGroup.innerHTML = "";
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
  const sel = safeEl("#planDay");
  if(!sel) return;

  const days = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
  sel.innerHTML = "";

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
  const tabAdmin = safeEl("#tabAdmin");
  const tabAluno = safeEl("#tabAluno");
  const formAdmin = safeEl("#formAdmin");
  const formAluno = safeEl("#formAluno");

  if(tabAdmin) tabAdmin.onclick = () => {
    tabAdmin.classList.add("active");
    tabAluno?.classList.remove("active");
    formAdmin?.classList.remove("hidden");
    formAluno?.classList.add("hidden");
    setLoginMsg("");
  };

  if(tabAluno) tabAluno.onclick = () => {
    tabAluno.classList.add("active");
    tabAdmin?.classList.remove("active");
    formAluno?.classList.remove("hidden");
    formAdmin?.classList.add("hidden");
    setLoginMsg("");
  };
}

/* =========================
   AUTH
========================= */
async function loginAdmin(){
  const email = normalizeEmail(safeEl("#loginUser")?.value);
  const pass  = (safeEl("#loginPass")?.value || "").trim();
  if(!email || !pass) return setLoginMsg("Preencha usuário e senha");

  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    console.error(e);
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function loginAluno(){
  const email = normalizeEmail(safeEl("#studentUserLogin")?.value);
  const pass  = (safeEl("#studentPassLogin")?.value || "").trim();
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
   ROLES / PERFIL
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
   EXERCISES (SEM orderBy -> SEM índice)
========================= */
function listenExercises(){
  return onSnapshot(exercisesCol, (snap)=>{
    exercises = snap.docs.map(d => ({ id:d.id, ...(d.data() || {}) }));

    // ordena no JS
    exercises.sort((a,b)=>{
      const g = (a.group||"").localeCompare(b.group||"");
      if(g!==0) return g;
      return (a.name||"").localeCompare(b.name||"");
    });

    if(currentRole === "admin") renderExercisesAdmin();
    if(currentRole === "student") renderStudentVideos();
  }, (err)=>{
    console.error("listenExercises:", err);
    setStatus("Erro ao carregar exercícios", false);
  });
}

async function addExercise(){
  const g = safeEl("#exGroup")?.value || groups[0] || "Geral";
  const n = (safeEl("#exName")?.value || "").trim();
  const y = (safeEl("#exYoutube")?.value || "").trim();

  if(!n) return setStatus("Digite o nome do exercício", false);

  // valida link (sem shorts)
  if(y && !youtubeToEmbed(y)){
    return setStatus("Link inválido (use watch?v= ou youtu.be). Shorts não.", false);
  }

  try{
    await addDoc(exercisesCol, {
      group: g,
      name: n,
      youtube: y || "",
      createdAt: serverTimestamp()
    });
    if(safeEl("#exName")) safeEl("#exName").value = "";
    if(safeEl("#exYoutube")) safeEl("#exYoutube").value = "";
    setStatus("Exercício adicionado ✅", true);
  }catch(e){
    console.error(e);
    setStatus("Erro ao adicionar (verifique Rules)", false);
  }
}

async function updateExercise(id, patch){
  try{
    await updateDoc(doc(db, "exercises", id), patch);
    setStatus("Atualizado ✅", true);
  }catch(e){
    console.error(e);
    if(String(e?.code).includes("permission-denied")){
      setStatus("Falhou: permission-denied (Rules do Firestore)", false);
      alert("Falhou ao atualizar: permission-denied.\nIsso é REGRAS do Firestore bloqueando update em exercises.");
    }else{
      setStatus("Erro ao atualizar", false);
    }
  }
}

async function deleteExercise(id){
  if(!confirm("Excluir exercício?")) return;
  try{
    await deleteDoc(doc(db, "exercises", id));
    setStatus("Excluído ✅", true);
  }catch(e){
    console.error(e);
    if(String(e?.code).includes("permission-denied")){
      setStatus("Falhou: permission-denied (Rules)", false);
      alert("Falhou ao excluir: permission-denied.\nAs Rules precisam permitir admin excluir exercises.");
    }else{
      setStatus("Erro ao excluir", false);
    }
  }
}

/* =========================
   ADMIN: TABELA EXERCÍCIOS (NÃO some mais)
========================= */
function renderExercisesAdmin(){
  const tb = safeEl("#exercisesTable tbody");
  if(!tb) return;

  const f = safeEl("#filterGroup")?.value || "ALL";
  const q = (safeEl("#searchExercise")?.value || "").trim().toLowerCase();

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

          <input data-url="${e.id}" placeholder="Cole URL (watch/youtu.be)"
            value="${String(e.youtube||"").replaceAll('"',"&quot;")}"
            style="height:40px; min-width:220px;">

          <button class="btn primary" type="button" data-saveurl="${e.id}">Salvar URL</button>
        </td>
      </tr>
    `;
  });

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

      const newGroup = (prompt("Grupo:", ex.group || "") || "").trim() || ex.group;
      const newUrl = (prompt("URL do YouTube (watch/youtu.be) ou vazio:", ex.youtube || "") || "").trim();

      if(newUrl && !youtubeToEmbed(newUrl)){
        alert("Link inválido. Use watch?v= ou youtu.be (shorts NÃO).");
        return;
      }

      updateExercise(id, { name: newName, group: newGroup, youtube: newUrl });
    };
  });

  tb.querySelectorAll("[data-saveurl]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.saveurl;
      const input = tb.querySelector(`[data-url="${id}"]`);
      const url = (input?.value || "").trim();

      if(url && !youtubeToEmbed(url)){
        alert("Link inválido. Use watch?v= ou youtu.be (shorts NÃO).");
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

async function loadAllStudents(){
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map(d => ({ uid:d.id, ...(d.data()||{}) }))
    .filter(u => u.role === "student")
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""));
}

async function renderStudentsAsync(){
  const tb = safeEl("#studentsTable tbody");
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
      if(!confirm("Excluir aluno (somente dados Firestore)?")) return;
      try{
        await deleteDoc(userRef(uid));
        await deleteDoc(plansRef(uid));
        setStatus("Aluno removido ✅", true);
        await renderStudentsAsync();
        await loadStudentsForSelect();
      }catch(e){
        console.error(e);
        setStatus("Erro ao excluir (Rules?)", false);
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
        setStatus("Plano renovado ✅", true);
        await renderStudentsAsync();
      }catch(e){
        console.error(e);
        setStatus("Erro ao renovar (Rules?)", false);
      }
    };
  });
}

async function createStudent(){
  const name = (safeEl("#studentName")?.value || "").trim();
  const username = (safeEl("#studentUser")?.value || "").trim().toLowerCase();
  const pass = (safeEl("#studentPass")?.value || "").trim();
  const planMonths = Number(safeEl("#studentPlan")?.value || "3");

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

    if(safeEl("#studentName")) safeEl("#studentName").value = "";
    if(safeEl("#studentUser")) safeEl("#studentUser").value = "";
    if(safeEl("#studentPass")) safeEl("#studentPass").value = "";

    await signOut(secondaryAuth);

    setStatus("Aluno criado ✅", true);
    await renderStudentsAsync();
    await loadStudentsForSelect();
  }catch(e){
    console.error(e);
    setStatus("Erro ao criar aluno (Auth Email/Senha?)", false);
  }
}

async function loadStudentsForSelect(){
  const sel = safeEl("#planStudent");
  if(!sel) return;
  const students = await loadAllStudents();
  sel.innerHTML = "";
  students.forEach(s=>{
    sel.innerHTML += `<option value="${s.uid}">${s.name || s.username || s.uid}</option>`;
  });
}

/* =========================
   PLANS (TREINOS)
========================= */
async function getPlanDays(uid){
  const snap = await getDoc(plansRef(uid));
  if(!snap.exists()) return {};
  return (snap.data()||{}).days || {};
}

async function setPlanDays(uid, days){
  await setDoc(plansRef(uid), { days }, { merge:true });
}

function fillPlanExercises(){
  const g = safeEl("#planGroup")?.value;
  const sel = safeEl("#planExercise");
  if(!sel) return;
  sel.innerHTML = "";

  exercises
    .filter(e=>e.group===g)
    .forEach(e=> sel.innerHTML += `<option value="${e.id}">${e.name}</option>`);
}

async function addToPlan(){
  const uid = safeEl("#planStudent")?.value;
  const day = safeEl("#planDay")?.value;
  const exId = safeEl("#planExercise")?.value;
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
    sets: safeEl("#planSets")?.value || "3",
    reps: safeEl("#planReps")?.value || "8-12",
    rest: safeEl("#planRest")?.value || "60s",
    note: safeEl("#planNote")?.value || ""
  });

  await setPlanDays(uid, days);
  setStatus("Adicionado no treino ✅", true);
  await renderPlansAdmin();
}

async function renderPlansAdmin(){
  const uid = safeEl("#planStudent")?.value;
  const box = safeEl("#planPreview");
  if(!box) return;
  box.innerHTML = "";

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
  const uid = safeEl("#planStudent")?.value;
  const day = safeEl("#planDay")?.value;
  if(!uid || !day) return setStatus("Selecione aluno e dia", false);

  const days = await getPlanDays(uid);
  if(!days[day]) return setStatus("Nada para limpar", false);
  if(!confirm(`Limpar treino de: ${day}?`)) return;

  delete days[day];
  await setPlanDays(uid, days);
  setStatus("Dia limpo ✅", true);
  await renderPlansAdmin();
}

async function clearAllPlans(){
  const uid = safeEl("#planStudent")?.value;
  if(!uid) return setStatus("Selecione um aluno", false);
  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  await setPlanDays(uid, {});
  setStatus("Treinos apagados ✅", true);
  await renderPlansAdmin();
}

/* =========================
   ALUNO: MODAL + CARROSSEL (SEM VÍDEO também aparece)
========================= */
function bindModal(){
  const modal = safeEl("#videoModal");
  if(!modal) return;

  const closeAll = ()=>{
    const iframe = safeEl("#modalIframe");
    if(iframe) iframe.src = "";
    modal.classList.add("hidden");
  };

  safeEl("#modalClose")?.addEventListener("click", closeAll);
  safeEl("#modalX")?.addEventListener("click", closeAll);
}

function openVideoModal(title, url){
  const modal = safeEl("#videoModal");
  if(!modal) return;

  const emb = youtubeToEmbed(url);
  safeEl("#modalTitle") && (safeEl("#modalTitle").textContent = title || "Vídeo");
  if(safeEl("#modalIframe")) safeEl("#modalIframe").src = emb || "";
  modal.classList.remove("hidden");
}

function renderStudentWelcome(name){
  if(safeEl("#welcomeStudentTitle")) safeEl("#welcomeStudentTitle").textContent = `Bem-vindo(a), ${name || "Aluno(a)"}!`;
  if(safeEl("#welcomeStudentText")) safeEl("#welcomeStudentText").textContent =
    `Explore os grupos abaixo. Use a busca para achar exercícios pelo nome.`;
}

function buildRow(title, items){
  return `
    <div class="row-netflix">
      <div class="row-title">${title}</div>
      <div class="row-rail">${items.join("")}</div>
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

function renderStudentVideos(){
  const grid = safeEl("#studentVideosGrid");
  if(!grid) return;

  const q = (safeEl("#studentSearch")?.value || "").trim().toLowerCase();
  const gFilter = safeEl("#studentFilterGroup")?.value || "ALL";

  const list = exercises.filter(ex=>{
    const okGroup = (gFilter==="ALL") || (ex.group===gFilter);
    const okName = (ex.name || "").toLowerCase().includes(q);
    return okGroup && okName;
  });

  const byGroup = {};
  list.forEach(ex=>{
    byGroup[ex.group] = byGroup[ex.group] || [];
    byGroup[ex.group].push(ex);
  });

  // Comece por aqui: só os que têm link válido (sem shorts)
  const start = list
    .filter(ex => !!youtubeToEmbed(ex.youtube || ""))
    .slice(0, 12)
    .map(videoCardHTML);

  let html = "";
  if(start.length) html += buildRow("Comece por aqui", start);

  // carrossel por grupo (mesmo sem vídeo)
  groups.forEach(g=>{
    const arr = (byGroup[g] || []).map(videoCardHTML);
    if(arr.length) html += buildRow(g, arr);
  });

  if(!html) html = `<div class="muted">Nenhum exercício encontrado.</div>`;
  grid.innerHTML = html;

  grid.querySelectorAll("[data-play]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.play;
      const ex = exercises.find(x=>x.id===id);
      if(!ex) return;

      const emb = youtubeToEmbed(ex.youtube || "");
      if(!emb){
        alert("Este exercício ainda não tem URL válida do YouTube (sem shorts).");
        return;
      }
      openVideoModal(ex.name, ex.youtube);
    };
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

async function renderPlansStudent(){
  const box = safeEl("#studentPlanPreview");
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

    (days[day]||[]).forEach(it=>{
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
   INIT
========================= */
async function init(){
  bindLoginTabs();
  bindMenu();
  bindModal();

  // binds
  if(safeEl("#btnLoginAdmin")) safeEl("#btnLoginAdmin").onclick = loginAdmin;
  if(safeEl("#btnLoginAluno")) safeEl("#btnLoginAluno").onclick = loginAluno;
  if(safeEl("#btnLogout")) safeEl("#btnLogout").onclick = logout;

  if(safeEl("#btnAddStudent")) safeEl("#btnAddStudent").onclick = createStudent;
  if(safeEl("#btnAddExercise")) safeEl("#btnAddExercise").onclick = addExercise;

  if(safeEl("#filterGroup")) safeEl("#filterGroup").onchange = renderExercisesAdmin;
  if(safeEl("#searchExercise")) safeEl("#searchExercise").oninput = renderExercisesAdmin;

  if(safeEl("#planGroup")) safeEl("#planGroup").onchange = fillPlanExercises;
  if(safeEl("#planStudent")) safeEl("#planStudent").onchange = renderPlansAdmin;

  if(safeEl("#btnAddToPlan")) safeEl("#btnAddToPlan").onclick = addToPlan;
  if(safeEl("#btnClearDay")) safeEl("#btnClearDay").onclick = clearDay;
  if(safeEl("#btnClearAllPlans")) safeEl("#btnClearAllPlans").onclick = clearAllPlans;

  safeEl("#studentSearch")?.addEventListener("input", renderStudentVideos);
  safeEl("#studentFilterGroup")?.addEventListener("change", renderStudentVideos);

  await ensureConfig();
  fillGroups();
  fillPlanDays();

  let unsubExercises = null;

  onAuthStateChanged(auth, async (u)=>{
    currentUser = u;
    setLoginMsg("");

    if(!u){
      safeEl("#loginScreen")?.classList.remove("hidden");
      safeEl("#app")?.classList.add("hidden");
      currentRole = null;
      if(unsubExercises){ unsubExercises(); unsubExercises=null; }
      return;
    }

    await ensureUserDocOnFirstLogin(u);
    currentRole = (await getMyRole(u.uid)) || "student";

    safeEl("#loginScreen")?.classList.add("hidden");
    safeEl("#app")?.classList.remove("hidden");

    if(!unsubExercises) unsubExercises = listenExercises();

    if(currentRole === "admin"){
      safeEl("#menuAluno")?.classList.add("hidden");
      safeEl("#menuAdmin")?.classList.remove("hidden");
      if(safeEl("#roleSub")) safeEl("#roleSub").textContent = "Administrador(a)";
      if(safeEl("#welcomeLine")) safeEl("#welcomeLine").textContent = "Bem-vindo(a), Administrador(a).";

      await loadStudentsForSelect();
      fillPlanExercises();

      showView("dashboard");
      setStatus("OK", true);

      await renderStudentsAsync();
      renderExercisesAdmin();
    }else{
      safeEl("#menuAdmin")?.classList.add("hidden");
      safeEl("#menuAluno")?.classList.remove("hidden");
      if(safeEl("#roleSub")) safeEl("#roleSub").textContent = "Aluno";

      const snap = await getDoc(userRef(u.uid));
      const me = snap.exists() ? (snap.data()||{}) : {};
      if(safeEl("#welcomeLine")) safeEl("#welcomeLine").textContent = me.name ? `Olá, ${me.name}.` : "Olá!";
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
              
