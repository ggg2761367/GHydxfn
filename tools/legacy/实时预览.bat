@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo  实时预览（保存自动刷新，只在本机）
echo ========================================
echo.
echo 浏览器会自动打开：http://localhost:4001/GHydxfn/
echo 修改 source/ 或 themes/ 下的文件，保存后页面自动刷新。
echo 如果提示 4000 端口被占用，先关掉旧的「本地预览」窗口。
echo 关闭这个黑窗口即停止。
echo.
call npm run dev
echo.
echo 预览已停止。
pause
