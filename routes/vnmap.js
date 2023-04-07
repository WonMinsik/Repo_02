var express = require('express');
var fs = require('fs');
var router = express.Router();

var path = require('path');
var vnum_dir = path.join(__dirname, '../vnum') + '/';

var g_places = null;
fs.readFile('./places.json', 'utf8', (error, jsonFile) => {
  if (error) return logger.debug('[DEBUG]'+error);
  const jsonData = JSON.parse(jsonFile);
  g_places = jsonData.places;
});

function fs_read_html(_resp, _html) {
  fs.readFile( vnum_dir + _html, function(err, _data) {
      _resp.writeHead(200, {'Content-Type':'text/html'});
      _resp.end(_data);
  });
}

/* GET home page. */
router.get('/', function(req, res, next) {
  fs_read_html(res, 'vnview_places.html');
});

module.exports = router;
