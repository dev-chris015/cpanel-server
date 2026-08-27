import Docker from 'dockerode';

const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const docker = new Docker({ socketPath });

/**
 * Obtener la lista de todos los contenedores (activos y detenidos)
 */
export const getContainers = async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json({
      success: true,
      count: containers.length,
      data: containers
    });
  } catch (error) {
    console.error('Error al listar contenedores:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo comunicar con el socket de Docker',
      details: error.message
    });
  }
};

/**
 * Desplegar / iniciar un nuevo contenedor de Docker
 */
export const deployContainer = async (req, res) => {
  try {
    const { image, name, ports, env } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la imagen es requerido (ej. nginx:latest)'
      });
    }

    // Descargar la imagen si no existe localmente
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve(output);
        });
      });
    });

    // Mapeo de puertos opcional
    const ExposedPorts = {};
    const PortBindings = {};
    if (ports && Array.isArray(ports)) {
      ports.forEach(({ hostPort, containerPort }) => {
        const key = `${containerPort}/tcp`;
        ExposedPorts[key] = {};
        PortBindings[key] = [{ HostPort: String(hostPort) }];
      });
    }

    const containerOptions = {
      Image: image,
      name: name || undefined,
      ExposedPorts,
      HostConfig: {
        PortBindings,
        AutoRemove: false
      },
      Env: env || []
    };

    const container = await docker.createContainer(containerOptions);
    await container.start();

    const info = await container.inspect();

    res.status(201).json({
      success: true,
      message: `Contenedor ${image} desplegado correctamente`,
      data: {
        id: info.Id,
        name: info.Name,
        status: info.State.Status
      }
    });
  } catch (error) {
    console.error('Error al desplegar contenedor:', error);
    res.status(500).json({
      success: false,
      error: 'Fallo al desplegar el contenedor',
      details: error.message
    });
  }
};

export const startContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true, message: 'Contenedor iniciado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al iniciar', details: error.message });
  }
};

export const stopContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true, message: 'Contenedor detenido' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al detener', details: error.message });
  }
};

export const restartContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ success: true, message: 'Contenedor reiniciado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al reiniciar', details: error.message });
  }
};

export const removeContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.remove({ force: true });
    res.json({ success: true, message: 'Contenedor eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar', details: error.message });
  }
};

export const inspectContainer = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al inspeccionar', details: error.message });
  }
};

export const getContainerLogs = async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    // Fetch logs (last 200 lines)
    const logs = await container.logs({ stdout: true, stderr: true, tail: 200 });
    // Docker multiplexes stdout/stderr, we parse it simply to string
    res.json({ success: true, data: logs.toString('utf8') });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener logs', details: error.message });
  }
};
