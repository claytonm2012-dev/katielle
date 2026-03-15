/* =========================================================
   APP.JS - Plataforma Katielle Amaral (Firebase)
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence
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
  where
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js";

/* =========================
   FIREBASE CONFIG
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
const storage = getStorage(app);

const persistenceReady = Promise.race([
  setPersistence(auth, browserLocalPersistence),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout na persistência (cookies/armazenamento do navegador)")), 6000)
  )
]).catch((e) => {
  console.error("PERSISTENCE ERROR:", e);
});

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
const DEFAULT_MODELS = ["A", "B", "C", "D"];

/* =========================
   STATE
========================= */
let groups = [...DEFAULT_GROUPS];
let models = [...DEFAULT_MODELS];
let exercises = [];
let currentUser = null;
let currentRole = null;

/* =========================
   HELPERS
========================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function safeGet(sel) {
  return $(sel) || null;
}

function setStatus(msg, ok = true) {
  const pill = safeGet("#statusPill");
  if (!pill) return;
  pill.textContent = msg;
  pill.style.color = ok ? "#18c37d" : "#ffb9bd";
}

function setLoginMsg(msg) {
  const el = safeGet("#loginMsg");
  if (el) el.textContent = msg || "";
}

function normalizeEmail(userLike) {
  const u = (userLike || "").trim().toLowerCase();
  if (!u) return "";
  if (u.includes("@")) return u;
  return `${u}@katielle.app`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* =========================================================
   YOUTUBE
========================================================= */
function youtubeToEmbed(url) {
  if (!url) return "";
  let u = String(url).trim();
  u = u.replace(/\s+/g, "");

  if (u.includes("youtube.com/embed/")) return u;

  if (u.includes("youtube.com/shorts/")) {
    const id = u.split("youtube.com/shorts/")[1]?.split("?")[0]?.split("&")[0]?.split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}?playsinline=1` : "";
  }

  if (u.includes("youtu.be/")) {
    const id = u.split("youtu.be/")[1]?.split("?")[0]?.split("&")[0]?.split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}?playsinline=1` : "";
  }

  if (u.includes("watch?v=")) {
    const id = u.split("watch?v=")[1]?.split("&")[0];
    return id ? `https://www.youtube.com/embed/${id}?playsinline=1` : "";
  }

  const m = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m && m[1]) return `https://www.youtube.com/embed/${m[1]}?playsinline=1`;

  return "";
}

function youtubeGetId(url) {
  if (!url) return "";
  let u = String(url).trim().replace(/\s+/g, "");

  if (u.includes("youtube.com/shorts/")) {
    return u.split("youtube.com/shorts/")[1]?.split("?")[0]?.split("&")[0]?.split("/")[0] || "";
  }
  if (u.includes("youtu.be/")) {
    return u.split("youtu.be/")[1]?.split("?")[0]?.split("&")[0]?.split("/")[0] || "";
  }
  if (u.includes("watch?v=")) {
    return u.split("watch?v=")[1]?.split("&")[0] || "";
  }
  if (u.includes("youtube.com/embed/")) {
    return u.split("youtube.com/embed/")[1]?.split("?")[0]?.split("&")[0]?.split("/")[0] || "";
  }

  const m = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m && m[1]) return m[1];

  return "";
}

function youtubeThumb(url) {
  const id = youtubeGetId(url);
  if (!id) return "";
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/* =========================
   FIRESTORE PATHS
========================= */
const configRef = doc(db, "app", "config");
const userRef = (uid) => doc(db, "users", uid);
const exercisesCol = collection(db, "exercises");
const plansRef = (uid) => doc(db, "plans", uid);
const progressCol = collection(db, "progress");
const progressPhotosCol = collection(db, "progressPhotos");

/* =========================
   CONFIG
========================= */
async function ensureConfig() {
  const snap = await getDoc(configRef);
  if (!snap.exists()) {
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

  if (!groups.includes("Comece por aqui")) groups.unshift("Comece por aqui");
}

/* =========================
   UI NAV
========================= */
function showView(v) {
  $$(".view").forEach(x => x.classList.add("hidden"));
  safeGet("#view-" + v)?.classList.remove("hidden");

  $$(".menu-item").forEach(b => b.classList.remove("active"));
  document.querySelector(`.menu-item[data-view="${v}"]`)?.classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    alunos: "Alunos",
    exercicios: "Exercícios",
    treinos: "Treinos",
    evolucao: "Evolução",
    fotos: "Fotos",
    backup: "Backup",
    videos: "Vídeos",
    meutreino: "Meu Treino"
  };
  const t = safeGet("#viewTitle");
  if (t) t.textContent = titles[v] || "Painel";
}

/* =========================
   SELECTS
========================= */
function fillGroups() {
  const exGroup = safeGet("#exGroup");
  const filterGroup = safeGet("#filterGroup");
  const planGroup = safeGet("#planGroup");
  const studentFilter = safeGet("#studentFilterGroup");

  if (exGroup) {
    exGroup.innerHTML = "";
    groups.forEach(g => (exGroup.innerHTML += `<option value="${g}">${g}</option>`));
  }
  if (planGroup) {
    planGroup.innerHTML = "";
    groups.forEach(g => (planGroup.innerHTML += `<option value="${g}">${g}</option>`));
  }
  if (filterGroup) {
    filterGroup.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g => (filterGroup.innerHTML += `<option value="${g}">${g}</option>`));
  }
  if (studentFilter) {
    studentFilter.innerHTML = `<option value="ALL">Todos</option>`;
    groups.forEach(g => (studentFilter.innerHTML += `<option value="${g}">${g}</option>`));
  }
}

function fillPlanDays() {
  const sel = safeGet("#planDay");
  if (!sel) return;

  const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  sel.innerHTML = "";
  days.forEach(d => {
    models.forEach(m => {
      sel.innerHTML += `<option value="${d} - ${m}">${d} - ${m}</option>`;
    });
  });
  models.forEach(m => (sel.innerHTML += `<option value="${m}">${m}</option>`));
}

/* =========================
   LOGIN TABS
========================= */
function bindLoginTabs() {
  const tabAdmin = safeGet("#tabAdmin");
  const tabAluno = safeGet("#tabAluno");
  const formAdmin = safeGet("#formAdmin");
  const formAluno = safeGet("#formAluno");

  if (tabAdmin) tabAdmin.onclick = () => {
    tabAdmin.classList.add("active");
    tabAluno?.classList.remove("active");
    formAdmin?.classList.remove("hidden");
    formAluno?.classList.add("hidden");
    setLoginMsg("");
  };

  if (tabAluno) tabAluno.onclick = () => {
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
async function loginAdmin() {
  const btn = safeGet("#btnLoginAdmin");
  if (btn) btn.disabled = true;

  setLoginMsg("Entrando...");

  const email = normalizeEmail(safeGet("#loginUser")?.value);
  const pass = (safeGet("#loginPass")?.value || "").trim();
  if (!email || !pass) {
    setLoginMsg("Preencha usuário e senha");
    if (btn) btn.disabled = false;
    return;
  }

  try {
    await persistenceReady;
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.error("LOGIN ADMIN ERROR:", e);
    setLoginMsg(e?.message || "Erro no login");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loginAluno() {
  const btn = safeGet("#btnLoginAluno");
  if (btn) btn.disabled = true;

  setLoginMsg("Entrando...");

  const email = normalizeEmail(safeGet("#studentUserLogin")?.value);
  const pass = (safeGet("#studentPassLogin")?.value || "").trim();
  if (!email || !pass) {
    setLoginMsg("Preencha usuário e senha");
    if (btn) btn.disabled = false;
    return;
  }

  try {
    await persistenceReady;
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.error("LOGIN ALUNO ERROR:", e);
    setLoginMsg(e?.message || "Erro no login");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function logout() {
  await signOut(auth);
}

/* =========================
   USERS / ROLES
========================= */
async function ensureUserDocOnFirstLogin(u) {
  const ref = userRef(u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    role: "student",
    name: u.email || "Aluno",
    accessType: "paid",
    createdAt: serverTimestamp()
  });
}

async function getMyRole(uid) {
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) return null;
  return (snap.data() || {}).role || null;
}

/* =========================
   EXERCISES
========================= */
function listenExercises() {
  return onSnapshot(exercisesCol, (snap) => {
    exercises = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

    exercises.sort((a, b) => {
      const g = (a.group || "").localeCompare(b.group || "");
      if (g !== 0) return g;
      return (a.name || "").localeCompare(b.name || "");
    });

    if (currentRole === "admin") renderExercisesAdmin();
    if (currentRole === "student") renderStudentVideos();
    updateDashboard();
  }, (err) => {
    console.error("listenExercises:", err);
    setStatus("Erro ao carregar exercícios (Firestore)", false);
  });
}

async function addExercise() {
  const g = safeGet("#exGroup")?.value || groups[0] || "Geral";
  const n = (safeGet("#exName")?.value || "").trim();
  const y = (safeGet("#exYoutube")?.value || "").trim();

  if (!n) return setStatus("Digite o nome do exercício", false);

  if (y && !youtubeToEmbed(y)) {
    return setStatus("Cole um link válido do YouTube (watch / youtu.be / shorts)", false);
  }

  try {
    await addDoc(exercisesCol, {
      group: g,
      name: n,
      youtube: y || "",
      createdAt: serverTimestamp()
    });

    if (safeGet("#exName")) safeGet("#exName").value = "";
    if (safeGet("#exYoutube")) safeGet("#exYoutube").value = "";

    setStatus("Exercício adicionado", true);
  } catch (e) {
    console.error(e);
    setStatus("Erro ao adicionar exercício", false);
  }
}

async function updateExercise(id, patch) {
  try {
    await updateDoc(doc(db, "exercises", id), patch);
    setStatus("Atualizado", true);
  } catch (e) {
    console.error(e);
    setStatus("Erro ao atualizar", false);
  }
}

async function deleteExercise(id) {
  if (!confirm("Excluir exercício?")) return;
  try {
    await deleteDoc(doc(db, "exercises", id));
    setStatus("Excluído", true);
  } catch (e) {
    console.error(e);
    setStatus("Erro ao excluir", false);
  }
}

/* =========================
   BULK
========================= */
function bindBulk() {
  const toggle = safeGet("#btnBulkToggle");
  const box = safeGet("#bulkBox");
  const cancel = safeGet("#btnBulkCancel");
  const save = safeGet("#btnBulkSave");
  const text = safeGet("#bulkText");
  if (!toggle || !box || !cancel || !save || !text) return;

  toggle.onclick = () => box.classList.toggle("hidden");
  cancel.onclick = () => {
    box.classList.add("hidden");
    text.value = "";
  };

  save.onclick = async () => {
    const g = safeGet("#exGroup")?.value || groups[0] || "Geral";
    const lines = text.value.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return setStatus("Cole 1 exercício por linha", false);

    let count = 0;
    for (const name of lines) {
      const exists = exercises.some(e =>
        (e.group === g) && ((e.name || "").toLowerCase() === name.toLowerCase())
      );
      if (!exists) {
        await addDoc(exercisesCol, { group: g, name, youtube: "", createdAt: serverTimestamp() });
        count++;
      }
    }

    text.value = "";
    box.classList.add("hidden");
    setStatus(`Lote salvo: ${count}`, true);
  };
}

/* =========================
   ADMIN: TABELA EXERCÍCIOS
========================= */
function renderExercisesAdmin() {
  const tb = safeGet("#exercisesTable tbody");
  if (!tb) return;

  const f = safeGet("#filterGroup")?.value || "ALL";
  const q = (safeGet("#searchExercise")?.value || "").trim().toLowerCase();

  const filtered = exercises.filter(e =>
    (f === "ALL" || e.group === f) &&
    ((e.name || "").toLowerCase().includes(q))
  );

  tb.innerHTML = "";

  if (!filtered.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Nenhum exercício encontrado.</td></tr>`;
    return;
  }

  filtered.forEach(e => {
    const ok = !!youtubeToEmbed(e.youtube || "");
    tb.innerHTML += `
      <tr>
        <td>${e.group || ""}</td>
        <td>${e.name || ""}</td>
        <td>${ok ? "OK" : "—"}</td>
        <td style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn" type="button" data-edit="${e.id}">Editar</button>
          <button class="btn danger" type="button" data-del="${e.id}">Excluir</button>

          <input data-url="${e.id}" placeholder="Cole URL do YouTube (watch/youtu.be/shorts)"
            value="${String(e.youtube || "").replaceAll('"', "&quot;")}"
            style="height:40px; min-width:220px;">

          <button class="btn primary" type="button" data-saveurl="${e.id}">Salvar URL</button>
        </td>
      </tr>
    `;
  });

  tb.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = () => deleteExercise(btn.dataset.del);
  });

  tb.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.edit;
      const ex = exercises.find(x => x.id === id);
      if (!ex) return;

      const newName = (prompt("Nome:", ex.name || "") || "").trim();
      if (!newName) return;

      const newGroup = (prompt("Grupo:", ex.group || "") || "").trim() || ex.group;
      const newUrl = (prompt("URL YouTube (watch/youtu.be/shorts) ou vazio:", ex.youtube || "") || "").trim();

      if (newUrl && !youtubeToEmbed(newUrl)) {
        alert("Link inválido. Use watch?v=, youtu.be ou youtube.com/shorts/");
        return;
      }

      updateExercise(id, { name: newName, group: newGroup, youtube: newUrl });
    };
  });

  tb.querySelectorAll("[data-saveurl]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.saveurl;
      const input = tb.querySelector(`[data-url="${id}"]`);
      const url = (input?.value || "").trim();

      if (url && !youtubeToEmbed(url)) {
        alert("Link inválido. Use watch?v=, youtu.be ou youtube.com/shorts/");
        return;
      }

      updateExercise(id, { youtube: url });
    };
  });
}

/* =========================
   STUDENTS
========================= */
function addMonthsISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString();
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

function daysLeft(iso) {
  if (!iso) return 999999;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function getAccessLabel(user) {
  if (user?.accessType === "trial") return "Teste grátis";
  return "Plano pago";
}

function getStudentStatus(user) {
  const left = daysLeft(user?.expiresAt);
  if (left < 0) return "Vencido";
  if (user?.accessType === "trial") return "Teste grátis";
  return "Ativo";
}

function showExpiredOverlay(userData = {}) {
  const overlay = safeGet("#expiredOverlay");
  if (!overlay) return;

  const title = safeGet("#expiredTitle");
  const text = safeGet("#expiredText");

  if (userData?.accessType === "trial") {
    if (title) title.textContent = "Seu teste grátis expirou";
    if (text) {
      text.textContent = "Seu acesso de 3 dias terminou. Fale com a administradora para liberar o plano completo.";
    }
  } else {
    if (title) title.textContent = "Seu plano expirou";
    if (text) {
      text.textContent = "Seu acesso não está mais ativo. Fale com a administradora para renovar seu plano.";
    }
  }

  overlay.classList.remove("hidden");
}

function hideExpiredOverlay() {
  const overlay = safeGet("#expiredOverlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
}

function updateStudentHero(me = {}) {
  const badge = safeGet("#studentAccessBadge");
  const statusText = safeGet("#studentStatusText");
  const expireText = safeGet("#studentExpireText");
  const welcomeLine = safeGet("#welcomeLine");

  const left = daysLeft(me.expiresAt);
  const status = getStudentStatus(me);

  if (badge) {
    badge.textContent = me.accessType === "trial" ? "Teste grátis" : "Plano ativo";
    badge.className = me.accessType === "trial"
      ? "student-badge trial"
      : "student-badge paid";
  }

  if (statusText) statusText.textContent = status;
  if (expireText) expireText.textContent = fmtDate(me.expiresAt);

  if (welcomeLine) {
    if (me.accessType === "trial" && left >= 0) {
      welcomeLine.textContent = `Olá, ${me.name || "Aluno"}! Seu teste grátis termina em ${left} dia(s).`;
    } else if (left >= 0) {
      welcomeLine.textContent = `Olá, ${me.name || "Aluno"}! Seu acesso está ativo até ${fmtDate(me.expiresAt)}.`;
    } else {
      welcomeLine.textContent = `Olá, ${me.name || "Aluno"}! Seu acesso está vencido.`;
    }
  }
}

async function createStudent(isTrial = false) {
  const name = (safeGet("#studentName")?.value || "").trim();
  const username = (safeGet("#studentUser")?.value || "").trim().toLowerCase();
  const pass = (safeGet("#studentPass")?.value || "").trim();
  const planMonths = Number(safeGet("#studentPlan")?.value || "3");

  if (!name || !username || pass.length < 4) {
    return setStatus("Dados inválidos (senha mínimo 4)", false);
  }

  const email = normalizeEmail(username);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const uid = cred.user.uid;

    const userData = {
      role: "student",
      name,
      username,
      createdAt: serverTimestamp()
    };

    if (isTrial) {
      userData.accessType = "trial";
      userData.trialDays = 3;
      userData.planMonths = 0;
      userData.expiresAt = addDaysISO(3);
    } else {
      userData.accessType = "paid";
      userData.planMonths = planMonths;
      userData.trialDays = 0;
      userData.expiresAt = addMonthsISO(planMonths);
    }

    await setDoc(userRef(uid), userData, { merge: true });
    await setDoc(plansRef(uid), { days: {} }, { merge: true });

    if (safeGet("#studentName")) safeGet("#studentName").value = "";
    if (safeGet("#studentUser")) safeGet("#studentUser").value = "";
    if (safeGet("#studentPass")) safeGet("#studentPass").value = "";

    await signOut(secondaryAuth);

    if (isTrial) {
      setStatus("Aluno criado com teste grátis de 3 dias ✅", true);
    } else {
      setStatus("Aluno criado ✅", true);
    }

    await renderStudentsAsync();
    await loadStudentsForSelect();
    await loadStudentsForEvolutionSelect();
    await loadStudentsForPhotoSelect();
    await updateDashboard();
  } catch (e) {
    console.error(e);
    setStatus("Erro: Auth Email/Senha não ativo ou usuário já existe", false);
  }
}

async function createTrialStudent() {
  await createStudent(true);
}

async function loadAllStudents() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map(d => ({ uid: d.id, ...(d.data() || {}) }))
    .filter(u => u.role === "student")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

async function renderStudentsAsync() {
  const tb = safeGet("#studentsTable tbody");
  if (!tb) return;

  const students = await loadAllStudents();
  tb.innerHTML = "";

  students.forEach(s => {
    const left = daysLeft(s.expiresAt);
    const access = getAccessLabel(s);
    const status = left >= 0 ? "Ativo" : "Vencido";
    const duration = s.accessType === "trial" ? "3 dias" : `${s.planMonths || "—"} meses`;

    tb.innerHTML += `
      <tr>
        <td>${s.name || ""}</td>
        <td>${s.username || ""}</td>
        <td>${access}</td>
        <td>${duration}</td>
        <td>${fmtDate(s.expiresAt)} (${left}d)</td>
        <td>${status}</td>
        <td>
          <button class="btn danger" type="button" data-delst="${s.uid}">Excluir</button>
          <button class="btn" type="button" data-renew="${s.uid}">Renovar</button>
        </td>
      </tr>
    `;
  });

  tb.querySelectorAll("[data-delst]").forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.dataset.delst;
      if (!confirm("Excluir aluno (dados Firestore)?")) return;
      try {
        await deleteDoc(userRef(uid));
        await deleteDoc(plansRef(uid));
        setStatus("Aluno removido", true);
        await renderStudentsAsync();
        await loadStudentsForSelect();
        await loadStudentsForEvolutionSelect();
        await loadStudentsForPhotoSelect();
        await updateDashboard();
      } catch (e) {
        console.error(e);
        setStatus("Erro ao excluir", false);
      }
    };
  });

  tb.querySelectorAll("[data-renew]").forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.dataset.renew;
      const months = Number(prompt("Renovar por quantos meses? (3/6/12)", "3") || "0");
      if (!months) return;

      try {
        await updateDoc(userRef(uid), {
          accessType: "paid",
          planMonths: months,
          trialDays: 0,
          expiresAt: addMonthsISO(months)
        });
        setStatus("Plano renovado", true);
        await renderStudentsAsync();
        await updateDashboard();
      } catch (e) {
        console.error(e);
        setStatus("Erro ao renovar", false);
      }
    };
  });
}

/* =========================
   EVOLUÇÃO
========================= */
async function loadStudentsForEvolutionSelect() {
  const sel = safeGet("#evolutionStudent");
  if (!sel) return;

  const students = await loadAllStudents();
  sel.innerHTML = "";

  students.forEach(s => {
    sel.innerHTML += `<option value="${s.uid}">${s.name || s.username || s.uid}</option>`;
  });
}

async function saveEvolution() {
  const studentId = safeGet("#evolutionStudent")?.value || "";
  const date = (safeGet("#evolutionDate")?.value || "").trim();
  const weight = Number(safeGet("#evolutionWeight")?.value || 0);
  const arm = Number(safeGet("#evolutionArm")?.value || 0);
  const waist = Number(safeGet("#evolutionWaist")?.value || 0);
  const hip = Number(safeGet("#evolutionHip")?.value || 0);
  const thigh = Number(safeGet("#evolutionThigh")?.value || 0);
  const notes = (safeGet("#evolutionNotes")?.value || "").trim();

  if (!studentId || !date) {
    return setStatus("Selecione aluno e data da avaliação", false);
  }

  try {
    await addDoc(progressCol, {
      studentId,
      date,
      weight,
      arm,
      waist,
      hip,
      thigh,
      notes,
      createdAt: serverTimestamp()
    });

    if (safeGet("#evolutionDate")) safeGet("#evolutionDate").value = todayISO();
    if (safeGet("#evolutionWeight")) safeGet("#evolutionWeight").value = "";
    if (safeGet("#evolutionArm")) safeGet("#evolutionArm").value = "";
    if (safeGet("#evolutionWaist")) safeGet("#evolutionWaist").value = "";
    if (safeGet("#evolutionHip")) safeGet("#evolutionHip").value = "";
    if (safeGet("#evolutionThigh")) safeGet("#evolutionThigh").value = "";
    if (safeGet("#evolutionNotes")) safeGet("#evolutionNotes").value = "";

    setStatus("Avaliação salva com sucesso ✅", true);

    if (currentRole === "admin") {
      await renderEvolutionAdmin();
    }
  } catch (e) {
    console.error(e);
    setStatus("Erro ao salvar avaliação", false);
  }
}

async function getEvolutionEntries(studentId) {
  if (!studentId) return [];

  const qRef = query(progressCol, where("studentId", "==", studentId));
  const snap = await getDocs(qRef);

  const entries = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

  entries.sort((a, b) => {
    const da = new Date(a.date || "1900-01-01");
    const dbb = new Date(b.date || "1900-01-01");
    return dbb - da;
  });

  return entries;
}

function renderEvolutionSummary(entries) {
  const latest = entries[0] || null;

  safeGet("#sumWeight") && (safeGet("#sumWeight").textContent = latest?.weight ? `${latest.weight} kg` : "—");
  safeGet("#sumArm") && (safeGet("#sumArm").textContent = latest?.arm ? `${latest.arm} cm` : "—");
  safeGet("#sumWaist") && (safeGet("#sumWaist").textContent = latest?.waist ? `${latest.waist} cm` : "—");
  safeGet("#sumHip") && (safeGet("#sumHip").textContent = latest?.hip ? `${latest.hip} cm` : "—");
  safeGet("#sumThigh") && (safeGet("#sumThigh").textContent = latest?.thigh ? `${latest.thigh} cm` : "—");
  safeGet("#sumDate") && (safeGet("#sumDate").textContent = latest?.date ? latest.date : "—");
}

function renderEvolutionHistory(entries) {
  const box = safeGet("#evolutionHistory");
  if (!box) return;

  if (!entries.length) {
    box.innerHTML = `<div class="muted">Nenhuma avaliação encontrada.</div>`;
    return;
  }

  box.innerHTML = entries.map(item => `
    <div class="evolution-entry">
      <div class="evolution-entry-top">
        <strong>${item.date || "Sem data"}</strong>
      </div>

      <div class="evolution-entry-grid">
        <div><span>Peso:</span> <b>${item.weight || "—"} kg</b></div>
        <div><span>Braço:</span> <b>${item.arm || "—"} cm</b></div>
        <div><span>Cintura:</span> <b>${item.waist || "—"} cm</b></div>
        <div><span>Quadril:</span> <b>${item.hip || "—"} cm</b></div>
        <div><span>Coxa:</span> <b>${item.thigh || "—"} cm</b></div>
      </div>

      ${item.notes ? `<div class="evolution-notes"><span>Observações:</span> ${item.notes}</div>` : ``}
    </div>
  `).join("");
}

async function renderEvolutionAdmin() {
  safeGet("#evolutionAdminBox")?.classList.remove("hidden");

  if (safeGet("#evolutionDate") && !safeGet("#evolutionDate").value) {
    safeGet("#evolutionDate").value = todayISO();
  }

  await loadStudentsForEvolutionSelect();

  const studentId = safeGet("#evolutionStudent")?.value || "";
  const entries = await getEvolutionEntries(studentId);

  renderEvolutionSummary(entries);
  renderEvolutionHistory(entries);
}

async function renderEvolutionStudent() {
  safeGet("#evolutionAdminBox")?.classList.add("hidden");

  const studentId = currentUser?.uid || "";
  const entries = await getEvolutionEntries(studentId);

  renderEvolutionSummary(entries);
  renderEvolutionHistory(entries);
}

/* =========================
   FOTOS
========================= */
async function loadStudentsForPhotoSelect(selectedUid = "") {
  const sel = safeGet("#photoStudent");
  if (!sel) return;

  const currentValue = selectedUid || sel.value || "";
  const students = await loadAllStudents();

  sel.innerHTML = "";

  if (!students.length) {
    sel.innerHTML = `<option value="">Nenhum aluno encontrado</option>`;
    return;
  }

  students.forEach((s, index) => {
    const label = s.name || s.username || s.uid || `Aluno ${index + 1}`;
    const selected = currentValue === s.uid ? "selected" : "";
    sel.innerHTML += `<option value="${s.uid}" ${selected}>${label}</option>`;
  });

  if (!sel.value && students[0]) {
    sel.value = students[0].uid;
  }
}

async function uploadSinglePhoto(file, studentId, date, label) {
  if (!file) return "";

  const safeName = String(file.name || "foto.jpg").replace(/[^\w.\-]/g, "_");
  const path = `progress-photos/${studentId}/${date}/${label}-${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

async function saveProgressPhotos() {
  const studentId = safeGet("#photoStudent")?.value || "";
  const date = (safeGet("#photoDate")?.value || "").trim();

  const frontFile = safeGet("#photoFront")?.files?.[0] || null;
  const sideFile = safeGet("#photoSide")?.files?.[0] || null;
  const backFile = safeGet("#photoBack")?.files?.[0] || null;

  if (!studentId || !date) {
    return setStatus("Selecione aluno e data das fotos", false);
  }

  if (!frontFile && !sideFile && !backFile) {
    return setStatus("Selecione pelo menos uma foto", false);
  }

  try {
    setStatus("Enviando fotos...", true);

    const frontUrl = await uploadSinglePhoto(frontFile, studentId, date, "front");
    const sideUrl = await uploadSinglePhoto(sideFile, studentId, date, "side");
    const backUrl = await uploadSinglePhoto(backFile, studentId, date, "back");

    await addDoc(progressPhotosCol, {
      studentId,
      date,
      front: frontUrl,
      side: sideUrl,
      back: backUrl,
      createdAt: serverTimestamp()
    });

    if (safeGet("#photoDate")) safeGet("#photoDate").value = todayISO();
    if (safeGet("#photoFront")) safeGet("#photoFront").value = "";
    if (safeGet("#photoSide")) safeGet("#photoSide").value = "";
    if (safeGet("#photoBack")) safeGet("#photoBack").value = "";

    setStatus("Fotos salvas com sucesso ✅", true);

    if (currentRole === "admin") {
      await renderPhotosAdmin();
    } else {
      await renderPhotosStudent();
    }
  } catch (e) {
    console.error("saveProgressPhotos:", e);
    setStatus("Erro ao salvar fotos", false);
  }
}

async function getPhotoEntries(studentId) {
  if (!studentId) return [];

  const qRef = query(progressPhotosCol, where("studentId", "==", studentId));
  const snap = await getDocs(qRef);

  const entries = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

  entries.sort((a, b) => {
    const da = new Date(a.date || "1900-01-01");
    const dbb = new Date(b.date || "1900-01-01");
    return dbb - da;
  });

  return entries;
}

function renderPhotoGallery(entries) {
  const box = safeGet("#photosGallery");
  if (!box) return;

  if (!entries.length) {
    box.innerHTML = `<div class="muted">Nenhuma foto encontrada.</div>`;
    return;
  }

  box.innerHTML = entries.map(item => `
    <div class="photo-entry">
      <div class="photo-entry-title">${item.date || "Sem data"}</div>

      <div class="photo-entry-grid">
        ${item.front ? `<div class="photo-thumb-box"><span>Frente</span><img src="${item.front}" alt="Frente"></div>` : ``}
        ${item.side ? `<div class="photo-thumb-box"><span>Lado</span><img src="${item.side}" alt="Lado"></div>` : ``}
        ${item.back ? `<div class="photo-thumb-box"><span>Costas</span><img src="${item.back}" alt="Costas"></div>` : ``}
      </div>
    </div>
  `).join("");
}

async function renderPhotosAdmin() {
  safeGet("#photosAdminBox")?.classList.remove("hidden");

  if (safeGet("#photoDate") && !safeGet("#photoDate").value) {
    safeGet("#photoDate").value = todayISO();
  }

  const selectedBeforeReload = safeGet("#photoStudent")?.value || "";

  await loadStudentsForPhotoSelect(selectedBeforeReload);

  const studentId = safeGet("#photoStudent")?.value || "";

  if (!studentId) {
    renderPhotoGallery([]);
    return;
  }

  const entries = await getPhotoEntries(studentId);
  renderPhotoGallery(entries);
}

async function renderPhotosStudent() {
  safeGet("#photosAdminBox")?.classList.add("hidden");

  const studentId = currentUser?.uid || "";
  const entries = await getPhotoEntries(studentId);
  renderPhotoGallery(entries);
}

/* =========================
   PLANS
========================= */
async function loadStudentsForSelect() {
  const sel = safeGet("#planStudent");
  if (!sel) return;

  const students = await loadAllStudents();
  sel.innerHTML = "";
  students.forEach(s => {
    sel.innerHTML += `<option value="${s.uid}">${s.name || s.username || s.uid}</option>`;
  });
}

async function getPlanDays(uid) {
  const snap = await getDoc(plansRef(uid));
  if (!snap.exists()) return {};
  return (snap.data() || {}).days || {};
}

async function setPlanDays(uid, days) {
  await setDoc(plansRef(uid), { days }, { merge: true });
}

function fillPlanExercises() {
  const g = safeGet("#planGroup")?.value;
  const sel = safeGet("#planExercise");
  if (!sel) return;
  sel.innerHTML = "";

  exercises.filter(e => e.group === g).forEach(e => {
    sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
  });
}

async function addToPlan() {
  const uid = safeGet("#planStudent")?.value;
  const day = safeGet("#planDay")?.value;
  const exId = safeGet("#planExercise")?.value;
  const ex = exercises.find(e => e.id === exId);

  if (!uid || !day || !ex) return setStatus("Selecione aluno / dia / exercício", false);

  const days = await getPlanDays(uid);
  if (!days[day]) days[day] = [];

  days[day].push({
    id: crypto.randomUUID?.() || ("it_" + Date.now()),
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
  await updateDashboard();
}

async function renderPlansAdmin() {
  const uid = safeGet("#planStudent")?.value;
  const box = safeGet("#planPreview");
  if (!box) return;
  box.innerHTML = "";

  if (!uid) {
    box.innerHTML = `<div class="muted">Selecione um aluno.</div>`;
    return;
  }

  const days = await getPlanDays(uid);
  const keys = Object.keys(days || {});
  if (!keys.length) {
    box.innerHTML = `<div class="muted">Nenhum treino criado.</div>`;
    return;
  }

  keys.forEach(day => {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (days[day] || []).forEach(it => {
      const emb = youtubeToEmbed(it.youtube);
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div><b>${it.name}</b> (${it.group}) — ${it.sets}x${it.reps} • Descanso: ${it.rest}</div>
        ${it.note ? `<div class="muted">Obs: ${it.note}</div>` : ``}
        ${emb ? `<div class="video-box"><iframe src="${emb}" allowfullscreen></iframe></div>` : ``}
      `;
      dayDiv.appendChild(item);
    });
  });
}

async function clearDay() {
  const uid = safeGet("#planStudent")?.value;
  const day = safeGet("#planDay")?.value;
  if (!uid || !day) return setStatus("Selecione aluno e dia", false);

  const days = await getPlanDays(uid);
  if (!days[day]) return setStatus("Nada para limpar", false);
  if (!confirm(`Limpar treino de: ${day}?`)) return;

  delete days[day];
  await setPlanDays(uid, days);
  setStatus("Dia limpo", true);
  await renderPlansAdmin();
  await updateDashboard();
}

async function clearAllPlans() {
  const uid = safeGet("#planStudent")?.value;
  if (!uid) return setStatus("Selecione um aluno", false);
  if (!confirm("Apagar TODOS os treinos deste aluno?")) return;

  await setPlanDays(uid, {});
  setStatus("Treinos apagados", true);
  await renderPlansAdmin();
  await updateDashboard();
}

/* =========================
   DASHBOARD
========================= */
async function updateDashboard() {
  const studentsEl = safeGet("#dashStudents");
  const exercisesEl = safeGet("#dashExercises");
  const plansEl = safeGet("#dashPlans");

  try {
    const students = await loadAllStudents();
    if (studentsEl) studentsEl.textContent = String(students.length);
  } catch {
    if (studentsEl) studentsEl.textContent = "0";
  }

  if (exercisesEl) exercisesEl.textContent = String(exercises.length);

  try {
    const plansSnap = await getDocs(collection(db, "plans"));
    let totalBlocks = 0;

    plansSnap.docs.forEach(d => {
      const data = d.data() || {};
      const days = data.days || {};
      totalBlocks += Object.keys(days).length;
    });

    if (plansEl) plansEl.textContent = String(totalBlocks);
  } catch {
    if (plansEl) plansEl.textContent = "0";
  }
}

/* =========================
   ALUNO: MODAL
========================= */
function bindModal() {
  const modal = safeGet("#videoModal");
  if (!modal) return;

  const closeAll = () => {
    const iframe = safeGet("#modalIframe");
    if (iframe) iframe.src = "";
    modal.classList.add("hidden");
  };

  safeGet("#modalClose")?.addEventListener("click", closeAll);
  safeGet("#modalX")?.addEventListener("click", closeAll);
}

function openVideoModal(title, url) {
  const modal = safeGet("#videoModal");
  if (!modal) return;

  const iframe = safeGet("#modalIframe");
  const t = safeGet("#modalTitle");

  const emb = youtubeToEmbed(url);
  if (t) t.textContent = title || "Vídeo";
  if (iframe) iframe.src = emb || "";

  modal.classList.remove("hidden");
}

function renderStudentWelcome(name) {
  const title = safeGet("#welcomeStudentTitle");
  const text = safeGet("#welcomeStudentText");
  if (title) title.textContent = `Bem-vindo(a), ${name || "Aluno(a)"}!`;
  if (text) text.textContent = `Use a busca e os grupos abaixo. As setas passam o carrossel.`;
}

/* =========================
   ALUNO: CARDS
========================= */
function videoCardHTML(ex) {
  const playable = !!(ex.youtube && youtubeToEmbed(ex.youtube));
  const thumb = playable ? youtubeThumb(ex.youtube) : "";

  const badge = playable
    ? `<span class="badge-ok">PLAY</span>`
    : `<span class="badge-miss">SEM VÍDEO</span>`;

  return `
    <button class="vcard" type="button" data-play="${ex.id}">
      <div class="vcard-thumb" style="background-image:url('${thumb}');">
        ${!playable ? `<div class="thumb-no">SEM VÍDEO</div>` : ``}
      </div>

      <div class="vcard-top">
        <div class="vcard-name">${ex.name || ""}</div>
        <div class="vcard-group">${ex.group || ""}</div>
      </div>

      <div class="vcard-badge">${badge}</div>
    </button>
  `;
}

function buildRow(title, railId, itemsHTML) {
  return `
    <div class="row-netflix">
      <div class="row-title">${title}</div>

      <button class="carousel-btn left" type="button" data-rail="${railId}" aria-label="Voltar">‹</button>
      <button class="carousel-btn right" type="button" data-rail="${railId}" aria-label="Avançar">›</button>

      <div class="row-rail" id="${railId}">
        ${itemsHTML.join("")}
      </div>
    </div>
  `;
}

function bindCarouselArrows(container) {
  container.querySelectorAll(".carousel-btn").forEach(btn => {
    btn.onclick = () => {
      const railId = btn.dataset.rail;
      const rail = container.querySelector(`#${CSS.escape(railId)}`);
      if (!rail) return;

      const step = Math.max(rail.clientWidth * 0.85, 220);

      rail.scrollBy({
        left: btn.classList.contains("right") ? step : -step,
        behavior: "smooth"
      });
    };
  });
}

/* =========================
   ALUNO: VÍDEOS
========================= */
function renderStudentVideos() {
  const grid = safeGet("#studentVideosGrid");
  if (!grid) return;

  const q = (safeGet("#studentSearch")?.value || "").trim().toLowerCase();
  const gFilter = safeGet("#studentFilterGroup")?.value || "ALL";

  const list = exercises.filter(ex => {
    const okGroup = (gFilter === "ALL") || (ex.group === gFilter);
    const okName = (ex.name || "").toLowerCase().includes(q);
    return okGroup && okName;
  });

  const byGroup = {};
  list.forEach(ex => {
    byGroup[ex.group] = byGroup[ex.group] || [];
    byGroup[ex.group].push(ex);
  });

  let html = "";

  const startArr = (byGroup["Comece por aqui"] || []).map(videoCardHTML);
  if (startArr.length) html += buildRow("Comece por aqui", "rail_start", startArr);

  groups.forEach((g, idx) => {
    if (g === "Comece por aqui") return;
    const arr = (byGroup[g] || []).map(videoCardHTML);
    if (arr.length) html += buildRow(g, `rail_${idx}`, arr);
  });

  if (!html) html = `<div class="muted">Nenhum exercício encontrado.</div>`;

  grid.innerHTML = html;

  bindCarouselArrows(grid);

  grid.querySelectorAll("[data-play]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.play;
      const ex = exercises.find(x => x.id === id);
      if (!ex) return;

      const emb = youtubeToEmbed(ex.youtube || "");
      if (!emb) {
        alert("Este exercício ainda não tem URL do YouTube.");
        return;
      }
      openVideoModal(ex.name, ex.youtube);
    };
  });
}

/* =========================
   ALUNO: Meu Treino
========================= */
async function renderPlansStudent() {
  const box = safeGet("#studentPlanPreview");
  if (!box) return;
  box.innerHTML = "";

  const uid = currentUser?.uid;
  if (!uid) {
    box.innerHTML = `<div class="muted">Faça login.</div>`;
    return;
  }

  const days = await getPlanDays(uid);
  const keys = Object.keys(days || {});
  if (!keys.length) {
    box.innerHTML = `<div class="muted">Seu treino ainda não foi criado.</div>`;
    return;
  }

  keys.forEach(day => {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.innerHTML = `<b>${day}</b>`;
    box.appendChild(dayDiv);

    (days[day] || []).forEach(it => {
      const emb = youtubeToEmbed(it.youtube);
      const item = document.createElement("div");
      item.className = "item";
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
function bindMenu() {
  $$(".menu-item").forEach(btn => {
    btn.onclick = async () => {
      const v = btn.dataset.view;
      showView(v);

      if (currentRole === "admin") {
        if (v === "dashboard") await updateDashboard();
        if (v === "alunos") await renderStudentsAsync();
        if (v === "exercicios") renderExercisesAdmin();
        if (v === "treinos") await renderPlansAdmin();
        if (v === "evolucao") await renderEvolutionAdmin();
        if (v === "fotos") await renderPhotosAdmin();
      } else {
        if (v === "videos") renderStudentVideos();
        if (v === "meutreino") await renderPlansStudent();
        if (v === "evolucao") await renderEvolutionStudent();
        if (v === "fotos") await renderPhotosStudent();
      }
    };
  });
}

/* =========================
   INIT
========================= */
async function init() {
  bindLoginTabs();
  bindMenu();
  bindModal();
  bindBulk();

  safeGet("#btnLoginAdmin") && (safeGet("#btnLoginAdmin").onclick = loginAdmin);
  safeGet("#btnLoginAluno") && (safeGet("#btnLoginAluno").onclick = loginAluno);
  safeGet("#btnLogout") && (safeGet("#btnLogout").onclick = logout);

  safeGet("#btnAddStudent") && (safeGet("#btnAddStudent").onclick = () => createStudent(false));
  safeGet("#btnAddTrialStudent") && (safeGet("#btnAddTrialStudent").onclick = createTrialStudent);
  safeGet("#btnAddExercise") && (safeGet("#btnAddExercise").onclick = addExercise);
  safeGet("#btnSaveEvolution") && (safeGet("#btnSaveEvolution").onclick = saveEvolution);
  safeGet("#btnSavePhotos") && (safeGet("#btnSavePhotos").onclick = saveProgressPhotos);

  safeGet("#filterGroup") && (safeGet("#filterGroup").onchange = renderExercisesAdmin);
  safeGet("#searchExercise") && (safeGet("#searchExercise").oninput = renderExercisesAdmin);

  safeGet("#planGroup") && (safeGet("#planGroup").onchange = fillPlanExercises);
  safeGet("#planStudent") && (safeGet("#planStudent").onchange = renderPlansAdmin);
  safeGet("#evolutionStudent") && (safeGet("#evolutionStudent").onchange = renderEvolutionAdmin);
  safeGet("#photoStudent") && (safeGet("#photoStudent").onchange = async (e) => {
    const studentId = e.target.value || "";
    const entries = await getPhotoEntries(studentId);
    renderPhotoGallery(entries);
  });

  safeGet("#btnAddToPlan") && (safeGet("#btnAddToPlan").onclick = addToPlan);
  safeGet("#btnClearDay") && (safeGet("#btnClearDay").onclick = clearDay);
  safeGet("#btnClearAllPlans") && (safeGet("#btnClearAllPlans").onclick = clearAllPlans);

  safeGet("#studentSearch")?.addEventListener("input", renderStudentVideos);
  safeGet("#studentFilterGroup")?.addEventListener("change", renderStudentVideos);

  safeGet("#btnGoMyWorkout") && (safeGet("#btnGoMyWorkout").onclick = async () => {
    showView("meutreino");
    await renderPlansStudent();
  });

  safeGet("#expiredLogoutBtn") && (safeGet("#expiredLogoutBtn").onclick = logout);

  await ensureConfig();
  fillGroups();
  fillPlanDays();

  safeGet("#loginScreen")?.classList.remove("hidden");
  safeGet("#app")?.classList.add("hidden");

  let unsubExercises = null;

  onAuthStateChanged(auth, async (u) => {
    console.log("AUTH STATE:", u ? u.email : "SEM USUÁRIO");

    currentUser = u;
    setLoginMsg("");

    if (!u) {
      hideExpiredOverlay();
      safeGet("#loginScreen")?.classList.remove("hidden");
      safeGet("#app")?.classList.add("hidden");
      currentRole = null;
      if (unsubExercises) {
        unsubExercises();
        unsubExercises = null;
      }
      return;
    }

    safeGet("#loginScreen")?.classList.add("hidden");
    safeGet("#app")?.classList.remove("hidden");
    setStatus("Carregando...", true);

    if (!unsubExercises) {
      setTimeout(() => {
        if (!unsubExercises && currentUser) unsubExercises = listenExercises();
      }, 800);
    }

    ensureUserDocOnFirstLogin(u).catch(console.error);

    try {
      currentRole = (await getMyRole(u.uid)) || "student";
    } catch (e) {
      console.error("ROLE ERROR:", e);
      currentRole = "student";
    }

    if (currentRole === "admin") {
      safeGet("#menuAluno")?.classList.add("hidden");
      safeGet("#menuAdmin")?.classList.remove("hidden");
      safeGet("#roleSub") && (safeGet("#roleSub").textContent = "Administrador(a)");
      safeGet("#welcomeLine") && (safeGet("#welcomeLine").textContent = "Bem-vindo(a), Administrador(a).");

      showView("dashboard");
      setStatus("OK", true);
      hideExpiredOverlay();

      loadStudentsForSelect().catch(console.error);
      loadStudentsForEvolutionSelect().catch(console.error);
      loadStudentsForPhotoSelect().catch(console.error);
      renderStudentsAsync().catch(console.error);
      Promise.resolve().then(() => renderExercisesAdmin()).catch(console.error);
      Promise.resolve().then(() => fillPlanExercises()).catch(console.error);
      updateDashboard().catch(console.error);

      safeGet("#evolutionAdminBox")?.classList.remove("hidden");
      safeGet("#photosAdminBox")?.classList.remove("hidden");

    } else {
      safeGet("#menuAdmin")?.classList.add("hidden");
      safeGet("#menuAluno")?.classList.remove("hidden");
      safeGet("#roleSub") && (safeGet("#roleSub").textContent = "Aluno");

      showView("videos");
      setStatus("OK", true);

      renderStudentWelcome("Aluno(a)");
      renderStudentVideos();

      getDoc(userRef(u.uid)).then(async (snap) => {
        const me = snap.exists() ? (snap.data() || {}) : {};

        renderStudentWelcome(me.name);
        updateStudentHero(me);
        hideExpiredOverlay();

        if (me.expiresAt && daysLeft(me.expiresAt) < 0) {
          showExpiredOverlay(me);

          safeGet("#menuAluno")?.classList.add("hidden");
          showView("videos");

          const grid = safeGet("#studentVideosGrid");
          const planPreview = safeGet("#studentPlanPreview");

          if (grid) grid.innerHTML = "";
          if (planPreview) planPreview.innerHTML = `<div class="muted">Acesso indisponível.</div>`;

          return;
        }

        safeGet("#evolutionAdminBox")?.classList.add("hidden");
        safeGet("#photosAdminBox")?.classList.add("hidden");
      }).catch(console.error);
    }
  });
}

init();
