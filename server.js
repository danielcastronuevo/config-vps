const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ====================================
// Sistema de Reportes
// ====================================
const REPORTS_DIR = path.join(__dirname, 'reports');

// Crear carpeta reports si no existe
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Función para registrar accesos
function registrarAcceso(raspy_id, tipo = 'acceso') {
  const ahora = new Date();
  const timestamp = ahora.toISOString();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  
  const reportPath = path.join(REPORTS_DIR, `${fecha}.json`);
  
  let registros = [];
  if (fs.existsSync(reportPath)) {
    try {
      registros = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      console.error('Error leyendo reporte:', err);
    }
  }
  
  registros.push({
    timestamp,
    raspy_id,
    tipo
  });
  
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`📊 Acceso registrado: ${raspy_id}`);
}

// Función para registrar configuraciones
function registrarConfiguracion(raspy_id, club, datosPartido) {
  const ahora = new Date();
  const timestamp = ahora.toISOString();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  
  const reportPath = path.join(REPORTS_DIR, `${fecha}.json`);
  
  let registros = [];
  if (fs.existsSync(reportPath)) {
    try {
      registros = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      console.error('Error leyendo reporte:', err);
    }
  }
  
  registros.push({
    timestamp,
    raspy_id,
    club,
    tipo: 'configuracion_enviada',
    partido: {
      jugadores: datosPartido.jugadores,
      parejas: datosPartido.parejas,
      pulseras: {
        pareja1: datosPartido.pulseras?.pareja1?.nombre,
        pareja2: datosPartido.pulseras?.pareja2?.nombre
      },
      duracion: datosPartido.duracion,
      comienzo: datosPartido.comienzo,
      fin: datosPartido.fin,
      tiempoCalentamiento: datosPartido.tiempoCalentamiento,
      cambioDeLado: datosPartido.cambioDeLado,
      tipoGames: datosPartido.tipoGames
    }
  });
  
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`📊 Configuración registrada para ${raspy_id}`);
}

// Función para registrar feedback
function registrarFeedback(raspy_id, club, mensaje) {
  const ahora = new Date();
  const timestamp = ahora.toISOString();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  
  const MENSAJES_DIR = path.join(__dirname, 'mensajes');
  
  // Crear carpeta mensajes si no existe
  if (!fs.existsSync(MENSAJES_DIR)) {
    fs.mkdirSync(MENSAJES_DIR, { recursive: true });
  }
  
  const reportPath = path.join(MENSAJES_DIR, `${fecha}.json`);
  
  let registros = [];
  if (fs.existsSync(reportPath)) {
    try {
      registros = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      console.error('Error leyendo mensajes:', err);
    }
  }
  
  registros.push({
    timestamp,
    raspy_id,
    club,
    mensaje
  });
  
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`💬 Feedback registrado de ${raspy_id}`);
}

// ====================================
// Registro de Raspys conectadas y clientes
// ====================================
const raspySockets = {};       // raspy_id => socket
const raspyClubs = {};    // raspy_id => club  [NUEVO]
const clientesConfig = {};     // socket.id => raspy_id
const estadoCanchaActual = {}; // raspy_id => { enEspera: true/false, ... }
const pulserasEnUsoPorClub = {}; // club => Set de pulseras en uso
const pulserasPorRaspy = {};   // raspy_id => Set de pulseras que configuró

// ====================================
// Rutas para enviar datos a Raspy
// ====================================
const sendRaspyRoutes = require('./routes/send_raspy');
const sendRaspyRouter = sendRaspyRoutes(io, raspySockets, raspyClubs, pulserasEnUsoPorClub, pulserasPorRaspy, registrarConfiguracion);
app.use('/api/send_raspy', sendRaspyRouter);

// ====================================
// Endpoint para registrar accesos
// ====================================
app.post('/api/registrar_acceso', (req, res) => {
  const { raspy_id, tipo } = req.body;
  
  if (!raspy_id) {
    return res.status(400).json({ error: 'Falta raspy_id' });
  }
  
  registrarAcceso(raspy_id, tipo || 'acceso');
  res.json({ mensaje: 'Acceso registrado' });
});

// ====================================
// Endpoint para enviar feedback
// ====================================
app.post('/api/enviar_feedback', (req, res) => {
  const { raspy_id, club, mensaje } = req.body;
  
  if (!raspy_id || !mensaje) {
    return res.status(400).json({ error: 'Faltan raspy_id o mensaje' });
  }
  
  registrarFeedback(raspy_id, club || 'desconocido', mensaje);
  res.json({ mensaje: 'Feedback registrado exitosamente' });
});

// ====================================
// Conexión de clientes (Raspys u otros)
// ====================================
io.on('connection', (socket) => {
  console.log('⚡ Nuevo cliente conectado');

  // Registrar Raspy
  socket.on('register_raspy', ({ raspy_id, club }) => {
    raspySockets[raspy_id] = socket;
    raspyClubs[raspy_id] = club;  // [NUEVO] Guardar el club
    console.log(`✅ ID registrada: ${raspy_id} - Club: ${club}`);
    
    // 📊 Registrar acceso
    registrarAcceso(raspy_id, 'inicio_de_sesion');
  });

  // Registrar clientes de configuración que quieren ver una Raspy específica
  socket.on('consultar_raspy', ({ raspy_id }) => {
    clientesConfig[socket.id] = raspy_id;
    const club = raspyClubs[raspy_id];
    console.log(`📡 Cliente ${socket.id} consulta ID: ${raspy_id}`);

    // Enviar inmediatamente el estado actual si existe
    if (estadoCanchaActual[raspy_id]) {
      socket.emit(`estado_cancha_${raspy_id}`, estadoCanchaActual[raspy_id]);
    }

    // 🔹 Enviar pulseras en uso del club
    if (club) {
      const pulserasEnUso = Array.from(pulserasEnUsoPorClub[club] || []);
      socket.emit(`pulseras_en_uso_${club}`, { pulserasEnUso });
    }
  });

  // Escuchar estado de cancha desde la Raspy
  socket.on('estado_cancha', (datos) => {
    const { raspy_id, enEspera, estado } = datos;
    console.log(`🟢 Estado cancha recibido de ${raspy_id}:`, datos);

    // Guardar estado actual en la VPS
    estadoCanchaActual[raspy_id] = { enEspera, estado };

    // 🔹 Si el partido terminó (enEspera = true), liberar pulseras y cancelar timeout
    if (enEspera === true && pulserasPorRaspy[raspy_id]) {
      sendRaspyRouter.liberarPulseras(raspy_id, '✅ Partido finalizado (confirmado por Raspy)');
    }

    // 🔹 Reenviar solo a clientes que consultan esta raspy
    for (const [clienteId, idRaspy] of Object.entries(clientesConfig)) {
      if (idRaspy === raspy_id) {
        io.to(clienteId).emit(`estado_cancha_${raspy_id}`, datos);
      }
    }
  });



  // Desconexión
  socket.on('disconnect', () => {
    // Si era una Raspy
    for (const [id, s] of Object.entries(raspySockets)) {
      if (s.id === socket.id) {
        const club = raspyClubs[id];
        delete raspySockets[id];
        console.log(`🔴 ID desconectada: ${id}`);

        // 🔹 Avisar a todos los clientes que consultaban esta Raspy
        for (const [clienteId, idRaspy] of Object.entries(clientesConfig)) {
          if (idRaspy === id) {
            io.to(clienteId).emit(`estado_cancha_${id}`, { enEspera: null });
          }
        }

        // 🔹 Limpiar su estado actual y liberar pulseras
        delete estadoCanchaActual[id];
        if (pulserasPorRaspy[id]) {
          sendRaspyRouter.liberarPulseras(id, '🔌 Raspy desconectada - Liberando pulseras de seguridad');
        }
        break;
      }
    }

    // Si era un cliente de configuración
    if (clientesConfig[socket.id]) {
      console.log(`🔴 Cliente de configuración desconectado: ${socket.id}`);
      delete clientesConfig[socket.id];
    }
  });

});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

