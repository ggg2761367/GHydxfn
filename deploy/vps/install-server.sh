#!/usr/bin/env bash
# 在 VPS 上执行一次：安装依赖、启动 Caddy、配置每分钟自动同步
#
# 步骤：
#   scp -r deploy/vps/* root@服务器IP:/opt/blog/
#   ssh root@服务器IP "bash /opt/blog/install-server.sh"
set -euo pipefail

BLOG_REPO="${BLOG_REPO:-https://github.com/ggg2761367/GHydxfn.git}"
BRANCH="${BRANCH:-gh-pages}"
BASE="${BASE:-/opt/blog}"
HTTP_PORT="${HTTP_PORT:-8080}"

log() { printf '\033[36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '\033[31m[错误]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 执行：sudo bash $0"
[ -f "$BASE/docker-compose.yml" ] || die "缺少 $BASE/docker-compose.yml，请先把 deploy/vps/ 目录内容上传到 $BASE"

if ! command -v docker >/dev/null 2>&1; then
	log "安装 Docker..."
	curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "缺少 Docker Compose v2（docker-compose-plugin），请先安装"

command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }
command -v rsync >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq rsync; }
if ! command -v crontab >/dev/null 2>&1; then
	apt-get update -qq && apt-get install -y -qq cron
	systemctl enable --now cron
fi

mkdir -p "$BASE/public" "$BASE/public-src"

if [ -d "$BASE/public-src/.git" ]; then
	log "更新静态站（$BRANCH 分支）..."
	git -C "$BASE/public-src" pull -q --ff-only origin "$BRANCH" || log "拉取失败，保留服务器现有版本"
else
	log "首次克隆 $BRANCH 分支（大陆 VPS 拉 GitHub 可能失败，可改用本地 sync-now.sh 推送）"
	git clone --depth 1 -b "$BRANCH" "$BLOG_REPO" "$BASE/public-src" || log "克隆失败，跳过"
fi

if [ -f "$BASE/public-src/index.html" ]; then
	rsync -a --delete --exclude='.git' "$BASE/public-src/" "$BASE/public/"
	log "已同步静态文件到 $BASE/public"
fi

cat > /etc/cron.d/blog-sync <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root flock -n /tmp/blog-sync.lock bash -c 'cd $BASE/public-src && git pull -q --ff-only origin $BRANCH && rsync -a --delete --exclude=.git ./ $BASE/public/'
EOF
chmod 644 /etc/cron.d/blog-sync
log "已配置每分钟自动同步：/etc/cron.d/blog-sync"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
	ufw allow "$HTTP_PORT"/tcp
	log "ufw 已放行 $HTTP_PORT/tcp"
fi

cd "$BASE"
docker compose up -d
sleep 2
docker compose ps

IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo '服务器IP')"
log "完成：http://${IP:-服务器IP}:$HTTP_PORT/GHydxfn/"
log "别忘了在云厂商控制台安全组放行 TCP $HTTP_PORT"
