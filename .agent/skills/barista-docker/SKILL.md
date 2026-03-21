---
name: barista-docker
description: >
  Usar cuando el agente trabaja en Dockerfile.dev, Dockerfile.prod,
  docker-compose.yml, nginx.conf, .dockerignore, o cuando el usuario
  pregunta cómo levantar el entorno de desarrollo o hacer un build
  de producción. No usar para código de la aplicación.
---

# Barista Docker Skill

## Comandos de uso

```bash
# Desarrollo con hot-reload (http://localhost:5173)
docker compose up dev

# Primera vez o tras cambiar dependencias
docker compose up dev --build

# Producción (http://localhost:8080)
docker compose up prod --build

# Limpiar todo (contenedores, volúmenes, imágenes locales)
docker compose down --volumes --rmi local
```

## Estructura de archivos Docker (todos en la raíz del repo)

```
Dockerfile.dev      ← node:22-alpine, HMR, volumen de source
Dockerfile.prod     ← multi-stage: builder (node) + server (nginx)
docker-compose.yml  ← orquesta ambos servicios
nginx.conf          ← SPA routing + headers seguridad + caché PWA
.dockerignore       ← excluye node_modules, dist, .git
```

## Por qué `CHOKIDAR_USEPOLLING=true`

En Docker Desktop (Mac/Windows) y WSL2, el sistema de archivos montado no
propaga eventos `inotify` al contenedor. Sin polling, Vite no detecta que
guardaste un archivo y el HMR no funciona. El polling revisa cada 300ms.

## Por qué `- /app/node_modules` en volumes

El `node_modules` del host puede contener binarios compilados para Mac/Windows.
Dentro del contenedor Linux esos binarios son incompatibles (esbuild, etc.).
El volumen anónimo `/app/node_modules` le dice a Docker: "este directorio
NO se sobreescribe con el del host — usa el que instaló `npm ci` en la imagen."

## Caché del service worker en nginx

El archivo `sw.js` y `workbox-*.js` tienen `Cache-Control: no-store`.
Si el browser los cachea, `autoUpdate` de vite-plugin-pwa deja de funcionar
y el usuario queda atascado en una versión vieja indefinidamente.

## Safety

Antes de ejecutar `docker compose down --volumes`, advertir al usuario que
esto elimina los volúmenes de Docker. En este proyecto no hay datos en
volúmenes (todo está en IndexedDB del browser), pero es buena práctica
confirmar antes de operaciones destructivas.
