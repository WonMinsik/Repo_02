var express = require('express');
var router = express.Router();

var asyncHandler = require('express-async-handler');
var util = require('util');
// var path = require('path');
// var fs = require('fs');
var pool = require('../db');

var emitter = require('../utils/emitter');
var sqlPlate = require('../utils/sql/plate');
var mngPlace = require('../utils/placeManager');
const edgeManager = require('../utils/edgeManager');
var mngFile = require('../utils/fileManager');
const logger = require('../utils/logManager');
//const e = require('express');
// var emitter = emitter_js.emitter;

//=================================================================================================
// var file_dir = path.join(__dirname, '../../files/'); // Original Path : /data/plate_detect/file

var g_page = 'vnum';

var a_park_list = [];
var g_park_list = new Map();
var g_park_item = `{
  "index":0,
  "addr":"",
  "type":"",
  "plate_no":"",
  "old_no":"",
  "time":0,
  "path":"",
  "e_time":0,
  "e_path":"",
  "s_flag":0
}`;

// var g_ev_list = new Map();
// var g_ev_item = `{
//   "_ID":0,
//   "number":"",
//   "auth":0,
//   "fuel":0,
//   "fuel_s":""
// }`;

//=================================================================================================
// Function
//-------------------------------------------------------------------------------------------------

function array_clear(_array) {
  if (_array && _array.length > 0) _array.splice(0, _array.length);
  return _array;
}

function get_2num(_val) {
  if (_val < 10) return '0'+_val;
  return _val;
}
//시간서식반환(시간) [YYYY/MM/DD-HH:mm:ss]
function get_time_string(_time) {
  var times  = new Date(_time);
  return times.getFullYear()+'/'
       + get_2num(times.getMonth()+1)+'/'
       + get_2num(times.getDate())+' - '
       + get_2num(times.getHours())+':'
       + get_2num(times.getMinutes())+':'
       + get_2num(times.getSeconds());
}

//plate테이블용 시간서식 반환(시간) [YYYY-MM-DD]
function get_db_date_string(_time) {
  var times  = new Date(_time);
  return times.getFullYear()+'-'
       + get_2num(times.getMonth()+1)+'-'
       + get_2num(times.getDate());
}

function get_parkingtime_string(_time) {
  var sec  = Math.floor((_time % 60000) / 1000);      //(1000 * 60)) / (1000));
  var min  = Math.floor((_time % 3600000) / 60000);   //(1000 * 60 * 60)) / (1000 * 60));
  var hour = Math.floor((_time % 86400000) / 3600000);//(1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  var time_string = '';
  if (hour > 0) {
    time_string = hour+'시간 ';
  }
  if (min > 0) {
    if (hour > 0) time_string += get_2num(min)+'분 ';
    else time_string += min+'분 ';
  }
  if (sec > 0) {
    if (hour > 0 || min > 0) time_string += get_2num(sec)+'초';
    else time_string += sec+'초';
  }
  return time_string;
  // return (hour > 0 ? hour+'시간 ':'')
  //      + (min > 0 ? get_2num(min)+'분 ' : '')
  //      + get_2num(sec)+'초';
}

function get_park_list_item(_index, _row) {
  var item = JSON.parse(g_park_item);
  item.index = _index;
  item.addr = _row.addr;
  item.type = _row.type;
  item.plate_no = _row.plate_no;
  item.old_no = '';
  item.time = Date.parse(_row.timestamp);//_row.timestamp; // parking time
  item.path = _row.path; // parking image path
  item.e_time = 0; // exit time
  item.e_path = ''; // exit image path
  item.s_flag = 0;
  return item;
}

function is_vnum_ok(_var) {
  var n_num = parseInt(_var);
  if (!n_num) return false;
  return true;
}

//주차번호 리스트를 작성한다.

function park_list_init(_rows, _now_time) {
  logger.debug('[DEBUG]'+'vnum::park_list_init() - '+_rows.length );

  var l_num = null;
  var l_time = null;
  var l_num_s = null; // 반복적으로 공백이 들어와서 추가한 변수
  var l_time_s = null; // 반복적으로 공백이 들어와서 추가한 변수
  var plate_no = '';
  var new_item = null;
  var p_indexer = new Map(); // 차량번호 중복체크

  // 주차 리스트 초기화
  if (g_park_list) g_park_list.clear();

  var i = 0;
  for (i = 0; i < _rows.length; i++) {
    new_item = get_park_list_item(i, _rows[i]);
    logger.debug('[DEBUG]'+'vnum::park_list_init() - ['+new_item.plate_no+']');

    // (입차) 공백이 아니면
    if (new_item.type && new_item.type != '' && new_item.plate_no && new_item.plate_no != '' && new_item.plate_no.length >= 7) {
      new_item.s_flag = 1; // 0:출자, 1:입차

      // 차량 번호 뒤 4자리를 비교, 인식률이 좋아지면 차량번호 전체로 비교하는 것으로 바꾸어야 함.
      plate_no = new_item.plate_no.slice(-4);
      var _index = p_indexer.get(plate_no);
      logger.debug('[DEBUG]'+'vnum::park_list_init() - 0 ['+plate_no+'] i['+i+'] _index['+_index+']');

      var s_item = null;
      // 이전에 아이템이 있으면, 중복 입차 출차가 아니면
      if ((s_item=g_park_list.get(_index)) != null ) {
        var s_time = (s_item.e_time > 0 ? s_item.e_time : s_item.time);
        logger.debug('[DEBUG]'+'vnum::park_list_init() - 1 ['+plate_no+'] _index['+_index+'] s_time['+s_time+']time['+s_item.time+'] e_time['+s_item.e_time+']');

        if (l_num_s == plate_no) {
          // 1시간 이내에 바로전 차량과 같은 번호는 입차시간은 같은 것으로 판단, (번호인식문제로)
          s_time += 3600000;
        } else {
          // 5분 이내에 같은 번호는 입차시간은 같은 것으로 판단, (번호인식문제로)
          s_time += 300000;
        }
        if (s_time > new_item.time) {
          logger.debug('[DEBUG]'+'vnum::park_list_init() - 1 ['+plate_no+'] old_idx['+old_idx+'] ['+s_item.time+'] ['+s_item.time+']');
          new_item.e_time = new_item.time;
          new_item.e_path = new_item.path;
          new_item.time   = s_item.time;
          // new_item.path   = s_item.path;  // Test Code : Last Image

          g_park_list.delete(_index); // 출력 리스트에서 이전 번호 삭제
        } else {
          logger.debug('[DEBUG]'+'vnum::park_list_init() - 3 i['+i+'] ['+plate_no+'] _index['+_index+'] time['+s_item.time+'] e_time['+new_item.e_time+']');

          // (출차) 공백이 들어오지 않고, 입차 시간이 31분 이전인 경우
          s_time += 1800000;
          if (s_item.s_flag != 0 && s_time > new_item.time) {
            new_item.e_time = new_item.time;
            new_item.e_path = new_item.path;
            new_item.time   = s_item.time;
            // new_item.path   = s_item.path;  // Test Code : Last Image

            g_park_list.delete(_index); // 출력 리스트에서 이전 번호 삭제
          } else {
            s_item.s_flag = 0;
            //s_item.e_time = new_item.time;
            if (s_item.e_time == 0) s_item.e_time = new_item.time;
            if (s_item.e_path == '') s_item.e_path = s_item.path;
          }
        }
        p_indexer.delete(plate_no); // 비교 리스트에서 이전 번호 삭제
      }
      // 중복 아이템이 없으면
      else {
        // 이전 아이템이 있으면, 공백이 없을 경우
        if (l_num) {
          var s_item = null;
          var _index = p_indexer.get(l_num);
          if ((s_item=g_park_list.get(_index)) != null ) {
            var old_num = s_item.plate_no.slice(-4);
            var old_idx = p_indexer.get(old_num);

            // 30초 이내에 다른 번호는 같은 번호로 판단,
            if ((s_item.time + 10000) > new_item.time) {
              // 어떤 번호를 선택할지 결정해야함.
              // new_item.plate_no = s_item.plate_no;
              if (is_vnum_ok(plate_no) == false)  {
                new_item.plate_no = s_item.plate_no;
              }

              new_item.old_no = s_item.plate_no;
              new_item.e_time = new_item.time;
              new_item.e_path = new_item.path;
              new_item.time   = s_item.time;
              // new_item.path   = s_item.path; // Test Code : Last Image

              logger.debug('[DEBUG]'+'vnum::park_list_init() - 4 ['+plate_no+'] old_num['+old_num+'] old_idx['+old_idx+'] ['+new_item.time+']  ['+new_item.e_time+']');

              p_indexer.delete(old_num); // 비교 리스트에서 이전 번호 삭제
              g_park_list.delete(old_idx); // 출력 리스트에서 이전 번호 삭제
            }
            // 다른 번호이면 이전 아이템 출차 시간 등록
            else {
              s_item.s_flag = 0; // 0:출자, 1:입차
              s_item.e_time = new_item.time;
              if (s_item.e_path == '') s_item.e_path = s_item.path;
              logger.debug('[DEBUG]'+'vnum::park_list_init() - 3-1 ['+plate_no+'] old_num['+old_num+'] old_idx['+old_idx+'] ['+old_item.time+']  ['+old_item.e_time+']');

              p_indexer.delete(old_num); // 비교 리스트에서 이전 번호 삭제
            }
          }
        }
      }

      p_indexer.set(plate_no, i);
      g_park_list.set(i, new_item);

      l_num = plate_no;
      l_time = new_item.time;

      // 반복적으로 공백이 들어와서 추가
      l_num_s = plate_no;
      l_time_s = new_item.time;
    }
    // (출차) 공백이면
    else {
      logger.debug('[DEBUG]'+'vnum::park_list_init() - 5 ['+plate_no+']['+l_num+']['+l_time+'] ['+new_item.time+']');
      // 이전 아이템이 있으면, 공백이 없을 경우
      if (l_num) {
        var s_item = null;
        var _index = p_indexer.get(l_num);
        logger.debug('[DEBUG]'+'vnum::park_list_init() - 7 ['+plate_no+'] l_num['+l_num+'] _index['+_index+']');
        logger.debug('[DEBUG]'+g_park_list);
        if ((s_item=g_park_list.get(_index)) != null ) {
          logger.debug('[DEBUG]'+'vnum::park_list_init() - 8 ['+plate_no+'] ['+new_item.plate_no+'] ['+s_item.time+'] ['+new_item.time+']');
          s_item.s_flag = 0;
          s_item.e_time = new_item.time;//l_time;
          if (s_item.e_path == '') s_item.e_path = s_item.path;

          //p_indexer.delete(l_num); // 비교 리스트에서 이전 번호 삭제
        }
      }
      l_num = null;
      l_time = null;
    }
  }
  p_indexer.clear();

  // 번호인식이 잘안될때 출차를 인식하지 못하는 문제 조정.
  var i_count = i-1;
  var l_count = 0;
  var l_item = null;
  // var length = g_park_list.length;
  g_park_list.forEach(_item => {
    l_count++;
    if (l_item) l_item.e_time = _item.time;
    l_item = null;
    //  마지막이 아니면 출차로 간주.
    if (_item.s_flag == 1 && _item.index < i_count) {// && l_count < length) {
      logger.debug('[DEBUG]'+'vnum::park_list_init() - exit index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
      _item.s_flag = 0; // 0:출자, 1:입차
      if (_item.e_time == 0) l_item = _item;
    }
    //l_time = _item.time;
  });

  return g_park_list;
}

//주차차량 리스트 취득
function get_park_list(_rows, _now_time) {
  var l_time = 0;
  var l_count = 0;

  var a_list = array_clear(a_park_list);
  var p_list = park_list_init(_rows, _now_time);
  var length = p_list.length;

  p_list.forEach(_item => {
    logger.debug('[DEBUG]'+'vnum::get_park_list() - 1 index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
    if (++l_count < length) {
      logger.debug('[DEBUG]'+'vnum::get_park_list() - 2 index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
      if (_item.s_flag != 0) _item.s_flag = 0;
      if (_item.e_time == 0) _item.e_time = l_time;
    }
    // 리스트로 할지 DB 쿼리로 할지 추후 결정, ==> ASYNC로 동작해서 아래 코드 삭제
    // var is_ev = true;
    // if (_item.type != '전기') is_ev = get_reg_ev_num(_item.plate_no); // (g_ev_list.get(_item.plate_no) != null ? true : false);

    var is_ev = false; //(g_ev_list.get(_item.plate_no) != null ? true : false); // 전기차 DB 체크하지
    var cur_time = ((_item.s_flag == 0 && _item.e_time != '') ? _item.e_time : _now_time) - _item.time;
    var t_time = get_parkingtime_string(cur_time);
    var e_time = ((_item.s_flag == 0 && _item.e_time > 0) ? get_time_string(_item.e_time) : '주차중');
    logger.debug('[DEBUG]'+'get_park_list() - '+e_time);

    a_list.push({
      index: _item.index,
      addr: _item.addr,
      type: (is_ev == true ? '전기' : _item.type),
      plate_no: _item.plate_no,
      t_time: t_time,
      is_ev:is_ev,
      t_rtime: _item.time,
      e_rtime: _item.e_time,
      p_rtime:cur_time,
      p_time: get_time_string(_item.time), // parking time
      //p_path:_item.path, // parking image path 2021-01-05_10:45:09
      //p_path:(_item.path .length > 21 ? _item.path : '/usr/src/files/plate/'+_item.addr+'/'+_item.path), // parking image path
      p_path:_item.path,// parking image path
      e_time: e_time, // exit time
      e_path: _item.e_path //_item.path  // exit image path
    });
    l_time = _item.time;
  });

  return a_list;
}

//시간대조 작업
async function _db_plate_list(_addr, _type, _num, _path, _now_time) {
  //logger.debug('[DEBUG]'+'vnum::_db_list() 1 - _addr['+_addr+'] _type['+_type+'] _num['+_num+'] _path['+_path+']');

  try {
    //var new_vnum = _num.slice(-4);
    var s_date = new Date(_now_time);
    var e_date = new Date(_now_time);
    s_date = (s_date - 32400000)-86400000; // - 9hour - 24Hour
    e_date = (e_date - 32400000)+86400000; // - 9hour + 24Hour
    //logger.debug('[DEBUG]'+'vnum::_db_list_date() - _addr['+_addr+'] _now_time['+_now_time+']['+get_db_date_string(_now_time)+'] s_date['+s_date+']['+get_db_date_string(s_date)+']');

    var s_db_date = get_db_date_string(s_date);
    var e_db_date = get_db_date_string(e_date);
    //logger.debug('[DEBUG]'+'vnum::_db_list_date() - _addr['+_addr+'] s_date['+s_date+']['+s_db_date+'] _now_time['+_now_time+']['+e_db_date+']');

    //var [rows] = await connection.query('SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr = ? AND timestamp BETWEEN ? AND ?', [_addr, s_db_date, e_db_date]);
    var [rows] = await sqlPlate.GetVnList(_addr, s_db_date, e_db_date);
    //logger.debug('[DEBUG]'+'vnum::_db_list_date() - _addr['+_addr+'] rows.length['+rows.length+'] ['+s_db_date+'] ['+e_db_date+'] _type['+_type+'] _num['+_num+'] _path['+_path+']');
    if (rows.length > 0) {
      var list = get_park_list(rows, _now_time);

      if (list.length > 0) {
        //var db_item = rows[rows.length-1];
        const sortedList = list.sort((a, b) => (a.index < b.index ? 1 : -1));
        var list_item = sortedList[0];

        // sortedList.forEach(_item => {
        //   //if (_item.plate_no == _num) logger.debug('[DEBUG]'+_item);
        //   //if (_item.e_time == '주차중') logger.debug('[DEBUG]'+_item);
        //   logger.debug('[DEBUG]'+'vnum::_db_list_date() ['+_item.index+'] ['+_item.addr+']['+_item.type+']['+_item.plate_no+']['+get_time_string(_item.t_rtime)+']['+_item.e_time+']');
        // });

        //logger.debug('[DEBUG]'+'vnum::_db_list_date() - _addr['+_addr+'] rows.length['+rows.length+'] ['+s_db_date+'] ['+e_db_date+'] _type['+_type+'] _num['+_num+'] _path['+_path+']');
        logger.debug('[DEBUG]'+'vnum::_db_list_date() - _num['+_num+'] _addr['+_addr+'] p_rtime['+list_item.p_rtime+'] ['+list_item.t_time+'] e_time['+list_item.e_time+']t_rtime['+get_time_string(list_item.t_rtime)+'] e_rtime['+get_time_string(list_item.e_rtime)+']  now_time['+_now_time+'] ');
        //if (_num == list_item.plate_no && list_item.is_ev != true && list_item.e_time == '주차중' && list_item.p_rtime > 10000 && list_item.p_rtime <= 600000) {
        if (_num == list_item.plate_no && list_item.e_time == '주차중' && list_item.p_rtime > 10000 && list_item.p_rtime <= 600000) {
          //send_on_vnum( _addr, _type, _num, _path, 3);//_mode); mode = 0 : none, 1 : 최초, 2 : 1시간 진입, 3 : Normal(1시간 미만 주차중)
        }
        else {
          //send_on_vnum( _addr, _type, _num, _path, 1);//_mode); mode = 0 : none, 1 : 최초, 2 : 1시간 진입, 3 : Normal(1시간 미만 주차중)
        }
      }
      else {
        //send_on_vnum( _addr, _type, _num, _path, 1);//_mode); mode = 0 : none, 1 : 최초, 2 : 1시간 진입, 3 : Normal(1시간 미만 주차중)
      }
    }
    else {
      //send_on_vnum( _addr, _type, _num, _path, 1);//_mode); mode = 0 : none, 1 : 최초, 2 : 1시간 진입, 3 : Normal(1시간 미만 주차중)
    }
  }
  catch (exception) {
    logger.error(exception);
  }
  finally {
    connection.release();
  }
}
//=================================================================================================
// EventEmitter, Subscribe on_vnum Event
//-------------------------------------------------------------------------------------------------
// emitter.on('_on_vnum', function(_page, _host, _v_type, _v_num, _v_path, _now_time) {
//   logger.debug('[DEBUG]'+'vnum::_on_vnum() - _host['+_host+'] _v_type['+_v_type+'] _v_num['+_v_num+'] _v_path['+_v_path+']');
//   if (_page == g_page) {
//     _db_plate_list(_host, _v_type, _v_num, _v_path, _now_time);
//   }
// });



//vnum 라우터로 정보 수신
// INSERT
router.post('/', asyncHandler(async (req, res, next) => {
  if (req.body.constructor === Object && Object.keys(req.body).length === 0) {
    logger.warn('[WARN]'+'object missing');
    return res.status(403).json({'error':'parameter missing'});
  }

  var body = req.body;
  var addr = null;
  var type = null;
  var number = null;
  var now_time = new Date();
  // var size = body._V_IMAGE_SIZE;
  var filename = 'no-image.png';
  var path = 'no-image.png';
  var data = null;

  if (body.hasOwnProperty('_ADDR_S')) {
     addr = body._ADDR_S;
  }
  else if (body.hasOwnProperty('addr')) {
     addr = body.addr;
  }

  if (body.hasOwnProperty('_V_TYPE')) {
     type = body._V_TYPE;
  }
  else if (body.hasOwnProperty('type')) {
     type = body.type;
  }

  if (body.hasOwnProperty('_V_NUM')) {
     number = body._V_NUM;
  }
  else if (body.hasOwnProperty('number')) {
     number = body.number;
  }


  if (body.hasOwnProperty('_VIMAGE_DATA')) {
     data = body._V_IMAGE_DATA;
  }
  else if (body.hasOwnProperty('data')) {
     data = body.data;
  }

  if ((typeof(type) == null) || (typeof(number) == null)) {
    type = null;
    number = null;
  }

  logger.info('[INFO]'+'[VNUM] INFO [addr: ' + addr + '], type: ' + type + ', plate_no: ' + number + ', data: ' + typeof(data) + ']');


  if (data != null) {
    // [E2S] mswon 2022.10.07 파일제어를 모듈로 분리 
    //logger.debug('[DEBUG]'+'receiving image data');
    // var buf = Buffer.from(data, 'base64');
    // path = body._V_IMAGE_PATH;

    // 'files/plate/[addr]/[current_time].jpg'
    
    // path = file_dir + 'plate/' + addr;//+'/'+path+'.jpg';
    // if (fs.existsSync(path) === false) {
    //   fs.mkdirSync(path, { recursive: true }, (err) => {
    //     if (err) {
    //       logger.debug('[DEBUG]'+err);
    //       // echo the result back
    //       return res.status(500).json({'error':'Can\'t make directory ! [' + path + ']','message':err.message});
    //     }
    //   });
    // }

    path = mngFile.report_file_path + addr + '/';

    mngFile.CreateDir(path);

    // filename = new Date().toISOString().toString('yyyyMMddHHmmss').replace(/-/gi, '').replace(/:/gi, '').replace(/T/, '').replace(/\..+/, '')+'.jpg';
    if (type != null) {
      if (type === '전기') {
        filename = 'E' + now_time.toISOString().toString('yyyyMMddHHmmss').replace(/-/gi, '').replace(/:/gi, '').replace(/\..+/, '')+'.jpg';
      }
      else if (type === '일반') {
        filename = 'N' + now_time.toISOString().toString('yyyyMMddHHmmss').replace(/-/gi, '').replace(/:/gi, '').replace(/\..+/, '')+'.jpg';
      }
      else if (type === '영업') {
        filename = 'B' + now_time.toISOString().toString('yyyyMMddHHmmss').replace(/-/gi, '').replace(/:/gi, '').replace(/\..+/, '')+'.jpg';
      }
      else {
        filename = 'U' + now_time.toISOString().toString('yyyyMMddHHmmss').replace(/-/gi, '').replace(/:/gi, '').replace(/\..+/, '')+'.jpg';
      }
    }
    else {
      filename = 'U' + now_time.toISOString().toString('yyyyMMddHHmmss').replace(/-/gi, '').replace(/:/gi, '').replace(/\..+/, '')+'.jpg';
    }
    
    
    //[E2s] mswon 2022.10.07 파일제어를 모듈로 분리
    //path = file_dir + 'plate/' + addr + '/' + filename;
    var filePath = path + filename;
    // // 비동기 파일 쓰기,
    // fs.writeFile(path, buf, (err) => {

    //   try {
    //     if (err) {
    //       //logger.debug('[DEBUG]'+'에러발생');
    //       logger.dir(err);
    //       return res.status(500).json({'error':'Can\'t write file ! ['+path+']','message':err.message});
    //       //return;
    //     }
    //     //logger.debug('[DEBUG]'+'파일쓰기완료');
    //     var link = file_dir + addr + '.jpg';
    //     fs.unlinkSync(link);
    //     fs.symlinkSync(path, link);
    //   }
    //   catch (e) {
    //     logger.error(e);
    //   }
    // });

    mngFile.SetReportImage(filePath, data);

    // 동기 파일 쓰기,
    //fs.writeFileSync(path, buf);
    //emitter.emit('on_upload', g_page, addr_l, addr_s, v_type, v_num, path);
  }

  //logger.debug('[DEBUG]'+'vnnum.js - manipulate database');

  // const connection = await pool.getConnection(async conn => conn);

  // await connection.beginTransaction();

  try {
    //if (v_type != 99) {// Test, 추후 조건 수정 해야함. 99는 Stream

      var reportType = (type == null) ? '' : type;
      var reportNumber = (number == null) ? '' : number;
      var reportStatus = ((type == null || type == '') && (number == null || number == '')) ? false : true;

      //var [rows] = await connection.query(query);
      var [rows] = await sqlPlate.GetCurrentStatus(addr);
      logger.debug('[DEBUG]'+'[VNUM] GetCurrentStatus Result : ' + JSON.stringify(rows));

      // 신규 IP의 경우 공란정보를 먼저 생성한다.
      if(rows === undefined)
      {
        var result = await sqlPlate.Insert(addr, '', '', '');
      }

      if (rows.length > 0) {
        var row = rows[0];

        if ((row.type != type) || (row.plate_no != number)) {
          //var [result] = await connection.execute('INSERT INTO plate (addr, type, plate_no, path) VALUES (?, ?, ?, ?)', [addr, type, number, filename]);
          logger.info('[INFO]'+'[VNUM] INSERT DATA : [' + addr + ', ' + type + ', ' + number + ', ' + filename + ']');
          var result = await sqlPlate.Insert(addr, type, number, filename);
        }
        else {

          logger.debug('[DEBUG]'+'[VNUM] we have same record !');
          logger.info('[INFO]'+'[VNUM] REJECT INSERT DATA [' + addr + ', ' + type + ', ' + number + ']');

          // connection.release();
          //emitter.emit('_on_vnum', g_page, addr, type, number, path, now_time);
          // _db_plate_list(addr, type, number, path, now_time);c
          mngPlace.OnReportAction(0, addr, reportType, reportStatus, reportNumber, now_time, filename);
          
          return res.status(203).json({
            'status' : 'ok, same record ...' // response
          });
        }
      }
      else {
        //var [result] = await connection.execute('INSERT INTO plate (addr, type, plate_no, path) VALUES (?, ?, ?, ?)', [addr, type, number, filename]);
        logger.info('[INFO]'+'[VNUM] INSERT DATA : [' + addr + ', ' + type + ', ' + number + ', ' + filename + ']');
        var result = await sqlPlate.Insert(addr, type, number, filename);
      }


      //await connection.commit();
      //emitter.emit('_on_vnum', g_page, addr, type, number, path, now_time);
      //_db_plate_list(addr, type, number, path, now_time);
      mngPlace.OnReportAction(0, addr, reportType, reportStatus, reportNumber, now_time, filename);
      return res.status(201).json({
        'status' : 'ok' // response
    });
  }
  catch (exception) {
    logger.error(exception);
    res.status(500).end();
  }
}));

module.exports = router;
