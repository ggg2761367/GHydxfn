@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo  发布博客
echo ========================================
echo.
echo [1/3] 本地先试构建一次，有问题现在就能发现...
call "node_modules\.bin\hexo.cmd" generate
if errorlevel 1 goto :fail
echo.
echo [2/3] 提交改动到本地版本库...
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo       没有新改动，跳过提交
) else (
  git commit -q -m "更新博客"
  echo       已提交
)
echo.
echo [3/3] 推送到 GitHub，云端会自动构建并上线...
git push origin main
if errorlevel 1 goto :fail
echo.
echo ========================================
echo  推送成功
echo ========================================
echo.
echo GitHub 正在后台构建，等 1 到 3 分钟访问：
echo https://ggg2761367.github.io/GHydxfn/
echo.
echo 查看构建进度：
echo https://github.com/ggg2761367/GHydxfn/actions
echo.
pause
exit /b 0

:fail
echo.
echo ========================================
echo  失败
echo ========================================
echo.
echo 把上面的错误信息复制下来发给 AI。
echo 常见原因：
echo   1. 连不上 GitHub，挂代理再试
echo   2. 文件被别的程序占用
echo   3. 本地和云端版本冲突，需要先同步
echo.
pause
exit /b 1
