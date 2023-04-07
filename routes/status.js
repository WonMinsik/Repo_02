var express = require('express');
var router = express.Router();

var db = require('../db');
var mngEdge = require('../utils/edgeManager');
const logger = require('../utils/logManager');
var mngPlace = require('../utils/placeManager');

var edgeSystemStateMap = mngPlace.edgeSystemStateMap;


router.post('/:id', function(req, res, next) {
  var host = req.params.id;
  logger.info('[INFO]'+'status.js /'+host);

  var edgeState = edgeSystemStateMap.get(host);
  if ((edgeState == null) || (typeof(edgeState) === undefined)) {
    return res.status(404).json({
      "error": "invalid edge device address"
    });
  }

  var body = req.body;

  if(body == null || body === undefined){
    return res.status(404).json({
      "error": "invalid status"
    });
  }
  else {
    return res.status(200).json({
      "result": "ok"
    });
  }
});

module.exports = router;
