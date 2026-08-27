# cPanel Server

cPanel Server es un panel de administración web liviano y moderno diseñado para gestionar contenedores Docker en entornos locales o servidores VPS remotos. Está construido con un frontend en Svelte/Vite y un backend en Node.js/Express integrado con la API de Docker mediante Dockerode.

---

## Características Principales

### 1. Dashboard Principal
- Monitoreo en tiempo real del uso estimado de CPU y memoria RAM asignados al daemon de Docker.
- Conteo dinámico de contenedores totales, en ejecución y detenidos.
- Lista de accesos directos a los contenedores recientes con control de inicio y detención inmediata.

### 2. Gestión de Contenedores
- Formulario horizontal para el despliegue de nuevas imágenes de Docker Hub (con asignación de nombre opcional y mapeo de puertos).
- Tabla completa de contenedores activos e inactivos.
- Control del ciclo de vida de cada servicio: iniciar, detener, reiniciar y eliminar.
- Visor de registros (logs) del contenedor.
- Inspección detallada con información de red, puertos, volúmenes e identificadores.

### 3. Terminal Web y Logs en Vivo
- Consola estilo terminal web con comandos internos simulados (`neofetch`, `docker ps`, `docker images`, `docker info`, `uptime`, `clear`, `help`).
- Visualización de logs en tiempo real mediante transporte Server-Sent Events (SSE).
- Ejecución directa de comandos en contenedores activos a través del endpoint exec.

### 4. Configuración
- Configuración dinámica del endpoint API del backend para alternar entre servidores locales o remotos.
- Mapeo de la ruta al UNIX socket de Docker (`/var/run/docker.sock`).
- Interfaz de diseño oscuro con colores sólidos sin transparencias ni efectos blur.

---

## Arquitectura del Proyecto

El proyecto está organizado en una estructura monorepo con workspaces de npm:

```
cpanel-server/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   └── dockerController.js
│   │   ├── routes/
│   │   │   └── containers.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ContainerTable.svelte
│   │   │   ├── DeployCard.svelte
│   │   │   └── Sidebar.svelte
│   │   ├── views/
│   │   │   ├── ContainersView.svelte
│   │   │   ├── DashboardView.svelte
│   │   │   ├── SettingsView.svelte
│   │   │   └── TerminalView.svelte
│   │   └── App.svelte
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json
└── README.md
```

---

## Requisitos Previos

- Node.js (v18 o superior)
- npm (v9 o superior)
- Docker instalado y ejecutándose en el sistema host o servidor VPS.
- Permisos de lectura y escritura sobre el socket de Docker (`/var/run/docker.sock`).

---

## Instalación y Configuración Local

1. Clonar el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd cpanel-server
   ```

2. Instalar todas las dependencias del monorepo:
   ```bash
   npm install
   ```

3. Iniciar el servidor backend de desarrollo:
   ```bash
   npm run dev:backend
   ```
   El backend se ejecutará en `http://localhost:5000`.

4. En otra terminal, iniciar el frontend de desarrollo:
   ```bash
   npm run dev:frontend
   ```
   El frontend se ejecutará en `http://localhost:5173`.

---

## Conexión y Despliegue en un VPS Remoto

El frontend desacoplado permite administrar una instancia remota de Docker ejecutando el backend en un servidor VPS:

### Configuración en el Servidor VPS
1. Transfiere la carpeta `backend` al servidor VPS.
2. Asegúrate de que el usuario que ejecuta el backend tenga acceso al socket de Docker (`/var/run/docker.sock`).
3. Instala las dependencias e inicia el backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
4. Asegúrate de habilitar el puerto `5000` (o el puerto configurado) en el firewall de tu proveedor de VPS.

### Configuración en el Frontend
1. Abre la interfaz web de cPanel Server.
2. Dirígete al apartado de Configuración en el menú lateral.
3. En el campo "URL del Backend (API)", ingresa la dirección IP de tu servidor VPS:
   ```text
   http://IP_DE_TU_VPS:5000/api
   ```
4. Haz clic en "Guardar Cambios".

---

## Endpoints de la API Backend

- `GET /api/containers`: Lista todos los contenedores presentes en Docker.
- `POST /api/containers/deploy`: Descarga una imagen y levanta un nuevo contenedor.
- `POST /api/containers/:id/start`: Inicia un contenedor detenido.
- `POST /api/containers/:id/stop`: Detiene un contenedor activo.
- `POST /api/containers/:id/restart`: Reinicia un contenedor.
- `DELETE /api/containers/:id`: Elimina un contenedor.
- `GET /api/containers/:id/logs`: Obtiene los registros actuales de un contenedor.
- `GET /api/containers/:id/logs/stream`: Transmisión en tiempo real de logs (Server-Sent Events).
- `POST /api/containers/:id/exec`: Ejecuta un comando dentro de un contenedor en ejecución.

---

## Licencia

Este proyecto está bajo la licencia MIT.
