---
name: barista-docker
description: >
  Usar cuando el agente trabaja en Dockerfile.dev, Dockerfile.prod,
  docker-compose.yml, nginx.conf, .dockerignore, o cuando el usuario
  pregunta cómo levantar el entorno de desarrollo local.
  En v4 Docker es SOLO para desarrollo — producción usa Vercel.
---

# Barista Docker Skill (v4 — solo desarrollo)

## Cambio en v4: Docker ya no es para producción

| v3 | v4 |
|----|-----|
| Docker prod → nginx sirviendo el bundle | Vercel sirve el bundle |
| Docker dev → HMR | Docker dev → HMR (sin cambios) |

Los archivos `Dockerfile.prod` y `nginx.conf` siguen en el repo por si
se necesita un deploy alternativo, pero el flujo normal es Vercel.

---

## Comandos

```bash
# Desarrollo con hot-reload (http://localhost:5173)
docker compose up dev

# Primera vez o tras cambiar package.json
docker compose up dev --build

# Detener
docker compose down

# Limpiar imágenes y volúmenes locales
docker compose down --volumes --rmi local
```

---

## Variables de entorno en desarrollo

Crear `.env.local` en la raíz del repo (ya está en .gitignore):

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Docker Compose pasa automáticamente las variables del archivo `.env.local`
al contenedor — no hay que agregarlas manualmente al `docker-compose.yml`.

---

## Por qué `CHOKIDAR_USEPOLLING=true`

En Docker Desktop (Mac/Windows) y WSL2, el sistema de archivos montado
no propaga eventos `inotify` al contenedor. Sin polling, Vite no detecta
cambios de archivo y el HMR no funciona. El polling revisa cada 300ms.

## Por qué `- /app/node_modules` en volumes

El `node_modules` del host contiene binarios nativos compilados para
Mac/Windows. Dentro de Linux (contenedor) son incompatibles. El volumen
anónimo preserva el `node_modules` que `npm ci` instaló en la imagen.

---

## Do not use this skill when

- El agente trabaja en componentes React
- El agente trabaja en vite.config.ts o vercel.json
- El agente trabaja en src/lib/ o src/store/
