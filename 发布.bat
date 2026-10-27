@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo  发布博客
echo ========================================
echo.
echo [1/3] 清理旧的生成文件...
call "node_modules\.bin\hexo.cmd" clean
echo.
echo [2/3] 生成网页...
call "node_modules\.bin\hexo.cmd" generate
if errorlevel 1 goto :fail
echo.
echo [3/3] 上传到 GitHub...
call "node_modules\.bin\hexo.cmd" deploy
if errorlevel 1 goto :fail
echo.
echo ========================================
echo  发布成功
echo ========================================
echo.
echo 等 1 到 2 分钟，然后打开：
echo https://ggg2761367.github.io/GHydxfn/
echo.
pause
exit /b 0

:fail
echo.
echo ========================================
echo  发布失败
echo ========================================
echo.
echo 把上面的红色错误信息复制下来发给 AI。
echo 常见原因：
echo   1. 网络连不上 GitHub，挂个代理再试
echo   2. 有文件被占用，关掉正在预览的浏览器
echo.
pause
exit /b 1
