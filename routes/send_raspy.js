
const express = require('express');

// 🔹 Tracking de timers de liberación automática
const timersLiberacionPulseras = {}; // raspy_id => timeoutId

// 🔹 Tiempo máximo que pueden estar bloqueadas las pulseras si no se recibe confirmación (5 minutos como red de seguridad)
const MAX_TIEMPO_PULSERA_BLOQUEADA = 5 * 60 * 1000;

module.exports = function(io, raspySockets, raspyClubs, pulserasEnUsoPorClub, pulserasPorRaspy, registrarConfiguracion) {
  const router = express.Router();

  // 🔹 Función auxiliar para liberar pulseras
  function liberarPulseras(raspy_id, motivo) {
    const club = raspyClubs[raspy_id];
    const pulseras = pulserasPorRaspy[raspy_id];

    if (pulseras && club) {
      console.log(`🔓 ${motivo} - Liberando pulseras de ${raspy_id}:`, Array.from(pulseras));
      
      // Eliminar de pulserasEnUso
      if (pulserasEnUsoPorClub[club]) {
        pulseras.forEach(p => pulserasEnUsoPorClub[club].delete(p));
      }
      delete pulserasPorRaspy[raspy_id];

      // Notificar a todos los clientes del club
      const pulserasEnUso = Array.from(pulserasEnUsoPorClub[club] || []);
      io.emit(`pulseras_en_uso_${club}`, { pulserasEnUso });
    }

    // Limpiar el timer
    if (timersLiberacionPulseras[raspy_id]) {
      clearTimeout(timersLiberacionPulseras[raspy_id]);
      delete timersLiberacionPulseras[raspy_id];
    }
  }

  router.post('/', (req, res) => {
    const { raspy_id, datos } = req.body;

    if (!raspy_id || !datos) {
      return res.status(400).json({ error: 'Faltan id o datos' });
    }

    const socketRaspy = raspySockets[raspy_id];
    const club = raspyClubs[raspy_id];  // [NUEVO] Obtener el club

    if (!socketRaspy || !socketRaspy.connected) {
      console.log(`❌ Dispositivo ${raspy_id} no conectado`);
      return res.status(400).json({ error: `Dispositivo ${raspy_id} no conectado` });
    }

    console.log(`🛠️ Partido para ${raspy_id} (Club: ${club})`, JSON.stringify(datos, null, 2));

    // 🔹 Extraer pulseras del partido y guardarlas como "en uso"
    const pulseras = new Set();
    if (datos.pulseras?.pareja1?.nombre) {
      pulseras.add(datos.pulseras.pareja1.nombre);
    }
    if (datos.pulseras?.pareja2?.nombre) {
      pulseras.add(datos.pulseras.pareja2.nombre);
    }

    // Guardar pulseras en uso para esta raspy
    if (pulseras.size > 0) {
      pulserasPorRaspy[raspy_id] = pulseras;

      // Inicializar Set del club si no existe
      if (!pulserasEnUsoPorClub[club]) {
        pulserasEnUsoPorClub[club] = new Set();
      }

      // Agregar pulseras al club
      pulseras.forEach(p => pulserasEnUsoPorClub[club].add(p));

      console.log(`🔒 Pulseras en uso para ${club}:`, Array.from(pulserasEnUsoPorClub[club]));

      // 🔹 Notificar a todos los clientes del club qué pulseras están en uso
      const pulserasEnUso = Array.from(pulserasEnUsoPorClub[club]);
      io.emit(`pulseras_en_uso_${club}`, { pulserasEnUso });

      // 🔹 Cancelar timer anterior si existe
      if (timersLiberacionPulseras[raspy_id]) {
        clearTimeout(timersLiberacionPulseras[raspy_id]);
      }

      // 🔹 Crear nuevo timer: si no se recibe confirmación de finalización en 5 min, liberar automáticamente
      timersLiberacionPulseras[raspy_id] = setTimeout(() => {
        liberarPulseras(raspy_id, `⏱️ TIMEOUT (5 min) - No se recibió confirmación de finalización, liberando por seguridad`);
      }, MAX_TIEMPO_PULSERA_BLOQUEADA);

      console.log(`⏰ Timer de seguridad iniciado: pulseras se liberarán automáticamente en 5 minutos si no se recibe confirmación`);
    }

    socketRaspy.emit(`config_${raspy_id}`, datos);

    // 📊 Registrar configuración enviada exitosamente
    registrarConfiguracion(raspy_id, club, datos);

    res.json({ mensaje: 'Datos enviados correctamente', club });
  });

  // 🔹 Exportar función de liberación para que server.js la use
  router.liberarPulseras = liberarPulseras;
  router.timersLiberacionPulseras = timersLiberacionPulseras;

  return router;
};
