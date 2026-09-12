// src/routes/classPerformanceRoutes.js
const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const authMiddleware = require('../middleware/authMiddleware');

//  ClassPerformanceScreen ke endpoints
router.get('/teacher/classes', authMiddleware.authenticate, teacherController.getAssignedClassesForPerformance);
router.post('/initialize', authMiddleware.authenticate, teacherController.initializeClassPerformance);
router.post('/', authMiddleware.authenticate, teacherController.saveClassPerformanceFull);
router.put('/:class_id', authMiddleware.authenticate, teacherController.saveClassPerformanceFull);
router.get('/:class_id', authMiddleware.authenticate, teacherController.getClassPerformanceFull);

module.exports = router;