/**
 * mAtlas BizLab 2.0 — JSON 文件数据库
 * 零依赖：数据持久化到磁盘，写操作同步落盘
 * 数据目录可通过环境变量 DATA_DIR 覆盖，默认为 <项目根>/data
 *   - 本地开发：使用 ./data
 *   - Render / PaaS 部署：将 DATA_DIR 指向挂载的持久卷路径（如 /data），防止重启丢数据
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = (process.env.DATA_DIR && process.env.DATA_DIR.trim())
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY = {
  users: [],            // {id, role, account, name, passHash, salt, createdAt}
  sessions: {},         // token -> {userId, expires}
  courses: [],          // {id, teacherId, title, desc, inviteCode, createdAt, stages:[]}
  enrollments: [],      // {courseId, studentId, joinedAt}
  submissions: [],      // {id, courseId, studentId, stageId, taskText, canvas, finance, plan, quiz:{score,total,answers}, status, score, feedback, submittedAt, gradedAt, gradedBy}
  quizLog: {},          // quiz_<courseId>_<studentId>_<stageId> -> {score,total,answers,at}
  counters: { user: 0, course: 0, submission: 0 },
};

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(EMPTY)), db);
  } catch (e) {
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

let db = load();

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

function nextId(kind) {
  db.counters[kind] = (db.counters[kind] || 0) + 1;
  return kind.charAt(0) + db.counters[kind];
}

module.exports = { db, save, nextId, DB_FILE };
