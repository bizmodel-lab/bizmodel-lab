/* ============================================================
   mAtlas BizLab 2.0 · 前端 SPA
   ============================================================ */
"use strict";

/* ================= 基础工具 ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = n => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("zh-CN");

function toast(msg) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove("show"), 2600);
}
function openModal(html) { $("modalBox").innerHTML = html; $("modalMask").classList.add("show"); }
function closeModal() { $("modalMask").classList.remove("show"); }

/* ================= 会话 ================= */
const SESSION_KEY = "bizlab2_session";
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; }
}
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

async function api(path, opts = {}) {
  const s = getSession();
  const headers = { "Content-Type": "application/json" };
  if (s && s.token) headers["Authorization"] = "Bearer " + s.token;
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    if (location.pathname.endsWith("app.html")) { location.href = "index.html"; throw new Error("登录已过期，请重新登录"); }
  }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

/* ============================================================
   认证页（index.html）
   ============================================================ */
function renderAuthPage(mode) {
  mode = mode || "login";
  const root = $("root");
  if (!root) return;
  root.innerHTML = `
  <div class="auth-page">
    <div class="card auth-card">
      <h1>mAtlas BizLab</h1>
      <p class="sub">创业实训系统 · 从机会开发到完整商业计划</p>
      <div class="form-error" id="authErr"></div>
      ${mode === "register" ? `
        <div class="role-pick">
          <button type="button" id="pickStudent" class="active">
            <span class="ric">🎓</span><span class="rt">我是学生</span>
            <span class="rd">注册后加入课程、完成实训</span>
          </button>
          <button type="button" id="pickTeacher">
            <span class="ric">👩‍🏫</span><span class="rt">我是教师</span>
            <span class="rd">创建课程、管理学生、评阅成果</span>
          </button>
        </div>
        <div class="field" id="teacherCodeField" style="display:none">
          <label>教师注册码 <small>· 由系统管理员提供（见服务启动日志）</small></label>
          <input id="fTeacherCode" placeholder="例如 A1B2C3" maxlength="12" style="text-transform:uppercase;letter-spacing:2px;font-weight:700">
        </div>` : ""}
      <form id="authForm">
        ${mode === "register" ? `
        <div class="field"><label>姓名</label><input id="fName" placeholder="真实姓名，教师评阅时可见" maxlength="20"></div>` : ""}
        <div class="field"><label>账号</label><input id="fAccount" placeholder="3–32 位字母/数字，登录用" autocomplete="username"></div>
        <div class="field"><label>密码</label><input id="fPass" type="password" placeholder="至少 6 位" autocomplete="current-password"></div>
        <button class="btn btn-primary" style="width:100%" type="submit">${mode === "login" ? "登 录" : "注 册"}</button>
      </form>
      <div class="auth-switch">
        ${mode === "login"
          ? '还没有账号？<a href="#" id="switchMode">注册新账号</a> · <a href="#" id="guestInfo">系统功能说明</a>'
          : '已有账号？<a href="#" id="switchMode">直接登录</a>'}
      </div>
      <div class="auth-features">
      </div>
    </div>
  </div>`;

  let role = "student";
  if (mode === "register") {
    const syncRoleUI = () => {
      $("teacherCodeField").style.display = role === "teacher" ? "" : "none";
    };
    $("pickStudent").onclick = () => { role = "student"; $("pickStudent").classList.add("active"); $("pickTeacher").classList.remove("active"); syncRoleUI(); };
    $("pickTeacher").onclick = () => { role = "teacher"; $("pickTeacher").classList.add("active"); $("pickStudent").classList.remove("active"); syncRoleUI(); };
  }
  const sw = $("switchMode");
  if (sw) sw.onclick = e => { e.preventDefault(); renderAuthPage(mode === "login" ? "register" : "login"); };
  const gi = $("guestInfo");
  if (gi) gi.onclick = e => { e.preventDefault(); toast("学生端：加入课程并逐阶段提交实训成果；教师端：创建课程、管理学生、在线评阅与成绩导出。请注册账号体验完整功能。"); };

  $("authForm").onsubmit = async e => {
    e.preventDefault();
    const err = $("authErr"); err.classList.remove("show");
    const account = $("fAccount").value.trim();
    const password = $("fPass").value;
    try {
      let result;
      if (mode === "register") {
        const name = $("fName").value.trim();
        const teacherCode = role === "teacher" ? ($("fTeacherCode") ? $("fTeacherCode").value.trim() : "") : undefined;
        result = await api("/api/auth/register", { method: "POST", body: { role, account, name, password, teacherCode } });
        toast("注册成功，欢迎加入！");
      } else {
        result = await api("/api/auth/login", { method: "POST", body: { account, password } });
        toast("登录成功");
      }
      setSession({ token: result.token, user: result.user });
      setTimeout(() => location.href = "app.html", 400);
    } catch (ex) {
      err.textContent = ex.message; err.classList.add("show");
    }
  };
}

/* ============================================================
   主应用（app.html）
   ============================================================ */
const BMC_BLOCKS = [
  { key: "kp", name: "重要伙伴", col: "1/3", row: "1/3" },
  { key: "ka", name: "关键业务", col: "3/5", row: "1" },
  { key: "kr", name: "核心资源", col: "3/5", row: "2" },
  { key: "vp", name: "价值主张", col: "5/7", row: "1/3" },
  { key: "cr", name: "客户关系", col: "7/9", row: "1" },
  { key: "ch", name: "渠道通路", col: "7/9", row: "2" },
  { key: "cs", name: "客户细分", col: "9/11", row: "1/3" },
  { key: "cost", name: "成本结构", col: "1/6", row: "3" },
  { key: "rev", name: "收入来源", col: "6/11", row: "3" },
];
const VPC_BLOCKS = [
  { key: "ps", name: "产品与服务", side: "left" },
  { key: "pr", name: "痛点缓解方案", side: "left" },
  { key: "gc", name: "收益创造方案", side: "left" },
  { key: "cj", name: "客户任务", side: "right" },
  { key: "cp", name: "客户痛点", side: "right" },
  { key: "cg", name: "期望收益", side: "right" },
];
const FIN_FIELDS = [
  { k: "fixed", label: "月固定成本（元）", v: 20000 },
  { k: "price", label: "单价（元）", v: 99 },
  { k: "vc", label: "单位变动成本（元）", v: 45 },
  { k: "vol", label: "第 1 个月销量", v: 600 },
  { k: "growth", label: "月增长率（%）", v: 10 },
  { k: "cac", label: "获客成本 CAC（元）", v: 50 },
  { k: "freq", label: "月均购买次数", v: 1 },
  { k: "months", label: "客户留存月数", v: 12 },
];
const PLAN_SECTIONS = [
  { k: "pitch", label: "一句话定位" },
  { k: "problem", label: "一、问题与机会" },
  { k: "solution", label: "二、解决方案与价值主张" },
  { k: "market", label: "三、目标市场与竞争" },
  { k: "model", label: "四、商业模式" },
  { k: "traction", label: "五、运营数据与里程碑" },
  { k: "growth", label: "六、营销与增长策略" },
  { k: "finance", label: "七、财务与融资计划" },
  { k: "risk", label: "八、风险与对策" },
  { k: "team", label: "九、核心团队" },
  { k: "elevator", label: "十、30 秒电梯演讲" },
];

const state = { user: null, courseCache: {} };

/* ---------- 顶栏 ---------- */
function renderTopbar() {
  const links = $("topbarLinks"), userBox = $("topbarUser");
  if (!links) return;
  const u = state.user;
  if (!u) return;
  const hash = location.hash || "#/home";
  if (u.role === "student") {
    links.innerHTML = `
      <a href="#/s/courses" class="${hash.startsWith("#/s/courses") || hash.startsWith("#/s/course") ? "active" : ""}">我的课程</a>
      <a href="#/cases" class="${hash.startsWith("#/cases") ? "active" : ""}">案例库</a>`;
  } else {
    links.innerHTML = `
      <a href="#/t/courses" class="${hash.startsWith("#/t/courses") || hash.startsWith("#/t/course") ? "active" : ""}">课程管理</a>
      <a href="#/cases" class="${hash.startsWith("#/cases") ? "active" : ""}">案例库</a>`;
  }
  userBox.innerHTML = `
    <span class="role-chip ${u.role}">${u.role === "teacher" ? "教师" : "学生"}</span>
    <span class="user-name">${esc(u.name)}</span>
    <button class="btn btn-ghost btn-sm" id="btnLogout">退出</button>`;
  $("btnLogout").onclick = async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {}
    clearSession(); location.href = "index.html";
  };
}

/* ---------- 路由 ---------- */
function route() {
  if (!$("view")) return; // 认证页
  const s = getSession();
  if (!s) { location.href = "index.html"; return; }
  state.user = s.user;
  renderTopbar();
  const hash = location.hash || "#/home";
  const parts = hash.slice(2).split("/");
  const view = $("view");
  window.scrollTo(0, 0);

  try {
    if (parts[0] === "home") {
      location.hash = state.user.role === "teacher" ? "#/t/courses" : "#/s/courses";
    } else if (parts[0] === "cases") {
      viewCases(view);
    } else if (parts[0] === "s") {
      if (state.user.role !== "student") { location.hash = "#/t/courses"; return; }
      if (parts[1] === "courses") viewStudentCourses(view);
      else if (parts[1] === "course" && parts[2] && parts[3] === "stage" && parts[4]) viewStudentStage(view, parts[2], +parts[4]);
      else if (parts[1] === "course" && parts[2]) viewStudentCourse(view, parts[2]);
      else viewStudentCourses(view);
    } else if (parts[0] === "t") {
      if (state.user.role !== "teacher") { location.hash = "#/s/courses"; return; }
      if (parts[1] === "courses") viewTeacherCourses(view);
      else if (parts[1] === "course" && parts[2]) {
        if (parts[3] === "students") viewTeacherStudents(view, parts[2]);
        else if (parts[3] === "review") viewTeacherReview(view, parts[2]);
        else if (parts[3] === "dashboard") viewTeacherDashboard(view, parts[2]);
        else if (parts[3] === "edit") viewTeacherEdit(view, parts[2]);
        else viewTeacherCourse(view, parts[2]);
      }
      else viewTeacherCourses(view);
    } else {
      location.hash = "#/home";
    }
  } catch (ex) {
    view.innerHTML = `<div class="empty"><span class="eic">⚠️</span>${esc(ex.message)}</div>`;
  }
}

/* ============================================================
   学生端视图
   ============================================================ */
async function viewStudentCourses(view) {
  const data = await api("/api/courses/mine");
  view.innerHTML = `
  <div class="page-head">
    <h1>我的课程</h1>
    <p class="desc">使用教师提供的邀请码加入课程，按阶段完成学习、自测与实训任务提交。</p>
  </div>
  <div class="card join-box">
    <div class="field"><label>课程邀请码</label><input id="joinCode" placeholder="例如 A1B2C3（向授课教师索取）" maxlength="8" style="text-transform:uppercase;letter-spacing:3px;font-weight:700"></div>
    <button class="btn btn-primary" id="btnJoin">加入课程</button>
  </div>
  <div class="grid-2" id="courseGrid"></div>`;

  $("btnJoin").onclick = async () => {
    const code = $("joinCode").value.trim();
    if (!code) return toast("请输入邀请码");
    try {
      const r = await api("/api/courses/join", { method: "POST", body: { code } });
      toast(`已加入课程「${r.title}」`);
      viewStudentCourses(view);
    } catch (ex) { toast(ex.message); }
  };

  const grid = $("courseGrid");
  if (!data.courses.length) {
    grid.innerHTML = `<div class="card empty" style="grid-column:1/-1"><span class="eic">📭</span>还没有加入任何课程<br>输入上方邀请码，开始你的商业模式实训之旅</div>`;
    return;
  }
  grid.innerHTML = data.courses.map(c => {
    const pct = Math.round(c.progress.submittedCount / c.stageCount * 100);
    return `
    <div class="card course-card" data-id="${c.id}" style="cursor:pointer">
      <h3>${esc(c.title)}</h3>
      <div class="meta"><span>👩‍🏫 ${esc(c.teacher)}</span><span>${c.stageCount} 个阶段</span><span>加入于 ${new Date(c.joinedAt).toLocaleDateString("zh-CN")}</span></div>
      <p>${esc(c.desc || "")}</p>
      <div class="pbar"><div style="width:${pct}%"></div></div>
      <div class="pbar-label"><span>已提交 ${c.progress.submittedCount}/${c.stageCount} 个阶段</span><span>${c.progress.gradedCount} 个已批改</span></div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".course-card").forEach(el => {
    el.onclick = () => location.hash = `#/s/course/${el.dataset.id}`;
  });
}

async function loadCourse(id) {
  if (state.courseCache[id]) return state.courseCache[id];
  const d = await api(`/api/courses/${id}/detail`);
  state.courseCache[id] = d;
  return d;
}

async function viewStudentCourse(view, courseId) {
  const c = await loadCourse(courseId);
  const my = await api(`/api/courses/${courseId}/mysubmissions`);
  const subMap = {};
  my.submissions.forEach(s => subMap[s.stageId] = s);
  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/s/courses">我的课程</a> / ${esc(c.title)}</div>
    <h1>${esc(c.title)}</h1>
    <p class="desc">授课教师：${esc(c.teacher)} · 共 ${c.stages.length} 个阶段。点击阶段进入学习，完成自测并提交实训成果后，等待教师批改。</p>
  </div>
  ${c.stages.map((st, idx) => {
    const sub = subMap[st.id];
    // 软门控:前一阶段必须「通过批改(approved)」才能解锁本阶段
    const prevSub = idx > 0 ? subMap[c.stages[idx - 1].id] : null;
    const locked = idx > 0 && (!prevSub || prevSub.status !== "approved");
    const lockReason = !prevSub ? "未提交前序阶段"
      : prevSub.status === "revise" ? `阶段 ${c.stages[idx - 1].id} 需重交`
      : prevSub.status === "submitted" ? `阶段 ${c.stages[idx - 1].id} 批改中`
      : "";
    const badge = locked ? `<span class="stage-badge none">🔒 ${lockReason}</span>`
      : !sub ? `<span class="stage-badge none">未开始</span>`
      : sub.status === "submitted" ? `<span class="stage-badge pending">待批改${sub.score != null ? "" : ""}</span>`
      : sub.status === "approved" ? `<span class="stage-badge approved">✓ 已通过 · ${sub.score} 分</span>`
      : `<span class="stage-badge revise">需修改 · ${sub.score} 分</span>`;
    const quiz = my.quizOnly[st.id] || (sub && sub.quiz);
    return `
    <div class="stage-list-item ${locked ? "locked" : ""}" data-stage="${st.id}">
      <span class="snum" style="background:${locked ? "#CBD5E1" : st.color}">${st.id}</span>
      <div class="stitle"><h4>${esc(st.name)}</h4><p>${esc(st.brief || "")}${quiz ? ` · 自测最佳 ${quiz.score}/${quiz.total}` : ""}</p></div>
      ${badge}
      <span style="color:var(--text-3)">›</span>
    </div>`;
  }).join("")}`;
  view.querySelectorAll(".stage-list-item").forEach(el => {
    el.onclick = () => {
      const stId = +el.dataset.stage;
      const idx = c.stages.findIndex(s => s.id === stId);
      const prevSub2 = idx > 0 ? subMap[c.stages[idx - 1].id] : null;
      if (idx > 0 && (!prevSub2 || prevSub2.status !== "approved")) {
        const suffix = !prevSub2 ? "(未提交)"
          : prevSub2.status === "revise" ? "(教师批为需修改,请按评语重交)"
          : "(教师尚未批改)";
        return toast(`请先完成阶段 ${c.stages[idx - 1].id}「${c.stages[idx - 1].name}」${suffix}`);
      }
      location.hash = `#/s/course/${courseId}/stage/${stId}`;
    };
  });
}

async function viewStudentStage(view, courseId, stageId) {
  const c = await loadCourse(courseId);
  const stage = c.stages.find(s => s.id === stageId);
  if (!stage) { toast("阶段不存在"); location.hash = `#/s/course/${courseId}`; return; }
  const my = await api(`/api/courses/${courseId}/mysubmissions`);
  const sub = my.submissions.find(s => s.stageId === stageId) || null;
  const quizRec = my.quizOnly[stageId] || (sub && sub.quiz) || null;
  // 软门控:前一阶段必须「通过批改(approved)」才能提交本阶段
  const stageIdx = c.stages.findIndex(s => s.id === stageId);
  const prevSubStage = stageIdx > 0 ? my.submissions.find(s => s.stageId === c.stages[stageIdx - 1].id) : null;
  const locked = stageIdx > 0 && (!prevSubStage || prevSubStage.status !== "approved");
  const lockKind = !prevSubStage ? "未提交"
    : prevSubStage.status === "revise" ? "需重交"
    : prevSubStage.status === "submitted" ? "批改中"
    : "";

  // 提交草稿（编辑态）：优先取已提交内容
  const draft = {
    taskText: sub ? sub.taskText : "",
    canvas: sub && sub.canvas ? sub.canvas : null,
    finance: sub && sub.finance ? sub.finance : null,
    plan: sub && sub.plan ? sub.plan : null,
    matrix: sub && sub.matrix ? sub.matrix : null,
    assumptions: sub && sub.assumptions ? sub.assumptions : null,
  };

  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/s/courses">我的课程</a> / <a href="#/s/course/${courseId}">${esc(c.title)}</a> / 阶段 ${stage.id}</div>
    <h1><span class="tag" style="background:${stage.color};color:#fff">阶段 ${stage.id}</span> ${esc(stage.name)}</h1>
    <p class="desc">${esc(stage.brief || "")}</p>
  </div>
  <div class="stage-layout">
    <aside class="card stage-nav">
      <h4 style="font-size:13px;color:var(--text-3);margin-bottom:10px">课程阶段</h4>
      ${c.stages.map(s => {
        const sb = my.submissions.find(x => x.stageId === s.id);
        const cls = sb ? (sb.status === "approved" ? "✓" : sb.status === "revise" ? "!" : "•") : "";
        return `<div class="sn-item ${s.id === stageId ? "active" : ""}" data-stage="${s.id}">
          <span class="dot">${cls || s.id}</span><span>${esc(s.name)}</span></div>`;
      }).join("")}
    </aside>
    <div class="stage-content">
      ${sub && sub.status !== "submitted" ? `
      <div class="submission-status-box ${sub.status}">
        ${sub.status === "approved"
          ? `✅ <b>教师评定：通过（${sub.score} 分）</b>${sub.feedback ? "<br>评语：" + esc(sub.feedback) : ""}<br><small>你可以继续修改并重新提交，或进入下一阶段。</small>`
          : `🔁 <b>教师评定：需修改（${sub.score} 分）</b>${sub.feedback ? "<br>评语：" + esc(sub.feedback) : ""}<br><small>请根据评语修改后重新提交。</small>`}
      </div>` : sub ? `
      <div class="submission-status-box submitted">⏳ <b>已提交，等待教师批改</b>（提交于 ${new Date(sub.submittedAt).toLocaleString("zh-CN")}）<br><small>批改前你可以修改并重新提交。</small></div>` : ""}

      <div class="card">
        <h2><span class="tag" style="background:${stage.color};color:#fff">📖</span> 知识精讲</h2>
        <ul class="knowledge-list" style="margin-top:14px">
          ${stage.knowledge.map(k => `<li>${esc(k)}</li>`).join("")}
        </ul>
        <div class="content-h">🛠 实战工具</div>
        <div class="tool-box">${esc(stage.tools)}</div>
      </div>

      <div class="card" id="quizCard">
        <h2><span class="tag" style="background:var(--primary-light);color:var(--primary-dark)">✅</span> 阶段自测</h2>
        <p style="font-size:13.5px;color:var(--text-3);margin:6px 0 4px">共 ${stage.quiz.length} 题 · 全部作答后系统自动判分（教师可见你的自测成绩）${quizRec ? ` · 最近成绩 <b style="color:var(--primary-dark)">${quizRec.score}/${quizRec.total}</b>` : ""}</p>
        <div id="quizArea"></div>
      </div>

      ${locked ? `<div class="card" id="submitCard">
        <div class="submission-status-box revise">🔒 <b>本阶段尚未解锁</b> —— ${lockKind === "未提交"
          ? `需先完成并提交阶段 ${c.stages[stageIdx - 1].id}「${esc(c.stages[stageIdx - 1].name)}」的实训成果,才能提交本阶段。`
          : lockKind === "需重交"
          ? `阶段 ${c.stages[stageIdx - 1].id}「${esc(c.stages[stageIdx - 1].name)}」被教师批为「需修改」,请按评语修改并重新提交,通过批改后再进入本阶段。`
          : `阶段 ${c.stages[stageIdx - 1].id}「${esc(c.stages[stageIdx - 1].name)}」已提交但尚未通过教师批改,通过批改后再进入本阶段。`}<br><small>知识精讲与阶段自测仍可正常学习。</small></div>
      </div>` : `
      <div class="card" id="submitCard">
        <h2><span class="tag" style="background:var(--accent-light);color:#92400E">✍️</span> 实训任务与成果提交</h2>
        <p style="font-size:13.5px;color:var(--text-3);margin:6px 0 16px">完成任务后填写下方内容并提交，教师将打分并给出评语；如被退回可修改后重新提交。</p>
        <div id="deliverArea"></div>
        <div class="content-h">任务说明</div>
        ${stage.tasks.map((t, i) => `<div class="task-block"><div class="tt">${esc(t)}</div></div>`).join("")}
        <div class="field" style="margin-top:14px">
          <label>实训成果描述 <small>· 各任务的完成情况、关键结论与数据（必填）</small></label>
          <textarea id="taskText" placeholder="对照上方各任务，逐条写明你的完成情况与结论…" style="min-height:140px">${esc(draft.taskText)}</textarea>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
          <button class="btn btn-primary" id="btnSubmitStage">提交本阶段成果</button>
          ${sub ? '<span style="font-size:12.5px;color:var(--text-3);align-self:center">重新提交将覆盖上次内容，等待教师重新批改</span>' : ""}
        </div>
      </div>`}
    </div>
  </div>`;

  view.querySelectorAll(".sn-item").forEach(el => {
    el.onclick = () => location.hash = `#/s/course/${courseId}/stage/${el.dataset.stage}`;
  });

  renderQuiz(stage, quizRec, courseId);

  // 各阶段专属交付物编辑器（锁定阶段不渲染）
  if (!locked) {
    if (stage.deliverable === "bmc" || stage.deliverable === "vpc") renderCanvasEditor(stage, draft);
    if (stage.deliverable === "finance") renderFinanceEditor(draft);
    if (stage.deliverable === "plan") renderPlanEditor(draft);
    if (stage.deliverable === "matrix") renderMatrixEditor(draft);
    if (stage.deliverable === "assumptions") renderAssumptionsEditor(draft);
  }

  if ($("btnSubmitStage")) $("btnSubmitStage").onclick = async () => {
    const taskText = $("taskText").value.trim();
    if (!taskText) return toast("请先填写实训成果描述");
    const body = { taskText };
    if (stage.deliverable === "bmc" || stage.deliverable === "vpc") body.canvas = collectCanvas();
    if (stage.deliverable === "finance") {
      const fin = collectFinance();
      if (!fin) return toast("请先填写财务测算参数");
      body.finance = fin;
    }
    if (stage.deliverable === "plan") body.plan = collectPlan();
    if (stage.deliverable === "matrix") {
      const m = collectMatrix();
      if (!m) return toast("请先在机会评估矩阵中填满 3 个候选机会(每个都要有名称)");
      body.matrix = m;
    }
    if (stage.deliverable === "assumptions") {
      const a = collectAssumptions();
      if (!a) return toast("请先在假设清单中填写至少一条完整假设");
      body.assumptions = a;
    }
    try {
      await api(`/api/courses/${courseId}/stages/${stageId}/submit`, { method: "POST", body });
      toast("提交成功！等待教师批改");
      delete state.courseCache[courseId];
      location.hash = `#/s/course/${courseId}`;
    } catch (ex) { toast(ex.message); }
  };
}

/* ---------- 测验（判分在服务端完成，答案不随题目下发） ---------- */
function renderQuiz(stage, quizRec, courseId) {
  const area = $("quizArea");
  let answered = 0;
  const answers = new Array(stage.quiz.length).fill(null);
  area.innerHTML = stage.quiz.map((q, qi) => `
    <div class="quiz-q" data-qi="${qi}">${qi + 1}. ${esc(q.q)}</div>
    <div class="quiz-opts">
      ${q.opts.map((o, oi) => `<label class="quiz-opt" data-qi="${qi}" data-oi="${oi}"><input type="radio" name="q${qi}">${esc(o)}</label>`).join("")}
    </div>
    <div class="quiz-explain" id="exp${qi}"></div>
  `).join("") + `<div class="quiz-score" id="quizScore"></div>`;

  area.querySelectorAll(".quiz-opt input").forEach(inp => {
    inp.onchange = async () => {
      if (answered >= stage.quiz.length) return;
      const label = inp.closest(".quiz-opt");
      const qi = +label.dataset.qi, oi = +label.dataset.oi;
      if (answers[qi] !== null) return;
      answers[qi] = oi;
      answered++;
      if (answered === stage.quiz.length) {
        // 全部作答 → 提交服务端判分，返回对错明细与解析
        const sc = $("quizScore");
        sc.className = "quiz-score show";
        sc.style.background = "#F1F5F9";
        sc.style.color = "var(--text-2)";
        sc.textContent = "判分中…";
        let result;
        try {
          result = await api(`/api/courses/${courseId}/stages/${stage.id}/quiz`, { method: "POST", body: { answers } });
        } catch (e) {
          sc.textContent = "判分失败：" + e.message;
          return;
        }
        const correct = result.score, total = result.total;
        result.detail.forEach((d, i) => {
          area.querySelectorAll(`.quiz-opt[data-qi="${i}"]`).forEach(l => {
            if (+l.dataset.oi === d.answer) l.classList.add("correct");
            else if (answers[i] === +l.dataset.oi && answers[i] !== d.answer) l.classList.add("wrong");
            l.querySelector("input").disabled = true;
          });
          const exp = $("exp" + i);
          exp.textContent = (d.correct ? "✅ " : "❌ ") + d.explain;
          exp.classList.add("show");
        });
        const good = correct === total;
        sc.style.background = good ? "#ECFDF5" : "#FEF3C7";
        sc.style.color = good ? "#065F46" : "#92400E";
        sc.textContent = good ? `🎉 全部正确！${correct}/${total} 分` : `本次成绩：${correct}/${total} 分（刷新页面可重测）`;
      }
    };
  });
}

/* ---------- 画布编辑器 ---------- */
let canvasData = { bmc: {}, vpc: {} };
function renderCanvasEditor(stage, draft) {
  const isBmc = stage.deliverable === "bmc";
  canvasData = draft.canvas ? JSON.parse(JSON.stringify(draft.canvas)) : { bmc: {}, vpc: {} };
  if (!canvasData.bmc) canvasData.bmc = {};
  if (!canvasData.vpc) canvasData.vpc = {};
  const target = isBmc ? canvasData.bmc : canvasData.vpc;
  const blocks = isBmc ? BMC_BLOCKS : VPC_BLOCKS;

  const renderBlocks = () => {
    const notesHtml = b => {
      const notes = target[b.key] || [];
      return notes.map((n, i) => `
        <div class="bmc-note"><span>${esc(n)}</span>
          <span class="note-actions">
            <button data-act="edit" data-key="${b.key}" data-i="${i}">✎</button>
            <button data-act="del" data-key="${b.key}" data-i="${i}">✕</button>
          </span></div>`).join("");
    };
    if (isBmc) {
      return `<div class="bmc-grid">${BMC_BLOCKS.map(b => `
        <div class="bmc-block" style="grid-column:${b.col};grid-row:${b.row}">
          <h5>${b.name}<span class="count">${(target[b.key] || []).length} 张</span></h5>
          ${notesHtml(b)}
          <button class="bmc-add" data-act="add" data-key="${b.key}">＋ 添加便签</button>
        </div>`).join("")}</div>`;
    }
    const col = side => `<div class="vpc-col">${VPC_BLOCKS.filter(b => b.side === side).map(b => `
      <div class="vpc-square" style="${side === "left" ? "background:#F5F6FF" : "background:#F0F9FF"}">
        <h5 style="font-size:13px;margin-bottom:6px;color:${side === "left" ? "#4F46E5" : "#0EA5E9"}">${b.name}<span class="count">${(target[b.key] || []).length} 张</span></h5>
        ${notesHtml(b)}
        <button class="bmc-add" data-act="add" data-key="${b.key}">＋ 添加便签</button>
      </div>`).join("")}</div>`;
    return `<div class="vpc-grid">${col("left")}${col("right")}</div>`;
  };

  const area = $("deliverArea");
  area.innerHTML = `
    <div class="content-h">${isBmc ? "🧩 商业模式画布（九模块）" : "🎯 价值主张画布（客户画像 × 价值地图）"}</div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:10px">每张便签一句话，每个模块建议 2–3 张。画布内容将随实训成果一并提交给教师。</p>
    <div class="bmc-wrap" id="canvasWrap">${renderBlocks()}</div>`;

  const bindEvents = () => {
    area.querySelectorAll("[data-act]").forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key, i = +btn.dataset.i, act = btn.dataset.act;
        if (act === "add") {
          const t = prompt("便签内容（一句话）：");
          if (t && t.trim()) { (target[key] = target[key] || []).push(t.trim()); }
        } else if (act === "edit") {
          const t = prompt("编辑便签：", target[key][i]);
          if (t !== null && t.trim()) target[key][i] = t.trim();
        } else if (act === "del") {
          if (confirm("删除这张便签？")) target[key].splice(i, 1);
        }
        $("canvasWrap").innerHTML = renderBlocks();
        bindEvents();
      };
    });
  };
  bindEvents();
}
function collectCanvas() { return JSON.parse(JSON.stringify(canvasData)); }

/* ---------- 财务编辑器 ---------- */
let financeData = {};
function renderFinanceEditor(draft) {
  financeData = draft.finance ? { ...draft.finance } : {};
  FIN_FIELDS.forEach(f => { if (financeData[f.k] === undefined) financeData[f.k] = f.v; });
  const area = $("deliverArea");
  const html = () => {
    const f = financeData;
    const cm = (+f.price || 0) - (+f.vc || 0);
    const bep = cm > 0 ? Math.ceil((+f.fixed || 0) / cm) : Infinity;
    const ltv = Math.max(cm, 0) * (+f.freq || 0) * (+f.months || 0);
    const ratio = +f.cac > 0 ? ltv / +f.cac : Infinity;
    return `
    <div class="content-h">🧮 财务测算参数（提交给教师批阅）</div>
    <div class="grid-4" style="margin-bottom:14px">
      ${FIN_FIELDS.map(x => `<div class="field" style="margin:0"><label style="font-size:12px">${x.label}</label>
        <input type="number" id="fin_${x.k}" value="${financeData[x.k]}" step="any"></div>`).join("")}
    </div>
    <div class="fin-grid">
      <div class="fin-cell"><div class="fl">盈亏平衡销量（每月）</div><div class="fv">${isFinite(bep) ? fmt(bep) + " 件" : "无法达到"}</div></div>
      <div class="fin-cell"><div class="fl">单位边际贡献</div><div class="fv">¥${fmt(cm)}</div></div>
      <div class="fin-cell"><div class="fl">LTV / CAC</div><div class="fv">${isFinite(ratio) ? (Math.round(ratio * 100) / 100) + " : 1" : "∞"}</div></div>
    </div>
    <p style="font-size:12px;color:var(--text-3);margin-top:8px">参数修改后结果实时更新；健康标准参考：LTV/CAC ≥ 3 且 CAC 回收期 &lt; 12 个月。请在任务描述中说明你的三笔账。</p>`;
  };
  area.innerHTML = html();
  const bind = () => {
    FIN_FIELDS.forEach(f => {
      const inp = $("fin_" + f.k);
      inp.oninput = () => { financeData[f.k] = +inp.value || 0; area.innerHTML = html(); bind(); };
    });
  };
  bind();
}
function collectFinance() {
  const has = FIN_FIELDS.some(f => $("fin_" + f.k));
  if (!has) return Object.keys(financeData).length ? financeData : null;
  FIN_FIELDS.forEach(f => { financeData[f.k] = +$("fin_" + f.k).value || 0; });
  return { ...financeData };
}

/* ---------- 计划书编辑器 ---------- */
let planData = {};
function renderPlanEditor(draft) {
  planData = draft.plan ? { ...draft.plan } : {};
  const area = $("deliverArea");
  area.innerHTML = `
    <div class="content-h">📄 商业计划书（分节填写）</div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">整合前五个阶段的成果，完成十部分计划书 + 30 秒电梯演讲。内容将整体提交给教师批阅。</p>
    ${PLAN_SECTIONS.map(s => `
      <div class="field">
        <label>${s.label}</label>
        <textarea data-pk="${s.k}" style="min-height:76px" placeholder="…">${esc(planData[s.k] || "")}</textarea>
      </div>`).join("")}`;
  area.querySelectorAll("[data-pk]").forEach(t => {
    t.oninput = () => { planData[t.dataset.pk] = t.value; };
  });
}
function collectPlan() { return { ...planData }; }

/* ---------- 机会评估矩阵编辑器（阶段 1） ---------- */
const MATRIX_DIMS = [
  { k: "market", label: "市场规模", tip: "目标市场规模与成长性（1 很小/饱和 → 5 巨大且增长）" },
  { k: "pain", label: "痛点强度", tip: "问题出现的强度与频率（1 可有可无 → 5 高频且锥心）" },
  { k: "pay", label: "付费意愿", tip: "客户为此掏钱的意愿与能力（1 免费都嫌多 → 5 主动预付）" },
  { k: "comp", label: "竞争强度", tip: "反向计分：竞争越弱得分越高（1 红海硬碰 → 5 无人区）" },
  { k: "match", label: "团队匹配", tip: "与团队资源/能力的匹配度（1 完全陌生 → 5 高度复用）" },
];
let matrixData = null;
function renderMatrixEditor(draft) {
  matrixData = draft.matrix
    ? JSON.parse(JSON.stringify(draft.matrix))
    : { opportunities: [{ name: "", scores: {} }, { name: "", scores: {} }, { name: "", scores: {} }], chosen: 0 };
  // 统一固定 3 个候选机会(与任务 1「推导出 3 个潜在商业机会」、任务 2「为 3 个机会打分」保持一致)
  if (!Array.isArray(matrixData.opportunities) || matrixData.opportunities.length !== 3) {
    const src = (Array.isArray(matrixData.opportunities) ? matrixData.opportunities : []).slice(0, 3);
    while (src.length < 3) src.push({ name: "", scores: {} });
    matrixData = { opportunities: src, chosen: Math.min(+(matrixData.chosen || 0), 2) };
  }
  const area = $("deliverArea");

  const total = o => MATRIX_DIMS.reduce((sum, d) => sum + (+o.scores[d.k] || 0), 0);
  const html = () => `
    <div class="content-h">📊 机会评估矩阵（固定 3 个候选机会 × 5 维打分，1–5 分）</div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">从趋势雷达中提炼出 3 个候选机会,按 5 个维度逐项打分(竞争强度为反向计分),系统自动加总;<b>总分 ≥ 18</b> 的机会值得进入下一阶段深挖。勾选综合判断后的「选定机会」——分数最高 ≠ 必然入选,请在任务描述里说明你的取舍理由。</p>
    <div class="table-wrap"><table class="dt mx-table">
      <thead><tr>
        <th style="min-width:150px">候选机会</th>
        ${MATRIX_DIMS.map(d => `<th title="${esc(d.tip)}">${d.label}<small style="display:block;font-weight:400;color:var(--text-3)">1–5</small></th>`).join("")}
        <th>总分</th><th>选定</th>
      </tr></thead>
      <tbody>
        ${matrixData.opportunities.map((o, i) => `
        <tr class="${i === matrixData.chosen ? "mx-chosen" : ""}">
          <td><input class="mx-name" data-i="${i}" value="${esc(o.name || "")}" placeholder="如:校园咖啡订阅" maxlength="50"></td>
          ${MATRIX_DIMS.map(d => `
          <td><select class="mx-score" data-i="${i}" data-k="${d.k}">
            ${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${+o.scores[d.k] === v ? "selected" : ""}>${v}</option>`).join("")}
          </select></td>`).join("")}
          <td><b>${total(o)}</b></td>
          <td style="text-align:center"><input type="radio" name="mxChosen" data-i="${i}" ${i === matrixData.chosen ? "checked" : ""}></td>
        </tr>`).join("")}
      </tbody>
    </table></div>
    <p style="font-size:12px;color:var(--text-3);margin-top:8px">矩阵固定为 3 个候选机会(与任务 1/2 一致),不可增删。</p>`;

  area.innerHTML = html();
  const bind = () => {
    area.querySelectorAll(".mx-name").forEach(inp => {
      inp.oninput = () => { matrixData.opportunities[+inp.dataset.i].name = inp.value; };
    });
    area.querySelectorAll(".mx-score").forEach(sel => {
      sel.onchange = () => {
        matrixData.opportunities[+sel.dataset.i].scores[sel.dataset.k] = +sel.value;
        area.innerHTML = html(); bind();
      };
    });
    area.querySelectorAll("input[name=mxChosen]").forEach(r => {
      r.onchange = () => { matrixData.chosen = +r.dataset.i; area.innerHTML = html(); bind(); };
    });
  };
  bind();
}
function collectMatrix() {
  const ops = matrixData.opportunities
    .map(o => ({ name: String(o.name || "").trim(), scores: o.scores || {} }))
    .filter(o => o.name);
  if (ops.length < 3) return null; // 必须填满 3 个候选机会(与任务 1/2 一致)
  let chosen = Math.min(+matrixData.chosen || 0, ops.length - 1);
  return { opportunities: ops, chosen };
}

/* ---------- 假设清单编辑器（阶段 4） ---------- */
const VERIFY_METHODS = ["客户访谈", "落地实验(MVP)", "问卷调查", "数据分析", "小规模试销", "专家咨询"];
let assumptionsData = null;
function renderAssumptionsEditor(draft) {
  assumptionsData = draft.assumptions && draft.assumptions.length
    ? JSON.parse(JSON.stringify(draft.assumptions))
    : [{ hyp: "", uncertainty: 3, severity: 3, method: "客户访谈", criteria: "" }];
  const area = $("deliverArea");
  const risk = a => (+a.uncertainty || 1) * (+a.severity || 1);
  const riskChip = v => {
    const cls = v >= 15 ? "red" : v >= 8 ? "amber" : "green";
    const txt = v >= 15 ? "高危" : v >= 8 ? "中风险" : "低风险";
    return `<span class="chip ${cls}">${v} · ${txt}</span>`;
  };
  const html = () => `
    <div class="content-h">🧪 假设清单（假设 → 验证计划）</div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">把商业模式中最关键、最不确定的假设列出来：<b>不确定度</b>（你有多不知道）× <b>致命度</b>（错了项目是否就死）越高，越要优先验证。每条假设都要给出可量化的判定标准（例：「访谈 20 人中 ≥12 人愿预付」）。</p>
    <div class="table-wrap"><table class="dt">
      <thead><tr>
        <th style="min-width:200px">假设（如果…那么…）</th>
        <th>不确定度<br><small style="font-weight:400">1–5</small></th>
        <th>致命度<br><small style="font-weight:400">1–5</small></th>
        <th>风险</th>
        <th>验证方式</th>
        <th style="min-width:180px">量化判定标准</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${assumptionsData.map((a, i) => `
        <tr>
          <td><textarea class="as-hyp" data-i="${i}" rows="2" placeholder="如：如果目标用户每周至少 3 次需要提神饮品，那么校园现磨咖啡会有复购" style="min-height:44px">${esc(a.hyp || "")}</textarea></td>
          <td><select class="as-u" data-i="${i}">${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${+a.uncertainty === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td><select class="as-s" data-i="${i}">${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${+a.severity === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td>${riskChip(risk(a))}</td>
          <td><select class="as-m" data-i="${i}">${VERIFY_METHODS.map(m => `<option ${a.method === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></td>
          <td><textarea class="as-c" data-i="${i}" rows="2" placeholder="如：访谈 20 人，≥12 人表示每周会买 ≥2 次" style="min-height:44px">${esc(a.criteria || "")}</textarea></td>
          <td><button class="btn btn-ghost btn-sm as-del" data-i="${i}" ${assumptionsData.length <= 1 ? "disabled" : ""}>✕</button></td>
        </tr>`).join("")}
      </tbody>
    </table></div>
    <button class="btn btn-ghost btn-sm" id="asAdd" style="margin-top:10px">＋ 添加假设</button>`;

  area.innerHTML = html();
  const bind = () => {
    area.querySelectorAll(".as-hyp").forEach(t => { t.oninput = () => { assumptionsData[+t.dataset.i].hyp = t.value; }; });
    area.querySelectorAll(".as-c").forEach(t => { t.oninput = () => { assumptionsData[+t.dataset.i].criteria = t.value; }; });
    area.querySelectorAll(".as-u").forEach(s => { s.onchange = () => { assumptionsData[+s.dataset.i].uncertainty = +s.value; area.innerHTML = html(); bind(); }; });
    area.querySelectorAll(".as-s").forEach(s => { s.onchange = () => { assumptionsData[+s.dataset.i].severity = +s.value; area.innerHTML = html(); bind(); }; });
    area.querySelectorAll(".as-m").forEach(s => { s.onchange = () => { assumptionsData[+s.dataset.i].method = s.value; }; });
    area.querySelectorAll(".as-del").forEach(b => {
      b.onclick = () => { assumptionsData.splice(+b.dataset.i, 1); area.innerHTML = html(); bind(); };
    });
    $("asAdd").onclick = () => { assumptionsData.push({ hyp: "", uncertainty: 3, severity: 3, method: "客户访谈", criteria: "" }); area.innerHTML = html(); bind(); };
  };
  bind();
}
function collectAssumptions() {
  const list = assumptionsData
    .map(a => ({
      hyp: String(a.hyp || "").trim(),
      uncertainty: +a.uncertainty || 3,
      severity: +a.severity || 3,
      method: a.method || "客户访谈",
      criteria: String(a.criteria || "").trim(),
    }))
    .filter(a => a.hyp);
  return list.length ? list : null;
}

/* ============================================================
   案例库（师生共用）
   ============================================================ */
const CASES = [
  {
    id: "airbnb", icon: "🏠", name: "Airbnb", model: "双边平台模式", tagBg: "var(--primary-light)", tagColor: "var(--primary-dark)",
    intro: "2008 年成立于旧金山。三位创始人靠出租气垫床起步，如今平台覆盖 220+ 国家和地区、数百万套房源——不拥有一间房，却重构了全球住宿市场。",
    canvas: [
      ["客户细分", "双边的：出行旅客 + 有闲置房源的房东（多边平台典型结构）"],
      ["价值主张", "旅客：更便宜、更有本地味的住宿；房东：闲置资产变现"],
      ["渠道通路", "网站与 App、搜索引擎、社交口碑与「房东转介绍」"],
      ["客户关系", "双向评价体系建立信任；房东社区与超级房东认证"],
      ["收入来源", "向房东与房客双边收取约 3% + 14% 服务佣金"],
      ["核心资源", "房源与用户双边网络、评价数据、品牌信任"],
      ["关键业务", "平台研发运营、信任与安全体系（身份核验/保险）"],
      ["重要伙伴", "房东、支付与保险公司、目的地旅游服务商"],
      ["成本结构", "技术研发、市场获客、信任安全与客服成本"],
    ],
    insights: [
      ["网络效应是护城河", "房东越多→房源越丰富→旅客越多→房东收益越高→更多房东加入。双边正向循环一旦转起来，后来者极难追赶。"],
      ["信任机制是平台的生命线", "双向评价、身份核验、房东保障金——早期最大的障碍不是没需求，而是「住进陌生人家里」的信任鸿沟。"],
      ["轻资产撬动重市场", "传统酒店要买地建楼，Airbnb 只做匹配。边际成本极低，规模扩张近乎零阻力。"],
      ["冷启动策略", "早期团队逐个城市「扫楼式」招募房东、请专业摄影师上门拍照——平台早期必须人工做重，才能把双边市场推过临界点。"],
    ],
    think: [
      "Airbnb 在中国的本土化尝试（爱彼迎）为何未能成功？双边平台跨国复制的关键障碍是什么？",
      "如果你做一个「共享自习室/共享厨房」平台，双边冷启动应该先补哪一边？为什么？",
    ],
  },
  {
    id: "costco", icon: "🛒", name: "Costco 开市客", model: "会员制模式", tagBg: "#ECFDF5", tagColor: "#065F46",
    intro: "全球第二大零售商。商品毛利率常年压在 11% 左右（同行普遍 25%+），却常年高盈利——它真正的产品不是货架上的商品，而是会员卡。",
    canvas: [
      ["客户细分", "中产家庭：注重品质与性价比、整箱采购的家庭用户"],
      ["价值主张", "「品质精选 + 极致低价」：SKU 仅约 4000 个（沃尔玛数万），每个品类只留最优选"],
      ["渠道通路", "仓储式大卖场（选址郊区、货仓即卖场）+ 线上商城"],
      ["客户关系", "付费会员制（年费制）：会员续费率约 90%"],
      ["收入来源", "会员费贡献利润大头；商品销售近乎平价走量"],
      ["核心资源", "全球供应链议价能力、买手选品能力、会员忠诚度"],
      ["关键业务", "极致选品与供应链压缩成本、自有品牌 Kirkland 开发"],
      ["重要伙伴", "头部品牌供应商（深度绑定、大规模直采）"],
      ["成本结构", "低营销（几乎不打广告）、高周转低毛利、简装仓储降运营成本"],
    ],
    insights: [
      ["利润前置，模式反转", "传统零售赚商品差价；Costco 把商品当「引流品」，赚「服务费」（会员费）。利益与客户站到同一边：越为会员省钱，续费率越高。"],
      ["少即是多", "极少的 SKU 意味着单品采购量巨大，议价能力极强，同时降低选择成本与库存周转天数——选品本身就是商业模式的一部分。"],
      ["续费率是命根子", "90% 续费率意味着会员费接近「经常性收入」，具备订阅制的一切优点：可预测、可累积、复利式增长。"],
      ["自有品牌是毛利调节器", "Kirkland 既能进一步压低价格，又能保住利润空间，还强化了「只有会员才买得到」的专属感。"],
    ],
    think: [
      "国内的山姆会员店复制了这一模式并大获成功，而许多模仿者（仓储会员店）却关门。会员制成立的前提条件是什么？",
      "把「会员制」迁移到你自己的项目上：你会把什么做成「近乎平价的引流品」，又靠什么收「会员费」？",
    ],
  },
  {
    id: "netflix", icon: "🎬", name: "Netflix 奈飞", model: "内容订阅模式", tagBg: "#FCE7F3", tagColor: "#9D174D",
    intro: "从「邮寄租碟」小店到全球流媒体霸主，两度自我颠覆：DVD 邮寄 → 流媒体 → 原创内容。订阅制的复利逻辑 + 数据驱动的内容飞轮，是其穿越三轮技术浪潮的答案。",
    canvas: [
      ["客户细分", "全球影视娱乐消费者：追剧党、家庭观影、通勤碎片化观看"],
      ["价值主张", "随时随地点播海量内容，无广告打扰，月费远低于有线电视"],
      ["渠道通路", "全终端 App（TV/手机/平板）、智能电视预装、电信捆绑合作"],
      ["客户关系", "自动化订阅管理：个性化推荐引擎维系粘性，可随时取消"],
      ["收入来源", "分级月度订阅费（纯订阅、零广告，后增加含广告低价档）"],
      ["核心资源", "原创内容库、观看行为数据、推荐算法、全球发行网络"],
      ["关键业务", "内容投资与自制（年投入超百亿美元）、算法与产品迭代"],
      ["重要伙伴", "影视制作公司与创作者、电信运营商、CDN 基础设施"],
      ["成本结构", "内容制作与版权采购（固定成本大头）、技术与带宽"],
    ],
    insights: [
      ["订阅制 = 确定性收入", "月费模式让收入可预测，敢于提前锁定巨额内容投资；用户越多，单内容成本越被摊薄——规模带来结构性成本优势。"],
      ["数据是隐形的产品经理", "观看、暂停、弃剧数据反哺内容决策。热门剧集、海报乃至片名都由数据测试驱动，把「内容赌注」变成「内容实验」。"],
      ["自我颠覆优于被颠覆", "利润最丰厚的 DVD 邮寄业务被自己亲手砍掉转投流媒体——商业模式的生命周期管理本身就是核心竞争力。"],
      ["留存即生死线", "订阅模式没有「单次交易」缓冲，用户每月都在重新决定是否续订。内容库的持续新鲜度就是留存的全部。"],
    ],
    think: [
      "订阅制在国内视频平台普遍「会员 + 广告」双收，用户颇有怨言。从商业模式角度，这损害了什么？Netflix 后来推出低价含广告档说明了什么？",
      "除内容外，还有哪些生意适合「订阅化改造」？改造的前提是什么（提示：使用频率、边际成本、沉没感）？",
    ],
  },
  {
    id: "pdd", icon: "🛍️", name: "拼多多", model: "社交裂变模式", tagBg: "#FFF7ED", tagColor: "#9A3412",
    intro: "2015 年成立，在淘宝京东双巨头格局看似板上钉钉之时，用「拼团 + 微信裂变 + 极致低价」五年做到年活跃买家第一——用社交关系链把获客成本打到地板。",
    canvas: [
      ["客户细分", "价格敏感型下沉市场用户 + 追求性价比的白领（后来居上）"],
      ["价值主张", "「多实惠、多乐趣」：极致低价 + 拼团砍价的社交游戏化体验"],
      ["渠道通路", "微信小程序与社交分享（零安装门槛）、App、微信支付"],
      ["客户关系", "游戏化运营：签到、砍一刀、多多果园——把省钱变成玩"],
      ["收入来源", "广告与佣金（平台模式），百亿补贴贴钱换信任与客单"],
      ["核心资源", "微信社交链、巨量下沉用户、C2M 反向定制供应链"],
      ["关键业务", "拼团裂变机制运营、商品治理、农产品直连（多多买菜）"],
      ["重要伙伴", "微信生态、白牌工厂与产地农户、物流伙伴"],
      ["成本结构", "百亿补贴（战略性获客投入）、平台研发与治理成本"],
    ],
    insights: [
      ["获客成本决定打法", "双巨头时代货架电商获客成本上百元，拼多多借拼团让「用户带用户」，把 CAC 压到个位数——当获客成本结构性低于对手，一切打法都成立。"],
      ["错位竞争，侧翼切入", "不做「更好的淘宝」，而做「五环外的淘宝」：服务被巨头忽视的下沉市场，在无人区建立根据地再向上渗透。"],
      ["社交即渠道，信任即转化", "拼团的本质是「用熟人信用背书商品」——朋友发起的拼团天然过滤了假货疑虑，这是纯货架电商没有的转化优势。"],
      ["C2M 反向定制", "用聚集的确定性需求反向驱动工厂按需生产（先拼后产），把库存风险从产业带工厂身上拿走——模式创新最终沉淀为供应链效率。"],
    ],
    think: [
      "「砍一刀」在增长后期为何逐渐淡出？裂变机制的生命周期与用户疲劳如何应对？",
      "对你的项目做一次「获客成本审计」：当前主要渠道的 CAC 是多少？是否存在一条「用户带用户」的裂变路径？障碍是什么（动机/信任/门槛）？",
    ],
  },
];

function viewCases(view) {
  view.innerHTML = `
  <div class="page-head">
    <h1>📖 经典案例库</h1>
    <p class="desc">四个经典商业模式的画布级拆解。看完案例，回到你自己的课程画布里去迭代——赢的不是产品，而是模式。</p>
  </div>
  <div class="case-list">
    ${CASES.map(c => `
    <div class="card case-card-2">
      <div class="case-head">
        <span class="case-ic">${c.icon}</span>
        <div>
          <h2>${esc(c.name)} <span class="model-tag" style="background:${c.tagBg};color:${c.tagColor}">${esc(c.model)}</span></h2>
          <p>${esc(c.intro)}</p>
        </div>
      </div>
      <h3>🧩 画布拆解</h3>
      <div class="case-canvas">
        ${c.canvas.map(([k, v]) => `<div class="cc"><b>${esc(k)}</b>${esc(v)}</div>`).join("")}
      </div>
      <h3>💡 关键洞察</h3>
      <ul class="insight-list">
        ${c.insights.map(([t, v]) => `<li><b>${esc(t)}：</b>${esc(v)}</li>`).join("")}
      </ul>
      <div class="think-box">
        <b>🎓 实训思考题</b>
        <ol>${c.think.map(t => `<li>${esc(t)}</li>`).join("")}</ol>
      </div>
    </div>`).join("")}
  </div>`;
}

/* ============================================================
   教师端视图
   ============================================================ */
async function viewTeacherCourses(view) {
  const data = await api("/api/teacher/courses");
  view.innerHTML = `
  <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:14px">
    <div><h1>课程管理</h1><p class="desc">创建实训课程并分享邀请码，学生加入后即可按阶段提交实训成果，你在评阅中心批改。</p></div>
    <button class="btn btn-primary" id="btnNewCourse">＋ 创建课程</button>
  </div>
  <div class="grid-2" id="courseGrid"></div>`;

  $("btnNewCourse").onclick = () => {
    openModal(`
      <h3>创建实训课程</h3>
      <p style="font-size:13px;color:var(--text-3);margin-bottom:16px">创建后自动生成六个阶段的「商业模式设计」标准课程（可再编辑阶段任务）。</p>
      <div class="field"><label>课程标题</label><input id="ncTitle" placeholder="例如：2026 春季 · 商业模式设计实训" maxlength="50"></div>
      <div class="field"><label>课程简介（选填）</label><input id="ncDesc" placeholder="面向的班级 / 专业 / 实训目标" maxlength="100"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" id="ncGo">创建</button>
      </div>`);
    $("ncGo").onclick = async () => {
      const title = $("ncTitle").value.trim();
      if (!title) return toast("请填写课程标题");
      try {
        const r = await api("/api/teacher/courses", { method: "POST", body: { title, desc: $("ncDesc").value.trim() } });
        closeModal(); toast("课程创建成功");
        location.hash = `#/t/course/${r.course.id}`;
      } catch (ex) { toast(ex.message); }
    };
  };

  const grid = $("courseGrid");
  if (!data.courses.length) {
    grid.innerHTML = `<div class="card empty" style="grid-column:1/-1"><span class="eic">📚</span>还没有课程<br>点击右上角「创建课程」开始</div>`;
    return;
  }
  grid.innerHTML = data.courses.map(c => `
    <div class="card course-card" data-id="${c.id}" style="cursor:pointer">
      <h3>${esc(c.title)}</h3>
      <div class="meta"><span>👥 ${c.students} 名学生</span><span>📥 ${c.submissions} 份提交</span><span>⏳ ${c.pending} 份待批</span></div>
      <p>邀请码 <b style="letter-spacing:2px;color:var(--primary-dark)">${esc(c.inviteCode)}</b></p>
      <span style="font-size:13px;color:var(--primary);font-weight:600">进入课程管理 →</span>
    </div>`).join("");
  grid.querySelectorAll(".course-card").forEach(el => {
    el.onclick = () => location.hash = `#/t/course/${el.dataset.id}`;
  });
}

async function viewTeacherCourse(view, courseId) {
  const c = await loadCourse(courseId);
  const data = await api("/api/teacher/courses");
  const mine = data.courses.find(x => x.id === courseId) || {};
  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/t/courses">课程管理</a> / ${esc(c.title)}</div>
    <h1>${esc(c.title)}</h1>
    <p class="desc">${esc(c.desc || "")} · 共 ${c.stages.length} 个阶段</p>
  </div>
  <div class="invite-box">
    <div style="flex:1">
      <div style="font-size:13px;color:var(--text-2)">学生加入邀请码（在「我的课程」页输入即可加入）</div>
      <div class="code">${esc(c.inviteCode)}</div>
    </div>
    <button class="btn btn-ghost btn-sm" id="btnRecode">重置邀请码</button>
  </div>
  <div class="kpi-grid" style="margin-top:20px">
    <div class="kpi"><div class="label">学生人数</div><div class="value">${mine.students || 0}</div></div>
    <div class="kpi"><div class="label">提交总数</div><div class="value">${mine.submissions || 0}</div></div>
    <div class="kpi"><div class="label">待批阅</div><div class="value" style="color:${(mine.pending || 0) > 0 ? "var(--warn)" : "var(--success)"}">${mine.pending || 0}</div></div>
    <div class="kpi"><div class="label">课程阶段</div><div class="value">${c.stages.length}</div></div>
  </div>
  <div class="grid-2">
    <a class="card course-card" href="#/t/course/${courseId}/review"><h3>📥 评阅中心</h3><p>查看学生各阶段提交的实训成果（任务、画布、财务模型、计划书），打分、评语、通过或退回修改。</p></a>
    <a class="card course-card" href="#/t/course/${courseId}/students"><h3>👥 学生管理</h3><p>查看加入课程的学生及其学习进度、平均分与自测正确率，可移除学生。</p></a>
    <a class="card course-card" href="#/t/course/${courseId}/dashboard"><h3>📊 进度看板</h3><p>各阶段提交率、平均分分布、自测正确率一览，掌握全班实训动态。</p></a>
    <a class="card course-card" href="#/t/course/${courseId}/edit"><h3>✏️ 课程内容</h3><p>修改课程信息与各阶段名称、任务说明；导出全班成绩表 CSV。</p></a>
  </div>
  <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
    <a class="btn btn-outline" href="/api/teacher/courses/${courseId}/grades.csv?token=${getSession().token}" id="csvLink">📥 导出成绩表 CSV</a>
    <button class="btn btn-danger" id="btnDelCourse">删除课程</button>
  </div>`;

  $("btnRecode").onclick = async () => {
    if (!confirm("重置邀请码后旧码将失效，确定？")) return;
    await api(`/api/teacher/courses/${courseId}/regenerate-code`, { method: "POST" });
    delete state.courseCache[courseId];
    toast("邀请码已重置");
    viewTeacherCourse(view, courseId);
  };
  $("btnDelCourse").onclick = async () => {
    if (!confirm(`删除课程「${c.title}」？该课程的学生选课与提交记录将一并删除，不可恢复。`)) return;
    await api(`/api/teacher/courses/${courseId}`, { method: "DELETE" });
    toast("课程已删除");
    location.hash = "#/t/courses";
  };
}

async function viewTeacherStudents(view, courseId) {
  const c = await loadCourse(courseId);
  const data = await api(`/api/teacher/courses/${courseId}/students`);
  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/t/courses">课程管理</a> / <a href="#/t/course/${courseId}">${esc(c.title)}</a> / 学生管理</div>
    <h1>学生管理</h1>
    <p class="desc">共 ${data.students.length} 名学生 · 邀请码 <b>${esc(c.inviteCode)}</b></p>
  </div>
  <div class="card" style="padding:10px 18px 18px">
    <div class="table-wrap"><table class="dt">
      <thead><tr><th>姓名</th><th>账号</th><th>加入时间</th><th>提交进度</th><th>已批改</th><th>平均分</th><th>自测正确率</th><th>操作</th></tr></thead>
      <tbody>
        ${data.students.length ? data.students.map(s => `
          <tr>
            <td><b>${esc(s.name)}</b></td>
            <td>${esc(s.account)}</td>
            <td>${new Date(s.joinedAt).toLocaleDateString("zh-CN")}</td>
            <td><div class="pbar" style="width:120px"><div style="width:${Math.round(s.progress.submittedCount / s.progress.stageCount * 100)}%"></div></div>
                <span style="font-size:12px;color:var(--text-3)">${s.progress.submittedCount}/${s.progress.stageCount}</span></td>
            <td>${s.progress.gradedCount}</td>
            <td>${s.progress.avgScore == null ? '<span class="chip gray">—</span>' : `<b>${s.progress.avgScore}</b>`}</td>
            <td>${s.progress.quizAccuracy == null ? '<span class="chip gray">—</span>' : s.progress.quizAccuracy + "%"}</td>
            <td><button class="btn btn-danger btn-sm" data-rm="${s.id}" data-nm="${esc(s.name)}">移除</button></td>
          </tr>`).join("") : `<tr><td colspan="8" class="empty"><span class="eic">📭</span>还没有学生加入，分享邀请码 ${esc(c.inviteCode)} 给学生吧</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
  view.querySelectorAll("[data-rm]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(`将学生「${btn.dataset.nm}」移出课程？其在本课程的提交记录也会删除。`)) return;
      await api(`/api/teacher/courses/${courseId}/students/${btn.dataset.rm}`, { method: "DELETE" });
      toast("已移除");
      viewTeacherStudents(view, courseId);
    };
  });
}

/* ---------- 评阅中心（按学员姓名分组）---------- */
async function viewTeacherReview(view, courseId) {
  const c = await loadCourse(courseId);
  const url = new URL(location.href);
  let stageFilter = url.searchParams.get("stage") || "";
  let statusFilter = url.searchParams.get("status") || "";
  const qs = [];
  if (stageFilter) qs.push("stage=" + stageFilter);
  if (statusFilter) qs.push("status=" + statusFilter);
  const data = await api(`/api/teacher/courses/${courseId}/submissions` + (qs.length ? "?" + qs.join("&") : ""));

  // 按学员姓名分组;同姓名合并(理论上一名学生只占一行)
  const groups = new Map();
  for (const s of data.submissions) {
    const key = s.studentId || (s.studentName + "|" + s.studentAccount);
    if (!groups.has(key)) groups.set(key, { studentId: s.studentId, studentName: s.studentName, studentAccount: s.studentAccount, subs: [] });
    groups.get(key).subs.push(s);
  }
  // 按学员姓名升序,姓名前可加未读提示(若有未批)
  const groupList = Array.from(groups.values()).sort((a, b) => a.studentName.localeCompare(b.studentName, "zh-CN"));

  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/t/courses">课程管理</a> / <a href="#/t/course/${courseId}">${esc(c.title)}</a> / 评阅中心</div>
    <h1>评阅中心</h1>
    <p class="desc">左侧按<strong>学员姓名</strong>分组排列,每张卡片显示该学员的<strong>待批成果份数</strong>;点击卡片展开后,选中具体提交查看详情并打分/退回修改。</p>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;align-items:center">
    <select id="fStage" class="btn btn-ghost btn-sm" style="padding:8px 12px">
      <option value="">全部阶段</option>
      ${data.stages.map(s => `<option value="${s.id}" ${String(s.id) === stageFilter ? "selected" : ""}>${s.id}. ${esc(s.name)}</option>`).join("")}
    </select>
    <select id="fStatus" class="btn btn-ghost btn-sm" style="padding:8px 12px">
      <option value="">全部状态</option>
      <option value="submitted" ${statusFilter === "submitted" ? "selected" : ""}>待批阅</option>
      <option value="approved" ${statusFilter === "approved" ? "selected" : ""}>已通过</option>
      <option value="revise" ${statusFilter === "revise" ? "selected" : ""}>需修改</option>
    </select>
    <span style="font-size:13px;color:var(--text-3);align-self:center">共 ${data.submissions.length} 份提交 · ${groupList.length} 名学员</span>
  </div>
  <div class="review-layout">
    <div class="card review-list" id="reviewList">
      ${groupList.length ? groupList.map(g => {
        const pending = g.subs.filter(x => x.status === "submitted").length;
        const revised = g.subs.filter(x => x.status === "revise").length;
        const approved = g.subs.filter(x => x.status === "approved").length;
        const total = g.subs.length;
        return `
        <div class="review-student" data-sid="${esc(g.studentId)}">
          <div class="rs-head" data-toggle="${esc(g.studentId)}">
            <span class="rs-name">${esc(g.studentName)}</span>
            <span class="rs-acc">${esc(g.studentAccount || "")}</span>
            <div class="rs-counts">
              ${pending > 0 ? `<span class="chip amber" title="待批阅">⏳ 待批 ${pending}</span>` : ""}
              ${revised > 0 ? `<span class="chip red" title="需修改">🔁 需修改 ${revised}</span>` : ""}
              ${approved > 0 ? `<span class="chip green" title="已通过">✓ 已通过 ${approved}</span>` : ""}
              ${pending === 0 && revised === 0 && approved === 0 ? `<span class="chip gray">无</span>` : ""}
            </div>
            <span class="rs-arrow">›</span>
          </div>
          <div class="rs-subs" id="rsSubs_${esc(g.studentId)}" hidden>
            ${g.subs.map(s => {
              const st = data.stages.find(x => x.id === s.stageId);
              const chip = s.status === "submitted" ? '<span class="chip amber">待批</span>'
                : s.status === "approved" ? '<span class="chip green">通过</span>' : '<span class="chip red">需修改</span>';
              const reChip = s.resubmitted ? ' <span class="chip amber">已重交</span>' : "";
              return `<div class="rs-sub" data-sid="${s.id}">
                <span class="rss-stage">阶段 ${s.stageId} · ${esc(st ? st.name : "")}</span>
                ${chip}${reChip}
                <span class="rss-meta">${s.score != null ? s.score + " 分 · " : ""}${new Date(s.submittedAt).toLocaleString("zh-CN")}</span>
              </div>`;
            }).join("")}
          </div>
        </div>`;
      }).join("") : `<div class="empty"><span class="eic">📭</span>暂无提交记录</div>`}
    </div>
    <div id="reviewDetail"><div class="card empty"><span class="eic">👈</span>选择左侧学员的具体提交查看详情</div></div>
  </div>`;

  const applyFilter = () => {
    const p = new URL(location.href);
    stageFilter = $("fStage").value; statusFilter = $("fStatus").value;
    if (stageFilter) p.searchParams.set("stage", stageFilter); else p.searchParams.delete("stage");
    if (statusFilter) p.searchParams.set("status", statusFilter); else p.searchParams.delete("status");
    history.replaceState(null, "", p);
    viewTeacherReview(view, courseId);
  };
  $("fStage").onchange = applyFilter;
  $("fStatus").onchange = applyFilter;

  // 折叠/展开学员卡片
  view.querySelectorAll(".rs-head").forEach(h => {
    h.onclick = () => {
      const sid = h.dataset.toggle;
      const subs = $("rsSubs_" + sid);
      if (!subs) return;
      const hidden = subs.hasAttribute("hidden");
      subs.toggleAttribute("hidden");
      h.classList.toggle("open", hidden);
    };
  });
  // 点击提交进入评阅详情
  view.querySelectorAll(".rs-sub").forEach(el => {
    el.onclick = () => {
      view.querySelectorAll(".rs-sub").forEach(x => x.classList.remove("active"));
      el.classList.add("active");
      renderReviewDetail($("reviewDetail"), el.dataset.sid, courseId);
    };
  });
}

async function renderReviewDetail(box, sid, courseId) {
  const d = await api(`/api/teacher/submissions/${sid}`);
  const s = d.submission;
  const canvas = s.canvas || null;
  const fin = s.finance || null;
  const plan = s.plan || null;
  const quiz = s.quiz || null;

  const canvasHtml = () => {
    if (!canvas) return "";
    let out = "";
    const bmc = canvas.bmc && Object.keys(canvas.bmc).length ? canvas.bmc : null;
    const vpc = canvas.vpc && Object.keys(canvas.vpc).length ? canvas.vpc : null;
    if (bmc) {
      out += `<div class="content-h">🧩 商业模式画布</div><div class="bmc-wrap"><div class="bmc-grid">
        ${BMC_BLOCKS.map(b => `<div class="bmc-block" style="grid-column:${b.col};grid-row:${b.row};min-height:auto">
          <h5>${b.name}<span class="count">${(bmc[b.key] || []).length} 张</span></h5>
          ${(bmc[b.key] || []).map(n => `<div class="readonly-note">${esc(n)}</div>`).join("") || '<span style="font-size:12px;color:var(--text-3)">（空）</span>'}
        </div>`).join("")}</div></div>`;
    }
    if (vpc) {
      const col = side => `<div class="vpc-col">${VPC_BLOCKS.filter(b => b.side === side).map(b => `
        <div class="vpc-square" style="min-height:auto"><h5 style="font-size:13px">${b.name}</h5>
        ${(vpc[b.key] || []).map(n => `<div class="readonly-note">${esc(n)}</div>`).join("") || '<span style="font-size:12px;color:var(--text-3)">（空）</span>'}</div>`).join("")}</div>`;
      out += `<div class="content-h">🎯 价值主张画布</div><div class="bmc-wrap"><div class="vpc-grid">${col("left")}${col("right")}</div></div>`;
    }
    return out;
  };

  const finHtml = () => {
    if (!fin) return "";
    const cm = (+fin.price || 0) - (+fin.vc || 0);
    const bep = cm > 0 ? Math.ceil((+fin.fixed || 0) / cm) : Infinity;
    const ltv = Math.max(cm, 0) * (+fin.freq || 0) * (+fin.months || 0);
    const ratio = +fin.cac > 0 ? Math.round(ltv / +fin.cac * 100) / 100 : "∞";
    return `<div class="content-h">🧮 财务测算参数</div>
      <div class="fin-grid">
        ${FIN_FIELDS.map(f => `<div class="fin-cell"><div class="fl">${f.label}</div><div class="fv" style="font-size:14px">${fmt(fin[f.k] || 0)}</div></div>`).join("")}
        <div class="fin-cell"><div class="fl">盈亏平衡销量</div><div class="fv">${isFinite(bep) ? fmt(bep) + " 件" : "—"}</div></div>
        <div class="fin-cell"><div class="fl">LTV / CAC</div><div class="fv">${ratio} : 1</div></div>
      </div>`;
  };

  const planHtml = () => {
    if (!plan) return "";
    return `<div class="content-h">📄 商业计划书</div><div class="plan-doc">
      ${PLAN_SECTIONS.map(sec => plan[sec.k] ? `<h4>${sec.label}</h4><p>${esc(plan[sec.k])}</p>` : "").join("")}
    </div>`;
  };

  const matrixHtml = () => {
    if (!s.matrix || !s.matrix.opportunities) return "";
    const m = s.matrix;
    const total = o => MATRIX_DIMS.reduce((sum, d) => sum + (+o.scores[d.k] || 0), 0);
    return `<div class="content-h">📊 机会评估矩阵</div>
      <div class="table-wrap"><table class="dt">
        <thead><tr><th>候选机会</th>${MATRIX_DIMS.map(d => `<th>${d.label}</th>`).join("")}<th>总分</th><th>选定</th></tr></thead>
        <tbody>${m.opportunities.map((o, i) => `
          <tr class="${i === m.chosen ? "mx-chosen" : ""}">
            <td><b>${esc(o.name)}</b></td>
            ${MATRIX_DIMS.map(d => `<td>${+o.scores[d.k] || "—"}</td>`).join("")}
            <td><b>${total(o)}</b></td>
            <td>${i === m.chosen ? "✅" : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>
      <p style="font-size:12px;color:var(--text-3);margin-top:6px">绿色高亮行为该生选定的机会。</p>`;
  };

  const assumptionsHtml = () => {
    if (!s.assumptions) return "";
    const riskChip = (u, sv) => {
      const v = (+u || 1) * (+sv || 1);
      const cls = v >= 15 ? "red" : v >= 8 ? "amber" : "green";
      const txt = v >= 15 ? "高危" : v >= 8 ? "中风险" : "低风险";
      return `<span class="chip ${cls}">${v} · ${txt}</span>`;
    };
    return `<div class="content-h">🧪 假设清单</div>
      <div class="table-wrap"><table class="dt">
        <thead><tr><th>假设</th><th>不确定度</th><th>致命度</th><th>风险</th><th>验证方式</th><th>量化判定标准</th></tr></thead>
        <tbody>${s.assumptions.map(a => `
          <tr>
            <td style="max-width:260px">${esc(a.hyp)}</td>
            <td>${a.uncertainty}/5</td>
            <td>${a.severity}/5</td>
            <td>${riskChip(a.uncertainty, a.severity)}</td>
            <td>${esc(a.method)}</td>
            <td style="max-width:220px">${esc(a.criteria || "—")}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  };

  box.innerHTML = `
  <div class="card grade-panel">
    <h3>${esc(d.studentName)} · 阶段 ${s.stageId} ${esc(d.stageName)}</h3>
    <p style="font-size:12.5px;color:var(--text-3)">提交于 ${new Date(s.submittedAt).toLocaleString("zh-CN")}
      ${quiz ? ` · 自测 ${quiz.score}/${quiz.total}` : ""}</p>
    ${s.resubmitted && s.lastGrade ? `<div class="submission-status-box revise" style="margin:10px 0">🔁 <b>该生已重新提交</b> —— 上次批改：${s.lastGrade.status === "approved" ? "通过" : "退回修改"}${s.lastGrade.score != null ? " · " + s.lastGrade.score + " 分" : ""}${s.lastGrade.feedback ? " · 评语：" + esc(s.lastGrade.feedback) : ""}<br><small>旧成绩快照仅供参照，本次批改将覆盖。</small></div>` : ""}
    <div class="content-h">✍️ 实训成果描述</div>
    <p style="font-size:14px;color:var(--text-2);white-space:pre-wrap;background:#F8FAFC;border-radius:10px;padding:14px 16px">${esc(s.taskText)}</p>
    ${matrixHtml()}${assumptionsHtml()}${canvasHtml()}${finHtml()}${planHtml()}
    <div class="content-h">🖊 批改</div>
    <div class="score-input">
      <input id="gScore" type="number" min="0" max="100" value="${s.score != null ? s.score : ""}" placeholder="0-100">
      <span style="font-size:13px;color:var(--text-3)">分（0–100 整数）</span>
      ${s.status !== "submitted" ? `<span class="chip ${s.status === "approved" ? "green" : "red"}">${s.status === "approved" ? "已通过" : "已退回"}</span>` : '<span class="chip amber">待批阅</span>'}
    </div>
    <div class="field" style="margin-top:12px">
      <label>评语</label>
      <textarea id="gFeedback" placeholder="写给学生：亮点、不足与修改建议…" style="min-height:90px">${esc(s.feedback || "")}</textarea>
    </div>
    <div class="grade-actions">
      <button class="btn btn-primary" id="gApprove">✓ 打分并通过</button>
      <button class="btn btn-outline" id="gRevise" style="color:var(--danger);border-color:#FECACA">退回修改</button>
    </div>
  </div>`;

  const grade = async status => {
    const score = $("gScore").value.trim();
    const feedback = $("gFeedback").value.trim();
    if (score === "") return toast("请填写分数");
    try {
      await api(`/api/teacher/submissions/${sid}/grade`, { method: "POST", body: { score: +score, feedback, status } });
      toast(status === "approved" ? "已批改：通过" : "已退回，待学生修改");
      viewTeacherReview($("view"), courseId);
    } catch (ex) { toast(ex.message); }
  };
  $("gApprove").onclick = () => grade("approved");
  $("gRevise").onclick = () => grade("revise");
}

/* ---------- 看板 ---------- */
async function viewTeacherDashboard(view, courseId) {
  const c = await loadCourse(courseId);
  const d = await api(`/api/teacher/courses/${courseId}/dashboard`);
  const maxRate = 100;
  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/t/courses">课程管理</a> / <a href="#/t/course/${courseId}">${esc(c.title)}</a> / 进度看板</div>
    <h1>进度看板</h1>
    <p class="desc">全班实训动态一览：各阶段提交率、批改进度、平均分与自测正确率。</p>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">学生人数</div><div class="value">${d.students}</div></div>
    <div class="kpi"><div class="label">待批阅</div><div class="value" style="color:${d.pending ? "var(--warn)" : "var(--success)"}">${d.pending}</div></div>
    <div class="kpi"><div class="label">平均分最高的阶段</div><div class="value" style="font-size:18px">${(() => {
      const s = d.stageStats.filter(x => x.avgScore != null).sort((a, b) => b.avgScore - a.avgScore)[0];
      return s ? `${esc(s.name)}（${s.avgScore}）` : "—";
    })()}</div></div>
    <div class="kpi"><div class="label">提交率最低的阶段</div><div class="value" style="font-size:18px">${(() => {
      const s = [...d.stageStats].sort((a, b) => a.submitRate - b.submitRate)[0];
      return s ? `${esc(s.name)}（${s.submitRate}%）` : "—";
    })()}</div></div>
  </div>
  <div class="grid-2">
    <div class="card" style="padding:22px">
      <h4 style="font-size:15px;margin-bottom:14px">各阶段提交率 / 已批改</h4>
      ${d.stageStats.map(s => `
        <div class="bar-row"><span class="bl">${s.stageId}. ${esc(s.name)}</span>
          <div class="bar" style="width:${Math.max(s.submitRate * 0.6, 1)}%"></div>
          <span class="bv">${s.submitted} 份 · ${s.submitRate}%${s.graded ? `（批 ${s.graded}）` : ""}</span>
        </div>`).join("") || '<div class="empty">暂无数据</div>'}
    </div>
    <div class="card" style="padding:22px">
      <h4 style="font-size:15px;margin-bottom:14px">各阶段自测正确率</h4>
      ${d.quizAvgs.map(s => `
        <div class="bar-row"><span class="bl">${s.stageId}. ${esc(s.name)}</span>
          <div class="bar ${s.avg != null && s.avg < 60 ? "amber" : ""}" style="width:${s.avg == null ? 0 : Math.max(s.avg * 0.6, 1)}%"></div>
          <span class="bv">${s.avg == null ? "未测" : s.avg + "%"}</span>
        </div>`).join("") || '<div class="empty">暂无数据</div>'}
    </div>
  </div>
  <div class="card" style="padding:22px;margin-top:20px">
    <h4 style="font-size:15px;margin-bottom:14px">成绩分布（按批改份数）</h4>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
      ${Object.entries(d.scoreDist).map(([k, v]) => `
        <div style="text-align:center;background:#F8FAFC;border:1px solid var(--border);border-radius:12px;padding:16px 8px">
          <div style="font-size:24px;font-weight:800;color:${k === "<60" && v ? "var(--danger)" : "var(--primary-dark)"}">${v}</div>
          <div style="font-size:12.5px;color:var(--text-3);font-weight:600">${k} 分</div>
        </div>`).join("")}
    </div>
  </div>`;
}

/* ---------- 课程内容编辑 ---------- */
async function viewTeacherEdit(view, courseId) {
  const c = await loadCourse(courseId);
  view.innerHTML = `
  <div class="page-head">
    <div class="breadcrumb"><a href="#/t/courses">课程管理</a> / <a href="#/t/course/${courseId}">${esc(c.title)}</a> / 课程内容</div>
    <h1>课程内容设置</h1>
    <p class="desc">修改课程基本信息与各阶段名称、简介、实训任务（每行一条）。知识点与自测题使用标准模板，暂不支持在线修改。</p>
  </div>
  <div class="card" style="padding:26px">
    <div class="grid-2">
      <div class="field"><label>课程标题</label><input id="ecTitle" value="${esc(c.title)}" maxlength="50"></div>
      <div class="field"><label>课程简介</label><input id="ecDesc" value="${esc(c.desc || "")}" maxlength="100"></div>
    </div>
    ${c.stages.map(st => `
      <div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">
        <div class="grid-2">
          <div class="field"><label>阶段 ${st.id} 名称</label><input data-st="${st.id}" data-f="name" value="${esc(st.name)}" maxlength="30"></div>
          <div class="field"><label>阶段 ${st.id} 简介</label><input data-st="${st.id}" data-f="brief" value="${esc(st.brief || "")}" maxlength="60"></div>
        </div>
        <div class="field" style="margin:0"><label>实训任务（每行一条）</label>
          <textarea data-st="${st.id}" data-f="tasks" style="min-height:88px">${esc((st.tasks || []).join("\n"))}</textarea>
        </div>
      </div>`).join("")}
    <button class="btn btn-primary" id="btnSaveCourse">保存修改</button>
  </div>`;

  $("btnSaveCourse").onclick = async () => {
    const stages = c.stages.map(st => {
      const nameEl = document.querySelector(`[data-st="${st.id}"][data-f="name"]`);
      const briefEl = document.querySelector(`[data-st="${st.id}"][data-f="brief"]`);
      const tasksEl = document.querySelector(`[data-st="${st.id}"][data-f="tasks"]`);
      return {
        id: st.id,
        name: nameEl.value.trim(),
        brief: briefEl.value.trim(),
        tasks: tasksEl.value.split("\n").map(t => t.trim()).filter(Boolean),
      };
    });
    try {
      await api(`/api/teacher/courses/${courseId}`, {
        method: "PUT",
        body: { title: $("ecTitle").value.trim(), desc: $("ecDesc").value.trim(), stages },
      });
      delete state.courseCache[courseId];
      toast("课程内容已保存");
    } catch (ex) { toast(ex.message); }
  };
}

/* ============================================================
   启动
   ============================================================ */
window.addEventListener("hashchange", route);
if ($("root")) {
  // 认证页
  const s = getSession();
  if (s) location.href = "app.html";
  else renderAuthPage("login");
} else if ($("view")) {
  route();
}
