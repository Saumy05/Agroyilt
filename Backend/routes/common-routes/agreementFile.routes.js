const express = require('express');
const router = express.Router();
const { downloadByToken } = require('../../controllers/commonControllers/agreementFileController');

// no authenticate: the signed token in the link is the proof (see agreementFileController)
router.get('/:id', downloadByToken);

module.exports = router;
