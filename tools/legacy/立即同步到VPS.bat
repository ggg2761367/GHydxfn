@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo  生成并推送到 VPS
echo ========================================
echo.

if not exist "deploy\vps\config.sh" (
  echo [错误] 还没配置服务器地址。
  echo.
  echo 请先执行：
  echo   copy deploy\vps\config.example.sh deploy\vps\config.sh
  echo 然后用记事本编辑 deploy\vps\config.sh 填入 VPS_HOST。
  echo.
  pause
  exit /b 1
)

where bash >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\Git\bin\bash.exe" (
    set "BASH=%ProgramFiles%\Git\bin\bash.exe"
  ) else (
    echo [错误] 找不到 bash，请先安装 Git for Windows。
    pause
    exit /b 1
  )
) else (
  set "BASH=bash"
)

echo [1/3] 生成网页...
call "node_modules\.bin\hexo.cmd" clean >nul 2>&1
call "node_modules\.bin\hexo.cmd" generate
if errorlevel 1 goto :fail

echo [2/3] 上传到 VPS...
"%BASH%" deploy/vps/sync-now.sh
if errorlevel 1 goto :fail

echo [3/3] 完成
echo.
pause
exit /b 0

:fail
echo.
echo 失败：把上面的报错复制下来发给 AI。
echo.
pause
exit /b 1
