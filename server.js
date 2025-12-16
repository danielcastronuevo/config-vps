const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
const sendRaspyRouter = sendRaspyRoutes(io, raspySockets, raspyClubs, pulserasEnUsoPorClub, pulserasPorRaspy);
app.use('/api/send_raspy', sendRaspyRouter);

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

