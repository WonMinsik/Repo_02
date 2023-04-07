var express = require('express');
var router = express.Router();

var emitter = require('../utils/emitter');
var mngEdge = require('../utils/edgeManager');
var mngPlace = require('../utils/placeManager');

var fs = require('fs');
var path = require('path');
var db = require('../db');
const logger = require('../utils/logManager');

const locationName = 'vnsnapshots';

//=================================================================================================
// Global variable
//-------------------------------------------------------------------------------------------------

var vnum_dir = path.join(__dirname, '../vnum') + '/';
var file_dir = path.join(__dirname, '../../files') + '/'; // Original Path : /data/plate_detect/file
var capture_dir = file_dir + 'capture/';
var image_dir = file_dir + 'plate/';
var view_dir = file_dir + 'view/';

var g_page = 'vnsnapshots';
var g_resp = null;

var g_mode = 0; // 0:Default, 1:Select
var g_row = 3; // 기본 3행
var g_files = [];
var g_page_start = 0;
var g_page_count = 12;

//=================================================================================================
// Function
//-------------------------------------------------------------------------------------------------

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

function read_dir(_dir) {
  //var dir = path.join(__dirname, '../../files/capture') + '/';

  g_files  = array_clear(g_files);

  g_files = fs.readdirSync(_dir)
    .map( function(v) { return { name:v, time:fs.statSync(_dir + v).mtime.getTime() }; })
    .sort(function(a, b) { return b.time - a.time; })
    .map(function(v) { return v.name; });

  logger.debug('[DEBUG]'+'vnsnapshots::read_dir() - clount '+ g_files.length);

  return g_files;
}

function _file_list_render(_resp, _mod=0, _row=3, _ofs=0, _cnt=12) {
  var _start = g_page_start;
  var _count = g_page_count;

  if (_resp) {
    if (_ofs != null && _ofs != '') {
      _start = parseInt(_ofs);
    }
    if (_cnt != null && _cnt != '') {
      _count = parseInt(_cnt);
    }

    var f_array = [];
    if (g_files.length > 0) f_array = g_files;
    else f_array = read_dir(capture_dir);
  
    var list_end = _start+_count;
    var list_count = f_array.length;
    var list_page = parseInt(list_count / _count);
    if ((list_page*_count) < list_count) list_page++;
  
    // logger.debug('vnsnapshots::_file_list_render() - row : '+_row + ' list_count : '+list_count+' list_page : '+list_page+' _start : '+_start+' list_end : '+list_end);

    var _f_list = [];
    for (var i = _start; i < list_end; i++) {
      _f_list.push({
        index: i,
        name: f_array[i]
      });
    }
    // var _f_list = [];
    // f_list.forEach(_item => {
    //   if (_index >= _start && _index < list_end) {
    //     _f_list.push({
    //       index: _item.index,
    //       name: _item.name
    //     });
    //   }
    //   _index++;
    // });

    var page_num = (_start / _count);
    var page_start = (parseInt(page_num / 10) * 10);
    var page_end = page_start+10;
    // logger.debug('vnsnapshots::_file_list_render() - row : '+_row + ' page_start : '+page_start+' page_end : '+page_end+' page_num :'+page_num);

    _resp.render('vnsnapshots', {
      title: '전기차 충전/주차 현황',
      list_start: _start,
      list_end: list_end,
      list_count: list_count,
      list_page: list_page,
      page_mod: _mod,
      page_row: _row,
      page_start: page_start,
      page_end: page_end,
      page_num: page_num,
      file_list: _f_list
    });
  }
  //if (_resp) _resp.end();
}

//=================================================================================================
// EventEmitter
//-------------------------------------------------------------------------------------------------
emitter.on('_on_file_list', function (_page, _mod, _row=3, _ofset=0, _count=12) {
  logger.info('[INFO]'+'vnsnapshots::_on_file_list() - _page['+_page+'] _mod['+_mod+'] _row['+_row+'] _ofset['+_ofset+'] _count['+_count+']');
  if (_page == g_page)  {
    _file_list_render( g_resp, _mod, _row, _ofset, _count);
  }
});

emitter.on('_on_file_command', function (_page, _cmd, _val1, _val2, _resp) {
  logger.info('[INFO]'+'vnsnapshots::_on_file_command() - _page['+_page+'] __cmd['+_cmd+'] _val1['+_val1+'] _val2['+_val2+']');
  if (_page == g_page)  {
    on_command(_cmd, _val1, _val2, _resp);
  }
});

//=================================================================================================
// Router
//-------------------------------------------------------------------------------------------------

/* GET users listing. */
router.get('/', function(req, res, next) {
  logger.info('[INFO]'+'vnsnapshots.js - /  ');

  if(req.session.user == undefined) {
    res.redirect('login');
  } else {
    req.session.user.lastLocation = locationName;
  }


  var mod = req.query.mod;
  var row = req.query.row;
  var ofs = req.query.ofs;

  if (mod == null || mod == '') {
    mod = 0;
  }
  if (row == null || row == '') {
    row = 3;
  }
  if (ofs == null || ofs == '') {
    ofs = 0;
  }

  g_mode = parseInt(mod);
  g_row = parseInt(row);
  g_page_start = parseInt(ofs);

  switch(g_row) {
  case 2: g_page_count = 2; break;
  case 3: g_page_count = 6; break;
  case 4: g_page_count = 12; break;
  case 5: g_page_count = 15; break;
  case 6: g_page_count = 24; break;
  case 7: g_page_count = 35; break;
  default : g_page_count = 6;
  }

  g_resp = res;
  read_dir(capture_dir);

  // var f_list = read_dir(capture_dir);
  // res.render('vnsnapshots', {
  //   title: '전기차 등록차량 편집',
  //   list_count: list_count,
  //   list_page: list_page,
  //   page_start: page_start,
  //   page_end: page_end,
  //   page_num: page_num,
  //   file_list: f_list
  // });

  // logger.debug('vnsnapshots.js - ['+g_mode+'] ['+g_row+'] ['+g_page_start+'] ['+g_page_count+']');

  emitter.emit('_on_file_list', g_page, g_mode, g_row, g_page_start, g_page_count);
});

// GET specific index
// router.get('/:id', function(req, res, next) {
//   logger.debug('[DEBUG]'+'vnsnapshots.js - /  '+ req.params.id);
// });

router.get('/list/', function(req, res, next) {
  logger.debug('[DEBUG]'+'vnsnapshots.js - /list  '+ req.params.id);

  var mod = req.query.mod;
  var row = req.query.row;
  var ofs = req.query.ofs;
  var cnt = req.query.cnt;

  if (mod == null || mod == '') {
    mod = 0;
  }
  if (row == null || row == '') {
    row = 3;
  }
  if (ofs == null || ofs == '') {
    ofs = 0;
  }
  if (cnt == null || cnt == '') {
    cnt = 12;
  }

  g_mode = parseInt(mod);
  g_row = parseInt(row);
  g_page_start = parseInt(ofs);
  g_page_count = parseInt(cnt);

  //_db_list_count();

  logger.debug('vnsnapshots.js - /list mod['+g_mode+'] row['+g_row+'] ofs['+g_page_start+'] cnt['+g_page_count+']');

  g_resp = res;
  emitter.emit('_on_file_list', g_page, g_mode, g_row, g_page_start, g_page_count);
});
router.get('/status/:id', async function(req, res, next) {
  logger.debug('[DEBUG]'+'vnsnapshots.js - /status '+ req.params.id);

  if(req.session.user.lastLocation !== locationName) {
    res.redirect('/'+locationName);
    return;
  }
  //g_resp = res;
  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });
  res.end();
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

//스냅샷화면 이미지 읽어오는 요청
router.get('/image/:id', function(req, res, next) {
  logger.debug('[DEBUG]'+'vnsnapshots.js - /image '+ req.params.id);
  if(req.params.id == undefined)
  {
    res.end();
  }
  
  var filename = capture_dir + req.params.id;
  //var filename = image_dir + req.params.id;
  //urlencode.decode(val);

  //logger.debug('[DEBUG]'+'vnsnapshots.js - /image '+ filename);

  fs.stat( filename, (_err, _stats) => {
    if (!_err) {
      fs.readFile(filename, function(_err2, _data) {
        if (!_err2) {
          res.writeHead(200, { 'Content-Type': 'image/jpg'});
          res.end(_data);
        } else {
          logger.error('[ERROR]'+_err2);
        }
      });
    } else {
      logger.error('[ERROR]'+_err);
    }
  })

});

function delete_file(_file) {
  fs.stat(_file, function (err, stats) {
    // logger.debug('[DEBUG]'+stats);//here we got all information of file in stats variable
 
    if (err) {
      logger.error('[ERROR]'+err);
      return;
    }
 
    fs.unlink(_file,function(err){
         if(err) {
          logger.error('[ERROR]'+err);
          return;
         }
         logger.debug('[DEBUG]'+'file deleted successfully => '+_file);
    });  
 });
}

function delete_files(_dir, _list_no) {
  //var dir = path.join(__dirname, '../../files/capture') + '/';

  var jbString = _list_no;
  var jbSplit = jbString.split('_'); // '1_2_3'

  for ( var i in jbSplit ) {
    var file = _dir + g_files[ jbSplit[i]];
    logger.debug('[DEBUG]'+'vnsnapshots::delete_files() - no:'+ jbSplit[i]+', file:'+file);
    delete_file(file);
  }

  // capture_dir
  // g_files = fs.readdirSync(_dir)
  //   .map( function(v) { return { name:v, time:fs.statSync(_dir + v).mtime.getTime() }; })
  //   .sort(function(a, b) { return b.time - a.time; })
  //   .map(function(v) { return v.name; });

  logger.debug('[DEBUG]'+'vnsnapshots::read_dir() - clount '+ g_files.length);

  return g_files;
}

// _cmd = 0:삭제, 1:등록
async function reg_ev_num(_ip, _cmd, _num, _resp = null) {
  logger.debug('vnsnapshots::reg_ev_num: _ip['+_ip+'] _cmd['+_cmd+'] _val['+_num+']');
}

async function on_command(_cmd, _val1, _val2, _resp) {
  switch (_cmd) {
    case 8: // 자동차 번호 등록
      reg_ev_num(1, _val1, _val2, _resp);
      return ;
    case 9: // 자동차 번호 삭제
      reg_ev_num(0, _val1, _val2, _resp);
      return ;
    case 10: // List
      //_on_db_list(res, ip, val1,  val2);
      //emitter.emit('_on_db_list', g_page, val1,  val2);
      //emitter.emit('_on_ev_list', g_page, ofs,  cnt);
      return ;
    case 20: // Delete Image
      delete_files(capture_dir, _val1);
      return;
    }
}

router.get('/command/', function(req, res, next) {
  logger.debug('[DEBUG]'+'vnsnapshots.js - /command');
  var cmd = parseInt(req.query.cmd);
  var val1 = req.query.val1;
  var val2 = req.query.val2;

  logger.debug('[DEBUG]'+'cmd: '+cmd+', val1: ' + val1+', val2: ' + val2);

  //g_resp = res;
  on_command( cmd, val1, val2, res);
  //emitter.emit('_on_command', g_page, cmd, val1, val2, res);
});

// POST
router.post("/", (req, res, next) => {
});

module.exports = router;
