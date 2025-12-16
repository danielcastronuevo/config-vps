
const express = require('express');

module.exports = function(io, raspySockets, raspyClubs) {
  const router = express.Router();

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

    socketRaspy.emit(`config_${raspy_id}`, datos);

    res.json({ mensaje: 'Datos enviados correctamente', club });
  });

  return router;
};
