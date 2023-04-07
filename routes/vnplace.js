var express = require('express');
var router = express.Router();

var emitter = require('../utils/emitter');

const locationName = 'vnplace';

var fs = require('fs');
var path = require('path');

var mngEdge = require('../utils/edgeManager');
var mngPlace = require('../utils/placeManager');
const browser = require('../utils/browser');
const logger = require('../utils/logManager');
//=================================================================================================
// Global variable
//-------------------------------------------------------------------------------------------------

var file_dir = path.join(__dirname, '../../files') + '/'; // Original Path : /data/plate_detect/file
var capture_dir = file_dir + 'capture/';
var status_dir = file_dir + 'status/';
var status_img_dir = status_dir + 'img/';
var status_cap_dir = status_dir + 'cap/';

var g_page = 'vnplace';
var g_status_resp_que = [];
var g_resp_que_size = 30;
// var g_row = 7;
var g_files = [];
var _PORT = 5000;
// [e2s] 2021.04.19 mswon 클릭시 스냅샷 갱신간격 변경
var g_intRenewalTime = 30000;

//주차면 상태객체
var vnplaceListItem = {
  //현황판 번호
  index:0,
  //주차면 소속 주차장 번호
  placeIndex:0,
  //주차면 번호
  areaIndex:0,
  //주차면 이름
  name:"",
  //주차면 EDGE단말 IP주소
  host:"",
  //주차면 상태
  state:99,
};

const vnplaceListItemStr = JSON.stringify(vnplaceListItem);

var places = [];
var edgeSystemStateMap = new Map();

var vnplaceListMap = new Map();
//=================================================================================================
// Function
//-------------------------------------------------------------------------------------------------
//주차장 정보 초기화 함수 [E2S] mswon 2021.07.12 변경
function GetCommonInfo() {
  if(vnplaceListMap.length > 0) return;
  places = mngPlace.places;
  edgeSystemStateMap = mngPlace.edgeSystemStateMap;  
  var vnplaceListArr = GetListFromMap();

  return vnplaceListArr;
}
function GetListFromMap() {
  var vnplaceListArr = [];
  var count = 0;

  places.forEach( _place => {
    _place.areas.forEach( _area => {
      var vnplaceItem = JSON.parse(vnplaceListItemStr);

      vnplaceItem.index = count;
      vnplaceItem.placeIndex = _area.place_idx;
      vnplaceItem.areaIndex = _area.space_idx;
      vnplaceItem.name = _place.name + ' ' + (_area.space_idx + 1 ) + '면';
      vnplaceItem.host = _area.host;
      var edgeState = edgeSystemStateMap.get(_area.host);
      if(edgeState != undefined) {
        vnplaceItem.state = edgeState.vehicleStatus;
      }

      vnplaceListArr.push(vnplaceItem); 
      vnplaceListMap.set(_area.host, vnplaceItem);

      count++;
    });
  });
  return vnplaceListArr;
}

function array_clear(_array) {
  if (_array && _array.length > 0) _array.splice(0, _array.length);
  return _array;
}

function read_dir() {
  
  g_files  = array_clear(g_files);

  return g_files;
}

function _place_list_render(_resp, _row=6) {  
  var _f_list = [];
  if (g_files.length > 0) _f_list = g_files;
  else _f_list = read_dir();
    
  logger.debug('[DEBUG]'+'[VNPLACE]_place_list_render');

  
}
//주차상태 간이표시용 함수 (차량 유무, 차량종류)
function getAreaStatus (_status, _type) {
  if (_status == false || _type == '') return 0;
  else if (_status == true && _type == '일반') return 1;//'일반차';
  else if (_status == true && _type == '전기') return 2;//'충전중';
  else if (_status == true && _type == '영업') return 3;//'영업';
  else if (_status == true && _type == 'OVER') return 98;// 98:Time Over
  else return 99; //99:Network disconnect
}

//=================================================================================================
// EventEmitter
//-------------------------------------------------------------------------------------------------
emitter.on('_on_place_command', function (_page, _cmd, _val1, _val2, _resp) {
  logger.debug('[DEBUG]'+'vnplace::_on_place_command() - _page['+_page+'] __cmd['+_cmd+'] _val1['+_val1+'] _val2['+_val2+']');
  if (_page == g_page)  {
    on_command(_cmd, _val1, _val2, _resp);
  }
});

//주차면 현상태 정보 갱신 이벤트
//현상태정보맵 갱신이벤트
emitter.on(mngPlace.EVT_STATE_UPDATED, function (_edgeStateInfo) {
  logger.info('[INFO]'+'[VNPLACE][EVT_STATE_UPDATED] (host = '+_edgeStateInfo.host+', status ='+_edgeStateInfo.vehicleStatus+')');  
  edgeSystemStateMap.set(_edgeStateInfo.host, _edgeStateInfo);
  
  const resp_data = 'data:'
     + '{\"d_type\": 0'
     + ', \"host\": \"' + _edgeStateInfo.host + '\"'
     + ', \"state\": \"' + _edgeStateInfo.vehicleStatus + '\"'
     + '}\n\n';
     
  if(g_status_resp_que.length > g_resp_que_size) {
    g_status_resp_que.unshift();
  } 
  g_status_resp_que.push(resp_data);
});

//주차면 팝업이미지(스냅샷) 갱신 이벤트
emitter.on('VNPLACE_POPUP_VIEW', function (_host, _file) {
  logger.info('[INFO]'+'vnplace::VNPLACE_POPUP_UPDATED - (host['+_host+'] file['+_file+'])');
  const resp_data = 'data:'
  + '{\"d_type\": 2'
  + ', \"cap_image\": \"' + _file
  + '\", \"d_host\": \"' + _host
  + '\"}\n\n';

  if(g_status_resp_que.length > g_resp_que_size) {
    g_status_resp_que.unshift();
  } 
  g_status_resp_que.push(resp_data);
});

//=================================================================================================
// Router
//-------------------------------------------------------------------------------------------------

//화면진입처리
router.get('/', function(req, res, next) {
  logger.info('[INFO]'+'vnplace.js - /  ');
  //화면에 대한 요청을 일단 비우기
  g_status_resp_que.length = 0;
  //유저 세션이 존재하는 경우 화면 랜더링
  if(req.session.user != undefined) {
    req.session.user.lastLocation = locationName;
    var row = 8;
    var vnplaceList = GetCommonInfo();
    res.render('vnplace', {
      title: '전기차 충전/주차 현황',
      page_row: row,
      vnplaceList: vnplaceList
    });
  } else {
    require('../utils/browser').ShowAlertMove(res, '로그인 정보가 없습니다.', 'login');
  }

  res.end();
});


router.get('/list/', function(req, res, next) {
  logger.debug('[DEBUG]'+'vnplace.js - /list  '+ req.params.id);
  var row = req.query.row;
  if (row == null || row == '') {
    row = 7;
  }

  // g_row = parseInt(row);
  var vnplaceList = vnplaceListMap;
  res.render('vnplace', {
    title: '전기차 충전/주차 현황',
    page_row: row,
    vnplaceList: vnplaceList
  });
});


//화면 갱신처리
router.get('/status/:id', async function(req, res, next) {
  logger.debug('[DEBUG]'+'vnplace.js - /status '+ req.params.id);
  
  if(req.session.user.lastLocation !== locationName) {
    res.redirect('/'+locationName);
    return;
  }

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });

  if(g_status_resp_que.length > 0) {
    const body_data = g_status_resp_que.shift();
    res.end(body_data);
    // 큐가 없는 경우 화면 요청에 대하여 대기
  } else {
    res.end();
  }
});

//섬네일 이미지 요청
router.get('/image/:id', async function(req, res, next) {
  logger.debug('[DEBUG]'+'vnplace.js - /image/'+req.params.id);
  var filename = status_dir + 'img_' + req.params.id;

  fs.stat( filename, (_err, _stats) => {
    if (!_err) {
      fs.readFile(filename, function(_err2, _data) {
        if (!_err2) {
          res.writeHead(200, { 'Content-Type': 'image/jpg'});
          res.end(_data);
        }
      });
    } else {
      logger.error('[VNPLACE] thumbnail file does not exists, ' + filename);
    }
  })
});

//스냅샷 이미지를 서버에 요청
router.get('/capture/:id', async function(req, res, next) {
  logger.debug('[DEBUG]'+'vnplace.js - /capture/'+req.params.id);
  var filename = status_dir + 'cap_' + req.params.id;

  var isExists = fs.existsSync(filename);
  
  if(!isExists) {
    logger.error('[ERROR]'+'[VNPLACE] clickImage file does not exists, ' + filename);
  }

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

function cmd_capture(_host, _time, _resp) {
  var filename = status_cap_dir + _host + '.jpg';
  logger.debug('[DEBUG]'+'vnplace::cmd_capture() - _host['+_host+'] _time['+ _time+'] filename['+ filename+']');
  g_host = _host;
  fs.stat( filename, (_err, _stats) => {
    if (_err) {
      logger.error('[ERROR]'+'[VNPLACE] clickImage file does not exists, ' + filename);
      emitter.emit('_on_place_command', g_page, 41, _host, 88888 , null);  
    } else {
      //logger.debug('[DEBUG]'+_stats);
      var now_time = new Date();
      var ctime = now_time - parseInt(_stats.ctimeMs);

      //logger.debug('[DEBUG]'+'vnplace::cmd_capture() - ctimeMs['+_stats.ctimeMs+'] ctime['+ ctime+']');
      if ((ctime) > g_intRenewalTime) {
        emitter.emit('_on_place_command', g_page, 41, _host, now_time , null);    
      }
    }
  })


  return true;
}

async function on_command(_cmd, _val1, _val2, _resp) {
  switch (_cmd) {
  case 41: // 카메라 캡쳐
    logger.info('[INFO]'+'[VNPLACE] REQUEST THUMBNAIL, ' + _val1 + ', ' + _val2);
    const response = await mngEdge.PostCommandSystem( _val1, 41, 88888);
    break;
  case 42: // 카메라 캡쳐
    cmd_capture(_val1, _val2, _resp);
    if (_resp) _resp.end();
    return;
  }
}

router.get('/command/', function(req, res, next) {
  var cmd = parseInt(req.query.cmd);
  var val1 = req.query.val1;
  var val2 = req.query.val2;

  logger.info('[INFO]'+'vnplace.js - /command - cmd: '+cmd+', val1: ' + val1+', val2: ' + val2);

  on_command( cmd, val1, val2, res);
  //emitter.emit('_on_command', g_page, cmd, val1, val2, res);
});

// POST
router.post("/", (req, res, next) => {
});

module.exports = router;
