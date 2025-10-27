
const express = require('express');

module.exports = function(io, raspySockets) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { raspy_id, datos } = req.body;

    if (!raspy_id || !datos) {
      return res.status(400).json({ error: 'Faltan id o datos' });
    }

    const socketRaspy = raspySockets[raspy_id];

    if (!socketRaspy || !socketRaspy.connected) {
      console.log(`❌ Dispositivo ${raspy_id} no conectado`);
      return res.status(400).json({ error: `Dispositivo ${raspy_id} no conectado` });
    }

    // ✅ Loguear el objeto que realmente llegó al servidor
    console.log("🛠️ Partido configurado recibido en el servidor:", JSON.stringify(datos, null, 2));

    // Emitimos evento específico para esa Raspy
    socketRaspy.emit(`config_${raspy_id}`, datos);

    res.json({ mensaje: 'Datos enviados correctamente' });
  });

  return router;
};

