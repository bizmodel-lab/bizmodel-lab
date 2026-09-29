// 通过 GitHub REST API 推送整个工作区(绕过被墙的 github.com git 通道)
// 用法: node api-push.js <token> <owner> <repo>
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.argv[2];
const OWNER = process.argv[3];
const REPO = process.argv[4];
const ROOT = __dirname; // bizmodel-lab-v2
const BRANCH = "main";

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.github.com",
      path: p,
      method,
      headers: {
        "User-Agent": "bizlab-deploy",
        "Authorization": "token " + TOKEN,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
      timeout: 30000,
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ code: res.statusCode, json: d ? JSON.parse(d) : null }); }
        catch (e) { resolve({ code: res.statusCode, json: null, raw: d }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (data) req.write(data);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 收集所有文件(排除 .git, data, node_modules, 日志)
function walk(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if ([".git", "data", "node_modules", ".env"].includes(name)) continue;
    if (/\.log$/.test(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? base + "/" + name : name;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

(async () => {
  // 1. 获取远端 main 当前 commit
  let ref;
  for (let i = 0; i < 5; i++) {
    const r = await api("GET", `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    if (r.code === 200) { ref = r.json; break; }
    console.log(`获取 ref 失败(${r.code}),重试 ${i + 1}/5...`);
    await sleep(3000);
  }
  if (!ref) { console.error("无法获取远端 main 分支"); process.exit(1); }
  const parentSha = ref.object.sha;
  console.log("远端 main 当前 commit:", parentSha.slice(0, 8));

  // 2. 获取父 commit 的 tree(保留远端已有的 README)
  const parentCommit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
  const baseTree = parentCommit.json.tree.sha;
  console.log("基础 tree:", baseTree.slice(0, 8));

  // 3. 逐个文件创建 blob(base64,支持中文/任意二进制)
  const files = walk(ROOT);
  console.log(`待上传 ${files.length} 个文件...`);
  const entries = [];
  for (const f of files) {
    const content = fs.readFileSync(f.full).toString("base64");
    let blob;
    for (let i = 0; i < 5; i++) {
      blob = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: "base64" });
      if (blob.code === 201) break;
      console.log(`  blob 失败(${f.rel} ${blob.code}),重试 ${i + 1}/5...`);
      await sleep(3000);
    }
    if (blob.code !== 201) { console.error("blob 上传失败:", f.rel, blob.raw || ""); process.exit(1); }
    entries.push({ path: f.rel, mode: "100644", type: "blob", sha: blob.json.sha });
    console.log(`  ✓ ${f.rel}`);
  }

  // 4. 创建 tree(基于远端 tree,覆盖同名文件,保留 README)
  const tree = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTree, tree: entries });
  if (tree.code !== 201) { console.error("tree 创建失败:", tree.raw); process.exit(1); }
  console.log("tree 创建成功:", tree.json.sha.slice(0, 8));

  // 5. 创建 commit
  const commit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: "deploy: full source + tencent lighthouse one-click install",
    tree: tree.json.sha,
    parents: [parentSha],
  });
  if (commit.code !== 201) { console.error("commit 创建失败:", commit.raw); process.exit(1); }
  console.log("commit 创建成功:", commit.json.sha.slice(0, 8));

  // 6. 更新 main 指针
  const upd = await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.json.sha, force: true });
  if (upd.code !== 200) { console.error("ref 更新失败:", upd.raw); process.exit(1); }
  console.log("\n✅ 推送完成: https://github.com/" + OWNER + "/" + REPO + " (分支 " + BRANCH + ")");
})().catch(e => { console.error("异常:", e.message); process.exit(1); });
