#!/usr/bin/env bash
# ============================================================
# 创见 BizLab · 腾讯云 Lighthouse 一键部署脚本
# 适用系统：Ubuntu 22.04 LTS / Debian 11+（腾讯云 Lighthouse 默认）
# 用法：bash install-on-tencent.sh <git-repo-url> [port]
# 示例：bash install-on-tencent.sh https://github.com/zhangsan/bizmodel-lab.git 8700
# ============================================================
set -e

REPO_URL="${1:-}"
PORT="${2:-8700}"
TEACHER_CODE="${TEACHER_CODE:-BVS2AE}"   # 可用环境变量覆盖教师注册码

if [ -z "$REPO_URL" ]; then
  echo "❌ 错误：请提供 Git 仓库 URL"
  echo "用法: bash install-on-tencent.sh <git-repo-url> [port]"
  echo "示例: bash install-on-tencent.sh https://github.com/zhangsan/bizmodel-lab.git 8700"
  exit 1
fi

APP_DIR="/opt/bizlab"
SERVICE_NAME="bizlab"
APP_PORT="$PORT"

echo "============================================================"
echo " 创见 BizLab · 腾讯云 Lighthouse 一键部署"
echo " 仓库: $REPO_URL"
echo " 端口: $APP_PORT"
echo "============================================================"

# ---------- 1. 系统检测 ----------
echo ""
echo "[1/8] 检测系统..."
. /etc/os-release
if [ "$ID" != "ubuntu" ] && [ "$ID" != "debian" ]; then
  echo "⚠️  此脚本针对 Ubuntu / Debian,你的系统是 $ID,继续尝试..."
fi
echo "✅ 系统: $PRETTY_NAME"

# ---------- 2. 基础工具 ----------
echo ""
echo "[2/8] 安装基础工具..."
apt-get update -y > /dev/null
apt-get install -y curl wget git ufw ca-certificates gnupg > /dev/null
echo "✅ git / curl / ufw 已安装"

# ---------- 3. Node.js 20 ----------
echo ""
echo "[3/8] 安装 Node.js 20..."
if ! command -v node > /dev/null 2>&1 || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
  apt-get install -y nodejs > /dev/null
fi
echo "✅ Node.js $(node -v) / npm $(npm -v)"

# ---------- 4. 拉取代码 ----------
echo ""
echo "[4/8] 克隆代码仓库..."
clone_repo() {
  # 已有代码且非 git 仓库(手动上传场景) → 直接使用
  if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/server.js" ] && [ ! -d "$APP_DIR/.git" ]; then
    echo "检测到手动上传的代码目录,跳过克隆"
    return 0
  fi
  local attempt=1
  while [ $attempt -le 5 ]; do
    if [ -d "$APP_DIR/.git" ]; then
      cd "$APP_DIR" && git pull origin main && return 0
    else
      rm -rf "$APP_DIR"
      if git clone "$REPO_URL" "$APP_DIR"; then return 0; fi
    fi
    echo "⚠️  克隆失败(第 ${attempt} 次),5 秒后重试..."
    sleep 5
    attempt=$((attempt+1))
  done
  return 1
}
if ! clone_repo; then
  echo "❌ 连续 5 次克隆失败。可能是服务器访问 GitHub 不稳定。"
  echo "   解决办法 1:重新执行本脚本再试一次"
  echo "   解决办法 2:手动下载 zip 上传:在本地电脑打包项目为 bizmodel-lab.zip,"
  echo "             通过浏览器上传到服务器(控制台「文件上传」),解压到 /opt/bizlab 后执行:"
  echo "             cd /opt/bizlab && bash scripts/install-on-tencent.sh skip-clone 8700"
  exit 1
fi
cd "$APP_DIR"
echo "✅ 代码路径: $APP_DIR"

# ---------- 5. 安装项目依赖（本项目零运行时依赖,跳过 npm install） ----------
echo ""
echo "[5/8] 检查 package.json..."
if [ -f package.json ] && grep -q '"dependencies"' package.json; then
  HAS_DEPS=$(node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).length)" 2>/dev/null || echo 0)
  if [ "$HAS_DEPS" != "0" ]; then
    echo "安装依赖..."
    npm install --omit=dev --no-audit --no-fund
  else
    echo "✅ 零依赖项目,跳过 npm install"
  fi
fi

# ---------- 6. 配置环境 ----------
echo ""
echo "[6/8] 配置环境..."
mkdir -p "$APP_DIR/data"
# server.js 只认进程环境变量(不读 .env),启动时通过 env 前缀注入(见第 7 步)
echo "✅ 数据目录: $APP_DIR/data (PORT=$APP_PORT)"

# ---------- 7. 安装 pm2 并启动 ----------
echo ""
echo "[7/8] 安装 pm2 并启动服务..."
if ! command -v pm2 > /dev/null 2>&1; then
  npm install -g pm2 > /dev/null
fi

# 停止可能残留的进程
pm2 delete "$SERVICE_NAME" > /dev/null 2>&1 || true

# 启动(环境变量通过 env 前缀注入进程)
cd "$APP_DIR"
PORT="$APP_PORT" DATA_DIR="$APP_DIR/data" NODE_ENV=production TEACHER_CODE="${TEACHER_CODE:-}" \
  pm2 start server.js --name "$SERVICE_NAME" --time
pm2 save

# 配置开机自启
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | tail -1)
if echo "$PM2_STARTUP" | grep -q "sudo"; then
  eval "$PM2_STARTUP" > /dev/null 2>&1 || true
fi

echo "✅ pm2 已启动,开机自启已配置"

# ---------- 8. 防火墙 + 健康检查 ----------
echo ""
echo "[8/8] 配置防火墙 + 健康检查..."
ufw allow "$APP_PORT/tcp" > /dev/null 2>&1 || true
ufw allow OpenSSH > /dev/null 2>&1 || true
# ufw 在容器内可能没意义,但不报错
echo "y" | ufw enable > /dev/null 2>&1 || true

# 等服务起来
sleep 3

# 探测服务
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT/" || echo "000")
if [ "$HEALTH" = "200" ]; then
  echo "✅ 健康检查通过 (HTTP 200)"
else
  echo "⚠️  健康检查未通过 (HTTP $HEALTH),查看日志: pm2 logs $SERVICE_NAME"
fi

# ---------- 输出 ----------
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 ip.sb 2>/dev/null || echo "<未获取>")

echo ""
echo "============================================================"
echo " 🎉 部署完成"
echo "============================================================"
echo ""
echo " 公网访问地址: http://$PUBLIC_IP:$APP_PORT"
echo " 本机访问地址: http://127.0.0.1:$APP_PORT"
echo ""
echo " 数据持久化目录: $APP_DIR/data (已绑定到腾讯云磁盘,重启不丢)"
echo ""
echo " 常用命令:"
echo "   pm2 status              # 查看服务状态"
echo "   pm2 logs $SERVICE_NAME  # 实时日志"
echo "   pm2 restart $SERVICE_NAME  # 重启"
echo "   pm2 stop $SERVICE_NAME  # 停止"
echo ""
echo " 教师注册码: $TEACHER_CODE"
echo "============================================================"