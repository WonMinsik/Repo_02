var express = require('express');
var router = express.Router();

var path = require('path');
var fs = require('fs');
const logger = require('../utils/logManager');

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
  var directoryPath = path.join(__dirname, '../../files/capture');
  var filename = directoryPath + '/' + req.params.id;
  fs.readFile(filename, function(err, data) {
    if (err) {
      res.writeHead(400, {'Content-type':'text/html'})
      logger.error('[ERROR]'+err);
      res.end("No such image");    
      return;
    }
   
    //specify the content type in the response will be an image
    res.writeHead(200, { 'Content-Type': 'image/jpg',  'refresh' : '1' });
    //res.write('<META HTTP-EQUIV="refresh" CONTENT="1">')
    res.end(data);
    //<META HTTP-EQUIV="refresh" CONTENT="15">
    ////res.write('<html><body><img src="data:image/jpeg;base64,')
    //res.write('<html><script>setTimeout(function(){location.reload();},1000);</script>')
    //res.write('<html><head><meta http-equiv="refresh" content="1"/></head>')
    //res.write('<body><img src="data:image/jpeg;base64,')
    //res.write(data);//Buffer.from(data).toString('base64'));
    //res.end('"/></body></html>');
  });
});



module.exports = router;
