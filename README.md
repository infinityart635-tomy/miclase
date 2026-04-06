# MiClase

Base limpia de Express lista para subir a GitHub y desplegar en Railway.

## Requisitos

- Node.js 20 o superior

## Desarrollo local

```bash
npm install
npm start
```

La app queda disponible en `http://localhost:3000`.

## Deploy en Railway

Railway detecta `npm start` automaticamente. El servidor usa `process.env.PORT`, asi que no requiere cambios extra.

## Estado actual

- Sin base de datos local
- Sin usuarios
- Sin sesiones
- Sin archivos subidos
