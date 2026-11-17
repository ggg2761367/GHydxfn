# 复制为 config.sh 后再填（config.sh 已加入 .gitignore，不会上传）
#   cp deploy/vps/config.example.sh deploy/vps/config.sh

VPS_HOST="1.2.3.4"        # 云服务器公网 IP 或域名
VPS_USER="root"
VPS_PORT="22"
REMOTE_DIR="/opt/blog"    # 服务器上 install-server.sh 使用的目录
HTTP_PORT="8080"          # 对外端口，与 docker-compose.yml 保持一致
