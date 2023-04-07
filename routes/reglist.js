var express = require('express');
var router = express.Router();

var emitter = require('../utils/emitter');
var mngEdge = require('../utils/edgeManager');
var mngPlace = require('../utils/placeManager');

var fs = require('fs');
var path = require('path');
var db = require('../db');
const logger = require('../utils/logManager');

const locationName = 'reglist';  

//=================================================================================================
// Global variable
//-------------------------------------------------------------------------------------------------

var vnum_dir = path.join(__dirname, '../vnum') + '/';
var file_dir = path.join(__dirname, '../../files') + '/'; // Original Path : /data/plate_detect/file
var image_dir = file_dir + 'plate/';
var view_dir = file_dir + 'view/';

var g_page = 'reglist';
var g_resp = null;
var g_status_resp = null;
var g_db_count = 0;
var g_db_page = 0;
var g_db_list = [];
var g_p_ofs = 0;
var g_p_cnt = 0;
var g_evnum_list= [];

//=================================================================================================
// Function
//-------------------------------------------------------------------------------------------------
async function get_evnum_list() {
  
  const connection = await db.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    
    var [rows] = await connection.query('SELECT * FROM evnum ORDER BY _ID DESC ');

    var a_evnum_list = array_clear(g_evnum_list);

    // auth = 0:자동등록, 1:사용자 등록, 2:국토부 연결 등록 (국토부 연결되면 fuel값 저장)
    rows.forEach(row => {
      a_evnum_list.push({
        _PID: row._ID,
        number: row.number,
        auth: row.auth,
        // fuel: row.fuel,
        // fuel_s: row.fuel_s,
        v_auth: (row.auth == 0 ? '자동' : (row.auth == 1 ? '사용자' : (row.auth == 2 ? '국토부' : '알수없음')) ),
        v_code: (row.fuel_s != null ? (row.fuel_s != '' ? _fuel_code(row.fuel_s) : '전기') : '전기')
      });
    });

    return a_evnum_list;
  }
  catch (ex) {
    logger.error('[ERROR]'+ex);
  }
  finally {
    connection.release();
  }
}


async function sleep(t){
  return new Promise(resolve=>setTimeout(resolve,t));
}

function fs_read_html(_resp, _html) {
  if (_resp) {
    fs.readFile( vnum_dir + _html, function(err, _data) {
      _resp.writeHead(200, {'Content-Type':'text/html'});
      _resp.end(_data);
    });
  }
}
function _fuel_code(_fuel_code) {
  if (_fuel_code == 'a') return '휘발유';
  else if (_fuel_code == 'b') return '경유';
  else if (_fuel_code == 'c') return '엘피지';
  else if (_fuel_code == 'd') return '등유';
  else if (_fuel_code == 'e') return '전기';
  else if (_fuel_code == 'f') return '알코올';
  else if (_fuel_code == 'g') return '휘발유(유연)';
  else if (_fuel_code == 'h') return '휘발유(무연)';
  else if (_fuel_code == 'i') return '태양열';
  else if (_fuel_code == 'j') return 'CNG';
  else if (_fuel_code == 'k') return 'LNG';
  else if (_fuel_code == 'l') return '하이브리드(휴발유+전기)';
  else if (_fuel_code == 'm') return '하이브리드(경유+전기)';
  else if (_fuel_code == 'n') return '하이브리드(LPG+전기)';
  else if (_fuel_code == 'o') return '하이브리드(CNG+전기)';
  else if (_fuel_code == 'p') return '하이브리드(LNG+전기)';
  return '기타연료 ('+_fuel_code+')';  //'z':기타연료
}

function array_clear(_array) {
  if (_array && _array.length > 0) _array.splice(0, _array.length);
  return _array;
}

function get_2num(_val) {
  if (_val < 10) return '0'+_val;
  return _val;
}

function get_db_date_string(_time) {
  var times  = new Date(_time);
  return times.getFullYear()+'-'
       + get_2num(times.getMonth()+1)+'-'
       + get_2num(times.getDate());
}

// _cmd = 0:삭제, 1:등록, 2:update
async function reg_ev_num(_cmd, _id, _num, _resp = null) {
  logger.info('[INFO]'+'reglist::reg_ev_num: _cmd['+_cmd+'] _id['+_id+'] _num['+_num+']');

  const connection = await db.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    // 등록
    if (_cmd == 1) {
      var [rows] = await connection.query('SELECT * FROM evnum WHERE number = ? ORDER BY _ID DESC', [_num]);
      //logger.debug('[DEBUG]'+rows);

      if (rows.length == 0) {
        var [result] = await connection.execute('INSERT IGNORE INTO evnum (_ID, number, auth, fuel) VALUES (NULL, ?, 1, 0);', [_num]);

        // auth = 0:자동등록, 1:사용자 등록, 2:국토부 연결 등록 (국토부 연결되면 fuel값 저장)
        logger.info('[INFO]'+'reglist::reg_ev_num() - result: ' + result.affectedRows + ' rows inserted');

        //emitter.emit('_on_ev_list', g_page, g_p_ofs,  g_p_cnt);
        //_db_list_render(_resp, g_p_ofs,  g_p_cnt);

        // if (_resp) _resp.status(201).json({
        //   'event' : {
        //     'type' :  'Register', // 등록, 삭제
        //     'status' : 'ok' // response
        //   }
        // })
      }
      else {
        logger.debug('[DEBUG]'+"reglist::reg_ev_num() - " + _num + " exists");
      }
    }
    // 삭제
    else if (_cmd == 0) {
      var [result] = await connection.execute('DELETE FROM evnum WHERE _ID=?', [_id]);

      logger.info('[INFO]'+'reglist::reg_ev_num() - result: ' + result.affectedRows + ' rows deleted');

      //emitter.emit('_on_ev_list', g_page, g_p_ofs,  g_p_cnt);
      //_db_list_render(_resp, g_p_ofs,  g_p_cnt);

      // if (_resp) _resp.status(201).json({
      //   'event' : {
      //     'type' :  'Delete', // 등록, 삭제
      //     'status' : 'ok' // response
      //   }
      // })
    }
    // Update 
    else if (_cmd == 2) {
      var [result] = await connection.execute('UPDATE evnum SET fuel=? WHERE _ID=?', [_num, _id]);
    }

    await connection.commit();
  }
  catch (exception) {
    logger.error('[ERROR]'+exception);
  }
  finally {
    connection.release();
  }
}

async function _db_list_count() {
  const connection = await db.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    var [rows] = await connection.query('SELECT COUNT(*) AS evCount FROM evnum');
    //logger.debug('[DEBUG]'+rows);
    g_db_count = rows[0].evCount;
    g_db_page = parseInt(g_db_count / 12);
    logger.debug('[DEBUG]'+'reglist::_db_list_count() - EV Count : '+g_db_count+' Page : '+g_db_page);
    await connection.commit();
  }
  catch (ex) {
    logger.error('[ERROR]'+ex);
  }
  finally {
    connection.release();
  }
}

async function _db_list_render(_resp, _ofs, _cnt) {
  if (_resp) {

    const connection = await db.getConnection(async conn => conn);
    await connection.beginTransaction();
  
    try {
      // list에서 자동 등록 제외, (auth = 0:자동등록, 1:사용자 등록, 2:국토부)
      var [rows] = await connection.query('SELECT COUNT(*) AS evCount FROM evnum');
  
      g_p_ofs = parseInt(_ofs);
      g_p_cnt = parseInt(_cnt);

      g_db_count = rows[0].evCount;
      g_db_page = parseInt(g_db_count / _cnt);
      if ((g_db_page*_cnt) < g_db_count) g_db_page++;

      logger.debug('[DEBUG]'+'reglist::_db_list_render() - EV Count : '+g_db_count+' Page : '+g_db_page +' g_p_ofs : '+g_p_ofs +' g_db_page :'+g_db_page);
  
      if (g_db_count > 0) {
        // list에서 자동 등록 제외, (auth = 0:자동등록, 1:사용자 등록, 2:국토부)
        var [rows] = await connection.query('SELECT * FROM evnum ORDER BY _ID DESC LIMIT ?, ?', [g_p_ofs, g_p_cnt]);
        //var [rows] = await connection.query('SELECT * FROM evnum');
  
        var a_list = array_clear(g_db_list);

        // auth = 0:자동등록, 1:사용자 등록, 2:국토부 연결 등록 (국토부 연결되면 fuel값 저장)
        rows.forEach(row => {
          a_list.push({
            _ID: row._ID,
            number: row.number,
            auth: row.auth,
            fuel: row.fuel,
            fuel_s: row.fuel_s,
            v_auth: (row.auth == 0 ? '자동' : (row.auth == 1 ? '사용자' : (row.auth == 2 ? '국토부' : '알수없음')) ),
            v_code: (row.fuel_s != null ? (row.fuel_s != '' ? _fuel_code(row.fuel_s) : '전기') : '전기')
          });
        });
  
        var page_num = (g_p_ofs / g_p_cnt);
        var page_start = (parseInt(page_num / 10) * 10);
        var page_end = page_start+10;
        logger.debug('[DEBUG]'+'reglist::_db_list_render() - page_start : '+page_start+' page_end : '+page_end+' page_num :'+page_num);

        _resp.render('reglist', {
          title: '전기차 등록차량 편집',
          list_count: g_db_count,
          list_page: g_db_page,
          page_start: page_start,
          page_end: page_end,
          page_num: page_num,
          ev_size: a_list.length,
          ev_list: a_list
        });
      }
    }
    catch (ex) {
      logger.error('[ERROR]'+ex);
    }
    finally {
      connection.release();
    }
  }
  //if (_resp) _resp.end();
}

async function _db_search_render(_resp, _num) {
  const connection = await db.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    var [rows] = await connection.query('SELECT * FROM evnum WHERE number = ? ORDER BY _ID DESC', [_num]);
    logger.debug('[DEBUG]'+'reglist::_db_search_render() - rows.length : '+rows.length);

    var message = '';

    if (rows.length > 0) {
      var row = rows[0];
      // auth = 0:자동등록, 1:사용자 등록, 2:국토부 연결 등록 (국토부 연결되면 fuel값 저장)
      message = 'PID : '+row._ID
        + ', Number : '+row.number
        + ', Type : '+(row.auth == 0 ? '자동' : (row.auth == 1 ? '사용자' : (row.auth == 2 ? '국토부' : '알수없음')) )
        + ', Code : '+(row.fuel_s != null ? (row.fuel_s != '' ? _fuel_code(row.fuel_s) : '전기') : '전기');
    }
    else {
      message = '['+_num + '] 찾을수 없습니다.';
    }

    await connection.commit();

    if (_resp) {
      _resp.write('data:'
        + '{\"d_type\": 1'
        + ', \"d_message\": \"' + message
        + '\"}\n\n');
    }
  
    logger.debug('[DEBUG]'+'reglist::_db_search_render() 1 - message : '+message);

  }
  catch (ex) {
    logger.error('[ERROR]'+ex);
  }
  finally {
    connection.release();
  }
}

//=================================================================================================
// EventEmitter
//-------------------------------------------------------------------------------------------------
emitter.on('_on_ev_list', function (_page, _ofset=0, _count=12) {
  logger.debug('[DEBUG]'+'reglist::_on_ev_list() - _page['+_page+'] _ofset['+_ofset+'] _count['+_count+']');
  if (_page == g_page)  {
    //g_p_ofs = parseInt(_ofset);
    //g_p_cnt = parseInt(_count);
    _db_list_render(g_resp, _ofset, _count);
  }
});

emitter.on('_on_ev_search', function (_page, _num) {
  logger.debug('[DEBUG]'+'reglist::_on_ev_search() - _page['+_page+'] _num['+_num+']');
  if (_page == g_page)  {
      _db_search_render(g_resp,_num);
  }
});

emitter.on('_on_ev_command', function (_page, _cmd, _val1, _val2, _resp) {
  logger.debug('[DEBUG]'+'reglist::_on_ev_command() - _page['+_page+'] __cmd['+_cmd+'] _val1['+_val1+'] _val2['+_val2+']');
  if (_page == g_page)  {
    on_command(_cmd, _val1, _val2, _resp);
  }
});

//=================================================================================================
// Router
//-------------------------------------------------------------------------------------------------

/* GET users listing. */
router.get('/', function(req, res, next) {
  logger.info('[INFO]'+'reglist.js - /  ');

  if(req.session.user == undefined) {
    require('../utils/browser').ShowAlertMove(res, '로그인 정보가 없습니다.', 'login');
  } else {
    req.session.user.lastLocation = locationName;
  }

  g_resp = res;
  g_p_ofs = 0;
  g_p_cnt = 12;

  //_db_list_count();

  //_db_list_render(res);
  emitter.emit('_on_ev_list', g_page, g_p_ofs, g_p_cnt);
});

// GET specific index
// router.get('/:id', function(req, res, next) {
//   logger.debug('[DEBUG]'+'vnlist.js - /  '+ req.params.id);
// });

router.get('/list/', function(req, res, next) {
  logger.info('[INFO]'+'reglist.js - /list  '+ req.params.id);
  var ofs = req.query.ofs;
  var cnt = req.query.cnt;

  g_resp = res;
  if (ofs == null || ofs == '') {
    ofs = 0;
  }
  if (cnt == null || cnt == '') {
    cnt = 12;
  }

  g_p_ofs = parseInt(ofs);
  g_p_cnt = parseInt(cnt);

  //_db_list_count();

  logger.info('[INFO]'+'reglist.js - ['+g_p_ofs+'] ['+g_p_cnt+']');

  emitter.emit('_on_ev_list', g_page, g_p_ofs,  g_p_cnt);
});
router.get('/status/:id', async function(req, res, next) {
  logger.info('[INFO]'+'reglist.js - /status '+ req.params.id);

  if(req.session.user.lastLocation !== locationName) {
    res.redirect('/'+locationName);
    return;
  }
  //g_resp = res;
  g_status_resp = res;
  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });
  // res.flushHeaders();

  //emitter.emit('_on_req_status', g_page, -1, -1, null);

  //while (true) {
  //  await new Promise(resolve => setTimeout(resolve, 5000));
  //  var jinfo = g_vinfos.get(req.params.id);
  //  if (jinfo) {
  //    req_on_system(jinfo.index, jinfo.addr_s, null);
  //  }
  //}
});

async function on_command(_cmd, _val1, _val2, _resp) {
  switch (_cmd) {
    case 8: // 자동차 번호 등록
      reg_ev_num(1, _val1, _val2, _resp);
      return ;
    case 9: // 자동차 번호 삭제
      reg_ev_num(0, _val1, _val2, _resp);
      return ;
    case 10: // 검색
      //_on_db_list(res, ip, val1,  val2);
      //emitter.emit('_on_db_list', g_page, val1,  val2);
      //emitter.emit('_on_ev_list', g_page, ofs,  cnt);
      //g_resp = _resp;
      //emitter.emit('_on_ev_search', g_page, _val1);
      _db_search_render(g_status_resp, _val1);
      return ;

    case 211: // 주차단속제외에서 제외 (단속하기)
      reg_ev_num(2, _val1, 2, _resp);
      break;      
    case 212: // 주차단속에서 제외 (단속 안하기)
      reg_ev_num(2, _val1, 1, _resp);
      break;      
    }
}

router.get('/command/', function(req, res, next) {
  logger.info('[INFO]'+'reglist.js - /command');
  var cmd = parseInt(req.query.cmd);
  var val1 = req.query.val1;
  var val2 = req.query.val2;

  logger.info('[INFO]'+'reglist.js - /command, cmd: '+cmd+', val1: ' + val1+', val2: ' + val2);

  on_command( cmd, val1, val2, res);
  //emitter.emit('_on_ev_command', g_page, cmd, val1, val2, res);
});
// [e2s] mswon 엑셀파일 출력용
router.get('/excelexport/',async function(req, res) {
  logger.info('[INFO]'+'reglist.js - /excelexport from ' + req.ip);

  var l_evnum_list = await get_evnum_list();

  logger.debug('[DEBUG]'+'reglist.js - /excelexport list length :' + l_evnum_list.length);

  var jsonDataList = JSON.stringify(l_evnum_list);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
  });
  
  res.write(jsonDataList);
  
  res.end();

});

// POST
router.post("/", (req, res, next) => {
});

module.exports = router;
