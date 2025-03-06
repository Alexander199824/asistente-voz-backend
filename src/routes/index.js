const express = require('express');
const router = express.Router();
const assistantRoutes = require('./assistantRoutes');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');

// Rutas de API
router.use('/assistant', assistantRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

// Ruta de verificación de estado
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;