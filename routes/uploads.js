var express = require('express');
var router = express.Router();

var path = require('path');
var fs = require('fs');

/* GET home page. */
router.get('/', function(req, res, next) {
  var dir = path.join(__dirname, '../uploads') + '/';

  var files = fs.readdirSync(dir)
              .map(function(v) { 
                  return { name:v,
                           time:fs.statSync(dir + v).mtime.getTime()
                         }; 
               })
               .sort(function(a, b) { return b.time - a.time; })
               .map(function(v) { return v.name; });

  res.render('uploads', { title: 'Snapshots', files: files });
});

router.get('/:id', function(req, res) {
  var directoryPath = path.join(__dirname, '../uploads');
  var filename = directoryPath + '/' + req.params.id;
  fs.readFile(filename, function(err, data) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

module.exports = router;
