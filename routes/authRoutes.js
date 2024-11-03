const express = require('express');
const { register, login, logout, fetchUserData } = require('../controllers/authController');
const router = express.Router();
const authenticate = require('../middleware/authenticate');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/user', authenticate, fetchUserData);

module.exports = router;
