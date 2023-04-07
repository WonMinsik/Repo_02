var express = require('express');const logger = require('../utils/logManager');
var router = express.Router();

var request = require("request");
var emitter = require('../utils/emitter');
var sqlPlate = require('../utils/sql/plate');
var mngPlace = require('../utils/placeManager');

var fs = require('fs');
var place_info = './place_info.json';
var path = require('path');
var db = require('../db');

//=================================================================================================
// Global variable
//-------------------------------------------------------------------------------------------------

var vnum_dir = path.join(__dirname, '../vnum') + '/';
var file_dir = path.join(__dirname, '../../files') + '/'; // Original Path : /data/plate_detect/file
var image_dir = file_dir + 'plate/';
var view_dir = file_dir + 'view/';

var g_page = 'vnlist';
var g_resp = null;
var a_park_list = [];
var g_page_start = 0;
var g_page_count = 8;

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

var g_ev_list = new Map();
var g_ev_item = `{
  "_ID":0,
  "number":"",
  "auth":0,
  "fuel":0,
  "fuel_s":""
}`;

var _places_idx = `{
  "place_idx":0,
  "space_idx":0,
  "v_ev_auth":0,
  "cap_image":0,
  "place_name":0,
  "space_ip":""
}`;

var g_places_idx = new Map();
function g_places_init() {
  //logger.debug('vnlist::g_places_init() - '+g_places_idx.size);
  if (g_places_idx.size <= 0) {
    const places = mngPlace.places;
    const edgeSystemStateMap = mngPlace.edgeSystemStateMap;
    places.forEach(_place => {
      for (var _key in _place.areas) {
        //logger.debug(_place.spaces[_key]);
        var areaInfo = _place.areas[_key];
        var p_idx = JSON.parse(_places_idx);
        p_idx['place_idx'] = areaInfo.place_idx;
        p_idx['space_idx'] = areaInfo.space_idx;
        p_idx['v_ev_auth'] = 0; // 전기차 인증 = 1:인증, 일반차일때 인증된 경우 전기차로 판단
        p_idx['cap_image'] = 0;
        p_idx['place_name'] = _place.name + ' ' + (areaInfo.space_idx + 1) + '면';
        p_idx['space_ip'] = areaInfo.host;
        g_places_idx.set(areaInfo.host, p_idx);
      }
    });
  }
}

//=================================================================================================
// Function
//-------------------------------------------------------------------------------------------------
// [e2s] mswon excel파일 출력 = 전체 목록 출력용 함수
async function getExcelDataList( strAddrs, _s_time, _e_time) {
  try {
      var s_date = new Date(_s_time);
      var e_date = new Date(_e_time);
      var exceldata_list = [];
  
      s_date = s_date - 32400000; // - 9hour
      e_date = (e_date - 32400000) + 86400000; // - 9hour + 24hour
  
      var s_db_date = get_db_date_string(s_date);
      var e_db_date = get_db_date_string(e_date);
  
      //var req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr IN( ? ) AND timestamp BETWEEN ? AND ?';
      //var [rows] = await connection.query(req_query, [strAddrs, s_db_date, e_db_date]);
      var rows = await sqlPlate.GetExcelData(strAddrs, s_db_date, e_db_date);
    
      var list = array_clear(exceldata_list);

      if (rows && rows.length > 0) {
        list = get_Export_park_Area_list(rows, 0, rows.length -1 );
      }

      const sortedList = list.sort((a, b) => (a.index < b.index ? 1 : -1));

      sortedList.forEach(_item => {      
        exceldata_list.push({
          type: _item.type,
          plate_no: _item.plate_no,
          t_time: _item.t_time,
          t_time_check: _item.t_time_check,
          p_time: _item.p_time,
          e_time: _item.e_time
        });
      });
      
      return exceldata_list;
  } catch (dberr) {
    logger.debug('vnlist::getExcelDataList() - error')
  } 
}
// [e2s] mswon 요청 IP로부터 해당 주차장의 모든 주차면의 IP를 나열한 문자열를 취득
async function SearchParkAreaAddrs (_addr) {
  logger.debug('vnlist::SearchParkAreaAddrs - Search Park Area from request IP : '+_addr);
  var dataBuffer = [];
  var addrs = '';
  var returnStr = '';
  var places = [];
  var place_idx = -1;
  try {
    var jsonFile = fs.readFileSync(place_info, 'utf8');

    dataBuffer = JSON.parse(jsonFile);

    places = dataBuffer.places;
    
    places.forEach(place => {
      var hosts = place['hosts'];

      hosts.forEach(host =>{
        if(host['ip'] == _addr) {
          hosts.forEach(TargetAddr => {
            addrs += ', ' + host['ip'];
          });
        }
        
      });    
    });
    if(addrs == '') {
      return returnStr;
    } else {
      returnStr = addrs.substring(2, addrs.length);
    }
    return  returnStr;

  } catch (exception) {
    logger.debug('vnlist::SearchParkAreaAddrs :' + exception);
  }
}

// [e2s] mswon 파일 출력용 주차 내역 목록 작성
function get_Export_park_Area_list(_rows, _start, _count) {
  var now_time = new Date();
  var a_export_list = [];
  var p_list = park_list_init(_rows);
  var l_time = 0;
  var l_count = 0;
  var length = p_list.length;
  var t_time_check  = '';

  p_list.forEach(_item => {
    if (++l_count < length) {
      if (_item.s_flag != 0) _item.s_flag = 0;
      if (_item.e_time == 0) _item.e_time = l_time;
    }
    var is_ev = (g_ev_list.get(_item.plate_no) != null ? true : false); // 전기차 DB 체크
    var parking_time = ((_item.s_flag == 0 && _item.e_time != '') ? _item.e_time : now_time) - _item.time;
    
    if(Math.floor((parking_time % 3600000) / 60000) < 5 ) {
      t_time_check = '5분 미만';
    } else if (Math.floor((parking_time % 3600000) / 60000) > 70 ) {
      t_time_check = '70분 초과';
    } else {
      t_time_check = '';
    }

    var t_time = get_parkingtime_string(parking_time);
    var e_time = ((_item.s_flag == 0 && _item.e_time > 0) ? get_time_string(_item.e_time) : '주차중');


    a_export_list.push({
      index: _item.index,
      type: (is_ev == true ? '전기' : _item.type),
      plate_no: _item.plate_no,
      t_time: t_time,
      t_time_check : t_time_check,
      p_time: get_time_string(_item.time), // parking time
      e_time: e_time, 
    });
    
    l_time = _item.time;
  });

  return a_export_list;
}

function fs_read_html(_resp, _html) {
  if (_resp) {
    fs.readFile( vnum_dir + _html, function(err, _data) {
      _resp.writeHead(200, {'Content-Type':'text/html'});
      _resp.end(_data);
    });
  }
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

function get_timestamp_string(_timestamp) {
  return get_time_string( Date.parse(_timestamp));
}

function array_clear(_array) {
  if (_array && _array.length > 0) _array.splice(0, _array.length);
  return _array;
}

//
async function get_reg_ev_nums() {
  logger.debug('vnlist::get_reg_ev_nums() - ');

  g_ev_list.clear();

  const connection = await db.getConnection(async conn => conn);

  await connection.beginTransaction();

  try {
    var [rows] = await connection.query('SELECT * FROM evnum ORDER BY number');
    // logger.debug(rows);
    rows.forEach(row => {
      var item = JSON.parse(g_ev_item);
      item._ID = row._ID;
      item.number = row.number;
      item.auth = row.auth;
      item.fuel = row.fuel;
      item.fuel_s = row.fuel_s;
      g_ev_list.set(row.number, item);
      //logger.debug(row);
      //logger.debug(item);
    });
  }
  catch (exception) {

  }
  finally {
    connection.release();
  }

  // logger.debug(g_ev_list);
}

async function get_reg_ev_num(_num) {
  logger.debug('vnlist::get_reg_ev_num() - '+_num);

  const connection = await db.getConnection(async conn => conn);

  await connection.beginTransaction();

  try {
    var [rows] = await connection.query('SELECT * FROM evnum WHERE number = ? ORDER BY number', [_num]);
    //logger.debug(rows);
    if (rows.length > 0) {
      return true;
    }
    return false;
  }
  catch (exception) {

  }
  finally {
    //logger.debug('get_reg_ev_num() - finally');
    connection.release();
  }
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

function park_list_init(_rows) {
  logger.debug('vnlist::park_list_init() - '+_rows.length );

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
    // logger.debug('vnlist::park_list_init() - ['+new_item.plate_no+']');

    // (입차) 공백이 아니면
    if (new_item.type && new_item.type != '' && new_item.plate_no && new_item.plate_no != '' && new_item.plate_no.length >= 7) {
      new_item.s_flag = 1; // 0:출자, 1:입차

      // 차량 번호 뒤 4자리를 비교, 인식률이 좋아지면 차량번호 전체로 비교하는 것으로 바꾸어야 함.
      plate_no = new_item.plate_no.slice(-4);
      var _index = p_indexer.get(plate_no);
      // logger.debug('vnlist::park_list_init() - 0 ['+plate_no+'] i['+i+'] _index['+_index+']');

      var s_item = null;
      // 이전에 아이템이 있으면, 중복 입차 출차가 아니면
      if ((s_item=g_park_list.get(_index)) != null ) {
        var s_time = (s_item.e_time > 0 ? s_item.e_time : s_item.time);
        // logger.debug('vnlist::park_list_init() - 1 ['+plate_no+'] _index['+_index+'] s_time['+s_time+']time['+s_item.time+'] e_time['+s_item.e_time+']');

        if (l_num_s == plate_no) {
          // 1시간 이내에 바로전 차량과 같은 번호는 입차시간은 같은 것으로 판단, (번호인식문제로)
          s_time += 3600000;
        } else {
          // 5분 이내에 같은 번호는 입차시간은 같은 것으로 판단, (번호인식문제로)
          s_time += 300000;
        }
        if (s_time > new_item.time) {
          // logger.debug('vnlist::park_list_init() - 1 ['+plate_no+'] old_idx['+old_idx+'] ['+s_item.time+'] ['+s_item.time+']');
          new_item.e_time = new_item.time;
          new_item.e_path = new_item.path;
          new_item.time   = s_item.time;
          // new_item.path   = s_item.path;  // Test Code : Last Image

          g_park_list.delete(_index); // 출력 리스트에서 이전 번호 삭제
        } else {
          // logger.debug('vnlist::park_list_init() - 3 i['+i+'] ['+plate_no+'] _index['+_index+'] time['+s_item.time+'] e_time['+new_item.e_time+']');

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

              // logger.debug('vnlist::park_list_init() - 4 ['+plate_no+'] old_num['+old_num+'] old_idx['+old_idx+'] ['+new_item.time+']  ['+new_item.e_time+']');

              p_indexer.delete(old_num); // 비교 리스트에서 이전 번호 삭제
              g_park_list.delete(old_idx); // 출력 리스트에서 이전 번호 삭제
            }
            // 다른 번호이면 이전 아이템 출차 시간 등록
            else {
              s_item.s_flag = 0; // 0:출자, 1:입차
              s_item.e_time = new_item.time;
              if (s_item.e_path == '') s_item.e_path = s_item.path;
              // logger.debug('vnlist::park_list_init() - 3-1 ['+plate_no+'] old_num['+old_num+'] old_idx['+old_idx+'] ['+old_item.time+']  ['+old_item.e_time+']');

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
      // logger.debug('vnlist::park_list_init() - 5 ['+plate_no+']['+l_num+']['+l_time+'] ['+new_item.time+']');
      // 이전 아이템이 있으면, 공백이 없을 경우
      if (l_num) {
        var s_item = null;
        var _index = p_indexer.get(l_num);
        // logger.debug('vnlist::park_list_init() - 7 ['+plate_no+'] l_num['+l_num+'] _index['+_index+']');
        // logger.debug(g_park_list);
        if ((s_item=g_park_list.get(_index)) != null ) {
          // logger.debug('vnlist::park_list_init() - 8 ['+plate_no+'] ['+new_item.plate_no+'] ['+s_item.time+'] ['+new_item.time+']');
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
      logger.debug('vnlist::park_list_init() - exit index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
      _item.s_flag = 0; // 0:출자, 1:입차
      if (_item.e_time == 0) l_item = _item;
    }
    //l_time = _item.time;
  });

  return g_park_list;
}

function get_park_list(_rows, _start, _count) {
  var now_time = new Date();
  var a_list = array_clear(a_park_list);
  var p_list = park_list_init(_rows);
  var l_time = 0;
  var l_count = 0;
  var length = p_list.length;
  p_list.forEach(_item => {
    // logger.debug('vnlist::get_park_list() - 1 index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
    if (++l_count < length) {
      // logger.debug('vnlist::get_park_list() - 2 index['+_item.index+'] l_count['+l_count+'] plate_no['+_item.plate_no+'] s_flag['+_item.s_flag+'] time['+_item.time+'] e_time['+_item.e_time+']');
      if (_item.s_flag != 0) _item.s_flag = 0;
      if (_item.e_time == 0) _item.e_time = l_time;
    }
    // 리스트로 할지 DB 쿼리로 할지 추후 결정, ==> ASYNC로 동작해서 아래 코드 삭제
    // var is_ev = true;
    // if (_item.type != '전기') is_ev = get_reg_ev_num(_item.plate_no); // (g_ev_list.get(_item.plate_no) != null ? true : false);

    var is_ev = (g_ev_list.get(_item.plate_no) != null ? true : false); // 전기차 DB 체크
    var t_time = get_parkingtime_string(((_item.s_flag == 0 && _item.e_time != '') ? _item.e_time : now_time) - _item.time);
    var e_time = ((_item.s_flag == 0 && _item.e_time > 0) ? get_time_string(_item.e_time) : '주차중');
    // logger.debug('get_park_list() - '+e_time);

    a_list.push({
      index: _item.index,
      addr: _item.addr,
      type: (is_ev == true ? '전기' : _item.type),
      plate_no: _item.plate_no,
      t_time: t_time,
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

function get_db_date_string(_time) {
  var times  = new Date(_time);
  return times.getFullYear()+'-'
       + get_2num(times.getMonth()+1)+'-'
       + get_2num(times.getDate());
}

function _db_list_render(_resp, _addr, _rows, _s_time = null, _e_time = null, _ofs=0, _cnt=9) {
  var _start = g_page_start;
  var _count = g_page_count;

  //logger.debug('vnlist::_db_list_render() - _start : '+_start+' _count : '+ _count+' _ofs : '+_ofs+' _cnt : '+_cnt);

  if (_ofs != null && _ofs != '') {
    _start = parseInt(_ofs);
  }
  if (_cnt != null && _cnt != '') {
    _count = parseInt(_cnt);
  }

  var list = array_clear(a_park_list);
  if (_rows && _rows.length > 0) {
    list = get_park_list(_rows, _start, _count);
  }
  const sortedList = list.sort((a, b) => (a.index < b.index ? 1 : -1));

  var _index = 0;
  var list_end = _start+_count;
  var list_count = sortedList.length;
  var list_page = parseInt(list_count / _count);
  if ((list_page*_count) < list_count) list_page++;

  logger.debug('vnlist::_db_list_render() - list_count : '+list_count+' list_page : '+list_page+' _start : '+_start+' list_end : '+list_end);

  var _park_list = [];
  sortedList.forEach(_item => {
    if (_index >= _start && _index < list_end) {
      _park_list.push({
        index: _item.index,
        addr: _item.addr,
        type: _item.type,
        plate_no: _item.plate_no,
        t_time: _item.t_time,
        p_time: _item.p_time,
        p_path: _item.p_path,
        e_time: _item.e_time,
        e_path: _item.e_path
      });
    }
    _index++;
  });
  g_vnlist = _park_list;
  //logger.debug(list);
  var place_item = g_places_idx.get(_addr);
  //logger.debug(place_item);
  if (_resp) {
    var page_num = (_start / _count);
    var page_start = (parseInt(page_num / 10) * 10);
    var page_end = page_start+10;
    logger.debug('vnlist::_db_list_render() - page_start : '+page_start+' page_end : '+page_end+' page_num :'+page_num);

    _resp.render('vnlist', {
      title: '전기차 충전/주차 현황',
      dt1: _s_time,
      dt2: _e_time,
      ip_addr: _addr, //place_item.space_ip
      place_name: place_item.place_name,
      list_count: list_count,
      list_page: list_page,
      page_start: page_start,
      page_end: page_end,
      page_num: page_num,
      park_list: _park_list
    });
  }
  //if (_resp) _resp.end();
}

async function _db_list( _resp, _addr = null, _s_time = null, _e_time = null, _ofs=0, _cnt=9) {
  //logger.debug('vnlist::_db_list() - '+_addr);
  const connection = await db.getConnection(async conn => conn);
  await connection.beginTransaction();

  //var query = util.format('SELECT * FROM plate WHERE addr = \'%s\' ORDER BY timestamp DESC LIMIT 1', host);

  try {
    if ((_s_time != null || _s_time != '') && (_e_time != null || _e_time != '') ) {
      var s_date = new Date(_s_time);
      var e_date = new Date(_e_time);

      s_date = s_date - 32400000; // - 9hour
      e_date = (e_date - 32400000) + 86400000; // - 9hour + 24hour
      //logger.debug('vnlist::_db_list_date() - s_date['+s_date+']['+get_db_date_string(s_date)+'] e_date['+e_date+']['+get_db_date_string(e_date)+']');

      var s_db_date = get_db_date_string(s_date);
      var e_db_date = get_db_date_string(e_date);

      logger.debug('vnlist::_db_list_date() - s_date['+s_date+']['+s_db_date+'] e_date['+e_date+']['+e_db_date+']');

      var [rows] = await connection.query('SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr = ? AND timestamp BETWEEN ? AND ?', [_addr, s_db_date, e_db_date]);
      //logger.debug(rows);
      _db_list_render(_resp, _addr, rows, _s_time, _e_time, _ofs, _cnt);
    }
    else {
      //connection.query('SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr = ? LIMIT 0, 15', [_addr], (_err, _rows) => {
      var [rows] = await connection.query('SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr = ?', [_addr]);
      //logger.debug(rows);
      _db_list_render(_resp, _addr, rows, '', '', _ofs, _cnt);
    }
    await connection.commit();
  }
  catch (exception) {

  }
  finally {
    connection.release();
  }
}

//=================================================================================================
// EventEmitter
//-------------------------------------------------------------------------------------------------
emitter.on('_on_db_list', function (_page, _addr=null, _s_time=null, _e_time=null, _ofs=0, _cnt=9) {
  // logger.debug('vnlist::_on_req_status() - _page['+_page+'] _index['+_index+'] _spc_idx['+_spc_idx+']');
  if (_page == g_page)  {
    if (!_s_time && _s_time == '') _s_time = null;
    if (!_e_time && _e_time == '') _s_time = null;
    _db_list(g_resp, _addr, _s_time, _e_time, _ofs, _cnt);
  }
});

//=================================================================================================
// Router
//-------------------------------------------------------------------------------------------------

/* GET users listing. */
router.get('/', function(req, res, next) {
  logger.debug('vnlist.js - /  ');

  var s_date = new Date();
  var s_db_date = get_db_date_string(s_date);
  // var e_date = new Date(s_date);
  // e_date =s_date + 86400000; // + 24hour
  // var e_db_date = get_db_date_string(e_date);

  // logger.debug('vnlist:: - s_date['+s_date+']['+get_time_string(s_date)+'] e_date['+e_date+']['+get_time_string(e_date)+']');
  // logger.debug('vnlist:: - s_date['+s_date+']['+get_db_date_string(s_date)+'] e_date['+e_date+']['+get_db_date_string(e_date)+']');

  g_resp = res;
  g_places_init();
  array_clear(a_park_list);
  //cemitter.emit('_on_db_list', g_page, '58.150.152.152', s_db_date, s_db_date);
  emitter.emit('_on_db_list', g_page, '27.101.117.45', s_db_date, s_db_date, g_page_start, g_page_count);
  //var place_item = g_places_idx.get('58.150.152.152');
  //_db_list(res, place_item.space_ip);
});

// GET specific index
// router.get('/:id', function(req, res, next) {
//   logger.debug('vnlist.js - /  '+ req.params.id);
// });

function formatDate(d) {
  var day = '' + d.getDate(),
      month = '' + (d.getMonth() + 1),
      year = d.getFullYear();

  if (month.length < 2)
      month = '0' + month;

  if (day.length < 2)
      day = '0' + day;

  return [year, month, day].join('-');
}

function getFirstDay(d) {
  var day = '' + d.getDate(),
      month = '' + (d.getMonth() + 1),
      year = d.getFullYear();

  if (month.length < 2)
      month = '0' + month;

  // if (day.length < 2)
  //     day = '0' + day;
  day = '01';

  return [year, month, day].join('-');
}

router.get('/list/:id', function(req, res, next) {
  logger.debug('vnlist.js - /list  '+ req.params.id);
  var ip  = req.query.ip;
  var dt1 = req.query.dt1;
  var dt2 = req.query.dt2;
  var ofs = req.query.ofs;
  var cnt = req.query.cnt;

  var n_date = new Date();
  if (ip == null || ip == '') {
    ip =  req.params.id;
  }
  if (dt1 == null || dt1 == '') {
    // dt1 = get_db_date_string(n_date);
    dt1 = formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    // dt1 = getFirstDay(new Date());
  }
  if (dt2 == null || dt2 == '') {
    dt2 = get_db_date_string(n_date);
  }
  if (ofs == null || ofs == '') {
    ofs = g_page_start;
  }
  if (cnt == null || cnt == '') {
    cnt = g_page_count;
  }

  logger.debug('ip: ' + ip + ', dt1: ' + dt1+', dt2: ' + dt2+', ofs: ' + ofs+', cnt: ' + cnt);

  g_resp = res;
  g_places_init();
  get_reg_ev_nums();
  //_db_list(res, req.params.id, null, null);
  emitter.emit('_on_db_list', g_page, req.params.id, dt1, dt2, ofs, cnt);
});

router.get('/status/:id', async function(req, res, next) {
  logger.debug('vnlist.js - /status '+ req.params.id);

  // if (g_resp) g_resp.end();
  g_resp = res;
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

router.get('/dimage/:id', function(req, res, next) {
  logger.debug('vnlist.js - /dimage '+ req.params.id);

  var p_item = g_park_list.get(parseInt(req.params.id));
  //var filename = image_dir + urlencode.decode(req.params.id);
  //var filename = p_item.path;
  var filename =(p_item.path .length > 21 ? p_item.path : '/usr/src/files/plate/'+p_item.addr+'/'+p_item.path);
  logger.debug('vnlist.js - /dimage '+ filename);

  fs.stat( filename, (_err, _stats) => {
    if (!_err) {
      fs.readFile(filename, function(_err2, _data) {
        if (!_err2) {
          res.writeHead(200, { 'Content-Type': 'image/jpg'});
          res.end(_data);
        }
      });
    }
  })

});

router.get('/image/:id', function(req, res, next) {
  logger.debug('vnlist.js - /image '+ req.params.id);
  var filename = req.params.id
  //var filename = image_dir + req.params.id;
  //urlencode.decode(val);

  fs.stat( filename, (_err, _stats) => {
    if (!_err) {
      fs.readFile(filename, function(_err2, _data) {
        if (!_err2) {
          res.writeHead(200, { 'Content-Type': 'image/jpg'});
          res.end(_data);
        }
      });
    }
  })

});

router.get('/pimage/', function(req, res, next) {
  logger.debug('vnlist.js - /pimage ');
  var ip = req.query.ip;
  var path = req.query.path;
  var filename = '/usr/src/files/plate/'+ip+'/'+path;
  logger.debug('vnlist.js - /pimage '+ filename);

  fs.stat( filename, (_err, _stats) => {
    if (!_err) {
      fs.readFile(filename, function(_err2, _data) {
        if (!_err2) {
          res.writeHead(200, { 'Content-Type': 'image/jpg'});
          res.end(_data);
        }
      });
    }
  })

});

// _cmd = 0:삭제, 1:등록
async function reg_ev_num(_ip, _cmd, _num, _resp = null) {
  logger.debug('vnlist::reg_ev_num: _ip['+_ip+'] _cmd['+_cmd+'] _val['+_num+']');

  const connection = await db.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    // 등록
    if (_cmd == 1) {
      var [rows] = await connection.query('SELECT * FROM evnum WHERE number = ? ORDER BY _ID DESC', [_num]);

      logger.debug(rows);

      if (rows.length == 0) {
        //logger.debug('OK: ' + _rows.length);
        //for(var i = 0; i < _rows.length; i++){
        //  logger.debug(_rows[i]._ID + " : " + _rows[i].number);
        //}
        //return ;

        //var query =
          //'INSERT IGNORE INTO evnum (_ID, number, auth, fuel) VALUES (NULL, \"'+_num+'\", 0, 0);'
          //'INSERT INTO evnum (_ID, number, auth, fuel) VALUES (NULL, \"'+_num+'\", 0, 0) WHERE NOT EXISTS (SELECT * FROM evnum WHERE number = \"'+_num+'\")';
        //db.execute( query, (_err, _row) => {
        //db.execute('INSERT INTO evnum (number) VALUES (?)', [_num], (_err, _res) => {
        //db.execute('INSERT INTO evnum (_ID, number, auth, fuel) VALUES (NULL, ?, 0, 0) WHERE NOT EXITS (SELECT _ID, number FROM evnum WHERE number=?)', [_num, _num], (_err, _row) => {
        var [result] = await connection.execute('INSERT IGNORE INTO evnum (_ID, number, auth, fuel) VALUES (NULL, ?, 1, 0);', [_num]);

        // auth = 0:자동등록, 1:사용자 등록, 2:국토부 연결 등록 (국토부 연결되면 fuel값 저장)
        logger.debug('result: ' + result.affectedRows + ' rows inserted');
        // logger.debug(result);

        //emit ter.emit('_on_reg_evnum', g_page, _ip, 1, _num);

        if (_resp) _resp.status(201).json({
          'event' : {
            'type' :  _cmd, // 등록, 삭제
            'status' : 'ok' // response
          }
        })
      }
      else {
        logger.debug( _num + " exists");
      }
    }
    // 삭제
    else if (_cmd == 0) {
      var [result] = await connection.execute('DELETE FROM evnum WHERE number=?', [_num]);

      logger.debug('result: ' + result.affectedRows + ' rows deleted');
      // logger.debug(result);

      //emitter.emit('_on_reg_evnum', g_page, _ip, 0, _num);

      if (_resp) _resp.status(201).json({
        'event' : {
          'type' :  _cmd, // 등록, 삭제
          'status' : 'fail' // response
        }
      })
    }

    await connection.commit();
  }
  catch (exception) {

  }
  finally {
    connection.release();
  }
}

router.get('/command/', function(req, res, next) {
  logger.debug('vnlist.js - /command');
  var ip  = req.query.ip;
  var cmd = parseInt(req.query.cmd);
  var val1 = req.query.val1;
  var val2 = req.query.val2;

  logger.debug('ip: ' + ip + ', cmd: '+cmd+', val1: ' + val1+', val2: ' + val2);

  switch (cmd) {
  case 8: // 자동차 번호 등록
    reg_ev_num( ip, 1, val1, res);
    return ;
  case 9: // 자동차 번호 삭제
    reg_ev_num( ip, 0, val1, res);
    return ;
  case 10:
    //_on_db_list(res, ip, val1,  val2);
    emitter.emit('_on_db_list', g_page, ip, val1,  val2, g_page_start, g_page_count);
    return ;
  }

});

router.get('/excelexport/',async function(req, res) {
  logger.debug('vnlist.js - /excelexport/addr=' + req.query.addr+'&s_time='+req.query.s_time+'&e_time='+req.query.e_time);
  
  // var strAddrs = await SearchParkAreaAddrs(req.query.addr);

  logger.debug('Addr Search Result : '+ req.query.addr);

  var exceldata_list = await getExcelDataList(req.query.addr, req.query.s_time, req.query.e_time);

  var jsonDataList = JSON.stringify(exceldata_list);

  //logger.debug('Get jsonData Result : '+ jsonDataList);

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
