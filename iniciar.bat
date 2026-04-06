@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo No se encontro .env. Se usara la configuracion por defecto.
)
npm start
