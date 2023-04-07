var express = require('express');
var fs = require('fs');
var router = express.Router();

var path = require('path');
var vnum_dir = path.join(__dirname, '../vnum') + '/';

var g_places = [];
var g_json = null;

fs.readFile('./places.json', 'utf8', (error, jsonFile) => {
  if (error) return logger.debug('[DEBUG]'+error);
  const jsonData = JSON.parse(jsonFile);
  g_json = jsonData.places;
  const todos = jsonData.places;
  todos.forEach(todo => {
    g_places.push({ip:todo.ip, name:todo.name, addr:todo.addr, space:todo.space, lat:todo.lat, lon:todo.lon});
  });
});

function fs_read_html(_resp, _html) {
  fs.readFile( vnum_dir + _html, function(err, _data) {
      _resp.writeHead(200, {'Content-Type':'text/html'});
      _resp.end(_data);
  });
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('places', { 
    title: '차량번호 인식 시스템',
    places: g_json,
    marker: JSON.stringify(g_places) 
  });
});

module.exports = router;
