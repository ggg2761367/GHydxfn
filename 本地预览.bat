@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo  本地预览（不会上传，只在这台电脑看）
echo ========================================
echo.
echo 地址：http://localhost:4000/GHydxfn/
echo 关闭这个黑窗口就停止预览。
echo.
start "" "http://localhost:4000/GHydxfn/"
call "node_modules\.bin\hexo.cmd" server
