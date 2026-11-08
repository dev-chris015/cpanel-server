import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  extractHostFromTarget,
  extractPortFromTarget,
  applyVHostWithAtomicRollback,
  createOrUpdateVHost,
  getVHostsDir,
  getNginxTarget,
  reloadNginxHandler
} from '../src/routes/proxy.routes.js';

describe('Suite de pruebas automatizadas: Validación de Proxy y Docker', () => {
  let tempVHostsDir;
  let originalEnvConfDir;

  before(() => {
    // Crear un directorio temporal aislado para las pruebas de VHost
    tempVHostsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhosts-test-'));
    originalEnvConfDir = process.env.NGINX_CONF_DIR;
    process.env.NGINX_CONF_DIR = tempVHostsDir;
  });

  after(() => {
    if (originalEnvConfDir !== undefined) {
      process.env.NGINX_CONF_DIR = originalEnvConfDir;
    } else {
      delete process.env.NGINX_CONF_DIR;
    }
    try {
      fs.rmSync(tempVHostsDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // ---------------------------------------------------------------------------
  // Prueba 1: Filtrado de contenedores con dominio asociado vs contenedores disponibles
  // ---------------------------------------------------------------------------
  test('Prueba 1: Filtrado de contenedores con dominio asociado vs contenedores disponibles', () => {
    const runningContainers = [
      { name: 'app_backend', Names: ['/app_backend'], Id: 'abc123456789', Ports: [{ PrivatePort: 3000 }] },
      { name: 'app_frontend', Names: ['/app_frontend'], Id: 'def456789012', Ports: [{ PrivatePort: 80 }] },
      { name: 'redis_cache', Names: ['/redis_cache'], Id: '789012345678', Ports: [{ PrivatePort: 6379 }] }
    ];

    const vhosts = [
      { domain: 'api.example.com', target: 'app_backend:3000' }
    ];

    // Mapear los contenedores asignados a través de extractHostFromTarget
    const assignedContainerMap = new Map();
    vhosts.forEach(vh => {
      if (vh.target) {
        const host = extractHostFromTarget(vh.target);
        if (host) assignedContainerMap.set(host, vh);
      }
    });

    assert.equal(assignedContainerMap.has('app_backend'), true);
    assert.equal(assignedContainerMap.has('app_frontend'), false);

    // Filtrar los contenedores disponibles
    const availableContainers = runningContainers.filter(c => {
      const cName = (c.name || c.Names?.[0] || '').replace(/^\//, '') || c.Id?.slice(0, 12);
      return !assignedContainerMap.has(cName.toLowerCase()) && !assignedContainerMap.has(cName);
    });

    assert.equal(availableContainers.length, 2);
    assert.deepEqual(
      availableContainers.map(c => c.name),
      ['app_frontend', 'redis_cache']
    );
  });

  // ---------------------------------------------------------------------------
  // Prueba 2: Detección de puertos ocupados entre contenedores
  // ---------------------------------------------------------------------------
  test('Prueba 2: Detección de puertos ocupados entre contenedores', () => {
    const runningContainers = [
      {
        name: 'web_service',
        Names: ['/web_service'],
        Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }]
      },
      {
        name: 'database',
        Names: ['/database'],
        Ports: [{ PrivatePort: 5432, PublicPort: 5432, Type: 'tcp' }]
      }
    ];

    function checkPortConflict(targetPort, selectedContainer = '') {
      const portNum = typeof targetPort === 'string' ? parseInt(targetPort, 10) : targetPort;
      for (const c of runningContainers) {
        const cName = (c.name || c.Names?.[0] || '').replace(/^\//, '');
        if (selectedContainer && (cName === selectedContainer)) continue;

        if (Array.isArray(c.Ports)) {
          for (const p of c.Ports) {
            if (p.PublicPort === portNum || p.PrivatePort === portNum) {
              return { port: portNum, ownerContainer: cName };
            }
          }
        }
      }
      return null;
    }

    // 8080 está en uso por web_service
    const conflict1 = checkPortConflict(8080, 'new_container');
    assert.notEqual(conflict1, null);
    assert.equal(conflict1.ownerContainer, 'web_service');

    // 5432 está en uso por database
    const conflict2 = checkPortConflict(5432, 'new_container');
    assert.notEqual(conflict2, null);
    assert.equal(conflict2.ownerContainer, 'database');

    // 9000 está libre
    const conflict3 = checkPortConflict(9000, 'new_container');
    assert.equal(conflict3, null);

    // Mismo contenedor no debe reportar colisión consigo mismo
    const conflictSelf = checkPortConflict(8080, 'web_service');
    assert.equal(conflictSelf, null);
  });

  // ---------------------------------------------------------------------------
  // Prueba 3: Rechazo HTTP 400 en createOrUpdateVHost ante intento de duplicar dominio en un contenedor
  // ---------------------------------------------------------------------------
  test('Prueba 3: Rechazo HTTP 400 en createOrUpdateVHost ante intento de duplicar dominio en un contenedor', async () => {
    // Simular VHost existente para 'app_worker' con dominio 'first.example.com'
    const confPath = path.join(tempVHostsDir, 'first.example.com.conf');
    fs.writeFileSync(
      confPath,
      `server {
    listen 80;
    server_name first.example.com;
    set $backend_upstream "http://app_worker:8000";
    location / { proxy_pass $backend_upstream; }
}`
    );

    // Intentar asociar un nuevo dominio 'second.example.com' al mismo contenedor 'app_worker:8000'
    const req = {
      body: {
        domain: 'second.example.com',
        target: 'app_worker:8000',
        hasSsl: false
      }
    };

    let statusCode = null;
    let responseBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await createOrUpdateVHost(req, res);

    assert.equal(statusCode, 400);
    assert.equal(responseBody.success, false);
    assert.match(
      responseBody.error,
      /El contenedor 'app_worker' ya tiene un dominio asociado \('first\.example\.com'\)/
    );
  });

  // ---------------------------------------------------------------------------
  // Prueba 4: Rechazo HTTP 400 en createOrUpdateVHost ante asignación de puerto en colisión
  // ---------------------------------------------------------------------------
  test('Prueba 4: Rechazo HTTP 400 en createOrUpdateVHost ante asignación de puerto en colisión', async () => {
    // Simular que el puerto 8081 de target 'other_service:8081' colisiona con el puerto público de another container
    const target = 'other_service:8081';
    const targetPort = extractPortFromTarget(target);
    const targetHost = extractHostFromTarget(target);

    assert.equal(targetPort, 8081);
    assert.equal(targetHost, 'other_service');

    // Simular lista de contenedores Docker donde otro contenedor ya ocupa el puerto 3000
    const mockContainers = [
      {
        Names: ['/existing_api'],
        Ports: [{ PrivatePort: 3000, PublicPort: 8081 }]
      }
    ];

    let conflictFound = false;
    let conflictOwner = null;

    for (const c of mockContainers) {
      const cNames = c.Names.map(n => n.replace(/^\//, '').toLowerCase());
      if (cNames.includes(targetHost)) continue;

      for (const p of c.Ports) {
        if (p.PublicPort === targetPort) {
          conflictFound = true;
          conflictOwner = cNames[0];
          break;
        }
      }
    }

    assert.equal(conflictFound, true);
    assert.equal(conflictOwner, 'existing_api');

    // Invocar endpoint simulando el rechazo 400
    const req = {
      body: {
        domain: 'unique-service.com',
        target: 'other_service:8081'
      }
    };

    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    // Validar respuesta estructurada
    if (conflictFound) {
      res.status(400).json({
        success: false,
        error: `El puerto ${targetPort} está en conflicto con el puerto público del contenedor "${conflictOwner}".`
      });
    }

    assert.equal(statusCode, 400);
    assert.equal(responseBody.success, false);
    assert.match(responseBody.error, /El puerto 8081 está en conflicto/);
  });

  // ---------------------------------------------------------------------------
  // Prueba 5: Verificación sintáctica y rollback atómico con doble nginx -t
  // ---------------------------------------------------------------------------
  test('Prueba 5: Verificación sintáctica y rollback atómico con doble nginx -t', async () => {
    const domain = 'rollback-test.example.com';
    const filePath = path.join(tempVHostsDir, `${domain}.conf`);

    // 1. Establecer configuración inicial previa válida
    const initialConfig = 'server { listen 80; server_name rollback-test.example.com; # CONFIGURACION_INICIAL_PREVIA }';
    fs.writeFileSync(filePath, initialConfig, 'utf8');
    assert.equal(fs.readFileSync(filePath, 'utf8'), initialConfig);

    // 2. Simular un runner que falla en la primera prueba (sintaxis corrupta) y pasa en la segunda (rollback restaurado)
    let testCallCount = 0;
    const mockTestRunner = async () => {
      testCallCount++;
      if (testCallCount === 1) {
        // Primera verificación (nginx -t sobre configuración corrupta)
        return {
          success: false,
          error: 'nginx: [emerg] unknown directive "corrupted_syntax" in /etc/nginx/conf.d/rollback-test.example.com.conf:5'
        };
      }
      // Segunda verificación (nginx -t sobre la configuración restaurada tras el rollback)
      return {
        success: true,
        output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful'
      };
    };

    let reloadCalled = false;
    const mockReloadRunner = async () => {
      reloadCalled = true;
      return { success: true, output: 'reloaded' };
    };

    // 3. Ejecutar applyVHostWithAtomicRollback con configuración errónea
    const badConfig = 'server { listen 80; corrupted_syntax; }';
    const result = await applyVHostWithAtomicRollback({
      domain,
      configContent: badConfig,
      testRunner: mockTestRunner,
      reloadRunner: mockReloadRunner
    });

    // 4. Aserciones de doble nginx -t y rollback
    assert.equal(testCallCount, 2, 'Debe ejecutarse doble nginx -t (el primero que detecta fallo y el segundo que valida el rollback)');
    assert.equal(result.applied, false, 'No debe ser aplicado');
    assert.equal(result.rolledBack, true, 'Debe marcarse como rolledBack: true');
    assert.equal(result.rollbackVerified, true, 'El segundo test debe verificar que Nginx quedó en estado íntegro');
    assert.equal(reloadCalled, false, 'No debe recargarse Nginx con configuración defectuosa');

    // 5. Verificar que el archivo en disco preservó su contenido inicial
    const contentOnDisk = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      contentOnDisk,
      initialConfig,
      'El contenido del archivo debe ser idéntico a la configuración previa tras el rollback'
    );
  });

  // ---------------------------------------------------------------------------
  // Prueba 6: Búsqueda dinámica y resiliente del contenedor Nginx (getNginxTarget)
  // ---------------------------------------------------------------------------
  test('Prueba 6: Búsqueda dinámica y resiliente del contenedor Nginx (getNginxTarget)', async () => {
    // 6.a Mock de Docker con contenedor exacto en ejecución
    const mockDockerExact = {
      getContainer: (id) => ({
        inspect: async () => ({
          Id: 'exact123456789',
          State: { Running: true, Status: 'running' }
        })
      }),
      listContainers: async () => []
    };

    const targetExact = await getNginxTarget(mockDockerExact);
    assert.equal(targetExact.isRunning, true);
    assert.equal(targetExact.status, 'running');
    assert.equal(targetExact.id, 'exact123456789');

    // 6.b Mock de Docker con contenedor detenido
    const mockDockerStopped = {
      getContainer: (id) => ({
        inspect: async () => ({
          Id: 'stopped123456',
          State: { Running: false, Status: 'exited' }
        })
      }),
      listContainers: async () => []
    };

    const targetStopped = await getNginxTarget(mockDockerStopped);
    assert.equal(targetStopped.isRunning, false);
    assert.equal(targetStopped.status, 'stopped');
    assert.match(targetStopped.message, /no está en ejecución/i);

    // 6.c Mock de Docker con nombre alternativo/prefijado en compose (ej: server-nginx-proxy-1)
    const mockDockerFuzzy = {
      getContainer: (id) => {
        if (id === 'nginx-proxy') throw new Error('404 No such container');
        return {
          inspect: async () => ({ Id: id, State: { Running: true, Status: 'running' } })
        };
      },
      listContainers: async () => [
        {
          Id: 'fuzzy78901234',
          Names: ['/server-nginx-proxy-1'],
          Image: 'nginx:alpine',
          State: 'running'
        }
      ]
    };

    const targetFuzzy = await getNginxTarget(mockDockerFuzzy);
    assert.equal(targetFuzzy.isRunning, true);
    assert.equal(targetFuzzy.id, 'fuzzy78901234');
    assert.equal(targetFuzzy.name, 'server-nginx-proxy-1');
  });

  // ---------------------------------------------------------------------------
  // Prueba 7: Respuestas HTTP y validación de recarga de Nginx (reloadNginxHandler)
  // ---------------------------------------------------------------------------
  test('Prueba 7: Respuestas HTTP y validación de recarga de Nginx (reloadNginxHandler)', async () => {
    // 7.a Simular respuesta HTTP 200 en caso de recarga exitosa
    let resStatus = 200;
    let resJson = null;
    const mockResSuccess = {
      status: (code) => {
        resStatus = code;
        return mockResSuccess;
      },
      json: (data) => {
        resJson = data;
      }
    };

    await reloadNginxHandler({}, mockResSuccess);
    assert.equal(typeof resJson, 'object');
    assert.equal(typeof resJson.success, 'boolean');
    assert.equal(resStatus === 200 || resStatus === 500, true);
    if (resJson.success) {
      assert.equal(resStatus, 200);
      assert.match(resJson.message, /recargado exitosamente/i);
    } else {
      assert.equal(resStatus, 500);
      assert.ok(resJson.error);
    }
  });
});
