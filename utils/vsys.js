var fs = require('fs');
var mngEdge = require('./edgeManager');
const logger = require('./logManager');
var mngPlace = require('./placeManager');

var vsys = new Map();

var v_info = `{
  "index": 0,
  "index_p": 0,
  "index_s": 0,
  "data_type": 0,
  "connected": false,
  "select":0,
  "place":0,
  "lon": "",
  "lat": "",
  "beacon": 0,
  "volume": 0,
  "sys_time": "",
  "space": 1,
  "spaces": {},
  "v_addr": "",
  "v_location": "",
  "s_status": false,
  "v_type": "",
  "v_num": "",
  "v_size": "",
  "v_path": "",
  "f_date": 0,
  "f_size": 0
}`;

function set_vsys(ip, location, lon="37.3530", lat="126.9702") {
  var info = vsys.get(ip);

  if (info == null) info = JSON.parse(v_info);

  // info.resp = null;
  info.id = vsys.size;
  info.v_addr = ip;
  info.v_location = location;
  info.lon = lon;
  info.lat = lat;
  //info.s_status = false; // Space status (차량 있음/없음)

  vsys.set(ip, info);
}

fs.readFile('./places.json', 'utf8', (error, jsonFile) => {
  if (error) return logger.error('[ERROR]'+error);
  //logger.debug('[DEBUG]'+jsonFile);

  const json_data = JSON.parse(jsonFile);
  //logger.debug('[DEBUG]'+jsonFile);

  const places = json_data.places;
  places.forEach(place => {
    // logger.debug('[DEBUG]'+place);
    // logger.debug('[DEBUG]'+place.ip);
    // logger.debug('[DEBUG]'+typeof(place.ip));

    if (typeof(place.ip) === 'object') {
      for (var key in place.ip) {
        set_vsys(place.ip[key], place.name, place.lon, place.lat);
        //logger.debug('[DEBUG]'+'set object = key : '+ place.ip[key] + ', name : ' + place.name);
      }
    }
    else {
      set_vsys(place.ip,  place.name, place.lon, place.lat);
      //logger.debug('[DEBUG]'+'set ????? = key : '+ place.ip[key] + ', name : ' + place.name);
    }
    
    //if (todo.ip != '223.171.67.105') {// Server
    //}
  });
  // [e2s] 2021.04.15 mswon add log
  logger.debug('[DEBUG]'+'vsys.js - readFile');
});

module.exports = vsys;
