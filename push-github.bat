@echo off
setlocal

cd /d "%~dp0"
git add .
git commit -m "Update MiClase" 2>nul
git push origin main
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
  echo El push termino bien.
) else (
  echo El push termino con errores.
)
echo La ventana queda abierta para que puedas leer el resultado.
pause
endlocal & exit /b %EXITCODE%
