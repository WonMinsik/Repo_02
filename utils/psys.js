var emitter = require('../utils/emitter');
var mngPlace = require('./placeManager');
var fs = require('fs');
const { EventEmitter } = require('stream');
var pool = require('../db');
const logger = require('./logManager');

//=================================================================================================

var g_psys = new Map();
var _PLACE_INFO = `{ 
  "index":0,
  "place":0,
  "lat":0,
  "lon":0,
  "s_index":-1,
  "space":0,
  "spaces": {}
}`;

function set_psys(_index, _place) {
  var pinfo = g_psys.get(_index);
  if (!pinfo) pinfo = JSON.parse(_PLACE_INFO);

  pinfo.index = _index;//_place.index;
  pinfo.place = _place.name;
  pinfo.lat = _place.lat;
  pinfo.lon = _place.lon;
  pinfo.space = _place.space; // space count
  pinfo.space_select = -1; // space selected index

  var spaces = pinfo['spaces']; //pinfo.space_info;
  var idx = 0; 
  _place.hosts.forEach(_host => {
    var vinfo = {};
    vinfo['index'] = idx;
    vinfo['selected'] = 0;
    vinfo['connected'] = 0;
    vinfo['beacon'] = 0;
    vinfo['volume'] = 0;
    vinfo['sys_time'] = 0;
    //vinfo['v_status'] = false; // Vehicle status (0:비어있음, 1:일반차, 2:충전중, 3:영업, 98:Time Over)
    vinfo['v_state'] = false; // Vehicle detect (true/false)
    vinfo['s_status'] = false; // Space status (차량 있음/없음)
    //vinfo['v_ev_auth'] = 0; // 전기차 인증 = 1:인증, 일반차일때 인증된 경우 전기차로 판단
    vinfo['v_addr'] = _host.ip;
    vinfo['v_type'] = 0;
    vinfo['v_num'] = 0;
    vinfo['v_size'] = 0;
    vinfo['v_path'] = 0;
    vinfo['f_date'] = 0;
    vinfo['f_size'] = 0;
    vinfo['cap_image'] = 0;
    vinfo['timestamp'] = ''; // Timestamp
    vinfo['p_time'] = ''; // Parking time

    spaces[idx] = vinfo;
    idx++;
  });
  pinfo.space = idx;//_place.space; // space count

  // [e2s] 2021.04.15 mswon - add log 
  logger.debug('[DEBUG]'+'psys.js::set_psys() - index[' + pinfo.space + ']');
  g_psys.set(_index, pinfo);
}

//시스템 초기 처리
fs.readFile('./place_info.json', 'utf8', (error, jsonFile) => {
  if (error) return logger.debug('[DEBUG]'+error);
  mngPlace.InitDBInfo(jsonFile);
});

async function sleep(t){
  return new Promise(resolve=>setTimeout(resolve,t));
}

var _CREATE_PLACE = `CREATE TABLE place (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  name varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  address varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  latitude float NOT NULL,
  longitude float NOT NULL,
  spaces int(4) DEFAULT 0,
  hosts varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

var _CREATE_SPACE = `CREATE TABLE space (
  _ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  place_id bigint(20) NOT NULL,
  ip char(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  connect int(4) DEFAULT 0,
  status int(4) DEFAULT 0,
  type char(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  plate_num char(20) COLLATE utf8mb4_unicode_ci DEFAULT '0',
  fuel_code char(4) COLLATE utf8mb4_unicode_ci DEFAULT '0',
  fuel_auth int(4) DEFAULT 0,
  path char(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  capture blob DEFAULT NULL,
  PRIMARY KEY (_ID)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

function _db_insert(_places)
{
  //_db_execute('DROP TABLE place');
  //_db_execute('DROP TABLE space');
  //sleep(500);

  _db_execute(_CREATE_PLACE);
  _db_execute(_CREATE_SPACE);

  sleep(500);
  _db_insert_place_space(_places);
}

function _db_insert_place_space(_places) {
  var idx = 0;
  var s_idx = 0;
  _places.forEach(_place => {
    idx++;
    _db_insert_place(idx, _place.name, _place.addr, _place.lat, _place.lon, _place.space);
    _place.hosts.forEach(_host => {
      s_idx++
      _db_insert_space(s_idx, idx, _host.ip);
    });
  });
}

async function _db_execute(_sql) {
  const connection = await pool.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    var result = await connection.execute(_sql);
    logger.debug('[DEBUG]'+result);
    await connection.commit();
  }
  catch (exception) {
    //logger.debug('[DEBUG]'+'home::_db_insert_place() - exception ['+exception+']');
    logger.debug('[DEBUG]'+exception);
  }
  finally {
    connection.release();
  }
}

async function _db_insert_place(_idx, _name, _addr, _lat, _lon, space) {
  const connection = await pool.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    var result = await connection.execute('INSERT IGNORE INTO place (id, name, address, latitude, longitude, spaces) VALUES (?,?,?,?,?,?);', [_idx, _name, _addr, _lat, _lon, space]);
    logger.debug('[DEBUG]'+result);
    await connection.commit();
  }
  catch (exception) {
    //logger.debug('[DEBUG]'+'home::_db_insert_place() - exception ['+exception+']');
    logger.debug('[DEBUG]'+exception);
  }
  finally {
    connection.release();
  }
}

async function _db_insert_space(_idx, plate_id, _ip) {
  const connection = await pool.getConnection(async conn => conn);
  await connection.beginTransaction();

  try {
    var result = await connection.execute('INSERT IGNORE INTO space (_ID, place_id, ip) VALUES (?,?,?);', [_idx, plate_id, _ip]);
    logger.debug('[DEBUG]'+result);
    await connection.commit();
  }
  catch (exception) {
    //logger.debug('[DEBUG]'+'home::_db_insert_space() - exception ['+exception+']');
    logger.debug('[DEBUG]'+exception);
  }
  finally {
    connection.release();
  }
}

module.exports = g_psys;
