#!/usr/bin/env bash
# 本地执行：把当前 public/ 直接推送到 VPS（不依赖 GitHub，大陆网络也稳）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CONFIG="$ROOT/deploy/vps/config.sh"
if [ ! -f "$CONFIG" ]; then
	printf '\033[31m[错误]\033[0m 缺少 deploy/vps/config.sh\n'
	echo "先复制模板并填写服务器信息："
	echo "  cp deploy/vps/config.example.sh deploy/vps/config.sh"
	exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG"

if [ ! -f public/index.html ]; then
	printf '\033[31m[错误]\033[0m public/index.html 不存在，先执行：npx hexo clean && npx hexo generate\n'
	exit 1
fi

TARBALL="/tmp/blog-$$.tar.gz"
REMOTE="$VPS_USER@$VPS_HOST"
SSH_OPTS=(-p "$VPS_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

cleanup() { rm -f "$TARBALL"; }
trap cleanup EXIT

echo "[1/3] 打包 public/ ..."
tar -czf "$TARBALL" -C public .

echo "[2/3] 上传到 $REMOTE:$REMOTE_DIR ..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR/incoming'"
scp -P "$VPS_PORT" "$TARBALL" "$REMOTE:$REMOTE_DIR/incoming/site.tar.gz"

echo "[3/3] 服务器解压并替换 ..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "
	set -e
	cd '$REMOTE_DIR/incoming'
	rm -rf site && mkdir site
	tar -xzf site.tar.gz -C site
	rm -f site.tar.gz
	rsync -a --delete './site/' '$REMOTE_DIR/public/'
	cd .. && rm -rf incoming
"

echo "完成：http://$VPS_HOST:$HTTP_PORT/GHydxfn/"
echo "（VPS 上每分钟的自动同步仍会继续运行，不影响手动推送）"
