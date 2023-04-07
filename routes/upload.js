var express = require('express');
var router = express.Router();

var path = require('path');
var fs = require('fs');
var pool = require('../db');

var g_page = 'upload';
var emitter = require('../utils/emitter');
// var g_emitter = emitter_js.emitter;

var file_dir = path.join(__dirname, '../../files/'); // Original Path : /data/plate_detect/file
var capture_file_dir = file_dir + 'status/cap/';
var capture_link_dir = file_dir + 'status/';
var capture_

function getIP(_req) {
  var ip = _req.headers['x-forwarded-for'] ||
      _req.connection.remoteAddress ||
      _req.socket.remoteAddress ||
      _req.connection.socket.remoteAddress;
  ip = ip.split(',')[0];
  ip = ip.split(':').slice(-1); //in case the ip returned in a format: "::ffff:146.xxx.xxx.xxx"
  return ip;
}

function get_tr_id(_file) {
  var split_str = _file.split('-')[1];
  //logger.debug('[DEBUG]'+'upload::get_tr_id() 1 - '+split_str);
  split_str = split_str.split('.')[0];
  //logger.debug('[DEBUG]'+'upload::get_tr_id() 2 - '+split_str);
  return parseInt(split_str);
}

var multer = require('multer'); //multer 모듈 import
const logger = require('../utils/logManager');

// 업로드 경로 설정, 미리 폴더를 만들어놔야 하며, 경로 맨 앞에 '/'는 붙이지 않습니다.
// var upload = multer({dest: 'public/images/yesno/'});
// multer 의 diskStorage를 정의
var upload = multer({
  storage: multer.diskStorage({ // 서버에서 파일저장 관리
    //경로 설정
    destination: function (req, file, cb) {
      //cb(null, 'uploads/'); // 'publics/images/'

      var tr_id = get_tr_id(file.originalname);
      var file_path = undefined;
      //테스트용 스냅샷?
      if (tr_id == 99999) {
        //var host = getIP(req);
        //_file_delete(host);
        //cb(null, file_dir + 'view');
        file_path = file_dir + 'view';
      }
      //현황판 스냅샷 (tr_id = 8888) (현황판 스냅샷)
      else if (tr_id == 88888) {
        cb(null, file_dir + 'status/cap');
        file_path = file_dir + 'status/cap';
      }
      //home화면 스냅샷 (tr_id = 12345) (스냅샷화면용)
      else {
        cb(null, file_dir + 'capture');
        file_path = file_dir + 'capture';
      }

      if(file_path == undefined)
      {
        logger.error('[ERROR]'+'[ERROR] Upload.js - multer [F_PATH] : GET FILE PATH FAILED !!');
      }
      else
      {
        logger.debug('[DEBUG]'+'[DEBUG] Upload.js - multer [F_PATH] : ' + file_path);
      }
      cb(null, file_path)
    },

    //실제 저장되는 파일명 설정
    filename: function (req, file, cb) {
      var tr_id = get_tr_id(file.originalname);
      var upload_file = undefined;
      //테스트용 스냅샷?
      if (tr_id == 99999) {
        upload_file = getIP(req) + '.jpg';
        // cb(null, upload_file);
      }
      //현황판 스냅샷
      else if (tr_id == 88888) {
        upload_file = getIP(req) + '.jpg';
        // cb(null, upload_file);
      }
      //home화면 스냅샷 (tr_id = 12345) (스냅샷화면용)
      else {
        upload_file = new Date().toISOString().replace(/-/gi, '').replace(/:/gi, '').replace(/T/, '').replace(/\..+/, '') + '_' + file.originalname;
        // cb(null, upload_file);
      }

      if(upload_file == undefined)
      {
        logger.error('[ERROR]'+'[UPLOAD] Upload.js - multer [F_NAME] : GET FILE NAME FAILED !!');
      }
      else
      {
        logger.debug('[DEBUG]'+'[UPLOAD] Upload.js - multer [F_NAME] : ' + upload_file);
      }

      cb(null, upload_file);

    }
  }),
});

//파일이 여러개이므로 두번째 인자에 upload.array(name) 을 이용
//혹시 파일이 한개인 경우는 upload.single(name)을 이용
router.post('/', upload.single('snapshot'), (req, res) => {
  var host = getIP(req);
  var file = req.file.filename;

  // logger.debug('[DEBUG]'+'remote_ip:'+ host);
  // logger.debug('[DEBUG]'+'req.file  :' + file);
  // logger.debug('[DEBUG]'+req.file);

  var file_path = req.file.path;
  var link_path = file_dir + 'status/' + 'cap_' + host + '.jpg';

  logger.debug('[DEBUG]'+'req.file.path: ' + req.file.path);
  logger.debug('[DEBUG]'+' link        : ' + link_path);

  try {
    if(fs.existsSync(file_path))
      fs.unlinkSync(link_path);
  }
  catch (e) {
    logger.error('[UPLOAD] FILE UNLINK ERROR : '+ e);
  } finally {
    try {
      if(fs.existsSync(file_path))
        fs.symlinkSync(file_path, link_path);
    }
    catch (e) {
      logger.error('[UPLOAD] FILE SYMBOLIC LINK ERROR : '+ e);
    }
  }
  
  emitter.emit('VNPLACE_POPUP_VIEW', host, file);

  return res.status(200).json({'message':'업로드 성공!'});
});

async function _file_delete(_addr) {
  const connection = await pool.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    //var query = util.format('SELECT * FROM space WHERE ip = \'%s\'', _addr);
    var query = 'SELECT * FROM space WHERE ip = \''+_addr+'\'';
    // logger.debug('[DEBUG]'+'upload::_file_delete() '+ query);

    var [rows] = await connection.query(query);
    // logger.debug('[DEBUG]'+rows);

    if (rows.length > 0) {
      var row = rows[0];
      if (row.path != '') {// delete a file
        var path = file_dir + 'view/'+row.path;
        fs.unlinkSync(path);
        // logger.debug('[DEBUG]'+'upload::_file_delete() File is deleted. '+path);
      }
    }
  }
  catch (exception) {
  }
  finally {
    connection.release();
  }
}

function _db_update_space(_addr, _path) { // state : true/false, 주차중인지 여부
  var sql =  'UPDATE space SET path=\''+_path+'\' WHERE ip=\''+_addr+'\'';
  _db_execute(sql);
}

async function _db_execute(_sql) {
  const connection = await pool.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    logger.info('[INFO]'+'upload::_db_execute() '+_sql);
    var result = await connection.execute(_sql);
    //logger.debug('[DEBUG]'+result);
    await connection.commit();
  }
  catch (exception) {
    // logger.debug('[DEBUG]'+'upload::_db_execute() - _sql [_sql] => exception ['+exception+']');
    logger.error('[ERROR]'+exception);
  }
  finally {
    connection.release();
  }
}

module.exports = router;

  //===============================================================================================
  //2. HTML 구조
  //form 안에 input type="FILE"이 여러개 있을 수 있는 형태입니다.
  //DB의 PK는 TEST_SN + Q_SN  형태로 저장됩니다. (갑자기 PK 구조를 언급한 이유는 뒤에 나옵니다.)
  //form의 method는 POST, enctype은 'multipart/form-data'로 설정해야 합니다.
  //<form name="questionForm" method="post" enctype="multipart/form-data" action="/test/save">
  //<input type="hidden" name="TEST_SN" value="1">

  //<ul id="questionFormList">
  //  <li>
  //    <input type="hidden" name="Q_SN" value="2">
  //    <input type="file" name="IMG_FILE">
  //  </li>
  //  <li>
  //    ...
  //  </li>
  //  ...
  //</ul>
  //<input type="submit" value="전송">
  //</form>
