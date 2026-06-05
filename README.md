# ☕ Barista Stock Manager

> PWA privada de control de inventario para cafeterías de especialidad.  
> Sincronización en tiempo real entre dispositivos. Datos cifrados end-to-end.  
> Offline-First · Privacy-First · Mobile-First.

<br>

![Vercel](https://img.shields.io/badge/Vercel-Deploy-black?logo=vercel)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?logo=supabase)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss)

---

## 📋 Tabla de contenidos

- [Características](#-características)
- [Stack tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Seguridad](#-modelo-de-seguridad)
- [Setup local](#-setup-local)
- [Deploy](#-deploy-en-vercel)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Gestión de usuarios](#-gestión-de-usuarios)
- [Reset total](#-reset-total)

---

## ✨ Características

| Característica | Descripción |
|----------------|-------------|
| 📱 **Mobile-First** | Diseñado para uso con una mano en barra, área táctil mínima 48px |
| 🔒 **Privacy-First** | Datos cifrados AES-GCM antes de salir del dispositivo |
| 📡 **Offline-First** | Funciona sin conexión, sincroniza al reconectar |
| ⚡ **Tiempo real** | Cambios visibles en todos los dispositivos en < 1 segundo |
| 👥 **Multi-usuario con roles** | Admin, Registrador y Lector — cada uno con permisos específicos |
| 🔑 **Autenticación por PIN** | Sin cuentas externas, sin emails — solo usuario + PIN local |
| 📊 **Export a Excel** | Reportes y salidas del día exportables a `.xlsx` |
| 📦 **PWA instalable** | Se instala como app nativa en iOS y Android |

---

## 🛠 Stack tecnológico

### Frontend

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| React | 19 | UI y componentes |
| TypeScript | 5.7 (strict) | Tipado estricto |
| Tailwind CSS | v4 (CSS-first) | Estilos, sin `tailwind.config.js` |
| Zustand | 5 | Estado global |
| lucide-react | 0.577 | Iconografía |
| xlsx | 0.18 | Export de reportes a Excel |

### Backend & Datos

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Supabase | SDK 2 | Base de datos + Realtime WebSockets |
| localforage | 1.10 | Persistencia offline (IndexedDB) |
| Zod | 3 | Validación de esquemas en runtime |
| DOMPurify | 3 | Sanitización de inputs (anti-XSS) |

### Build & Deploy

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Vite | 7 | Bundler y dev server |
| vite-plugin-pwa | 1.2 | Service Worker y manifest |
| Vercel | — | Deploy de producción (automático) |
| Docker | — | Entorno de desarrollo local |

---

## 🏗 Arquitectura

### Flujo de datos

```mermaid
flowchart TD
    U([👤 Usuario]) --> |Usuario + PIN| SG[SecurityGate]
    SG --> |PBKDF2 100k iter| WK[🔐 Wrapping Key]
    WK --> |unwrap| MK[🔑 Master Key en memoria]
    MK --> Z[Zustand Store]
    Z --> |AES-GCM cifrado| LF[(localforage\nIndexedDB)]
    Z --> |AES-GCM cifrado| SB[(Supabase\nPostgreSQL)]
    SB --> |WebSocket Realtime| OD([📱 Otro dispositivo])

    style WK fill:#8A7363,color:#FDF8F3
    style MK fill:#5C3D2E,color:#FDF8F3
    style SB fill:#3ECF8E,color:#fff
    style LF fill:#C8A98B,color:#382218
```

### Sincronización offline-first

```mermaid
sequenceDiagram
    participant D as 📱 Dispositivo
    participant L as 💾 localforage
    participant S as ☁️ Supabase

    Note over D,S: Con conexión
    D->>L: Escribe cambio (cifrado)
    D->>S: Sync en background (cifrado)
    S-->>D: Confirma escritura

    Note over D,S: Sin conexión
    D->>L: Escribe cambio (cifrado)
    D->>D: Encola operación pendiente

    Note over D,S: Al reconectar
    D->>S: Flush de cola pendiente
    S-->>D: Merge completado
```

### Modelo de cifrado (multi-usuario con master key envuelta)

```mermaid
flowchart LR
    PIN[🔢 PIN usuario] --> |SHA-256| H[Hash almacenado\nen Supabase]
    PIN --> |PBKDF2\n100k iter| WK[🔐 Wrapping Key\nen memoria]
    SALT[🧂 Salt único\nen Supabase] --> |input| WK
    WK --> |AES-GCM unwrap| MK[🔑 Master Key\nen memoria]
    WMK[(🎁 wrappedKey\nen Supabase por usuario)] --> |input| MK
    MK --> |AES-GCM\nIV aleatorio| CT[🔒 Ciphertext\nen Supabase]
    CT --> |AES-GCM\ndescifra| DATA[📦 Datos\nen Zustand]

    style WK fill:#8A7363,color:#FDF8F3
    style MK fill:#5C3D2E,color:#FDF8F3
    style CT fill:#382218,color:#FDF8F3
    style DATA fill:#6B8E23,color:#fff
```

> 💡 La **Master Key** cifra todos los datos y es la misma para todos los usuarios.
> Cada usuario tiene su propia copia *envuelta* (cifrada) con una clave derivada de su PIN.
> Cambiar el PIN de un usuario solo re-envuelve su copia — los datos no se re-cifran.

### Estados de autenticación

```mermaid
stateDiagram-v2
    [*] --> loading: App arranca
    loading --> fresh: Sin salt en Supabase
    loading --> migration: Sistema antiguo (single-PIN) detectado
    loading --> locked: Sistema multi-usuario configurado
    fresh --> unlocked: Setup primer admin ✓
    migration --> unlocked: PIN antiguo verificado → admin creado ✓
    locked --> unlocked: Usuario + PIN correctos ✓
    locked --> locked_out: 5 intentos fallidos
    locked_out --> locked: Timeout expirado
    unlocked --> locked: 30 min inactividad
    unlocked --> locked: Logout manual
```

### Roles y permisos

| Acción | Admin | Registrador | Lector |
|--------|:-----:|:-----------:|:------:|
| Ver inventario y reportes | ✓ | ✓ | ✓ |
| Registrar entradas / salidas | ✓ | ✓ | — |
| Agregar / eliminar productos | ✓ | — | — |
| Gestionar usuarios | ✓ | — | — |

---

## 🔐 Modelo de seguridad

### Amenazas cubiertas

| Amenaza | Mitigación |
|---------|-----------|
| Acceso físico al dispositivo | PIN + sesión con expiración de 30 min |
| Fuerza bruta del PIN | Lockout progresivo: 30s → 60s → 120s tras 5 intentos |
| Extensión maliciosa en el browser | Datos cifrados AES-GCM en IndexedDB — solo ciphertext visible |
| XSS stored | DOMPurify sanitiza todos los campos string antes de persistir |
| Acceso directo a Supabase | Solo ve `{ id, encrypted_payload }` — nunca plaintext |
| Intercepción de red | HTTPS + CSP headers + datos ya cifrados en el cliente |

### Por qué cada decisión criptográfica

> **SHA-256 para el PIN hash:** Permite verificar el PIN sin enviarlo por la red. El hash no revela el PIN original.

> **PBKDF2 con 100,000 iteraciones:** Hace que cada intento de fuerza bruta cueste ~100ms. Con 10,000 combinaciones posibles de PIN = mínimo 17 minutos para un ataque completo.

> **AES-GCM (modo autenticado):** Detecta si alguien modificó el ciphertext. Si hay tampering, el descifrado falla con error explícito.

> **IV aleatorio por escritura:** Previene ataques de nonce reuse. Sin IV único, dos textos iguales producirían el mismo ciphertext.

> **Salt en Supabase sin cifrar:** El salt no es secreto — su función es hacer que el mismo PIN derive claves distintas en distintas instalaciones. Guardarlo en Supabase permite que todos los dispositivos deriven la misma *Wrapping Key* con el mismo PIN y puedan desenvolver la Master Key.

> **Master Key envuelta por usuario:** Los datos se cifran una sola vez con una Master Key compartida. Cada usuario guarda su propia copia *envuelta* con su Wrapping Key derivada de su PIN. Así se puede agregar/quitar usuarios y cambiar PINs **sin re-cifrar todo el inventario**.

### Limitaciones conocidas

> ⚠️ **Sin auditoría de accesos** — no hay log de quién entró ni desde dónde.  
> ⚠️ **Sin 2FA** — un solo factor de autenticación (usuario + PIN).  
> ⚠️ **RLS permisivo** — la privacidad real depende del cifrado AES-GCM del cliente; cualquiera con la `anon key` puede leer el ciphertext (sin poder descifrarlo).

*Para el caso de uso de una cafetería local estas limitaciones son aceptables.*

---

## 🚀 Setup local

### Prerrequisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- [Git](https://git-scm.com/) instalado
- Cuenta en [Supabase](https://supabase.com) (tier gratuito)

### 1. Clonar el repo

```bash
git clone https://github.com/YaelTriana/barista-stock-manager.git
cd barista-stock-manager
```

### 2. Configurar variables de entorno

Crear `.env.local` en la raíz del proyecto:

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> 💡 Obtener estas claves en: Supabase Dashboard → Settings → API

### 3. Configurar la base de datos

En Supabase Dashboard → **SQL Editor** → ejecutar el contenido de:

```
supabase/migrations/001_initial.sql
```

### 4. Levantar el entorno de desarrollo

```bash
# Primera vez (descarga imagen Node, instala deps ~2 min)
docker compose up dev --build

# Las veces siguientes (~5 segundos)
docker compose up dev
```

La app estará disponible en **http://localhost:5173** con hot-reload.

### Comandos útiles

```bash
# Detener el contenedor
docker compose down

# Limpiar todo (imágenes, volúmenes)
docker compose down --volumes --rmi local

# Ver logs en tiempo real
docker compose logs -f dev
```

---

## ☁️ Deploy en Vercel

El deploy es completamente automático — cada `git push` a `main` redespliega.

### Setup inicial

1. Conectar repo en [vercel.com](https://vercel.com) → **Add New Project**
2. Framework preset: **Vite** (auto-detectado)
3. Agregar variables de entorno en **Settings → Environment Variables**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

4. **Deploy** → la app queda en `https://barista-stock-manager.vercel.app`

5. Agregar la URL en Supabase → **Authentication → URL Configuration → Site URL**

### Flujo de trabajo

```bash
# Hacer cambios en el código
git add .
git commit -m "feat: descripción del cambio"
git push origin main
# → Vercel redespliega automáticamente en ~30s
```

---

## 📁 Estructura del proyecto

```
barista-stock-manager/
├── .agent/
│   └── skills/                    # Skills para Antigravity AI
│       ├── barista-security/      # Auth, PIN, crypto, Zod
│       ├── barista-store/         # Zustand + sync
│       ├── barista-supabase/      # DB, Realtime, schema
│       ├── barista-ui/            # Componentes, Tailwind v4
│       ├── barista-pwa/           # Vite, PWA, Vercel
│       └── barista-docker/        # Docker dev
├── supabase/
│   └── migrations/
│       └── 001_initial.sql        # Schema inicial
├── src/
│   ├── components/
│   │   ├── admin/
│   │   │   └── UserManagement.tsx # Panel admin: crear/eliminar usuarios, cambiar PIN
│   │   ├── auth/
│   │   │   └── SecurityGate.tsx   # Login, setup inicial y migración
│   │   ├── inventory/
│   │   │   ├── InventoryList.tsx  # Pantalla de stock
│   │   │   ├── AddProductModal.tsx # Alta de productos (solo admin)
│   │   │   ├── StockEntry.tsx     # Registro de entradas
│   │   │   └── DailyOutputs.tsx   # Salidas del día + export Excel
│   │   ├── layout/
│   │   │   └── MainLayout.tsx     # Navbar + layout
│   │   ├── reports/
│   │   │   └── ReportsList.tsx    # Pantalla de reportes
│   │   └── ui/
│   │       └── SyncIndicator.tsx  # Estado de conexión
│   ├── contexts/
│   │   └── UserContext.tsx        # Usuario actual + masterKey en memoria
│   ├── hooks/
│   │   ├── useIdleTimer.ts        # Expiración de sesión
│   │   └── useSession.ts          # Estado de auth
│   ├── lib/
│   │   ├── crypto.ts              # Web Crypto API (AES-GCM, PBKDF2, key wrapping)
│   │   ├── encryptedStorage.ts    # Adapter Zustand + cifrado
│   │   ├── supabase.ts            # Cliente Supabase
│   │   ├── sync.ts                # Cola offline + merge
│   │   └── userAuth.ts            # Setup, login, CRUD usuarios, migración
│   ├── schemas/
│   │   ├── product.ts             # Zod schema Product
│   │   ├── movement.ts            # Zod schema Movement
│   │   └── user.ts                # Zod schema AppUser + roles + permisos
│   ├── store/
│   │   └── useInventoryStore.ts   # Store principal Zustand 5
│   ├── App.tsx
│   └── index.css                  # Tema Tailwind v4 (@theme {})
├── AGENT_BRIEF.md                 # Prompt principal para Antigravity
├── dockerfile.dev                 # Imagen de desarrollo
├── dockerfile.prod                # Imagen de producción (multi-stage)
├── docker-compose.yml             # Orquestación dev + prod
├── nginx.conf                     # SPA routing + headers seguridad
├── vercel.json                    # Headers CSP + SPA routing
└── .env.local                     # Variables de entorno (no en git)
```

---

## 👥 Gestión de usuarios

El sistema soporta múltiples usuarios con roles distintos. Solo un **administrador** puede gestionar usuarios.

### Crear el primer admin
En el primer arranque la app detecta que no hay configuración y muestra la pantalla de **setup inicial**: define un nombre de usuario y un PIN para el administrador.

### Agregar más usuarios
Desde la app (logueado como admin):
1. Abrir el **panel de administración** (menú → gestionar usuarios)
2. **Agregar usuario** → nombre + rol (Registrador / Lector) + PIN inicial
3. Compartir las credenciales con la persona

### Cambiar el PIN de un usuario
- Cada usuario puede cambiar su propio PIN.
- El admin puede cambiar el PIN de cualquier usuario sin conocer el actual.
- Al cambiar el PIN solo se re-envuelve la copia personal de la master key — **los datos no se re-cifran**.

### Migración desde el sistema viejo (single-PIN)
Si la instalación venía de la versión anterior con un único PIN compartido, la app detecta automáticamente esa configuración y muestra la pantalla de **migración**: ingresá el PIN viejo y se crea un usuario admin con ese PIN. Los datos existentes siguen siendo accesibles sin re-cifrar.

---

## 🔄 Reset total

> ⚠️ **Advertencia:** Esto borra todos los datos del inventario. Los datos están cifrados con una clave derivada de los PINs — sin un PIN válido no hay forma de recuperarlos.

Si perdiste todos los PINs o querés empezar desde cero, ejecutá en **Supabase Dashboard → SQL Editor**:

```sql
-- Borra configuración (salt, lista de usuarios, PIN hash legacy)
DELETE FROM app_config;

-- Borra todos los datos cifrados (no recuperables)
DELETE FROM movements;
DELETE FROM products;
```

Después de esto, la app entrará en modo **fresh setup** y podrás configurar un nuevo admin desde cero.

---

## 🗄️ Schema de base de datos

```mermaid
erDiagram
    app_config {
        uuid id PK
        text key UK
        text value
        timestamptz created_at
    }

    products {
        uuid id PK
        text encrypted_payload
        timestamptz updated_at
        timestamptz created_at
    }

    movements {
        uuid id PK
        uuid product_id FK
        text encrypted_payload
        timestamptz updated_at
        timestamptz created_at
    }

    products ||--o{ movements : "tiene"
```

> 💡 `encrypted_payload` contiene el JSON cifrado con AES-GCM. Supabase nunca ve el contenido real.

---

## 🎨 Paleta de colores

| Token | Color | Uso |
|-------|-------|-----|
| `bg-cream` | `#FDFBF7` | Fondo principal |
| `coffee-dark` | `#382218` | Títulos |
| `coffee-brown` | `#5C3D2E` | Botones primarios, nav activo |
| `wood-light` | `#EBE1D5` | Superficies de tarjetas |
| `wood-medium` | `#C8A98B` | Bordes, nav inactivo |
| `text-muted` | `#8A7363` | Texto secundario |
| `accent-red` | `#D9534F` | Bajo stock, alertas |
| `accent-green` | `#6B8E23` | Entradas, éxito |

---

<div align="center">
  <br>
  Hecho con ☕ para cafeterías de especialidad
  <br><br>
</div>
