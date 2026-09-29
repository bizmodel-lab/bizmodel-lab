# 腾讯云 Lighthouse 一键部署指南

**约 15 分钟拿到公网 IP**,适合愿意付少量费用追求稳定 + 国内访问快的场景。

---

## 为什么选腾讯云 Lighthouse

| 对比项 | Render 免费 | 腾讯云 Lighthouse |
|---|---|---|
| 月费 | 0 | **约 50-60 元**(活动期最低 25 元/月起) |
| 数据持久化 | ❌ 重启即丢 | ✅ 独立磁盘 |
| 国内访问 | 慢(美国节点) | **快(国内 BGP)** |
| 24h 在线 | ❌ 15 分钟休眠 | ✅ |
| 流量 | 受限 | 1Mbps / 5Mbps 不限流量 |
| 配置难度 | 低 | 中 |

---

## 0. 准备工作

- 腾讯云账号(微信扫码即注册 → [cloud.tencent.com](https://cloud.tencent.com))
- GitHub 账号(用来托管代码)
- 一个小时左右时间

---

## 1. 购买 Lighthouse(约 3 分钟)

1. 打开 [腾讯云轻量应用服务器购买页](https://cloud.tencent.com/product/lighthouse)
2. 选择配置(**推荐起步档**):
   - **镜像**:Ubuntu 22.04 LTS
   - **实例规格**:2 核 2G(约 50 元/月,活动期更低)
   - **带宽**:1Mbps(足够 50-100 人并发)
   - **系统盘**:50GB SSD(默认即可)
   - **地域**:**广州 / 上海 / 北京**(离你最近的城市)
   - **时长**:月付(随时可退订)
3. 设置 **root 密码**(记下来!)
4. 点击 **立即购买** → 支付

---

## 2. 在 GitHub 创建空仓库(约 2 分钟)

打开 [github.com/new](https://github.com/new):

- **Repository name**:`bizmodel-lab`(任意名字)
- **勾选 Add a README file**(避免冲突)
- **不要**选 Add .gitignore / license
- 点 **Create repository**
- 复制仓库 URL,**发给我(AI 助手)**,形如:
  ```
  https://github.com/你的用户名/bizmodel-lab.git
  ```

> 我会用我的 PAT 帮你把代码推上去,这一步你**不需要做任何额外操作**。

---

## 3. 我帮你推代码(约 1 分钟,全自动)

收到你发的 URL 后,我会执行:

```bash
git remote add origin <你的 URL>
git add . && git commit -m "init"
git push -u origin main
```

推完后告诉你「已推送」。

---

## 4. 在 Lighthouse 一键部署(约 5 分钟,核心步骤)

### 4.1 控制台登录服务器(免 SSH 客户端)

回到 [腾讯云轻量控制台](https://console.cloud.tencent.com/lighthouse) → 找到你的实例 → 点击右上角 **「登录」** 按钮 → 选择 **「一键登录(免密)」** → 弹出黑色终端窗口。

> ✅ 不需要装 SSH 客户端,不需要密钥对,浏览器里直接敲命令。

### 4.2 防火墙放行端口(必须)

部署脚本会自动放行,但**腾讯云防火墙默认拦截所有入站**,需要先在控制台手动放行:

1. 实例详情 → **「防火墙」** 标签 → **「添加规则」**
2. 协议:TCP,端口:`8700`,策略:允许,备注:`bizlab-web`
3. 点确定

### 4.3 执行一键部署脚本

在弹出的服务器终端里,**粘贴并回车** 这一行:

```bash
git clone https://github.com/bizmodel-lab/bizmodel-lab.git /tmp/bizlab-install && bash /tmp/bizlab-install/scripts/install-on-tencent.sh https://github.com/bizmodel-lab/bizmodel-lab.git 8700
```

> ⚠️ 不要用 `raw.githubusercontent.com` 的下载方式——该域名在国内服务器上通常无法访问。上面的方式是先 `git clone` 整个仓库(约 200KB,秒下),再执行仓库内的脚本,国内服务器可用。

**等待 2-3 分钟**,脚本会自动:

- [x] 安装 Node.js 20
- [x] 克隆代码到 `/opt/bizlab`
- [x] 安装 pm2 + 启动服务
- [x] 配置开机自启
- [x] 放行防火墙
- [x] 健康检查

完成后会输出:

```
🎉 部署完成
公网访问地址: http://<你的公网 IP>:8700
教师注册码: BVS2AE
```

### 4.4 公网访问

把输出的 IP 复制到浏览器,例如:

```
http://123.123.123.123:8700
```

**任何人、任何设备**都能打开。

---

## 5. 日常运维

SSH 进服务器后:

```bash
# 查看服务状态
pm2 status

# 实时看日志
pm2 logs bizlab

# 重启服务(改完代码后)
pm2 restart bizlab

# 停止服务
pm2 stop bizlab

# 查看数据文件
ls -lh /opt/bizlab/data/
```

**改代码后的部署**:本机改完 → 推送 GitHub → 服务器执行 `pm2 restart bizlab` 即可。或在服务器上 `cd /opt/bizlab && git pull && pm2 restart bizlab`。

---

## 6. 进阶(可选)

| 需求 | 方案 |
|---|---|
| **绑定域名**(需要备案,7-20 天) | 域名备案 → Lighthouse 控制台「域名」 → nginx 反代 |
| **HTTPS**(免费) | 备案后用 Let's Encrypt(`certbot --nginx`)配 nginx 反代 |
| **数据自动备份** | 加 cron 每天把 `/opt/bizlab/data/db.json` 同步到 COS |
| **监控告警** | Lighthouse 控制台自带基础监控 |

---

## 7. 费用参考

| 配置 | 月费(原价) | 活动价 |
|---|---|---|
| 2核2G / 1Mbps / 50GB SSD | 96 元 | **40-60 元/月**(新人券) |
| 2核4G / 5Mbps / 60GB SSD | 144 元 | 80-100 元/月 |
| 4核4G / 5Mbps / 80GB SSD | 240 元 | 120-150 元/月 |

50 人级别的实训课程用第一档就够了。**不想用了随时在控制台退订**。

---

## 8. 常见问题

**Q: 访问 IP 被墙?**
国内一般不会,但**境外访问**慢。建议申请已备案的域名 + CDN 加速。

**Q: 浏览器显示「不安全」?**
因为是 http + IP,没备案证书。演示用没问题,正式上线建议申请域名 + 备案 + 配 HTTPS。

**Q: 数据会不会丢?**
不会。Lighthouse 系统盘独立,服务器重启/重装**不会**影响数据盘(只要不点「重置磁盘」)。

**Q: 怎么升级配置?**
控制台 → 实例 → 升降配 → 选新规格 → 支付差额(系统会重启约 1 分钟,数据不丢)。