var express = require('express');
var router = express.Router();
var mngEdge = require('../utils/edgeManager');
var mngPlace = require('../utils/placeManager');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { 
    title: '전기차 충전소 인식 시스템' 
  });
});

module.exports = router;
