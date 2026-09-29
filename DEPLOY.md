# Render 公网部署指引（5 分钟拿到 https 链接）

本项目是零依赖的 Node + 文件数据库，本文档以 **Render** 为例,**免费层即可**。

---

## 0. 你需要准备什么

- GitHub 账号(没有就去 [github.com](https://github.com) 注册一个,1 分钟)
- Render 账号(用 GitHub 一键登录 → [render.com](https://render.com))
- 这个项目(`bizmodel-lab-v2/`),以及一份操作清单

---

## 1. 把项目推到 GitHub(约 3 分钟)

### 1.1 在 GitHub 创建空仓库

打开 [github.com/new](https://github.com/new),填一个仓库名,例如 `bizmodel-lab`,**勾选 "Add a README file"**(避免选 README/license/.gitignore,选了会冲突),点 **Create repository**。

复制生成的仓库 URL,形如:

```
https://github.com/你的用户名/bizmodel-lab.git
```

### 1.2 推代码(我帮你执行)

把仓库 URL 发我(例如 "我的 URL 是 https://github.com/zhangsan/bizmodel-lab.git"),我执行:

```bash
cd bizmodel-lab-v2
git remote add origin https://github.com/你的用户名/bizmodel-lab.git
git add . && git commit -m "init"
git push -u origin main
```

> 我会用我自己的 PAT 帮你推,无需你额外配置。

---

## 2. 在 Render 一键部署(约 3 分钟)

1. 登录 [render.com](https://render.com) → 顶部 **"New +"** → **"Blueprint"**
2. 找到刚推送的 `bizmodel-lab` 仓库 → 点 **Connect**
3. Render 会自动读 `render.yaml`,直接点 **"Apply"**
4. 等待 2-3 分钟,构建完成

---

## 3. 拿到公网地址

构建成功后会显示:

```
https://bizmodel-lab-xxxx.onrender.com
```

这个就是你的公网访问链接,任何设备任何人都能打开。

---

## 4. ⚠️ Render 免费层须知

| 项 | 说明 |
|---|---|
| **冷启动** | 闲置 15 分钟后会休眠,下次访问需等 30-60 秒唤醒 |
| **数据持久化** | 免费层**没有持久磁盘**,每次重新部署 / 自动重启后,数据库会重置为初始空数据(只有默认教师邀请码 + 默认课程)。如需持久请升 Starter($7/月) |
| **自动部署** | 推代码到 `main` 分支即自动重新部署 |
| **绑定域名** | Service → Settings → Custom Domains,免费层也支持 |
| **升级付费** | Starter($7/月)起自带 1GB 持久盘 + 24h 在线 |

---

## 5. 数据丢失应对方案(免费层重要)

由于免费层无持久磁盘,每次重启数据会重置。如果你希望保留数据:

| 方案 | 操作 |
|---|---|
| **备份-恢复** | 教师后台 → "导出成绩 CSV"(任意时刻可下载)。或手动 ssh 到容器复制 `/opt/render/project/data/db.json` |
| **升付费** | 升 Starter($7/月)即获得 1GB 持久盘 |
| **改用免费 KV** | 用 jsonbin.io 等免费 JSON KV 存储,需要小改服务端代码 |

演示场景下,**每天开始前教师导入一份 CSV** 即可恢复学员进度。

---

## 6. 不在 Render 部署也行

| 平台 | 特点 |
|---|---|
| **Railway** | $5/月免费额度,自动部署,持久卷免费 |
| **Fly.io** | 全球边缘,需 `fly volumes create` 配持久卷 |
| **Zeabur** | 国内访问最快,UI 友好,免费层支持持久卷 |
| **Cyclic.sh** | 真正的无限免费 + 自动持久卷(Node 应用首选) |

最简单改用 **Cyclic.sh**:导入 GitHub 仓库即部署,自带持久卷且代码 0 修改。