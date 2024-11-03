const express = require('express');
const { fetchDailyROI, updateDailyROI, withdraw, invest } = require('../controllers/investmentController');
const router = express.Router();
const authenticate = require('../middleware/authenticate');

router.get('/daily-roi', authenticate, fetchDailyROI);
router.post('/update-daily-roi', authenticate, updateDailyROI);
router.post('/withdraw', authenticate, withdraw);
router.post('/invest', authenticate, invest);

module.exports = router;
