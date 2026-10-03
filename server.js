/**
 * mAtlas BizLab 2.0 — 创业实训系统服务端
 * 零依赖（Node 内置模块）：HTTP 服务 + 静态文件 + REST API + JSON 文件数据库
 * 启动：node server.js  （默认端口 8700，可用环境变量 PORT 覆盖）
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, save, nextId } = require("./db");
const { defaultCourse } = require("./default-course");

const PORT = process.env.PORT || 8700;
const PUBLIC_DIR = path.join(__dirname, "public");
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 天

/* ================= 工具函数 ================= */
const now = () => new Date().toISOString();
const genToken = () => crypto.randomBytes(24).toString("hex");
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

function publicUser(u) {
  return { id: u.id, role: u.role, account: u.account, name: u.name, createdAt: u.createdAt };
}

function cleanSessionStore() {
  const t = Date.now();
  let changed = false;
  for (const [tok, s] of Object.entries(db.sessions)) {
    if (new Date(s.expires).getTime() < t) { delete db.sessions[tok]; changed = true; }
  }
  if (changed) save();
}

function getUser(req) {
  let token = null;
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) token = auth.slice(7);
  // 支持 ?token= 查询参数（用于 CSV 文件下载等无法携带 header 的场景）
  if (!token && req.url && req.url.includes("token=")) {
    try { token = new URL(req.url, "http://x").searchParams.get("token"); } catch (e) {}
  }
  if (!token || !db.sessions[token]) return null;
  const session = db.sessions[token];
  if (new Date(session.expires).getTime() < Date.now()) { delete db.sessions[token]; save(); return null; }
  return db.users.find(u => u.id === session.userId) || null;
}

/* ================= 业务辅助 ================= */
/* 教师注册码：防止学生自助注册为教师。优先用环境变量 TEACHER_CODE，
   否则首次启动自动生成一次并持久化（控制台打印，可给多位教师共用） */
if (!db.settings) db.settings = {};
(function initTeacherCode() {
  const envCode = (process.env.TEACHER_CODE || "").trim();
  if (envCode) {
    if (db.settings.teacherCode !== envCode) { db.settings.teacherCode = envCode; save(); }
  } else if (!db.settings.teacherCode) {
    db.settings.teacherCode = genCode();
    save();
  }
})();

/* 登录限速：同账号连续失败 5 次锁定 10 分钟（内存态，重启即清零） */
const loginFails = new Map(); // account -> { count, until }
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 10 * 60 * 1000;

function getCourse(id) { return db.courses.find(c => c.id === id) || null; }
function isEnrolled(courseId, studentId) {
  return db.enrollments.some(e => e.courseId === courseId && e.studentId === studentId);
}
function findSubmission(courseId, studentId, stageId) {
  return db.submissions.find(s => s.courseId === courseId && s.studentId === studentId && s.stageId === stageId) || null;
}
function quizBest(courseId, studentId, stageId) {
  // 取该阶段最近一次自测成绩
  const key = `quiz_${courseId}_${studentId}_${stageId}`;
  return db.quizLog && db.quizLog[key] ? db.quizLog[key] : null;
}
function sanitizeStage(st) {
  // 注意：不下发自测答案与解析（判分在服务端完成，防止学生查看源码作弊）
  return {
    id: st.id, name: st.name, color: st.color, brief: st.brief, deliverable: st.deliverable,
    knowledge: st.knowledge || [], tools: st.tools || "", tasks: st.tasks || [], quiz: (st.quiz || []).map(q => ({
      q: q.q, opts: q.opts,
    })),
  };
}
function studentProgress(course, studentId) {
  const stages = course.stages;
  const submitted = {}, graded = {};
  let scoreSum = 0, scoreCount = 0, quizSum = 0, quizCount = 0;
  for (const st of stages) {
    const sub = findSubmission(course.id, studentId, st.id);
    if (sub) {
      submitted[st.id] = true;
      if (sub.score != null) { graded[st.id] = true; scoreSum += sub.score; scoreCount++; }
    }
    const qz = quizBest(course.id, studentId, st.id);
    if (qz) { quizSum += qz.score / qz.total; quizCount++; }
  }
  return {
    submittedCount: Object.keys(submitted).length,
    gradedCount: Object.keys(graded).length,
    stageCount: stages.length,
    submitted, graded,
    avgScore: scoreCount ? Math.round(scoreSum / scoreCount) : null,
    quizAccuracy: quizCount ? Math.round((quizSum / quizCount) * 100) : null,
  };
}

/* ================= API 处理 ================= */
const api = {};

/* ---------- 认证 ---------- */
api["POST /api/auth/register"] = (req, body) => {
  const { role, account, name, password } = body || {};
  if (!["student", "teacher"].includes(role)) return { status: 400, json: { error: "角色必须是 student 或 teacher" } };
  // 教师注册门槛：必须提供正确的教师注册码（由部署方/管理员掌握）
  if (role === "teacher") {
    const code = String((body || {}).teacherCode || "").trim().toUpperCase();
    if (!code) return { status: 400, json: { error: "教师注册需要教师注册码（向系统管理员索取）" } };
    if (code !== String(db.settings.teacherCode || "").toUpperCase()) {
      return { status: 400, json: { error: "教师注册码不正确" } };
    }
  }
  const acc = String(account || "").trim().toLowerCase();
  const nm = String(name || "").trim();
  if (!/^[a-zA-Z0-9_@.]{3,32}$/.test(acc)) return { status: 400, json: { error: "账号需 3–32 位字母/数字/_@. 组成" } };
  if (!nm || nm.length > 20) return { status: 400, json: { error: "姓名不能为空且不超过 20 字" } };
  if (!password || String(password).length < 6) return { status: 400, json: { error: "密码至少 6 位" } };
  if (db.users.some(u => u.account === acc)) return { status: 400, json: { error: "该账号已被注册" } };
  const salt = crypto.randomBytes(8).toString("hex");
  const user = {
    id: nextId("user"), role, account: acc, name: nm,
    passHash: hashPassword(password, salt), salt, createdAt: now(),
  };
  db.users.push(user);
  const token = genToken();
  db.sessions[token] = { userId: user.id, expires: new Date(Date.now() + TOKEN_TTL).toISOString() };
  save();
  return { json: { token, user: publicUser(user) } };
};

api["POST /api/auth/login"] = (req, body) => {
  const acc = String((body || {}).account || "").trim().toLowerCase();
  const password = String((body || {}).password || "");
  // 登录限速：锁定期间直接拒绝
  const failRec = loginFails.get(acc);
  if (failRec && failRec.until && Date.now() < failRec.until) {
    const mins = Math.ceil((failRec.until - Date.now()) / 60000);
    return { status: 429, json: { error: `登录失败次数过多，请 ${mins} 分钟后再试` } };
  }
  const recordFail = () => {
    const rec = loginFails.get(acc) || { count: 0, until: 0 };
    rec.count++;
    if (rec.count >= LOGIN_MAX_FAILS) {
      rec.until = Date.now() + LOGIN_LOCK_MS;
      rec.count = 0; // 锁定期结束后重新计数
    }
    loginFails.set(acc, rec);
  };
  const user = db.users.find(u => u.account === acc);
  if (!user) { recordFail(); return { status: 400, json: { error: "账号不存在" } }; }
  if (hashPassword(password, user.salt) !== user.passHash) { recordFail(); return { status: 400, json: { error: "密码错误" } }; }
  loginFails.delete(acc); // 登录成功即清零
  const token = genToken();
  db.sessions[token] = { userId: user.id, expires: new Date(Date.now() + TOKEN_TTL).toISOString() };
  save();
  return { json: { token, user: publicUser(user) } };
};

api["POST /api/auth/logout"] = (req, body, user) => {
  const auth = req.headers["authorization"] || "";
  const token = auth.slice(7);
  delete db.sessions[token];
  save();
  return { json: { ok: true } };
};

api["GET /api/me"] = (req, body, user) => {
  if (!user) return { status: 401, json: { error: "未登录" } };
  return { json: { user: publicUser(user) } };
};

/* ---------- 学生端 ---------- */
api["GET /api/courses/mine"] = (req, body, user) => {
  if (!user || user.role !== "student") return { status: 403, json: { error: "需要学生身份" } };
  const list = db.enrollments.filter(e => e.studentId === user.id).map(e => {
    const c = getCourse(e.courseId);
    if (!c) return null;
    const teacher = db.users.find(u => u.id === c.teacherId);
    return {
      id: c.id, title: c.title, desc: c.desc, teacher: teacher ? teacher.name : "—",
      stageCount: c.stages.length, progress: studentProgress(c, user.id), joinedAt: e.joinedAt,
    };
  }).filter(Boolean);
  return { json: { courses: list } };
};

api["POST /api/courses/join"] = (req, body, user) => {
  if (!user || user.role !== "student") return { status: 403, json: { error: "需要学生身份" } };
  const code = String((body || {}).code || "").trim().toUpperCase();
  const course = db.courses.find(c => c.inviteCode === code);
  if (!course) return { status: 400, json: { error: "邀请码无效" } };
  if (isEnrolled(course.id, user.id)) return { status: 400, json: { error: "你已加入该课程" } };
  db.enrollments.push({ courseId: course.id, studentId: user.id, joinedAt: now() });
  save();
  return { json: { ok: true, courseId: course.id, title: course.title } };
};

api["GET /api/courses/:id/detail"] = (req, body, user) => {
  if (!user) return { status: 401, json: { error: "未登录" } };
  const course = getCourse(req.params.id);
  if (!course) return { status: 404, json: { error: "课程不存在" } };
  const isTeacher = course.teacherId === user.id;
  const isStudent = user.role === "student" && isEnrolled(course.id, user.id);
  if (!isTeacher && !isStudent) return { status: 403, json: { error: "未加入该课程" } };
  const teacher = db.users.find(u => u.id === course.teacherId);
  const resp = {
    id: course.id, title: course.title, desc: course.desc,
    teacher: teacher ? teacher.name : "—",
    role: isTeacher ? "teacher" : "student",
    inviteCode: isTeacher ? course.inviteCode : undefined,
    stages: course.stages.map(sanitizeStage),
  };
  if (isStudent) resp.progress = studentProgress(course, user.id);
  return { json: resp };
};

api["POST /api/courses/:id/stages/:sid/quiz"] = (req, body, user) => {
  if (!user || user.role !== "student") return { status: 403, json: { error: "需要学生身份" } };
  const course = getCourse(req.params.id);
  if (!course) return { status: 404, json: { error: "课程不存在" } };
  if (!isEnrolled(course.id, user.id)) return { status: 403, json: { error: "未加入该课程" } };
  const stage = course.stages.find(s => s.id === +req.params.sid);
  if (!stage) return { status: 404, json: { error: "阶段不存在" } };
  const answers = Array.isArray((body || {}).answers) ? body.answers.map(Number) : [];
  let correct = 0;
  // 判分在服务端完成；答案与解析仅在提交后随结果下发
  const detail = stage.quiz.map((q, i) => {
    const ok = answers[i] === q.answer;
    if (ok) correct++;
    return { correct: ok, answer: q.answer, explain: q.explain };
  });
  if (!db.quizLog) db.quizLog = {};
  const key = `quiz_${course.id}_${user.id}_${stage.id}`;
  db.quizLog[key] = { score: correct, total: stage.quiz.length, answers, at: now() };
  save();
  return { json: { score: correct, total: stage.quiz.length, detail } };
};

api["GET /api/courses/:id/mysubmissions"] = (req, body, user) => {
  if (!user || user.role !== "student") return { status: 403, json: { error: "需要学生身份" } };
  const course = getCourse(req.params.id);
  if (!course) return { status: 404, json: { error: "课程不存在" } };
  if (!isEnrolled(course.id, user.id)) return { status: 403, json: { error: "未加入该课程" } };
  const subs = db.submissions
    .filter(s => s.courseId === course.id && s.studentId === user.id)
    .map(s => ({ ...s, quiz: quizBest(course.id, user.id, s.stageId) }));
  const quizOnly = {};
  for (const st of course.stages) {
    const qz = quizBest(course.id, user.id, st.id);
    if (qz && !subs.find(s => s.stageId === st.id)) quizOnly[st.id] = qz;
  }
  return { json: { submissions: subs, quizOnly, progress: studentProgress(course, user.id) } };
};

api["POST /api/courses/:id/stages/:sid/submit"] = (req, body, user) => {
  if (!user || user.role !== "student") return { status: 403, json: { error: "需要学生身份" } };
  const course = getCourse(req.params.id);
  if (!course) return { status: 404, json: { error: "课程不存在" } };
  if (!isEnrolled(course.id, user.id)) return { status: 403, json: { error: "未加入该课程" } };
  const stage = course.stages.find(s => s.id === +req.params.sid);
  if (!stage) return { status: 404, json: { error: "阶段不存在" } };
  // 阶段软门控:必须前一阶段教师批为「通过」(approved)才能进入本阶段
  //   - 无提交: 未提交
  //   - submitted: 已提交待批改(尚不可进入)
  //   - revise: 教师退回未重交(尚不可进入)
  //   - approved: 通过 → 解锁本阶段
  if (stage.id > 1) {
    const prev = course.stages.find(s => s.id === stage.id - 1);
    const prevSub = findSubmission(course.id, user.id, prev.id);
    if (!prevSub) {
      return { status: 400, json: { error: `请先完成并提交阶段 ${prev.id}「${prev.name}」,再进入本阶段` } };
    }
    if (prevSub.status !== "approved") {
      const reason = prevSub.status === "revise"
        ? `阶段 ${prev.id}「${prev.name}」被教师批为「需修改」,请按评语修改并重新提交,通过批改后再进入本阶段`
        : `阶段 ${prev.id}「${prev.name}」已提交但尚未通过教师批改,通过批改后再进入本阶段`;
      return { status: 400, json: { error: reason } };
    }
  }
  const b = body || {};
  const taskText = String(b.taskText || "").trim();
  if (!taskText) return { status: 400, json: { error: "请填写实训任务内容再提交" } };
  // 阶段专属结构化交付物校验与规整（必填：deliverable 类型对应的数据缺失即拒绝）
  if (stage.deliverable === "matrix") {
    if (!b.matrix || !Array.isArray(b.matrix.opportunities) || b.matrix.opportunities.length < 3) {
      return { status: 400, json: { error: "机会评估矩阵必须填满 3 个候选机会（与任务 1/2 一致）" } };
    }
    b.matrix.opportunities = b.matrix.opportunities.slice(0, 10).map(o => ({
      name: String(o.name || "").trim().slice(0, 50),
      scores: o.scores || {},
    })).filter(o => o.name);
    if (b.matrix.opportunities.length < 3) return { status: 400, json: { error: "3 个候选机会的名称都必须填写" } };
    b.matrix.chosen = Math.max(0, Math.min(b.matrix.opportunities.length - 1, Number(b.matrix.chosen) || 0));
  }
  if (stage.deliverable === "assumptions") {
    if (!Array.isArray(b.assumptions) || !b.assumptions.length) {
      return { status: 400, json: { error: "请先在假设清单中至少填写一条假设" } };
    }
    b.assumptions = b.assumptions.map(a => ({
      hyp: String(a.hyp || "").trim().slice(0, 300),
      uncertainty: Math.max(1, Math.min(5, Math.round(+a.uncertainty) || 1)),
      severity: Math.max(1, Math.min(5, Math.round(+a.severity) || 1)),
      method: String(a.method || "客户访谈").trim().slice(0, 20),
      criteria: String(a.criteria || "").trim().slice(0, 200),
    })).filter(a => a.hyp);
    if (!b.assumptions.length) return { status: 400, json: { error: "假设描述不能为空" } };
  }
  let sub = findSubmission(course.id, user.id, stage.id);
  if (!sub) {
    sub = { id: nextId("submission"), courseId: course.id, studentId: user.id, stageId: stage.id };
    db.submissions.push(sub);
  } else if (sub.score != null || sub.status !== "submitted") {
    // 重交保护：保存上一次批改快照，教师端可见「已重新提交」标记
    sub.lastGrade = { score: sub.score, status: sub.status, feedback: sub.feedback, gradedAt: sub.gradedAt };
    sub.resubmitted = true;
  }
  sub.taskText = taskText;
  if (b.canvas !== undefined) sub.canvas = b.canvas;      // {bmc:{}, vpc:{}}
  if (b.finance !== undefined) sub.finance = b.finance;   // 参数对象
  if (b.plan !== undefined) sub.plan = b.plan;            // 计划书分节对象
  if (b.matrix !== undefined) sub.matrix = b.matrix;      // 阶段1 机会评估矩阵
  if (b.assumptions !== undefined) sub.assumptions = b.assumptions; // 阶段4 假设清单
  sub.quiz = quizBest(course.id, user.id, stage.id) || null;
  sub.status = "submitted"; sub.score = null; sub.feedback = "";
  sub.submittedAt = now(); sub.gradedAt = null; sub.gradedBy = null;
  save();
  return { json: { ok: true, submission: sub } };
};

/* ---------- 教师端 ---------- */
api["GET /api/teacher/courses"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const list = db.courses.filter(c => c.teacherId === user.id).map(c => {
    const students = db.enrollments.filter(e => e.courseId === c.id).length;
    const subs = db.submissions.filter(s => s.courseId === c.id);
    const pending = subs.filter(s => s.status === "submitted").length;
    return { id: c.id, title: c.title, desc: c.desc, inviteCode: c.inviteCode, students, submissions: subs.length, pending, createdAt: c.createdAt };
  });
  return { json: { courses: list } };
};

api["POST /api/teacher/courses"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const title = String((body || {}).title || "").trim();
  const desc = String((body || {}).desc || "").trim();
  if (!title || title.length > 50) return { status: 400, json: { error: "课程标题必填且不超过 50 字" } };
  const tpl = defaultCourse();
  const course = {
    id: nextId("course"), teacherId: user.id, title, desc: desc || "商业模式设计全流程实训",
    inviteCode: genCode(), createdAt: now(), stages: tpl.stages,
  };
  db.courses.push(course);
  save();
  return { json: { ok: true, course: { id: course.id, inviteCode: course.inviteCode } } };
};

api["PUT /api/teacher/courses/:id"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  const b = body || {};
  if (b.title !== undefined) {
    const t = String(b.title).trim();
    if (!t || t.length > 50) return { status: 400, json: { error: "课程标题必填且不超过 50 字" } };
    course.title = t;
  }
  if (b.desc !== undefined) course.desc = String(b.desc).trim();
  if (Array.isArray(b.stages)) {
    // 更新阶段：允许改 name / tasks / brief，保留其余结构
    for (const incoming of b.stages) {
      const st = course.stages.find(s => s.id === incoming.id);
      if (!st) continue;
      if (incoming.name !== undefined) st.name = String(incoming.name).trim().slice(0, 30);
      if (incoming.brief !== undefined) st.brief = String(incoming.brief).trim().slice(0, 60);
      if (incoming.tasks !== undefined) {
        const tasks = incoming.tasks.map(t => String(t || "").trim()).filter(Boolean).slice(0, 10);
        if (!tasks.length) return { status: 400, json: { error: `阶段 ${st.id} 至少保留一条实训任务` } };
        st.tasks = tasks;
      }
    }
  }
  save();
  return { json: { ok: true } };
};

api["DELETE /api/teacher/courses/:id"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  db.courses = db.courses.filter(c => c.id !== course.id);
  db.enrollments = db.enrollments.filter(e => e.courseId !== course.id);
  db.submissions = db.submissions.filter(s => s.courseId !== course.id);
  save();
  return { json: { ok: true } };
};

api["POST /api/teacher/courses/:id/regenerate-code"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  course.inviteCode = genCode();
  save();
  return { json: { ok: true, inviteCode: course.inviteCode } };
};

api["GET /api/teacher/courses/:id/students"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  const students = db.enrollments.filter(e => e.courseId === course.id).map(e => {
    const u = db.users.find(x => x.id === e.studentId);
    return u ? { id: u.id, name: u.name, account: u.account, joinedAt: e.joinedAt, progress: studentProgress(course, u.id) } : null;
  }).filter(Boolean);
  return { json: { students, stageCount: course.stages.length } };
};

api["DELETE /api/teacher/courses/:id/students/:sid"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  db.enrollments = db.enrollments.filter(e => !(e.courseId === course.id && e.studentId === req.params.sid));
  db.submissions = db.submissions.filter(s => !(s.courseId === course.id && s.studentId === req.params.sid));
  save();
  return { json: { ok: true } };
};

api["GET /api/teacher/courses/:id/submissions"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  const url = new URL(req.url, "http://x");
  const stageFilter = url.searchParams.get("stage");
  const statusFilter = url.searchParams.get("status");
  let subs = db.submissions.filter(s => s.courseId === course.id);
  if (stageFilter) subs = subs.filter(s => s.stageId === +stageFilter);
  if (statusFilter) subs = subs.filter(s => s.status === statusFilter);
  const list = subs.map(s => {
    const st = db.users.find(u => u.id === s.studentId);
    return { ...s, studentName: st ? st.name : "（已注销）", studentAccount: st ? st.account : "" };
  }).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return { json: { submissions: list, stages: course.stages.map(s => ({ id: s.id, name: s.name })) } };
};

api["GET /api/teacher/submissions/:sid"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const sub = db.submissions.find(s => s.id === req.params.sid);
  if (!sub) return { status: 404, json: { error: "提交记录不存在" } };
  const course = getCourse(sub.courseId);
  if (!course || course.teacherId !== user.id) return { status: 403, json: { error: "无权查看" } };
  const st = db.users.find(u => u.id === sub.studentId);
  const stage = course.stages.find(s => s.id === sub.stageId);
  return { json: { submission: sub, studentName: st ? st.name : "", stageName: stage ? stage.name : "", tasks: stage ? stage.tasks : [] } };
};

api["POST /api/teacher/submissions/:sid/grade"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const sub = db.submissions.find(s => s.id === req.params.sid);
  if (!sub) return { status: 404, json: { error: "提交记录不存在" } };
  const course = getCourse(sub.courseId);
  if (!course || course.teacherId !== user.id) return { status: 403, json: { error: "无权批改" } };
  const b = body || {};
  const score = Math.round(Number(b.score));
  if (!Number.isFinite(score) || score < 0 || score > 100) return { status: 400, json: { error: "分数需为 0–100 的整数" } };
  if (!["approved", "revise"].includes(b.status)) return { status: 400, json: { error: "状态必须是 approved 或 revise" } };
  sub.score = score;
  sub.status = b.status;
  sub.feedback = String(b.feedback || "").trim().slice(0, 2000);
  sub.gradedAt = now();
  sub.gradedBy = user.id;
  save();
  return { json: { ok: true, submission: sub } };
};

api["GET /api/teacher/courses/:id/dashboard"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  const students = db.enrollments.filter(e => e.courseId === course.id)
    .map(e => db.users.find(u => u.id === e.studentId)).filter(Boolean);
  const stageStats = course.stages.map(st => {
    const subs = db.submissions.filter(s => s.courseId === course.id && s.stageId === st.id);
    const graded = subs.filter(s => s.score != null);
    return {
      stageId: st.id, name: st.name,
      submitted: subs.length, graded: graded.length,
      submitRate: students.length ? Math.round(subs.length / students.length * 100) : 0,
      avgScore: graded.length ? Math.round(graded.reduce((n, s) => n + s.score, 0) / graded.length) : null,
    };
  });
  const allGraded = db.submissions.filter(s => s.courseId === course.id && s.score != null);
  const scoreDist = { "90+": 0, "80-89": 0, "70-79": 0, "60-69": 0, "<60": 0 };
  allGraded.forEach(s => {
    if (s.score >= 90) scoreDist["90+"]++;
    else if (s.score >= 80) scoreDist["80-89"]++;
    else if (s.score >= 70) scoreDist["70-79"]++;
    else if (s.score >= 60) scoreDist["60-69"]++;
    else scoreDist["<60"]++;
  });
  const quizAvgs = course.stages.map(st => {
    const scores = students.map(u => {
      const qz = quizBest(course.id, u.id, st.id);
      return qz ? qz.score / qz.total : null;
    }).filter(v => v !== null);
    return { stageId: st.id, name: st.name, avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) : null };
  });
  return { json: { students: students.length, stageStats, scoreDist, quizAvgs, pending: db.submissions.filter(s => s.courseId === course.id && s.status === "submitted").length } };
};

api["GET /api/teacher/courses/:id/grades.csv"] = (req, body, user) => {
  if (!user || user.role !== "teacher") return { status: 403, json: { error: "需要教师身份" } };
  const course = getCourse(req.params.id);
  if (!course || course.teacherId !== user.id) return { status: 404, json: { error: "课程不存在" } };
  const students = db.enrollments.filter(e => e.courseId === course.id)
    .map(e => db.users.find(u => u.id === e.studentId)).filter(Boolean);
  const esc = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const header = ["姓名", "账号", ...course.stages.map(s => s.name + "·成绩"), ...course.stages.map(s => s.name + "·状态"), "平均分", "自测正确率"];
  const rows = students.map(u => {
    const p = studentProgress(course, u.id);
    const scores = course.stages.map(st => { const s = findSubmission(course.id, u.id, st.id); return s ? (s.score == null ? "未批" : s.score) : "未交"; });
    const stats = course.stages.map(st => { const s = findSubmission(course.id, u.id, st.id); return s ? (s.status === "approved" ? "通过" : s.status === "revise" ? "需修改" : "待批") : "未交"; });
    return [u.name, u.account, ...scores, ...stats, p.avgScore == null ? "—" : p.avgScore, p.quizAccuracy == null ? "—" : p.quizAccuracy + "%"];
  });
  const csv = "\uFEFF" + [header, ...rows].map(r => r.map(esc).join(",")).join("\r\n");
  return { raw: { content: csv, type: "text/csv; charset=utf-8", filename: encodeURIComponent(course.title + "-成绩表.csv") } };
};

/* ================= 路由匹配 ================= */
const STATIC_ROUTES = [
  [/^\/api\/auth\/register$/, "POST /api/auth/register"],
  [/^\/api\/auth\/login$/, "POST /api/auth/login"],
  [/^\/api\/auth\/logout$/, "POST /api/auth/logout"],
  [/^\/api\/me$/, "GET /api/me"],
  [/^\/api\/courses\/mine$/, "GET /api/courses/mine"],
  [/^\/api\/courses\/join$/, "POST /api/courses/join"],
  [/^\/api\/courses\/([^/]+)\/detail$/, "GET /api/courses/:id/detail"],
  [/^\/api\/courses\/([^/]+)\/stages\/([^/]+)\/quiz$/, "POST /api/courses/:id/stages/:sid/quiz"],
  [/^\/api\/courses\/([^/]+)\/mysubmissions$/, "GET /api/courses/:id/mysubmissions"],
  [/^\/api\/courses\/([^/]+)\/stages\/([^/]+)\/submit$/, "POST /api/courses/:id/stages/:sid/submit"],
  [/^\/api\/teacher\/courses$/, "GET /api/teacher/courses"],
  [/^\/api\/teacher\/courses$/, "POST /api/teacher/courses"],
  [/^\/api\/teacher\/courses\/([^/]+)$/, "PUT /api/teacher/courses/:id"],
  [/^\/api\/teacher\/courses\/([^/]+)$/, "DELETE /api/teacher/courses/:id"],
  [/^\/api\/teacher\/courses\/([^/]+)\/regenerate-code$/, "POST /api/teacher/courses/:id/regenerate-code"],
  [/^\/api\/teacher\/courses\/([^/]+)\/students$/, "GET /api/teacher/courses/:id/students"],
  [/^\/api\/teacher\/courses\/([^/]+)\/students\/([^/]+)$/, "DELETE /api/teacher/courses/:id/students/:sid"],
  [/^\/api\/teacher\/courses\/([^/]+)\/submissions$/, "GET /api/teacher/courses/:id/submissions"],
  [/^\/api\/teacher\/submissions\/([^/]+)$/, "GET /api/teacher/submissions/:sid"],
  [/^\/api\/teacher\/submissions\/([^/]+)\/grade$/, "POST /api/teacher/submissions/:sid/grade"],
  [/^\/api\/teacher\/courses\/([^/]+)\/dashboard$/, "GET /api/teacher/courses/:id/dashboard"],
  [/^\/api\/teacher\/courses\/([^/]+)\/grades\.csv$/, "GET /api/teacher/courses/:id/grades.csv"],
];

/* ================= 静态文件 ================= */
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
};

function serveStatic(req, res, pathname) {
  let file = pathname === "/" ? "/index.html" : pathname;
  file = file.replace(/\\/g, "/");
  if (file.includes("..")) { res.writeHead(400); res.end("Bad request"); return; }
  const full = path.join(PUBLIC_DIR, file);
  fs.readFile(full, (err, buf) => {
    if (err) {
      // SPA 回退：非文件路径返回 index.html（app.html 由前端直接访问）
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, b2) => {
        if (e2) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(b2);
      });
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}

/* ================= 整合站点静态路由（大众创业学门户 + 方法论卡） ================= */
// 部署结构：门户站副本在 site/，方法论卡副本在 cards/（由 tools/sync-deploy.py 同步生成）
// 门户文件未部署时自动回退到 BizLab 原有行为（serveStatic），保证升级顺序安全
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, "site");
const CARDS_DIR = process.env.CARDS_DIR || path.join(__dirname, "cards");
const CONCEPT_DIR = process.env.CONCEPT_DIR || path.join(__dirname, "concept-cards");
const CASE_DIR = process.env.CASE_DIR || path.join(__dirname, "case-cards");
const READING_DIR = process.env.READING_DIR || path.join(__dirname, "reading");

function serveFileFrom(res, full, onMiss) {
  fs.readFile(full, (err, buf) => {
    if (err) {
      if (onMiss) return onMiss();
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}

function dispatchStatic(req, res, pathname) {
  // 门户站页面：/ 与五个站点页；注意 /index.html 留给 BizLab 登录页使用
  // /read.html 必须显式接管，否则会落到 SPA 回退返回 BizLab 登录页
  if (pathname === "/" || pathname === "/cards.html" || pathname === "/chapter.html"
      || pathname === "/concept-cards.html" || pathname === "/case-cards.html"
      || pathname === "/read.html") {
    const rel = pathname === "/" ? "index.html" : pathname.slice(1);
    return serveFileFrom(res, path.join(SITE_DIR, rel), () => serveStatic(req, res, pathname));
  }
  // 门户站静态资源：/assets/*
  if (pathname.startsWith("/assets/")) {
    if (pathname.includes("..")) { res.writeHead(400); res.end("Bad request"); return; }
    return serveFileFrom(res, path.join(SITE_DIR, pathname));
  }
  // 四套内容目录：/cards/*（方法论）/concept-cards/*（知识链接）/case-cards/*（案例）/reading/*（读）
  for (const [prefix, dir] of [["/cards/", CARDS_DIR], ["/concept-cards/", CONCEPT_DIR], ["/case-cards/", CASE_DIR], ["/reading/", READING_DIR]]) {
    if (pathname.startsWith(prefix)) {
      const rel = pathname.slice(prefix.length);
      if (!rel || rel.includes("..")) { res.writeHead(400); res.end("Bad request"); return; }
      return serveFileFrom(res, path.join(dir, rel));
    }
  }
  // 其余：BizLab v2 前端（public/，含 SPA 回退）
  serveStatic(req, res, pathname);
}

/* ================= 服务器 ================= */
function readBody(req) {
  return new Promise(resolve => {
    let data = "";
    req.on("data", ch => { data += ch; if (data.length > 2e6) req.destroy(); });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname.startsWith("/api/")) {
      const method = req.method === "OPTIONS" ? "GET" : req.method;
      for (const [re, key] of STATIC_ROUTES) {
        const m = pathname.match(re);
        if (m && key.startsWith(method + " ")) {
          const user = getUser(req);
          if (!user && !key.includes("/auth/") && key !== "GET /api/me") {
            res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "未登录" }));
            return;
          }
          // 从路由 key（如 "GET /api/courses/:id/detail"）提取参数名，构建 params 对象
          const paramNames = (key.split(" ")[1].match(/:([a-zA-Z]+)/g) || []).map(p => p.slice(1));
          req.params = {};
          paramNames.forEach((n, i) => { req.params[n] = m[i + 1]; });
          const body = ["POST", "PUT", "DELETE"].includes(req.method) ? await readBody(req) : {};
          const result = api[key](req, body, user) || { status: 404, json: { error: "未知接口" } };
          if (result.raw) {
            res.writeHead(200, {
              "Content-Type": result.raw.type,
              "Content-Disposition": `attachment; filename*=UTF-8''${result.raw.filename}`,
            });
            res.end(result.raw.content);
          } else {
            res.writeHead(result.status || 200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(result.json));
          }
          return;
        }
      }
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "接口不存在" }));
      return;
    }
    dispatchStatic(req, res, pathname);
  } catch (e) {
    console.error("Server error:", e);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "服务器内部错误" }));
  }
});

cleanSessionStore();
// 迁移:为旧模板课程补上阶段 1（机会评估矩阵）与阶段 4（假设清单）的结构化交付物
(function migrateDeliverables() {
  let changed = false;
  const tpl = defaultCourse();
  const tplStage1 = tpl.stages.find(s => s.id === 1);
  for (const c of db.courses) {
    for (const st of c.stages) {
      if (st.id === 1 && (!st.deliverable || st.deliverable === "none")) { st.deliverable = "matrix"; changed = true; }
      if (st.id === 4 && (!st.deliverable || st.deliverable === "none")) { st.deliverable = "assumptions"; changed = true; }
      // 把旧的「对候选机会按 5 个维度」文字更新为「对 3 个候选机会」(与任务 1/2「3 个」统一)
      if (st.id === 1 && typeof st.tools === "string" && st.tools.includes("对候选机会按 5 个维度")) {
        st.tools = st.tools.replace("对候选机会按 5 个维度", "对 3 个候选机会按 5 个维度");
        changed = true;
      }
      // 阶段 1 教学内容升级（PEST→PESTEL + 机会假设命题句式，源自方法论卡 5-03 / 5-08）：
      // 旧课程是创建时快照，检测旧版 PEST 文案后，用新模板同步 knowledge/tools/tasks/quiz/brief，
      // 仅同步教学内容字段，学员提交与成绩数据不受影响。
      if (st.id === 1 && Array.isArray(st.knowledge) && st.knowledge.some(k => typeof k === "string" && k.includes("PEST 趋势扫描：从 Political"))) {
        st.brief = tplStage1.brief;
        st.knowledge = tplStage1.knowledge;
        st.tools = tplStage1.tools;
        st.tasks = tplStage1.tasks;
        st.quiz = tplStage1.quiz;
        changed = true;
        console.log(`[迁移] 课程 ${c.id} 阶段 1 教学内容已升级为 PESTEL + 机会假设命题句式版本`);
      }
    }
  }
  if (changed) save();
})();
server.listen(PORT, () => {
  console.log(`mAtlas BizLab 2.0 实训系统已启动`);
  console.log(`访问地址: http://localhost:${PORT}`);
  console.log(`数据文件: ${require("./db").DB_FILE}`);
  console.log(`教师注册码: ${db.settings.teacherCode}（教师注册时填写；可用环境变量 TEACHER_CODE 自定义）`);
});
