# MiClase

Base limpia de Express lista para subir a GitHub y desplegar en Railway con PostgreSQL.

## Requisitos

- Node.js 20 o superior

## Desarrollo local

```bash
npm install
npm start
```

La app queda disponible en `http://localhost:3000`.

## Variables de entorno

- `DATABASE_URL` obligatorio para usar PostgreSQL
- `NODE_ENV=production` recomendado en Railway

## Deploy en Railway

Railway detecta `npm start` automaticamente. El servidor usa `process.env.PORT` y `process.env.DATABASE_URL`.
Al iniciar crea una tabla minima llamada `app_meta` si no existe.

## Estado actual

- Sin SQLite
- Preparado para PostgreSQL
- Sin usuarios
- Sin sesiones
- Sin archivos subidos
