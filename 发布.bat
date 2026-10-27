@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo  发布博客
echo ========================================
echo.
echo [1/4] 生成网页...
call "node_modules\.bin\hexo.cmd" clean >nul 2>&1
call "node_modules\.bin\hexo.cmd" generate
if errorlevel 1 goto :fail

echo.
echo [2/4] 上传网页到 GitHub Pages...
call "node_modules\.bin\hexo.cmd" deploy
if errorlevel 1 (
  echo.
  echo 网页上传失败，多半是网络或代理问题，换个代理节点再试。
  goto :fail
)

echo.
echo [3/4] 同步源码到 GitHub（供手机端使用）...
git add -A >nul 2>&1
git diff --cached --quiet >nul 2>&1
if errorlevel 1 (
  git commit -q -m "更新博客" >nul 2>&1
)
git push origin main 2>nul
if errorlevel 1 (
  echo       源码同步失败，不影响本次发布，等网络好些再点一次
) else (
  echo       源码已同步
)

echo.
echo [4/4] 完成
echo.
echo ========================================
echo  发布成功
echo ========================================
echo.
echo 等 1 到 2 分钟访问：
echo https://ggg2761367.github.io/GHydxfn/
echo.
pause
exit /b 0

:fail
echo.
echo 把上面的错误信息复制下来发给 AI。
echo.
pause
exit /b 1
