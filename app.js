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
let currentUser = null;
let currentRole = null; // "admin" | "student"
let unsubExercises = null;

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
  if(u.includes("@")) return u;
  return `${u}@katielle.app`;
}

// ✅ Somente links normais e youtu.be (sem shorts)
function youtubeToEmbed(url){
  if(!url) return "";
  const u = url.trim();

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

  return "";
}

function escapeHtml(str=""){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function niceErr(e){
  const code = e?.code || "";
  const msg  = e?.message || "";
  if(code) return `${code}`;
  return msg || "erro";
}

/* =========================
   FIRESTORE PATHS (MINÚSCULO!)
========================= */
const configRef = doc(db, "app", "config");
const userRef = (uid) => doc(db, "users", uid);
const exercisesCol = collection(db, "exercises");
const plansRef = (uid) => doc(db, "plans", uid);

/* =========================
   FIRESTORE: CONFIG
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
}

/* =========================
   DASHBOARD
========================= */
function renderDashboardCounts({studentsCount=0, exercisesCount=0, blocksCount=0}={}){
  $("#dashStudents").textContent = studentsCount;
  $("#dashExercises").textContent = exercisesCount;
  $("#dashPlans").textContent = blocksCount;
}

async function renderDashboardAsync(){
  if(currentRole !== "admin") return;
  const students = await loadAllStudents();
  renderDashboardCounts({
    studentsCount: students.length,
    exercisesCount: exercises.length,
    blocksCount: 0
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
   AUTH: LOGIN / LOGOUT
========================= */
async function loginAdmin(){
  const email = normalizeEmail($("#loginUser").value);
  const pass  = ($("#loginPass").value || "").trim();
  if(!email || !pass) return setLoginMsg("Preencha usuário e senha");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    setLoginMsg("Usuário ou senha inválidos");
  }
}

async function loginAluno(){
  const email = normalizeEmail($("#studentUserLogin").value);
  const pass  = ($("#studentPassLogin").value || "").trim();
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
========================= */
async function getMyRole(uid){
  const snap = await getDoc(userRef(uid));
  if(!snap.exists()) return null;
  const data = snap.data() || {};
  return data.role || null;
}

async function ensureUserDocOnFirstLogin(u){
  const ref = userRef(u.uid);
  const snap = await getDoc(ref);
  if(snap.exists()) return;
  await setDoc(ref, {
    role: "student",
    name: u.email || "Aluno",
    createdAt: serverTimestamp()
  }, { merge:true });
}

/* =========================
   EXERCISES (Firestore)
========================= */
function listenExercises(){
  // ✅ orderBy único = NÃO exige índice composto
  const qy = query(exercisesCol, orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap)=>{
    exercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(currentRole==="admin") renderExercisesAdmin();
    if(currentRole==="student") renderStudentVideosCarousel();
    renderDashboardAsync();
  }, (err)=>{
    setStatus("Erro ao ler exercícios: " + niceErr(err), false);
  });
}

async function addExercise(){
  const g = $("#exGroup").value;
  const n = ($("#exName").value || "").trim();
  const y = ($("#exYoutube").value || "").trim();

  if(!n) return setStatus("Digite o nome do exercício", false);

  // valida link: pode vazio, mas se tiver precisa virar embed
  if(y && !youtubeToEmbed(y)){
    return setStatus("Link inválido (use watch?v= ou youtu.be/)", false);
  }

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
  }catch(e){
    setStatus("Erro ao adicionar: " + niceErr(e), false);
  }
}

async function addExercisesBulk(lines){
  const g = $("#exGroup").value;
  let ok = 0;
  let fail = 0;

  for(const lineRaw of lines){
    const line = (lineRaw || "").trim();
    if(!line) continue;

    // formato: Nome | URL
    const parts = line.split("|").map(x=>x.trim());
    const name = parts[0] || "";
    const url  = parts[1] || "";

    if(!name){ fail++; continue; }
    if(url && !youtubeToEmbed(url)){ fail++; continue; }

    try{
      await addDoc(exercisesCol, {
        group: g,
        name,
        youtube: url || "",
        createdAt: serverTimestamp()
      });
      ok++;
    }catch{
      fail++;
    }
  }
  setStatus(`Lote: ${ok} ok, ${fail} falhou`, fail===0);
}

async function updateExercise(id, patch){
  try{
    await updateDoc(doc(db, "exercises", id), patch);
    setStatus("Exercício atualizado", true);
  }catch(e){
    setStatus("Erro ao atualizar: " + niceErr(e), false);
  }
}

async function deleteExercise(id){
  if(!confirm("Excluir exercício?")) return;
  try{
    await deleteDoc(doc(db, "exercises", id));
    setStatus("Exercício excluído", true);
  }catch(e){
    setStatus("Erro ao excluir: " + niceErr(e), false);
  }
}

/* =========================
   ADMIN: tabela exercícios
========================= */
function renderExercisesAdmin(){
  const tb = $("#exercisesTable tbody");
  if(!tb) return;
  tb.innerHTML = "";

  const f = $("#filterGroup")?.value || "ALL";
  const q = ($("#searchExercise")?.value || "").trim().toLowerCase();

  const filtered = exercises
    .filter(e =>
      (f==="ALL" || e.group===f) &&
      (e.name || "").toLowerCase().includes(q)
    )
    .sort((a,b)=> (a.group||"").localeCompare(b.group||"") || (a.name||"").localeCompare(b.name||""));

  filtered.forEach(e=>{
    const has = e.youtube ? "OK" : "—";
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(e.group || "")}</td>
        <td>${escapeHtml(e.name || "")}</td>
        <td>${has}</td>
        <td style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn" type="button" data-edit="${e.id}">Editar</button>
          <button class="btn danger" type="button" data-del="${e.id}">Excluir</button>
          <input data-url="${e.id}" placeholder="Cole URL do YouTube"
            value="${escapeHtml(e.youtube||"")}"
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
      const newUrl  = (prompt("URL do YouTube (vazio se não tiver):", ex.youtube || "") || "").trim();

      if(newUrl && !youtubeToEmbed(newUrl)){
        alert("Link inválido. Use watch?v=... ou youtu.be/...");
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
        setStatus("Link inválido (use watch?v= ou youtu.be/)", false);
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
  const name = ($("#studentName").value || "").trim();
  const username = ($("#studentUser").value || "").trim().toLowerCase();
  const pass = ($("#studentPass").value || "").trim();
  const planMonths = Number($("#studentPlan").value);

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

    await setDoc(plansRef(uid), { days: {} }, { merge:true });

    $("#studentName").value="";
    $("#studentUser").value="";
    $("#studentPass").value="";
    setStatus("Aluno criado (login pelo usuário/senha)", true);

    await signOut(secondaryAuth);

    await renderStudentsAsync();
    await renderDashboardAsync();
    await loadStudentsForSelect();
  }catch(e){
    setStatus("Erro ao criar aluno: " + niceErr(e), false);
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
        <td>${escapeHtml(s.name || "")}</td>
        <td>${escapeHtml(s.username || "")}</td>
        <td>${escapeHtml(String(s.planMonths || "—"))}m</td>
        <td>${escapeHtml(fmtDate(s.expiresAt))} (${left}d)</td>
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
        await deleteDoc(userRef(uid));
        await deleteDoc(plansRef(uid));
        setStatus("Aluno removido (dados)", true);
        await renderStudentsAsync();
        await renderDashboardAsync();
        await loadStudentsForSelect();
      }catch(e){
        setStatus("Erro ao excluir: " + niceErr(e), false);
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
        setStatus("Erro ao renovar: " + niceErr(e), false);
      }
    };
  });
}

/* =========================
   PLANS
========================= */
async function loadStudentsForSelect(){
  const sel = $("#planStudent");
  if(!sel) return;
  const students = await loadAllStudents();
  sel.innerHTML = "";
  students.forEach(s=>{
    sel.innerHTML += `<option value="${s.uid}">${escapeHtml(s.name || s.username || s.uid)}</option>`;
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
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .forEach(e => sel.innerHTML += `<option value="${e.id}">${escapeHtml(e.name)}</option>`);
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
  await renderPlansAdmin();
  await renderDashboardAsync();
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
    dayDiv.innerHTML = `<b>${escapeHtml(day)}</b>`;
    box.appendChild(dayDiv);

    (days[day] || []).forEach(it=>{
      const item = document.createElement("div");
      item.className="item";
      const emb = youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${escapeHtml(it.name)}</b> (${escapeHtml(it.group)}) — ${escapeHtml(it.sets)}x${escapeHtml(it.reps)} • Descanso: ${escapeHtml(it.rest)}</div>
        ${it.note ? `<div class="muted">Obs: ${escapeHtml(it.note)}</div>` : ``}
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
  await renderPlansAdmin();
  await renderDashboardAsync();
}

async function clearAllPlans(){
  const uid = $("#planStudent").value;
  if(!uid) return setStatus("Selecione um aluno", false);
  if(!confirm("Apagar TODOS os treinos deste aluno?")) return;

  await setPlanDays(uid, {});
  setStatus("Treinos apagados", true);
  await renderPlansAdmin();
  await renderDashboardAsync();
}

/* =========================
   STUDENT: MODAL + CARROSSEL
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
  if(!emb) return alert("Este exercício não tem um link válido.");
  $("#modalTitle").textContent = title || "Vídeo";
  $("#modalIframe").src = emb;
  modal.classList.remove("hidden");
}

function renderStudentWelcome(name){
  const title = $("#welcomeStudentTitle");
  const text  = $("#welcomeStudentText");
  if(title) title.textContent = `Bem-vindo(a), ${name || "Aluno(a)"}!`;
  if(text) text.textContent = `Comece por aqui: assista aos vídeos iniciais e depois explore os grupos abaixo. Use a busca para achar exercícios pelo nome.`;
}

function carouselHTML(groupName, itemsHtml){
  const gid = "car_" + groupName.replace(/\s+/g,"_").toLowerCase();
  return `
    <div class="car-block">
      <div class="car-title">${escapeHtml(groupName)}</div>
      <div class="car-wrap">
        <button class="car-arrow left" type="button" data-carleft="${gid}">‹</button>
        <div class="car-rail" id="${gid}">
          ${itemsHtml.join("")}
        </div>
        <button class="car-arrow right" type="button" data-carright="${gid}">›</button>
      </div>
    </div>
  `;
}

function videoCardHTML(ex){
  const playable = !!(ex.youtube && youtubeToEmbed(ex.youtube));
  return `
    <button class="vcard" type="button" data-play="${ex.id}">
      <div class="vcard-top">
        <div class="vcard-name">${escapeHtml(ex.name || "")}</div>
        <div class="vcard-sub">${playable ? "Toque para assistir" : "Vídeo não cadastrado"}</div>
      </div>
      <div class="vcard-badge ${playable ? "ok" : "miss"}">${playable ? "PLAY" : "SEM VÍDEO"}</div>
    </button>
  `;
}

function bindCarouselArrows(container){
  container.querySelectorAll("[data-carleft]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.carleft;
      const rail = document.getElementById(id);
      if(!rail) return;
      rail.scrollBy({ left: -Math.max(260, rail.clientWidth*0.7), behavior: "smooth" });
    };
  });

  container.querySelectorAll("[data-carright]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.carright;
      const rail = document.getElementById(id);
      if(!rail) return;
      rail.scrollBy({ left: Math.max(260, rail.clientWidth*0.7), behavior: "smooth" });
    };
  });
}

function renderStudentVideosCarousel(){
  const grid = $("#studentVideosGrid");
  if(!grid) return;

  const q = ($("#studentSearch")?.value || "").trim().toLowerCase();
  const gFilter = $("#studentFilterGroup")?.value || "ALL";

  // filtra
  const list = exercises
    .filter(ex=>{
      const okGroup = (gFilter === "ALL") || (ex.group === gFilter);
      const okName = (ex.name || "").toLowerCase().includes(q);
      return okGroup && okName;
    })
    .sort((a,b)=> (a.group||"").localeCompare(b.group||"") || (a.name||"").localeCompare(b.name||""));

  // agrupa por grupo
  const byGroup = {};
  list.forEach(ex=>{
    byGroup[ex.group] = byGroup[ex.group] || [];
    byGroup[ex.group].push(ex);
  });

  // se não tiver nada
  if(!list.length){
    grid.innerHTML = `<div class="muted">Nenhum vídeo encontrado.</div>`;
    return;
  }

  let html = "";

  // render em ordem dos groups do config
  groups.forEach(g=>{
    const arr = (byGroup[g] || []).map(videoCardHTML);
    if(arr.length){
      html += carouselHTML(g, arr);
    }
  });

  grid.innerHTML = html;

  // clique card -> modal
  grid.querySelectorAll("[data-play]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.play;
      const ex = exercises.find(x=>x.id===id);
      if(!ex) return;
      if(!ex.youtube || !youtubeToEmbed(ex.youtube)){
        return alert("Este exercício ainda não tem um link válido do YouTube.");
      }
      openVideoModal(ex.name, ex.youtube);
    };
  });

  bindCarouselArrows(grid);
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
    dayDiv.innerHTML = `<b>${escapeHtml(day)}</b>`;
    box.appendChild(dayDiv);

    (days[day] || []).forEach(it=>{
      const item = document.createElement("div");
      item.className="item";
      const emb = youtubeToEmbed(it.youtube);

      item.innerHTML = `
        <div><b>${escapeHtml(it.name)}</b> (${escapeHtml(it.group)}) — ${escapeHtml(it.sets)}x${escapeHtml(it.reps)} • ${escapeHtml(it.rest)}</div>
        ${it.note ? `<div class="muted">Obs: ${escapeHtml(it.note)}</div>` : ``}
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
        if(v==="dashboard") await renderDashboardAsync();
        if(v==="alunos") await renderStudentsAsync();
        if(v==="exercicios") renderExercisesAdmin();
        if(v==="treinos") await renderPlansAdmin();
      }else{
        if(v==="videos") renderStudentVideosCarousel();
        if(v==="meutreino") await renderPlansStudent();
      }
    };
  });
}

/* =========================
   BULK UI
========================= */
function bindBulk(){
  const toggle = $("#btnBulkToggle");
  const box = $("#bulkBox");
  if(!toggle || !box) return;

  toggle.onclick = ()=>{
    box.classList.toggle("hidden");
  };

  $("#btnBulkCancel")?.addEventListener("click", ()=>{
    box.classList.add("hidden");
    $("#bulkText").value = "";
  });

  $("#btnBulkSave")?.addEventListener("click", async ()=>{
    const text = ($("#bulkText").value || "").trim();
    if(!text) return setStatus("Cole as linhas para adicionar em lote.", false);
    const lines = text.split("\n");
    await addExercisesBulk(lines);
    $("#bulkText").value = "";
    box.classList.add("hidden");
  });
}

/* =========================
   INIT
========================= */
async function init(){
  bindLoginTabs();
  bindMenu();
  bindModal();
  bindBulk();

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
  $("#studentSearch")?.addEventListener("input", renderStudentVideosCarousel);
  $("#studentFilterGroup")?.addEventListener("change", renderStudentVideosCarousel);

  await ensureConfig();
  fillGroups();
  fillPlanDays();

  onAuthStateChanged(auth, async (u)=>{
    currentUser = u;
    setLoginMsg("");

    if(!u){
      $("#loginScreen").classList.remove("hidden");
      $("#app").classList.add("hidden");
      currentRole = null;
      if(unsubExercises){ unsubExercises(); unsubExercises = null; }
      return;
    }

    await ensureUserDocOnFirstLogin(u);

    const role = await getMyRole(u.uid);
    currentRole = role || "student";

    $("#loginScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    if(!unsubExercises) unsubExercises = listenExercises();

    if(currentRole === "admin"){
      $("#menuAluno").classList.add("hidden");
      $("#menuAdmin").classList.remove("hidden");
      $("#roleSub").textContent = "Administrador(a)";
      $("#welcomeLine").textContent = "Bem-vindo(a), Administrador(a).";

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

      const snap = await getDoc(userRef(u.uid));
      const me = snap.exists() ? (snap.data()||{}) : {};
      $("#welcomeLine").textContent = me.name ? `Olá, ${me.name}.` : "Olá!";
      renderStudentWelcome(me.name);

      if(me.expiresAt && daysLeft(me.expiresAt) < 0){
        alert("Seu plano está vencido. Fale com a administradora.");
        await logout();
        return;
      }

      showView("videos");
      renderStudentVideosCarousel();
      setStatus("OK", true);
    }
  });
}

init();


