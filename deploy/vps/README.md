# VPS 部署：http://你的IP:8080/GHydxfn/

用 Caddy 容器托管 `public/`，不改动现有 Hexo 配置，GitHub Pages 照常工作。

## 一次性服务器初始化

```bash
# 本机（Git Bash）上传部署文件
scp -r deploy/vps/* root@你的服务器IP:/opt/blog/

# 登录服务器执行
ssh root@你的服务器IP "bash /opt/blog/install-server.sh"
```

脚本会完成：装 Docker/git/rsync/cron → 首次拉取 `gh-pages` → 启动 Caddy 容器 →
配置每分钟自动同步 → 放行 ufw 端口（如启用）。

**云厂商安全组必须手动放行 TCP 8080**，否则外部仍访问不到。

访问验证：

```bash
curl -I http://你的服务器IP:8080/GHydxfn/
# 期望 HTTP/2 200 或 HTTP/1.1 200
```

## 日常发布（二选一）

| 方式 | 操作 | 生效时间 |
|:---|:---|:---|
| 自动 | 照常双击 `发布.bat` | 1~2 分钟内服务器自动拉取 |
| 立即 | 双击 `立即同步到VPS.bat` | 几秒（本地打包直传，不经过 GitHub） |

大陆 VPS 拉 GitHub 经常超时：此时自动同步会失败，用「立即同步」最稳。
先用：

```bash
cp deploy/vps/config.example.sh deploy/vps/config.sh
# 编辑 config.sh 填 VPS_HOST 等
```

`config.sh` 已被 `.gitignore` 忽略，不会上传仓库。

## 目录与端口

```
/opt/blog/
├── Caddyfile
├── docker-compose.yml
├── public/        # Caddy 实际托管的目录
└── public-src/    # gh-pages 的本地克隆，供 cron 拉取
```

改端口：同时改 `docker-compose.yml` 的 `8080:80` 和 `config.sh` 的 `HTTP_PORT`，
`docker compose up -d` 重建容器。

## 安全边界

- 只暴露静态目录 `public/`，不运行 Node，不暴露 `hexo-admin`。
- `source/_drafts/` 不会被生成，草稿不会公开。
- 无 HTTPS（IP:端口）。要 HTTPS 需要域名，把 `Caddyfile` 的 `:80` 改成
  `blog.example.com { ... }` 并加 `ports: ["8080:443"]`，Caddy 会自动签证书。

## 故障排查

| 现象 | 处理 |
|:---|:---|
| `502` / 连接被拒 | `cd /opt/blog && docker compose ps`，看容器是否 Up |
| 页面 404 全站 | 确认访问路径带 `/GHydxfn/`，`public/index.html` 是否存在 |
| 样式丢失 | 检查 `_config.yml` 的 `root: /GHydxfn/` 未被改动 |
| 自动同步不生效 | `tail -50 /var/log/syslog \| grep blog-sync`，或手动执行 cron 里的命令 |
| 大陆 VPS git 拉取失败 | 忽略，改用 `立即同步到VPS.bat` |
