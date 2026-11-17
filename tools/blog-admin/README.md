# 博客管理后台

双击仓库根目录的 **博客管理.exe**，浏览器会自动打开 `http://127.0.0.1:7788/`。
关闭那个黑色窗口即停止服务（本地预览也会一起停）。

## 能做什么

| 页面 | 操作 | 结果 |
|:---|:---|:---|
| 站点 | 改标题 / 副标题 / 作者 | 写入 `_config.yml` → `git commit` → `git push origin main` |
| 站点 | 上传头像 | 存到 `source/img/uploads/`，更新 `_config.butterfly.yml` 的 `avatar.img`，并提交推送 |
| 文章 | 新建 / 编辑 Markdown | 写入 `source/_posts/`，并提交推送 |
| 实时预览 | 启动预览 | 自动挑空闲端口，内嵌 iframe，保存文件自动刷新 |
| 发布 | 立即发布上线 | `hexo clean` → `generate` → `deploy`，再同步源码到 main |

保存后 GitHub Actions 会重新构建，线上约 1~2 分钟更新；「立即发布」会直接推 `gh-pages`，更快。

## 安全边界

- 只监听 `127.0.0.1:7788`，外网访问不到，也没有登录页。
- 不要把 7788 端口映射到公网；它拥有对仓库的写权限。
- 上传图片限 5MB，仅 png/jpg/webp/gif；SVG 会被拒绝（可携带脚本）。
- 跨站 POST 会被 Origin 校验拦截。

## 目录

```
博客管理.exe                 启动器（需要本机已安装 Node.js）
tools/launcher.cs            exe 源码，可重新编译
tools/blog-admin/server.js   本地 HTTP 服务（无第三方依赖）
tools/blog-admin/ui.html     管理界面
tools/legacy/                原来的 5 个 .bat，已合并，保留作备用
```

重新编译 exe：

```bash
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe -nologo -target:exe \
  -codepage:65001 -out:"E:\blog\博客管理.exe" "E:\blog\tools\launcher.cs"
```

## 为什么不用现成方案

- **Sveltia CMS / Decap CMS**：成熟的 Git-based CMS，保存直接提交 GitHub，但需要自建 GitHub OAuth 代理（Cloudflare Worker），且不管本地预览与 Hexo 构建。
- **hexo-admin-panel**（Gitee）：Hexo 后台，有图片管理和发布中心，但不自动 commit/push。
- 本工具用本地 Git 凭据，零 OAuth、零额外服务，把编辑、预览、发布合成一个入口。

## 常见问题

- 预览打不开：端口被别的程序占用时会自动顺延；页面会显示实际地址。
- 保存失败：看界面下方日志，多为网络/代理导致 `git push` 失败，内容已写入本地，网络恢复后再点一次即可。
- 首次保存会把 `tools/`、`deploy/`、`博客管理.exe` 一起提交，属于正常现象。
