const express = require('express');

module.exports = function(io, raspySockets) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { raspy_id, datos } = req.body;

    if (!raspy_id || !datos) {
      return res.status(400).json({ error: 'Faltan raspy_id o datos' });
    }

    const socketRaspy = raspySockets[raspy_id];

    if (!socketRaspy || !socketRaspy.connected) {
      console.log(`❌ Raspy ${raspy_id} no conectada`);
      return res.status(400).json({ error: `Raspy ${raspy_id} no conectada` });
    }

    console.log(`📤 Enviando datos a ${raspy_id}:`, datos);

    // Emitimos evento específico para esa Raspy
    socketRaspy.emit(`config_${raspy_id}`, datos);

    res.json({ mensaje: 'Datos enviados correctamente' });
  });

  return router;
};
