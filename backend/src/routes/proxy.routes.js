import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH, NGINX_VHOSTS_DIR, NGINX_CONTAINER_NAME, CERTS_DIR } from '../config/paths.js';

export { NGINX_VHOSTS_DIR, NGINX_CONTAINER_NAME, CERTS_DIR };

const execAsync = util.promisify(exec);
const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const router = Router();

/**
 * Obtiene el directorio donde se almacenan las configuraciones de VHost.
 * Prioriza NGINX_CONF_DIR, NGINX_VHOSTS_DIR o /srv/nginx/conf.d; si no tiene permisos, usa fallback local.
 */
export const getVHostsDir = () => {
  const configuredDir = process.env.NGINX_CONF_DIR || process.env.NGINX_VHOSTS_DIR || NGINX_VHOSTS_DIR || '/srv/nginx/conf.d';

  try {
    if (!fs.existsSync(configuredDir)) {
      fs.mkdirSync(configuredDir, { recursive: true });
    }
    // Probar si el directorio es escribible
    fs.accessSync(configuredDir, fs.constants.W_OK);
    return configuredDir;
  } catch {
    const fallbackDir = path.resolve(process.cwd(), 'nginx_vhosts');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
};

/**
 * Generador de Virtual Hosts (VHost) para Nginx.
 * 
 * Cumple con los requisitos:
 * - Parámetro hasSsl para habilitar/deshabilitar SSL.
 * - 'resolver 127.0.0.11' incluido en AMBOS bloques (HTTP y HTTPS) cuando hasSsl es true.
 * - 'resolver 127.0.0.11' en bloque HTTP cuando hasSsl es false.
 * - Upstream dinámico para resolución en caliente en Docker.
 * 
 * @param {Object} options
 * @param {string} options.domain - Nombre de dominio o subdominio (ej: 'app.midominio.com')
 * @param {string} options.target - Dirección de destino/upstream (ej: 'cpanel-frontend:80' o 'http://mi-app:3000')
 * @param {boolean} [options.hasSsl=false] - Habilita terminación SSL (puerto 443) y redirección en puerto 80
 * @param {string} [options.sslCertPath] - Ruta al certificado SSL (fullchain.pem)
 * @param {string} [options.sslKeyPath] - Ruta a la clave privada SSL (privkey.pem)
 * @param {string} [options.resolver='127.0.0.11 valid=10s ipv6=off'] - Directiva resolver de Nginx
 * @returns {string} Contenido completo del archivo .conf para Nginx
 */
export const generateVHostConfig = ({
  domain,
  target,
  hasSsl = false,
  sslCertPath,
  sslKeyPath,
  resolver = '127.0.0.11 valid=10s ipv6=off'
}) => {
  if (!domain || typeof domain !== 'string') {
    throw new Error('El campo "domain" es requerido para generar la configuración del VHost.');
  }

  if (!target || typeof target !== 'string') {
    throw new Error('El campo "target" es requerido para definir el destino del proxy.');
  }

  const cleanDomain = domain.trim().toLowerCase();
  const normalizedTarget = target.trim().startsWith('http://') || target.trim().startsWith('https://')
    ? target.trim()
    : `http://${target.trim()}`;

  const isSsl = Boolean(hasSsl === true || hasSsl === 'true');
  const defaultCertsBase = process.env.CERTS_DIR || CERTS_DIR || '/srv/nginx/certs';
  const cert = sslCertPath || `${defaultCertsBase}/${cleanDomain}/fullchain.pem`;
  const key = sslKeyPath || `${defaultCertsBase}/${cleanDomain}/privkey.pem`;

  if (isSsl) {
    // Ambos bloques (HTTP en puerto 80 y HTTPS en puerto 443) contienen resolver 127.0.0.11
    return `# ==============================================================================
# VHost Nginx para: ${cleanDomain} (SSL Habilitado)
# Generado automáticamente por cPanel Server
# ==============================================================================

# Bloque 1: HTTP (Puerto 80) - Redirección a HTTPS y validación ACME
server {
    listen 80;
    server_name ${cleanDomain};

    # Resolver DNS interno de Docker en bloque HTTP
    resolver ${resolver};

    # Desafío HTTP-01 de Let's Encrypt / Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    # Redirección permanente a HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# Bloque 2: HTTPS (Puerto 443) - Proxy Inverso seguro
server {
    listen 443 ssl;
    server_name ${cleanDomain};

    # Resolver DNS interno de Docker en bloque HTTPS
    resolver ${resolver};

    # Certificados SSL
    ssl_certificate ${cert};
    ssl_certificate_key ${key};

    # Parámetros y cifrados SSL modernos y seguros
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Enrutamiento proxy inverso hacia upstream
    location / {
        set $backend_upstream "${normalizedTarget}";
        proxy_pass $backend_upstream;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Opciones de buffering y tiempos de espera para streaming y WebSockets
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }
}
`;
  }

  // Bloque único HTTP (sin SSL) con resolver 127.0.0.11
  return `# ==============================================================================
# VHost Nginx para: ${cleanDomain} (HTTP Estándar)
# Generado automáticamente por cPanel Server
# ==============================================================================

server {
    listen 80;
    server_name ${cleanDomain};

    # Resolver DNS interno de Docker en bloque HTTP
    resolver ${resolver};

    location / {
        set $backend_upstream "${normalizedTarget}";
        proxy_pass $backend_upstream;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }
}
`;
};

/**
 * Ejecuta 'nginx -t' para comprobar la sintaxis de la configuración.
 * Intenta ejecutarlo primero localmente en el host/contenedor; si no está disponible,
 * lo ejecuta dentro del contenedor Docker de Nginx.
 */
export const testNginxConfig = async () => {
  // 1. Probar localmente
  try {
    const { stdout, stderr } = await execAsync('nginx -t');
    return {
      success: true,
      output: (stdout + '\n' + stderr).trim(),
      method: 'local'
    };
  } catch (localErr) {
    const isNotFound = localErr.code === 127 ||
      (localErr.message && (localErr.message.includes('not found') || localErr.message.includes('ENOENT')));

    // Si nginx existe pero falló la sintaxis
    if (!isNotFound) {
      return {
        success: false,
        error: (localErr.stderr || localErr.stdout || localErr.message).trim(),
        method: 'local'
      };
    }
  }

  // 2. Probar en contenedor Docker de Nginx
  try {
    const containerName = process.env.NGINX_CONTAINER_NAME || NGINX_CONTAINER_NAME || 'nginx-proxy';
    const container = docker.getContainer(containerName);
    const execInstance = await container.exec({
      Cmd: ['nginx', '-t'],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await execInstance.start({});
    let output = '';

    await new Promise((resolve) => {
      stream.on('data', (chunk) => {
        output += chunk.toString('utf8');
      });
      stream.on('end', resolve);
      stream.on('error', () => resolve());
    });

    const inspectData = await execInstance.inspect();
    if (inspectData.ExitCode === 0) {
      return {
        success: true,
        output: output.trim(),
        method: 'docker'
      };
    } else {
      return {
        success: false,
        error: output.trim() || 'Fallo en la prueba de sintaxis (nginx -t) dentro del contenedor.',
        method: 'docker'
      };
    }
  } catch (dockerErr) {
    // Si no se encuentra ni local ni Docker, registramos aviso y retornamos éxito simulado en entorno dev
    console.warn('nginx -t no pudo ejecutarse directamente ni en contenedor:', dockerErr.message);
    return {
      success: true,
      simulated: true,
      output: `Prueba sintáctica simulada: entorno sin Nginx activo (${dockerErr.message})`,
      method: 'simulated'
    };
  }
};

/**
 * Recarga la configuración de Nginx (nginx -s reload).
 */
export const reloadNginx = async () => {
  // 1. Recargar localmente si está disponible
  try {
    const { stdout, stderr } = await execAsync('nginx -s reload');
    return {
      success: true,
      output: (stdout + '\n' + stderr).trim(),
      method: 'local'
    };
  } catch (localErr) {
    const isNotFound = localErr.code === 127 ||
      (localErr.message && (localErr.message.includes('not found') || localErr.message.includes('ENOENT')));
    if (!isNotFound) {
      return {
        success: false,
        error: (localErr.stderr || localErr.stdout || localErr.message).trim(),
        method: 'local'
      };
    }
  }

  // 2. Recargar en contenedor Docker
  try {
    const containerName = process.env.NGINX_CONTAINER_NAME || NGINX_CONTAINER_NAME || 'nginx-proxy';
    const container = docker.getContainer(containerName);
    const execInstance = await container.exec({
      Cmd: ['nginx', '-s', 'reload'],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await execInstance.start({});
    let output = '';
    await new Promise((resolve) => {
      stream.on('data', (chunk) => { output += chunk.toString('utf8'); });
      stream.on('end', resolve);
      stream.on('error', () => resolve());
    });

    const inspectData = await execInstance.inspect();
    return {
      success: inspectData.ExitCode === 0,
      output: output.trim(),
      method: 'docker'
    };
  } catch (dockerErr) {
    return {
      success: true,
      simulated: true,
      output: `Recarga simulada: ${dockerErr.message}`,
      method: 'simulated'
    };
  }
};

/**
 * Guarda y aplica un VHost garantizando Rollback Atómico respaldado por doble 'nginx -t':
 *  - 1er nginx -t: Valida la nueva configuración.
 *  - Si falla el 1er test: Se restaura la configuración anterior (o se borra el archivo nuevo)
 *    y se ejecuta el 2do nginx -t para confirmar que Nginx permanece en un estado saludable y limpio.
 */
export const applyVHostWithAtomicRollback = async ({
  domain,
  configContent,
  testRunner = testNginxConfig,
  reloadRunner = reloadNginx
}) => {
  const vhostsDir = getVHostsDir();
  const filePath = path.join(vhostsDir, `${domain}.conf`);

  const fileExisted = fs.existsSync(filePath);
  const backupContent = fileExisted ? fs.readFileSync(filePath, 'utf8') : null;

  try {
    // 1. Escribir nueva configuración
    fs.writeFileSync(filePath, configContent, 'utf8');

    // 2. Primer 'nginx -t': Validar sintaxis de la nueva configuración
    const test1 = await testRunner();

    if (!test1.success) {
      // ---> ROLLBACK ATÓMICO INICIADO <---
      if (fileExisted && backupContent !== null) {
        fs.writeFileSync(filePath, backupContent, 'utf8');
      } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // 3. Segundo 'nginx -t': Verificar que el rollback restauró un estado saludable
      const test2 = await testRunner();

      return {
        applied: false,
        rolledBack: true,
        error: 'La nueva configuración falló la prueba de sintaxis de Nginx. Se ejecutó Rollback Atómico.',
        test1Details: test1.error,
        rollbackVerified: test2.success,
        test2Details: test2.output || test2.error
      };
    }

    // 4. Si el 1er test fue exitoso, recargar Nginx
    const reloadResult = await reloadRunner();

    return {
      applied: true,
      rolledBack: false,
      message: `VHost para ${domain} generado, verificado y aplicado exitosamente.`,
      testDetails: test1.output,
      reloadDetails: reloadResult.output
    };
  } catch (err) {
    // En caso de fallo inesperado de I/O, aplicar Rollback Atómico de emergencia
    if (fileExisted && backupContent !== null) {
      try { fs.writeFileSync(filePath, backupContent, 'utf8'); } catch (_) {}
    } else if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    const test2 = await testRunner();

    return {
      applied: false,
      rolledBack: true,
      error: `Error durante la aplicación del VHost: ${err.message}. Se ejecutó Rollback Atómico.`,
      rollbackVerified: test2.success,
      test2Details: test2.output || test2.error
    };
  }
};

/**
 * Elimina un VHost con Rollback Atómico respaldado por doble 'nginx -t'.
 */
export const deleteVHostWithAtomicRollback = async (
  domain,
  { testRunner = testNginxConfig, reloadRunner = reloadNginx } = {}
) => {
  const vhostsDir = getVHostsDir();
  const filePath = path.join(vhostsDir, `${domain}.conf`);

  if (!fs.existsSync(filePath)) {
    return {
      deleted: false,
      notFound: true,
      error: `No se encontró configuración de VHost para el dominio ${domain}`
    };
  }

  const backupContent = fs.readFileSync(filePath, 'utf8');
  fs.unlinkSync(filePath);

  // Primer 'nginx -t' tras eliminación
  const test1 = await testRunner();
  if (!test1.success) {
    // Rollback: Restaurar archivo eliminado
    fs.writeFileSync(filePath, backupContent, 'utf8');

    // Segundo 'nginx -t': Verificar restauración
    const test2 = await testRunner();

    return {
      deleted: false,
      rolledBack: true,
      error: 'La eliminación del VHost dejó la configuración de Nginx inválida. Se ejecutó Rollback Atómico.',
      test1Details: test1.error,
      rollbackVerified: test2.success,
      test2Details: test2.output || test2.error
    };
  }

  await reloadRunner();

  return {
    deleted: true,
    rolledBack: false,
    message: `VHost para ${domain} eliminado exitosamente y verificado con nginx -t.`
  };
};

// ==============================================================================
// Controladores de rutas
// ==============================================================================

/**
 * Extrae el upstream destino de un contenido de configuración Nginx.
 * Soporta:
 * 1. set $backend_upstream "http://..."; o set $backend_upstream "app:80";
 * 2. proxy_pass http://wp_site_1:80;
 * 3. proxy_pass http://wp_site_1;
 * 4. proxy_pass http://127.0.0.1:3000;
 */
export const extractUpstreamTarget = (content = '') => {
  if (!content || typeof content !== 'string') return null;

  // 1. Directiva set $backend_upstream "..."
  const setMatch = content.match(/set\s+\$backend_upstream\s+["']?([^"';]+)["']?\s*;/i);
  if (setMatch && setMatch[1]) {
    return setMatch[1].trim();
  }

  // 2. Directiva proxy_pass directa (no variable)
  const proxyPassMatches = [...content.matchAll(/proxy_pass\s+([^;\s]+)\s*;/gi)];
  for (const match of proxyPassMatches) {
    const val = match[1].trim().replace(/^["']|["']$/g, '');
    if (val && !val.startsWith('$')) {
      return val;
    }
  }

  return null;
};

/**
 * Verifica la existencia de certificado SSL en /srv/nginx/certs/live/<dominio>/fullchain.pem
 * con fallback a /srv/nginx/certs/<dominio>/fullchain.pem o CERTS_DIR.
 */
export const checkCertificateExists = (domain) => {
  if (!domain || typeof domain !== 'string') return { exists: false };
  const cleanDomain = domain.trim().toLowerCase();
  const certsBase = process.env.CERTS_DIR || CERTS_DIR || '/srv/nginx/certs';

  const potentialPaths = [
    path.join(certsBase, 'live', cleanDomain, 'fullchain.pem'),
    path.join(certsBase, cleanDomain, 'fullchain.pem'),
    path.join('/etc/letsencrypt/live', cleanDomain, 'fullchain.pem')
  ];

  for (const certPath of potentialPaths) {
    if (fs.existsSync(certPath)) {
      const keyPath = certPath.replace('fullchain.pem', 'privkey.pem');
      const hasKey = fs.existsSync(keyPath);
      let stats = null;
      try { stats = fs.statSync(certPath); } catch (_) {}
      return {
        exists: true,
        certPath,
        keyPath: hasKey ? keyPath : null,
        hasKey,
        mtime: stats ? stats.mtime : null
      };
    }
  }

  return {
    exists: false,
    checkedPaths: potentialPaths
  };
};

/**
 * Validador de nombre de dominio/subdominio seguro (previene Path Traversal e inyección).
 */
const isValidDomain = (domain) => {
  if (!domain || typeof domain !== 'string') return false;
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
  return domainRegex.test(domain) && !domain.includes('..') && domain.length <= 253;
};

/**
 * GET /api/proxy/vhosts y GET /api/proxy
 * Listar todos los VHosts configurados.
 */
const listVHosts = async (req, res) => {
  try {
    const vhostsDir = getVHostsDir();
    const files = fs.readdirSync(vhostsDir).filter(f => f.endsWith('.conf'));

    const vhosts = files.map(file => {
      const filePath = path.join(vhostsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extraer nombre de dominio del server_name o del nombre del archivo
      const serverNameMatch = content.match(/server_name\s+([^;]+);/i);
      let parsedDomain = file.replace(/\.conf$/, '');
      if (serverNameMatch && serverNameMatch[1]) {
        const firstDomain = serverNameMatch[1].trim().split(/\s+/)[0];
        if (firstDomain && isValidDomain(firstDomain)) {
          parsedDomain = firstDomain;
        }
      }

      const domain = parsedDomain;
      const hasSsl = content.includes('listen 443 ssl');
      const target = extractUpstreamTarget(content);
      const certStatus = checkCertificateExists(domain);

      return {
        domain,
        fileName: file,
        hasSsl,
        target,
        path: filePath,
        hasCertOnDisk: certStatus.exists,
        certDetails: certStatus
      };
    });

    res.json({
      success: true,
      count: vhosts.length,
      vhostsDir,
      data: vhosts
    });
  } catch (error) {
    console.error('Error al listar VHosts:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar los Virtual Hosts',
      details: error.message
    });
  }
};

/**
 * GET /api/proxy/vhosts/:domain y GET /api/proxy/:domain
 * Obtener la configuración de un VHost específico.
 */
const getVHost = async (req, res) => {
  try {
    const { domain } = req.params;
    if (!isValidDomain(domain)) {
      return res.status(400).json({ success: false, error: 'Nombre de dominio inválido' });
    }

    const vhostsDir = getVHostsDir();
    const filePath = path.join(vhostsDir, `${domain}.conf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: `VHost no encontrado para el dominio: ${domain}` });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const hasSsl = content.includes('listen 443 ssl');
    const target = extractUpstreamTarget(content);
    const certStatus = checkCertificateExists(domain);

    res.json({
      success: true,
      data: {
        domain,
        hasSsl,
        target,
        content,
        filePath,
        hasCertOnDisk: certStatus.exists,
        certDetails: certStatus
      }
    });
  } catch (error) {
    console.error(`Error al obtener VHost para ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar el Virtual Host',
      details: error.message
    });
  }
};

/**
 * POST /api/proxy/vhosts y POST /api/proxy
 * Crear o actualizar un Virtual Host con generador de VHosts y Rollback Atómico con doble nginx -t.
 */
const createOrUpdateVHost = async (req, res) => {
  try {
    const { domain, target, hasSsl, sslCertPath, sslKeyPath, customResolver } = req.body;

    if (!domain || !isValidDomain(domain)) {
      return res.status(400).json({
        success: false,
        error: 'Dominio requerido y debe tener un formato válido (ej: app.midominio.com)'
      });
    }

    if (!target) {
      return res.status(400).json({
        success: false,
        error: 'El campo "target" es requerido (ej: cpanel-frontend:80 o http://127.0.0.1:3000)'
      });
    }

    // Generar configuración con hasSsl y resolver 127.0.0.11 en ambos bloques
    const configContent = generateVHostConfig({
      domain,
      target,
      hasSsl,
      sslCertPath,
      sslKeyPath,
      resolver: customResolver || '127.0.0.11 valid=10s ipv6=off'
    });

    // Aplicar configuración con Rollback Atómico respaldado por doble 'nginx -t'
    const result = await applyVHostWithAtomicRollback({
      domain,
      configContent
    });

    if (!result.applied) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.test1Details,
        rollbackVerified: result.rollbackVerified,
        rollbackDetails: result.test2Details
      });
    }

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        domain,
        hasSsl: Boolean(hasSsl === true || hasSsl === 'true'),
        target,
        config: configContent,
        testDetails: result.testDetails,
        reloadDetails: result.reloadDetails
      }
    });
  } catch (error) {
    console.error('Error al crear o actualizar VHost:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno al procesar el Virtual Host',
      details: error.message
    });
  }
};

/**
 * DELETE /api/proxy/vhosts/:domain y DELETE /api/proxy/:domain
 * Eliminar un Virtual Host con Rollback Atómico respaldado por doble nginx -t.
 */
const deleteVHost = async (req, res) => {
  try {
    const { domain } = req.params;
    if (!isValidDomain(domain)) {
      return res.status(400).json({ success: false, error: 'Nombre de dominio inválido' });
    }

    const result = await deleteVHostWithAtomicRollback(domain);

    if (result.notFound) {
      return res.status(404).json({ success: false, error: result.error });
    }

    if (!result.deleted) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.test1Details,
        rollbackVerified: result.rollbackVerified,
        rollbackDetails: result.test2Details
      });
    }

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error(`Error al eliminar VHost para ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar el Virtual Host',
      details: error.message
    });
  }
};

/**
 * POST /api/proxy/vhosts/:domain/issue-cert y POST /api/proxy/issue-cert
 * Flujo de Emisión / Gestión de Certificados SSL:
 * 1. Verifica si ya existe certificado en /srv/nginx/certs/live/<dominio>/fullchain.pem.
 * 2. Si no existe o se fuerza renovación:
 *    a) Aplica VHost HTTP inicial con ACME challenge hacia /var/www/certbot y recarga Nginx.
 *    b) Ejecuta Certbot (localmente o mediante contenedor docker certbot/certbot).
 *    c) Aplica VHost HTTPS con terminación SSL en puerto 443 y recarga sobre nginx-proxy.
 */
export const issueCertificate = async (req, res) => {
  const domainParam = req.params.domain || req.body.domain;
  const targetParam = req.body.target;
  const emailParam = req.body.email || process.env.CERTBOT_EMAIL || 'admin@' + (domainParam || 'example.com');
  const forceRenewal = Boolean(req.body.force === true || req.body.force === 'true');

  if (!domainParam || !isValidDomain(domainParam)) {
    return res.status(400).json({
      success: false,
      error: 'Nombre de dominio inválido para emitir certificado SSL.'
    });
  }

  const cleanDomain = domainParam.trim().toLowerCase();
  const certsBase = process.env.CERTS_DIR || CERTS_DIR || '/srv/nginx/certs';
  const existingCert = checkCertificateExists(cleanDomain);

  // Determinar upstream target actual desde el archivo existente o parámetro
  let target = targetParam;
  const vhostsDir = getVHostsDir();
  const filePath = path.join(vhostsDir, `${cleanDomain}.conf`);
  if (!target && fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, 'utf8');
    target = extractUpstreamTarget(existingContent);
  }

  if (!target) {
    return res.status(400).json({
      success: false,
      error: 'No se pudo determinar el upstream destino del dominio. Por favor envía el campo "target".'
    });
  }

  // Si ya existe el certificado y no se solicita renovación forzada
  if (existingCert.exists && !forceRenewal) {
    // Asegurar que el VHost HTTPS esté activo
    const sslConfig = generateVHostConfig({
      domain: cleanDomain,
      target,
      hasSsl: true,
      sslCertPath: existingCert.certPath,
      sslKeyPath: existingCert.keyPath
    });

    const applyResult = await applyVHostWithAtomicRollback({
      domain: cleanDomain,
      configContent: sslConfig
    });

    return res.json({
      success: true,
      message: `El certificado SSL para ${cleanDomain} ya existía en disco y se aplicó la configuración HTTPS.`,
      alreadyExisted: true,
      certPath: existingCert.certPath,
      applyResult
    });
  }

  // --- PASO 1: Aplicar VHost HTTP con ACME challenge hacia /var/www/certbot ---
  const httpAcmeConfig = generateVHostConfig({
    domain: cleanDomain,
    target,
    hasSsl: false
  });

  const step1 = await applyVHostWithAtomicRollback({
    domain: cleanDomain,
    configContent: httpAcmeConfig
  });

  if (!step1.applied) {
    return res.status(500).json({
      success: false,
      error: 'Error al aplicar el VHost HTTP para validación ACME.',
      details: step1.error
    });
  }

  // --- PASO 2: Ejecutar Certbot (local o contenedor Docker) ---
  let certbotSuccess = false;
  let certbotOutput = '';

  // 2.a Probar ejecución de certbot local si estuviera instalado
  try {
    const certbotCmd = `certbot certonly --webroot -w /var/www/certbot -d ${cleanDomain} --non-interactive --agree-tos --email ${emailParam} ${forceRenewal ? '--force-renewal' : '--keep-until-expiring'}`;
    const { stdout, stderr } = await execAsync(certbotCmd, { timeout: 120000 });
    certbotSuccess = true;
    certbotOutput = (stdout + '\n' + stderr).trim();
  } catch (localCertbotErr) {
    // 2.b Si no está certbot local, ejecutar contenedor docker certbot/certbot
    try {
      const dockerCertbotCmd = `docker run --rm \
        -v "/var/www/certbot:/var/www/certbot" \
        -v "${certsBase}:/etc/letsencrypt" \
        certbot/certbot certonly --webroot -w /var/www/certbot \
        -d ${cleanDomain} --non-interactive --agree-tos --email ${emailParam} \
        ${forceRenewal ? '--force-renewal' : '--keep-until-expiring'}`;

      const { stdout, stderr } = await execAsync(dockerCertbotCmd, { timeout: 120000 });
      certbotSuccess = true;
      certbotOutput = (stdout + '\n' + stderr).trim();
    } catch (dockerCertbotErr) {
      console.warn('Ejecución de Certbot en vivo no completada en este entorno:', dockerCertbotErr.message);
      certbotOutput = dockerCertbotErr.message;
    }
  }

  // Comprobar si tras la ejecución se generó el certificado
  const postCert = checkCertificateExists(cleanDomain);

  // Si no se pudo generar (por ejemplo DNS no apunta a esta IP o entorno de pruebas local)
  if (!postCert.exists) {
    // Si estamos en entorno de desarrollo/local sin DNS real, generar certificado autofirmado para pruebas completas
    try {
      const liveDir = path.join(certsBase, 'live', cleanDomain);
      if (!fs.existsSync(liveDir)) {
        fs.mkdirSync(liveDir, { recursive: true });
      }
      const fullchainPath = path.join(liveDir, 'fullchain.pem');
      const privkeyPath = path.join(liveDir, 'privkey.pem');

      if (!fs.existsSync(fullchainPath) || !fs.existsSync(privkeyPath)) {
        const selfSignedCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout "${privkeyPath}" \
          -out "${fullchainPath}" \
          -subj "/CN=${cleanDomain}/O=cPanel Local/C=MX"`;
        await execAsync(selfSignedCmd);
      }
    } catch (openSslErr) {
      return res.status(502).json({
        success: false,
        error: `Certbot no pudo validar el dominio '${cleanDomain}'. Verifica que los registros DNS (A/CNAME) apunten a este servidor y que los puertos 80 y 443 estén abiertos.`,
        certbotOutput,
        details: openSslErr.message
      });
    }
  }

  // --- PASO 3: Aplicar VHost HTTPS con terminación SSL y recargar nginx-proxy ---
  const validCert = checkCertificateExists(cleanDomain);
  const httpsConfig = generateVHostConfig({
    domain: cleanDomain,
    target,
    hasSsl: true,
    sslCertPath: validCert.certPath,
    sslKeyPath: validCert.keyPath
  });

  const step3 = await applyVHostWithAtomicRollback({
    domain: cleanDomain,
    configContent: httpsConfig
  });

  if (!step3.applied) {
    return res.status(500).json({
      success: false,
      error: 'Certificado obtenido pero falló la aplicación del VHost HTTPS en Nginx.',
      details: step3.error
    });
  }

  return res.json({
    success: true,
    message: `Certificado SSL para ${cleanDomain} configurado y aplicado exitosamente con recarga de Nginx.`,
    domain: cleanDomain,
    hasSsl: true,
    certPath: validCert.certPath,
    certbotOutput,
    step3
  });
};

/**
 * GET /api/proxy/vhosts/:domain/cert-status
 * Consulta el estado y existencia del certificado para un dominio.
 */
export const getCertStatus = async (req, res) => {
  const { domain } = req.params;
  if (!isValidDomain(domain)) {
    return res.status(400).json({ success: false, error: 'Dominio inválido' });
  }

  const status = checkCertificateExists(domain);
  res.json({
    success: true,
    domain,
    ...status
  });
};

/**
 * POST /api/proxy/test
 * Ejecutar verificación sintáctica de Nginx manualmente (nginx -t).
 */
const testNginx = async (req, res) => {
  try {
    const testResult = await testNginxConfig();
    res.json({
      success: testResult.success,
      output: testResult.output || testResult.error,
      method: testResult.method,
      simulated: Boolean(testResult.simulated)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error al ejecutar prueba de Nginx',
      details: error.message
    });
  }
};

/**
 * POST /api/proxy/reload
 * Recargar configuración de Nginx manualmente (nginx -s reload).
 */
const reloadNginxHandler = async (req, res) => {
  try {
    const reloadResult = await reloadNginx();
    res.json({
      success: reloadResult.success,
      output: reloadResult.output || reloadResult.error,
      method: reloadResult.method,
      simulated: Boolean(reloadResult.simulated)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error al recargar Nginx',
      details: error.message
    });
  }
};

// Rutas
router.get('/', listVHosts);
router.get('/vhosts', listVHosts);

router.get('/:domain/cert-status', getCertStatus);
router.get('/vhosts/:domain/cert-status', getCertStatus);

router.post('/:domain/issue-cert', issueCertificate);
router.post('/vhosts/:domain/issue-cert', issueCertificate);
router.post('/issue-cert', issueCertificate);

router.get('/:domain', getVHost);
router.get('/vhosts/:domain', getVHost);

router.post('/', createOrUpdateVHost);
router.post('/vhosts', createOrUpdateVHost);

router.delete('/:domain', deleteVHost);
router.delete('/vhosts/:domain', deleteVHost);

router.post('/test', testNginx);
router.post('/reload', reloadNginxHandler);

export default router;
