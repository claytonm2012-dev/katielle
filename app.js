/* =========
   JSON Load + Local override (admin changes)
   ========= */
const STORAGE_KEY = "consultoria_dos_sonhos_data_v1";
let DATA = null;

function $(id){ return document.getElementById(id); }

async function loadData(){
  const local = localStorage.getItem(STORAGE_KEY);
  if(local){
    DATA = JSON.parse(local);
    return;
  }
  const res = await fetch("data.json", { cache: "no-store" });
  DATA = await res.json();
}

function saveLocal(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA, null, 2));
}

function setCssVars(){
  const a = DATA.app || {};
  document.documentElement.style.setProperty("--primary", a.primaryColor || "#e50914");
  document.documentElement.style.setProperty("--dark-bg", a.darkBg || "#141414");
  document.documentElement.style.setProperty("--card-bg", a.cardBg || "#1f1f1f");

  // login bg / hero bg
  const login = $("loginScreen");
  if(login) login.style.backgroundImage =
    `linear-gradient(rgba(0,0,0,.7), rgba(0,0,0,.7)), url('${a.loginBackground || ""}')`;

  const heroCard = document.querySelector(".hero-card");
  if(heroCard) heroCard.style.backgroundImage = `url('${a.heroBackground || ""}')`;

  // titles
  const title = DATA.app?.title || "Consultoria Dos Sonhos";
  document.title = title;
  if($("brandLogo")) $("brandLogo").textContent = title;
  if($("studentTitle")) $("studentTitle").textContent = title;
}

/* =========
   Helpers
   ========= */
function addMonths(dateISO, months){
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months));
  // handle month rollover
  if(d.getDate() !== day) d.setDate(0);
  return d;
}

function fmtDateBR(date){
  const dd = String(date.getDate()).padStart(2,"0");
  const mm = String(date.getMonth()+1).padStart(2,"0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function youtubeEmbed(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes("youtu.be")){
      const id = u.pathname.replace("/","");
      return `https://www.youtube.com/embed/${id}`;
    }
    const v = u.searchParams.get("v");
    if(v) return `https://www.youtube.com/embed/${v}`;
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("embed");
    if(idx >= 0 && parts[idx+1]) return `https://www.youtube.com/embed/${parts[idx+1]}`;
  }catch(_){}
  return "";
}

/* =========
   UI: Plans
   ========= */
function renderPlans(){
  const root = $("plansList");
  if(!root) return;
  root.innerHTML = "";

  (DATA.plans || []).forEach(plan => {
    const div = document.createElement("div");
    div.className = "plan-card";
    div.innerHTML = `
      <h3 class="plan-title">${plan.title}</h3>
      <p>${plan.subtitle}</p>
      <div class="plan-price">${plan.price}</div>
      <p class="muted">${plan.paymentNote || ""}</p>
      <ul class="plan-features">
        ${(plan.features || []).map(f => `<li>✓ ${f}</li>`).join("")}
      </ul>
      <button class="btn-plan" type="button">Comprar Plano</button>
    `;
    root.appendChild(div);
  });
}

/* =========
   UI: Student categories/videos
   ========= */
function renderStudentCategories(){
  const root = $("categoriesRoot");
  if(!root) return;
  root.innerHTML = "";

  const cats = DATA.categories || [];
  const vids = (DATA.videos || []).filter(v => v.published !== false);

  cats.forEach(cat => {
    const section = document.createElement("section");
    section.className = "section";
    section.innerHTML = `
      <h2 class="section-title">${cat.name}</h2>
      <div class="carousel-container" data-cat="${cat.id}"></div>
    `;
    root.appendChild(section);

    const car = section.querySelector(".carousel-container");
    vids.filter(v => v.categoryId === cat.id).forEach(v => {
      const item = document.createElement("div");
      item.className = "carousel-item";
      item.innerHTML = `
        <div class="video-card" data-video="${v.id}">
          <img src="${v.thumb || "https://placehold.co/300x170"}" alt="Vídeo">
          <div class="video-meta">
            <h3>${v.title}</h3>
            <p>${v.duration || ""}</p>
            ${typeof v.progress === "number" ? `
              <div class="progress-bar"><div class="progress" style="width:${v.progress}%"></div></div>
            ` : ``}
          </div>
          <div class="watch-btn">Assistir</div>
        </div>
      `;
      car.appendChild(item);
    });
  });

  // bind watch buttons
  document.querySelectorAll(".video-card .watch-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".video-card");
      const id = card.getAttribute("data-video");
      openPlayerById(id);
    });
  });
}

/* =========
   Player
   ========= */
let currentVideoIndex = -1;
let currentPlaylist = [];

function openPlayerById(videoId){
  const vids = (DATA.videos || []).filter(v => v.published !== false);
  currentPlaylist = vids;
  currentVideoIndex = vids.findIndex(v => v.id === videoId);
  if(currentVideoIndex < 0) return;
  openPlayer(vids[currentVideoIndex]);
}

function openPlayer(video){
  const overlay = $("playerOverlay");
  const frame = $("videoFrame");
  const title = $("playerTitle");

  const embed = youtubeEmbed(video.youtubeUrl || "");
  title.textContent = video.title || "Vídeo";
  frame.src = embed || "";

  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closePlayer(){
  const overlay = $("playerOverlay");
  const frame = $("videoFrame");

  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "auto";
  frame.src = "";
}

function nextVideo(){
  if(!currentPlaylist.length) return;
  const next = currentVideoIndex + 1;
  if(next >= currentPlaylist.length) return;
  currentVideoIndex = next;
  openPlayer(currentPlaylist[currentVideoIndex]);
}

/* =========
   Admin: tabs + tables + modals
   ========= */
function showAdminTab(tabId){
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".admin-tab-content").forEach(c => c.classList.remove("active"));

  document.querySelectorAll(`.admin-tab[data-tab="${tabId}"]`).forEach(t => t.classList.add("active"));
  const content = $(tabId);
  if(content) content.classList.add("active");
}

function renderStats(){
  const root = $("statsCards");
  if(!root) return;

  const s = DATA.dashboardStats || {};
  root.innerHTML = `
    <div class="admin-card">
      <h3 class="admin-h3">Total de Alunos</h3>
      <p style="font-size:32px;color:var(--primary);font-weight:900;margin:0">${s.totalStudents ?? 0}</p>
    </div>
    <div class="admin-card">
      <h3 class="admin-h3">Vídeos Disponíveis</h3>
      <p style="font-size:32px;color:var(--primary);font-weight:900;margin:0">${s.totalVideos ?? 0}</p>
    </div>
    <div class="admin-card">
      <h3 class="admin-h3">Aulas Concluídas</h3>
      <p style="font-size:32px;color:var(--primary);font-weight:900;margin:0">${s.lessonsCompleted ?? 0}</p>
    </div>
  `;
}

function renderStudentsTables(){
  const tbody = $("studentsTbody");
  const recent = $("recentStudentsTbody");
  const students = DATA.auth?.students || [];

  const rows = students.map(st => {
    const end = fmtDateBR(addMonths(st.startDate, st.planMonths));
    const planLabel = `${st.planMonths} meses`;
    const status = st.status === "active" ? `<span style="color:#22c55e">Ativo</span>` : `<span style="color:#f59e0b">Pendente</span>`;
    return `
      <tr>
        <td>${st.name || ""}</td>
        <td>${st.email || ""}</td>
        <td>${planLabel}</td>
        <td>${end}</td>
        <td>${status}</td>
        <td>
          <button class="admin-btn admin-btn-danger" data-del-student="${st.id}">Excluir</button>
        </td>
      </tr>
    `;
  }).join("");

  if(tbody) tbody.innerHTML = rows || `<tr><td colspan="6" class="muted">Sem alunos.</td></tr>`;
  if(recent) recent.innerHTML = rows.split("</tr>").slice(0,2).join("</tr>") || `<tr><td colspan="5" class="muted">Sem alunos.</td></tr>`;

  document.querySelectorAll("[data-del-student]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-student");
      DATA.auth.students = DATA.auth.students.filter(s => s.id !== id);
      saveLocal();
      renderStudentsTables();
    });
  });
}

function renderVideosTable(){
  const tbody = $("videosTbody");
  const vids = DATA.videos || [];
  const catMap = new Map((DATA.categories || []).map(c => [c.id, c.name]));

  tbody.innerHTML = vids.map(v => {
    const status = v.published !== false ? `<span style="color:#22c55e">Publicado</span>` : `<span style="color:#f59e0b">Rascunho</span>`;
    return `
      <tr>
        <td>${v.title || ""}</td>
        <td>${catMap.get(v.categoryId) || v.categoryId || ""}</td>
        <td>${v.duration || ""}</td>
        <td>${status}</td>
        <td>
          <button class="admin-btn admin-btn-danger" data-del-video="${v.id}">Excluir</button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5" class="muted">Sem vídeos.</td></tr>`;

  document.querySelectorAll("[data-del-video]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-video");
      DATA.videos = DATA.videos.filter(v => v.id !== id);
      saveLocal();
      renderVideosTable();
      renderStudentCategories();
    });
  });
}

function renderExercises(){
  const root = $("exercisesRoot");
  if(!root) return;
  root.innerHTML = "";

  (DATA.exercises || []).forEach(group => {
    const block = document.createElement("div");
    block.className = "exercise-category";
    block.innerHTML = `
      <h4 style="margin:0;font-weight:900">${group.name}</h4>
      <div class="exercise-list">
        ${(group.items || []).map(i => `<div class="exercise-item">${i}</div>`).join("")}
      </div>
    `;
    block.addEventListener("click", () => {
      const list = block.querySelector(".exercise-list");
      list.style.display = list.style.display === "block" ? "none" : "block";
    });
    root.appendChild(block);
  });
}

function renderThemes(){
  const row = $("themesRow");
  if(!row) return;
  row.innerHTML = "";

  const themes = DATA.themes || [];
  const selectedId = DATA.app?.selectedThemeId || themes[0]?.id;

  themes.forEach(t => {
    const div = document.createElement("div");
    div.className = "theme-preview" + (t.id === selectedId ? " selected" : "");
    div.style.background = `linear-gradient(to right, ${t.gradient[0]}, ${t.gradient[1]})`;
    div.title = t.name;
    div.addEventListener("click", () => {
      DATA.app.selectedThemeId = t.id;
      // apply primary color as first gradient color (opcional)
      DATA.app.primaryColor = t.gradient[0];
      saveLocal();
      setCssVars();
      renderThemes();
    });
    row.appendChild(div);
  });
}

/* =========
   Modals
   ========= */
function openModal(id){
  const m = $(id);
  if(!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
}
function closeModal(id){
  const m = $(id);
  if(!m) return;
  m.classList.add("hidden");
  m.setAttribute("aria-hidden", "true");
}

/* =========
   Forms
   ========= */
function fillPlanSelects(){
  const sel = $("studentPlan");
  if(!sel) return;
  sel.innerHTML = `<option value="">Selecione um plano</option>` +
    (DATA.plans || []).map(p => `<option value="${p.months}">${p.months} meses</option>`).join("");
}

function fillVideoCategorySelect(){
  const sel = $("videoCategory");
  if(!sel) return;
  sel.innerHTML = `<option value="">Selecione uma categoria</option>` +
    (DATA.categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join("");
}

function uid(prefix){
  return (prefix || "id") + "_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* =========
   Auth / Navigation
   ========= */
function showLogin(){
  $("loginScreen").style.display = "flex";
  $("studentDashboard").classList.add("hidden");
  $("adminDashboard").classList.add("hidden");
}

function showStudent(){
  $("loginScreen").style.display = "none";
  $("studentDashboard").classList.remove("hidden");
  $("adminDashboard").classList.add("hidden");
}

function showAdmin(){
  $("loginScreen").style.display = "none";
  $("studentDashboard").classList.add("hidden");
  $("adminDashboard").classList.remove("hidden");
}

/* =========
   Main bindings
   ========= */
function bindEvents(){
  // login
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const u = $("username").value.trim();
    const p = $("password").value;

    const err = $("loginErrorMessage");
    err.style.display = "none";

    const admin = DATA.auth?.admin;
    if(admin && u === admin.username && p === admin.password){
      showAdmin();
      renderAdminAll();
      return;
    }

    const students = DATA.auth?.students || [];
    const student = students.find(s => s.username === u && s.password === p);
    if(student){
      showStudent();
      renderStudentCategories();
      return;
    }

    err.style.display = "block";
    setTimeout(()=> err.style.display = "none", 3000);
  });

  // logout
  $("logoutBtn").addEventListener("click", () => {
    $("username").value = "";
    $("password").value = "";
    showLogin();
  });

  $("adminLogout").addEventListener("click", (e) => {
    e.preventDefault();
    $("username").value = "";
    $("password").value = "";
    showLogin();
  });

  // player
  $("playHero").addEventListener("click", () => {
    // abre o primeiro vídeo publicado
    const first = (DATA.videos || []).find(v => v.published !== false);
    if(first) openPlayerById(first.id);
  });

  $("closePlayer").addEventListener("click", closePlayer);
  $("playerOverlay").addEventListener("click", (e) => {
    if(e.target === $("playerOverlay")) closePlayer();
  });

  $("nextVideoBtn").addEventListener("click", nextVideo);

  // admin tabs
  document.querySelectorAll(".admin-tab").forEach(btn => {
    btn.addEventListener("click", () => showAdminTab(btn.getAttribute("data-tab")));
  });

  // sidebar links (tab)
  document.querySelectorAll(".side-link[data-tab]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showAdminTab(a.getAttribute("data-tab"));
    });
  });

  // open modals
  $("addStudentBtn").addEventListener("click", () => openModal("studentModal"));
  $("addVideoBtn").addEventListener("click", () => openModal("videoModal"));

  // close modal buttons
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close")));
  });

  // close on backdrop click
  ["studentModal","videoModal"].forEach(id => {
    const modal = $(id);
    modal.addEventListener("click", (e) => {
      if(e.target === modal) closeModal(id);
    });
  });

  // add student
  $("studentForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const st = {
      id: uid("s"),
      name: $("studentName").value.trim(),
      email: $("studentEmail").value.trim(),
      username: $("studentUsername").value.trim(),
      password: $("studentPassword").value,
      planMonths: Number($("studentPlan").value),
      startDate: $("studentAccess").value,
      status: "active"
    };

    DATA.auth.students.push(st);
    saveLocal();
    renderStudentsTables();
    closeModal("studentModal");
    e.target.reset();
    alert("Aluno adicionado com sucesso!");
  });

  // add video
  $("videoForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const v = {
      id: uid("v"),
      title: $("videoTitle").value.trim(),
      categoryId: $("videoCategory").value,
      duration: $("videoDuration").value.trim(),
      thumb: "https://placehold.co/300x170",
      progress: null,
      youtubeUrl: $("videoUrl").value.trim(),
      published: $("videoStatus").checked,
      description: $("videoDescription").value.trim()
    };

    DATA.videos.push(v);
    saveLocal();
    renderVideosTable();
    renderStudentCategories();
    closeModal("videoModal");
    e.target.reset();
    alert("Vídeo adicionado com sucesso!");
  });

  // themes save (preview only)
  $("saveThemeBtn").addEventListener("click", () => {
    saveLocal();
    alert("Tema salvo (no navegador).");
  });

  // image preview (optional): just stores as dataURL locally
  $("backgroundImage").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const url = await fileToDataURL(file);
    DATA.app.loginBackground = url;
    DATA.app.heroBackground = url;
    saveLocal();
    setCssVars();
  });

  $("customLogo").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const url = await fileToDataURL(file);
    // store and show on login title as simple text replacement not possible.
    // for now we keep it as data (ready for a future img logo)
    DATA.app.customLogoDataUrl = url;
    saveLocal();
    alert("Logo salvo (no navegador).");
  });
}

function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function renderAdminAll(){
  renderStats();
  renderStudentsTables();
  renderVideosTable();
  renderThemes();
  renderExercises();
  fillPlanSelects();
  fillVideoCategorySelect();
}

/* =========
   Init
   ========= */
(async function init(){
  await loadData();
  setCssVars();
  renderPlans();
  fillPlanSelects();
  fillVideoCategorySelect();
  bindEvents();

  // se quiser exibir planos na tela de login:
  $("plansSection").style.display = "block";
})();
