var express = require('express');
var router = express.Router();

var emitter = require('../utils/emitter');
var mngEdge = require('../utils/edgeManager');
var mngPlace = require('../utils/placeManager');

var sqlPlate = require('../utils/sql/plate');

var mngPlace = require('../utils/placeManager');

var fs = require('fs');
var path = require('path');
var db = require('../db');
const placeManager = require('../utils/placeManager');

//=================================================================================================
// Global variable
//-------------------------------------------------------------------------------------------------

var vnum_dir = path.join(__dirname, '../vnum') + '/';
var file_dir = path.join(__dirname, '../../files') + '/'; // Original Path : /data/plate_detect/file
var status_dir = file_dir + 'status/img/';

var g_page = 'place';
var g_resp = null;
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

async function sleep(t) {
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

function get_time_string(_time) {
  var times  = new Date(_time);
  return times.getFullYear()+'/'
       + get_2num(times.getMonth()+1)+'/'
       + get_2num(times.getDate())+' - '
       + get_2num(times.getHours())+':'
       + get_2num(times.getMinutes())+':'
       + get_2num(times.getSeconds());
}

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

function park_list_init(_rows, _now_time) {
  logger.debug('[DEBUG]'+'place::park_list_init() - '+_rows.length );
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
      logger.debug('[DEBUG]'+'place::park_list_init() - exit index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
      _item.s_flag = 0; // 0:출자, 1:입차
      if (_item.e_time == 0) l_item = _item;
    }
    //l_time = _item.time;
  });

  return g_park_list;
}

function get_park_list(_rows, _now_time) {
  var l_time = 0;
  var l_count = 0;

  var a_list = array_clear(a_park_list);
  var p_list = park_list_init(_rows, _now_time);
  var length = p_list.length;

  p_list.forEach(_item => {
    if (++l_count < length) {
      if (_item.s_flag != 0) _item.s_flag = 0;
      if (_item.e_time == 0) _item.e_time = l_time;
    }
    var is_ev = false;
    var cur_time = ((_item.s_flag == 0 && _item.e_time != '') ? _item.e_time : _now_time) - _item.time;
    var t_time = get_parkingtime_string(cur_time);
    var e_time = ((_item.s_flag == 0 && _item.e_time > 0) ? get_time_string(_item.e_time) : '주차중');

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
      p_path:_item.path,// parking image path
      e_time: e_time, // exit time
      e_path: _item.e_path //_item.path  // exit image path
    });
    l_time = _item.time;
  });

  return a_list;
}

function base64_decode(_data) {
  return Buffer.from(_data, 'base64');
}

function fs_image_write(_file_name, _data) {
  logger.debug('[DEBUG]'+'fs_image_write() 1- file_name['+_file_name+']');
  var image_data = base64_decode(_data);
  try{
    fs.writeFileSync(_file_name, image_data);
  }
  catch(err){
    logger.error(err)
  }
}


//주기보고 전처리
function post_place(_host, _body, _resp) {

  if (_body) {
    var file_name = status_dir + _host + '.jpg';
    var image = null; 
    var beacon = null;
    var status = null;
    var type = null;
    var number = null;

    if (_body.hasOwnProperty('beacon')) {
      beacon = (_body.beacon == 'True' || _body.beacon == 'true' || _body.beacon == true) ? true : false;
    }
    if (_body.hasOwnProperty('image')) {
      image = _body.image;
    }
    if (_body.hasOwnProperty('data')) {
      image = _body.data;
    }
    if (_body.hasOwnProperty('plate')) {
      var plate = _body.plate;
      if (plate.status != null) status = (plate.status == 'True' || plate.status == 'true' || plate.status == true) ? true : false;

      if (plate.type != null) type = plate.type;
      else type = '';

      if (plate.number != null) number = plate.number;
      else number = '';

    } 
    else {
      status = false;
      type = '';
      number = '';
    }

    if (image.startsWith('b\''))
      image = image.slice(2, -1);
    fs_image_write(file_name, image);

    // get_reg_ev_nums();

    //emitter.emit('_on_place', g_page, _ip, file_name, _beacon, _status, type, number);
    //_db_plate_list(_ip, type, _number, file_name, _beacon, _status);
    var now_time = new Date();
    mngPlace.OnReportAction(1, _host, type, status, number, now_time, file_name);
  }
}

//시간 대조 작업
async function _db_plate_list(_addr, _type, _num, _path, _beacon, _status) {

  try {
    var now_time = new Date();
    var s_date = new Date(now_time);
    var e_date = new Date(now_time);
    s_date = (s_date - 32400000)-86400000; // - 9hour - 24Hour
    e_date = (e_date - 32400000)+86400000; // - 9hour + 24Hour
c
    var s_db_date = get_db_date_string(s_date);
    var e_db_date = get_db_date_string(e_date);

    var [rows] = await sqlPlate.GetVnList( _addr, s_db_date, e_db_date);

    if (rows.length > 0) {

      var list = get_park_list(rows, now_time);


      if (list.length > 0) {

        const sortedList = list.sort((a, b) => (a.index < b.index ? 1 : -1));
        var list_item = sortedList[0];

        logger.debug('[DEBUG]'+'[PLACE]\n' + _num + ' : ' + list_item.plate_no + '&&\n' + list_item.e_time + ' : 주차중 &&\n' + list.p_rtime + '> 10000 &&\n' + list_item.p_rtime + '<= 600000');
        if (_num == list_item.plate_no && list_item.e_time == '주차중' && list_item.p_rtime >= 3600000 && list_item.p_rtime <= 3900000) {
          //mngPlace.OnReportAction(1, _addr, _type, _status, _num, now_time, _path);
        }
        else {
          //mngPlace.OnReportAction(1, _addr, _type, _status, _num, now_time, _path);
        }
      }
      else {
        //mngPlace.OnReportAction(1, _addr, _type, _status, _num, now_time, _path);
      }
    }
    else {
      //mngPlace.OnReportAction(1, _addr, _type, _status, _num, now_time, _path);
    }
  }
  catch (exception) {
    logger.debug('[DEBUG]'+exception);
  }
  finally {
    connection.release();
  }
}

//=================================================================================================
// EventEmitter
//-------------------------------------------------------------------------------------------------
// emitter.on('_on_place', function (_page, _ip, _file, _beacon, _status, _type, _number) {
//   logger.debug('[DEBUG]'+'place::_on_place() - ip['+_ip+'] file['+_file+']');
//   //logger.debug('[DEBUG]'+_body);
//   if (_page == g_page) {
//     _db_plate_list(_ip, _type, _number, _file, _beacon, _status);
//   }
// });

//=================================================================================================
// Router
//-------------------------------------------------------------------------------------------------

// router.post('/', (req, res, next) => {
//   logger.debug('[DEBUG]'+'place.js - / ');
//   post_place(req.params.id, req.body, res);
//   return res.status(200).json({ 'result': 'ok'});
// });

router.post('/:id', (req, res, next) => {
  logger.debug('[DEBUG]'+'place.js - / '+ req.params.id);
  post_place(req.params.id, req.body, res);
  
  res.status(200).json({ 'result': 'ok'}).end();
});

module.exports = router;
