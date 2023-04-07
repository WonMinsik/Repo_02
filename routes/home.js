var express = require('express');
const logger = require("../utils/logManager");
var router = express.Router();

var emitter = require('../utils/emitter');

const locationName = 'home';
var g_count = 0;
const reqInterval = 10;
//DB 제어 모듈
var sqlevnum = require('../utils/sql/evnum');
var sqlplate = require('../utils/sql/plate');

//각 제어 매니저
var mngEdge = require('../utils/edgeManager');
var mngPlace = require('../utils/placeManager');

var util = require('util');
const browser = require('../utils/browser');
const { setInterval } = require('timers/promises');

//응답 큐
var g_resp_que = [];
var resp_que_size = 30;
//=================================================================================================
//[응답데이터 제어패널] : 주차면 제어패널 데이터형
var bottomPanelItem = {
  host:''
  , place_idx : 0
  , space_idx : 0
  , placeName : ''
  , beacon : 0
  , volume : 0
  , parkingTime : ''
  , status: 99
  , number : ''
  , type : ''
  , sysTime: ''
};
//주차면 제어패널 데이터 
const bottomPanelItemStr = JSON.stringify(bottomPanelItem);

//[응답데이터 종합패널] : home화면 종합패널 데이터
var resultPanelItem = {
  places : 0
  , area : 0
  , connected : 0
  , empty : 0
  , charging : 0
  , violation : 0
};
//주차장 종합 패널 데이터
const resultPanelItemStr = JSON.stringify(resultPanelItem);

//[응답데이터 0형] : HOME화면 주차장/마커 상태정보 데이터
var markerInfoItem = {
  //주차장번호
  place_idx:0,
  //위도
  lon:'',
  //경도
  lat:'',
  //주차장명
  name:'',
  //주차장 종합 상태
  status: 99,
  //주차면 갯수
  areaCount:0,
  //주차면 정보
  areas:[]
};
//주차장/마커 상태정보 데이터
const markerInfoItemStr = JSON.stringify(markerInfoItem);

//[응답데이터 0형] : HOME화면 주차면/리스트 상태정보 데이터
var listButtonInfoItem = {
  place_idx: 0,
  space_idx: 0,
  host:'',
  type: '',
  number: '',
  status:99,
  parkingTime:'',
  timeStamp:''
};
//주차면/리스트 상태정보 데이터
const listButtonInfoItemStr = JSON.stringify(listButtonInfoItem);

//공통 : DB등록 주차장/주차면 정보
var places = mngPlace.places;
//공통 : EDGE시스템상태맵
var edgeSystemStateMap = mngPlace.edgeSystemStateMap;
//HOME화면 : 마커용 데이터 배열
var markers= [];
//HOME화면 : 주차장/주차면 선택상태맵
var markerMap = new Map();

//===============================================================================================
//HOME화면 사용 함수
//===============================================================================================
//주차장/주차면 정보 획득
function GetCommonInfo() {
  if(markers.length > 0) return;
  places = mngPlace.places;
  edgeSystemStateMap = mngPlace.edgeSystemStateMap;

  places.forEach(_place => {
    
    var markerInfo = GetMarkerInfo(_place.index);
    
    markers.push(markerInfo);
    markerMap.set(markerInfo.place_idx, markerInfo);
    logger.debug('[DEBUG]'+'markerMap SET ['+ markerInfo.place_idx + ', ' + _place.name + ']');
  });
}

//주차장/마커정보 생성 (주차장번호)
function GetMarkerInfo(_place_idx) {
  var place = places[_place_idx];
  var markerInfo = JSON.parse(markerInfoItemStr);

  markerInfo.place_idx=place.index;
  markerInfo.lon=place.lon;
  markerInfo.lat=place.lat;
  markerInfo.name=place.name;
  markerInfo.status= GetPlaceMarkerStatus(_place_idx);
  markerInfo.areaCount=place.areas.length;
  markerInfo.areas=place.areas;

  return markerInfo;
}

//주차면/리스트상태정보 생성 (대상 단말IP)
function GetListButtonInfo( _host ) {
  var edgeState = edgeSystemStateMap.get(_host);
  var listButtonInfo = JSON.parse(listButtonInfoItemStr);

  var parkingTimeString = '';
  var parkingPlateNumber = '';
  var parkingPlateType = '';
  
  if (edgeState === undefined) {
    edgeState = new Object();
    edgeState.status = 99;
  }
  
  if( edgeState.status == 99 ) {
    parkingTimeString = '연결해제';
    parkingPlateType = '';
    parkingPlateNumber = '';
  }
  else if(edgeState.status == 0) {
    parkingTimeString = '비어있음';
    parkingPlateType = '';
    parkingPlateNumber = '';
  }
  else {
    parkingTimeString = GetParkingTimeString(edgeState.timestamp);
    parkingPlateType = edgeState.plateType;
    parkingPlateNumber = edgeState.plateNumber;
  }

  listButtonInfo.place_idx = edgeState.place_idx;
  listButtonInfo.space_idx = edgeState.space_idx;
  listButtonInfo.host = edgeState.host;

  listButtonInfo.status = edgeState.vehicleStatus;

  listButtonInfo.type = parkingPlateType;
  listButtonInfo.number = parkingPlateNumber;
  listButtonInfo.parkingTime = parkingTimeString;
  
  listButtonInfo.timeStamp = GetTimeString(edgeState.timestamp);
  
  return listButtonInfo;
}

//제어패널 정보 생성 (대상 단말 IP)
function GetBottomPanelInfo( _host ) {
  var edgeState = edgeSystemStateMap.get(_host);
  var bottomPanelInfo = JSON.parse(bottomPanelItemStr);
  var parkingTimeString = '';
  var parkingPlateNumber = '';
  var parkingPlateType = '';

  if(edgeState === undefined) {
    edgeState = new Object();
    edgeState.vehicleStatus = 99;
  }
  
  if(edgeState.vehicleStatus == 0) {
    parkingTimeString = '비어있음';
    parkingPlateType = '';
    parkingPlateNumber = '';
  }
  else if (edgeState.vehicleStatus == 99) {
    parkingTimeString = '연결해제';
    parkingPlateType = '';
    parkingPlateNumber = '';
  }
  else {
    parkingTimeString = GetParkingTimeString(edgeState.timestamp);
    parkingPlateType = edgeState.plateType;
    parkingPlateNumber = edgeState.plateNumber;
  }

  bottomPanelInfo.host = edgeState.host;
  bottomPanelInfo.place_idx = edgeState.place_idx;
  bottomPanelInfo.space_idx = edgeState.space_idx;
  bottomPanelInfo.placeName = places[edgeState.place_idx].name;

  bottomPanelInfo.beacon = edgeState.beacon;
  bottomPanelInfo.volume = edgeState.volume;
  bottomPanelInfo.status = edgeState.vehicleStatus;
  
  bottomPanelInfo.parkingTime = parkingTimeString;
  bottomPanelInfo.number = parkingPlateNumber;
  bottomPanelInfo.type = parkingPlateType;
  
  bottomPanelInfo.sysTime = edgeState.sys_time;

  return bottomPanelInfo;
}

//종합패널 정보 생성
function GetResultPanel() {
  var totalPlace = places.length;
  var totalArea = edgeSystemStateMap.size;

  var connectedCount = 0;
  var emptyAreaCount = 0;
  var normalVehicleCount = 0; // 주차중인 일반차량 수
  var electronicalVehiclevCount = 0; // 주차중인 전기차량 수

  edgeSystemStateMap.forEach(_edgeSystemState => {
    switch (_edgeSystemState.vehicleStatus) {
      case 0 : //공란
        connectedCount++;
        emptyAreaCount++;
        break;
      case 1 : //일반
        connectedCount++;
        normalVehicleCount++;
        break;
      case 2 : //전기
        connectedCount++;
        electronicalVehiclevCount++;
        break;
      case 3 : //영업
        connectedCount++;
        // bisnessVehicleCount++;
        electronicalVehiclevCount++;
        break;
      case 98 : //충전시간 초과
        connectedCount++;
        electronicalVehiclevCount++;
        break;
      default :
        break;
    }
  });

  var result = JSON.parse(resultPanelItemStr);

  result.places = totalPlace;
  result.area = totalArea;
  result.connected = connectedCount;
  result.empty = emptyAreaCount;
  result.charging = electronicalVehiclevCount;
  result.violation = normalVehicleCount;

  return result;
}

//IP주소 취득 (주차장번호, 주차면번호)
function getHostFromIndex(_placeIndex, _areaIndex) {
  logger.debug('[DEBUG]'+' getHostFromIndex (' + _placeIndex + ',' + _areaIndex + ')');
  try {
    if(_placeIndex < 0 || _areaIndex < 0) return null;

    var place = places[_placeIndex];
    var area = place.areas[_areaIndex];
    var hostBuffer = area.host;

    if(edgeSystemStateMap.has(hostBuffer)) return hostBuffer;
    else return null;
  }
  catch (exception) {
    logger.error('[ERROR]'+exception);
    return null;
  }
}

//Date형 시간정보를 문자열로 변환 (Date형시간)
function GetTimeString ( _timeStamp = new Date()) {
  if (_timeStamp == '' || _timeStamp == null || _timeStamp == undefined) return '';
  var year = _timeStamp.getFullYear();
  var month = _timeStamp.getMonth() + 1;
  var day = _timeStamp.getDate();
  var hours = _timeStamp.getHours();
  var minuets = _timeStamp.getMinutes();
  var seconds = _timeStamp.getSeconds();
  var timeString = year+'/'+month+'/'+day+' '+hours+':'+minuets+':'+seconds;
  return timeString;
}

async function sleep(t){
  return new Promise(resolve=>setTimeout(resolve,t));
}

function GetParkingTimeString(_timeStamp) {
  if (_timeStamp == '' || _timeStamp == null || _timeStamp == undefined) return '';
  var now_time = new Date();
  var old_time = _timeStamp;
  var parkingTimeMiliSec = now_time.getTime() - old_time.getTime();
  var parkingTime = parkingTimeMiliSec / 1000 / 60;      //(1000 * 60)) / (1000));
  return parseInt(parkingTime)+' 분 주차중';
}

// Map에서 여러면의 상태정보을 처리하기 위해
function GetPlaceMarkerStatus(_placeIndex) {
  var returnValue = 0;
  edgeSystemStateMap.forEach(_edgeStateInfo => {
    if(_edgeStateInfo.place_idx == _placeIndex) {
      if(_edgeStateInfo.vehicleStatus < 99){
        if(returnValue < _edgeStateInfo.vehicleStatus) returnValue = _edgeStateInfo.vehicleStatus;
      }
    }
  });
  logger.debug('[DEBUG]'+'place_idx : ' + _placeIndex + ', status = '+ returnValue);
  return returnValue;
}

//EDGE시스템호출(주차면의 EDGE시스템 IP주소)
async function CallEdgeSystemStatus(_host) {
  logger.info('[INFO]'+'[HOME] CALL EDGE SYSTEM : '+ _host);
  try {

    var sysInfo = await mngEdge.RequestSystemStatus(_host);
    if(sysInfo != undefined) {
      mngPlace.UpdateEdgeStateFromRequest(_host, true, sysInfo);
    }
    else{
      mngPlace.UpdateEdgeStateFromRequest(_host, false, sysInfo);
    }
  }
  catch (exception) {
    logger.error('[ERROR]'+exception);
  }
}

//주차면 충전시간설정 변경 ( 대상IP , 충전시간)
async function ChangeChargeTimeSetting(_host, _val) {
  //[E2S] mswon // 이하의 부분은 주차장정보DB작성시 해당 sql모듈 작성후, DB쿼리문 (UPDATE문)으로 변경이 필요.
  var chargeTimeChangeResult = false;
  places.forEach(_place => { 
    _place.areas.forEach(_area => {
      if(_area.host == _host) {
        chargeTimeChangeResult = true;
        _area.chargeTime = _val;
      }
    });
  });

  //이하는 sql모듈 작성시 해당 모듈에 넣을 것
  if(chargeTimeChangeResult) mngPlace.ReacquireDBInfo(places);

  return chargeTimeChangeResult;
}

//EDGE시스템호출 메소드 응답속도 동기화를 고려한 이벤트 분할
async function SelectAreaInfoUpdate(_host, _sysInfo) {
  logger.info('[INFO]'+'[HOME] SelectAreaInfoUpdate : '+ _host);
  try {
    //[E2S] mswon 2022.08.29 // 접속이 끊김등으로 정보가 없는 경우
    if (_sysInfo === '' || _sysInfo == undefined || _sysInfo === null){
      logger.debug('[DEBUG]'+'[HOME] : edge state update ==> false [' + _host + ']');
      mngPlace.UpdateEdgeStateFromRequest(_host, false, _sysInfo);
    }
    //[E2S] mswon 2022.08.29 // 정보가 존재하는 경우
    else {
      logger.debug('[DEBUG]'+'[HOME] : edge state update ==> true [' + _host + ']');
      mngPlace.UpdateEdgeStateFromRequest(_host, true, _sysInfo);
      
    }
    return true;
  }
  catch (exception) {
    logger.error('[ERROR]'+exception);
    return false;
  }
}

//전기차번호등록삭제 (호스트IP, 등록삭제여부, 등록할 차량번호, 응답) _cmd = 0:삭제, 1:등록
async function regDBPlateNumber(_host, _cmd, _number, _resp = null) {
  logger.info('[INFO]'+'[HOME] '+ (_cmd == 1 ? 'REGRISTER' : 'DELETE') + ' DB PLATE NUMBER : '+ _number);
  var returnValue = false;
  try {
    
    var rows = [];
    rows = await sqlevnum.GetVehicleInfo(_number);

    logger.debug('[DEBUG]'+'[HOME] rows :' + JSON.stringify(rows));

    // 등록
    if (_cmd == 1) {

      if (rows == null) {

        var result = await sqlevnum.Insert( _number, sqlevnum.AUTH_USER_REG, sqlevnum.FUEL_ALLOW, 'e');

        if(result) {
          //주차면Map의 정보를 갱신한다.
          mngPlace.UpdateVehicleAuthState(_host, 1, 1, '전기');
          returnValue = true;
        }
        else {
          returnValue = false;
        }
      }
      else {
        logger.info('[INFO]'+"[HOME] " + _number + " IS ALREADY REGRISTERED");
        returnValue = false;
      }
    }
    // 삭제
    else if (_cmd == 0) {

      if (rows != null) {

        var result = await sqlevnum.Delete(_number);

        if(result) {
          //주차면Map의 정보 갱신
          mngPlace.UpdateVehicleAuthState(_host, 0, 1, '일반');
          returnValue = true;
        }
        else {
          returnValue = false;
        }
      }
      else {
        logger.info('[INFO]'+"[HOME] " + _number + " IS NOT REGRISTERED");
        returnValue = false;
      }
    }
    else {
      logger.error('[ERROR]'+"[HOME] COMMAND NUMBER " + _cmd + " IS NOT VALID");
      returnValue = false;
    }

    return returnValue;
  }
  catch (exception) {
    logger.error('[ERROR]'+exception);
  }
}


//EDGE단말 제어 이벤트 (대상IP주소, 명령번호, 명령값, 응답) 2021.07.14 mswon 
async function SendCommandToEdge (_host, _cmd, _val, _resp = null) {

  var result = null;
  var command = parseInt(_cmd);
  
  switch (command) {
  // Get
  case 0: // 시스템 정보
    result = await mngEdge.RequestSystemStatus(_host);
    break;
  case 1: // 시스템 정보
    result = await mngEdge.RequestSystemStatus(_host);
    break;
  case 7 : // 충전시간 설정 변경
    result = ChangeChargeTimeSetting(_host, _val);
  case 8: // 자동차 번호 등록
    result = regDBPlateNumber(_host, 1, _val, _resp);
    return ;
  case 9: // 자동차 번호 삭제
    result = regDBPlateNumber(_host, 0, _val, _resp);
    return ;

  // Post
  case 2: // 서버 설정
    result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
    break;
  case 3: // 시스템 재시작
    result = await mngEdge.SshCommandSystem(_host);
    break;
  case 4: // 카메라 캡쳐
    result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
    break;
  case 41: // 카메라 캡쳐
    result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
    break;
  case 51: // 볼륨설정
    result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
    break;
  case 61: // 경광등 제어 설정 _val[ 'on' = 경광등 ON, 'off' = 경광등 OFF]
    result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
    break;
  case 71: // 안내방송 제어 - _val 텍스트를 음성화 하여 출력
    result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
    break;
  // case 81: // 스피커 제어, 2021.03.22 추가 _val[ 1 = 일반차량에 대한 주차금지 안내음성, 2 = 충전시간 초과 차량에 대한 이동주차 안내음성]
  //   result = await mngEdge.OrderToEdgeSystem(_host, command, _val);
  //   break;

  default:
    if (_resp != null) _resp.status(201).json({
      'result' : {
        'url' : _host,
        'body' : 'null',
        'status' : 'fail'
      }
    });
    return;
  }

  if (_resp != null) {
    if (result == true || result !=null) {
      //edge단말의 호출에 성공한 경우
      if(command == 1 || command == 0) {
        _resp.render('result', { title: 'Result', results : result });
      }
      else if(command == 3) {
        //_resp.render('result', { title: 'Result', results : result });
      }
      else if (command == 51 || command == 61) {
        var sysInfo = await mngEdge.RequestSystemStatus(_host);
        _resp.render('result', { title: 'Result', results : sysInfo });
      }
      else {
        _resp.render('result', { title: 'Result', results : result });
      }
    }
    else {
      //edge단말의 응답이 없거나 처리에 실패한 경우
      var inform = 'Connection Failed';
      _resp.render('result', { title: 'ERROR', results : inform });
    }
  }
}


//현상태정보맵 갱신이벤트
emitter.on(mngPlace.EVT_STATE_UPDATED, function (_edgeStateInfo) {
  logger.debug('[DEBUG]'+'[HOME] EVT_STATE_UPDATED _edgeStateInfo : '+ _edgeStateInfo.host);
  edgeSystemStateMap.set(_edgeStateInfo.host, _edgeStateInfo);
  respWrite(0, _edgeStateInfo.host); // 갱신대상의 정보를 큐에 추가
});


///주차면 객체를 제어(주차면IP주소)
//home화면 response 작성 이벤트
async function respWrite( _dataType = 0, _host = null) {
  var respString = undefined;

  if(_dataType == 1 && (_host == null || _host == undefined || _host == '')) {// data type : 0=단일 주차면 상태 변경 정보, 1:전체 주차면 상태변경 정보, 2: 주차면 선택시 표시내용 (제어 패널 정보 포함)

    if(places.length  == 0) return;

    var markerInfoList = [];
    var listButtonInfoList = [];
    places.forEach(_place => {
      var markerInfo = GetMarkerInfo(_place.index);
      markerInfoList.push(markerInfo);

      _place.areas.forEach(area=> {
        var listButtonInfo = GetListButtonInfo(area.host);
        listButtonInfoList.push(listButtonInfo);
      });
    })

    var resultPanel = GetResultPanel();
    var respString = 'data:'
    + '{\"dataType\": ' + _dataType
    + ', \"markerInfoList\": ' +JSON.stringify(markerInfoList) + ''
    + ', \"listButtonInfoList\": ' +JSON.stringify(listButtonInfoList) + ''
    + ', \"resultPanel\": ' +JSON.stringify(resultPanel)
    + '}\n\n';

    return respString;
  }
  else if (_dataType == 0) {// data type : 0=단일 주차면 상태 변경 정보, 1:전체 주차면 상태변경 정보 2: 주차면 선택시 표시내용 (제어 패널 정보 포함)
    var edgeStateInfo = edgeSystemStateMap.get(_host);
    var markerInfo = GetMarkerInfo(edgeStateInfo.place_idx);
    var listButtonInfo = GetListButtonInfo(_host);
    var resultPanel = GetResultPanel();
    var respString = 'data:'
    + '{\"dataType\": ' + _dataType
    + ', \"markerInfo\": ' +JSON.stringify(markerInfo)
    + ', \"listButtonInfo\": ' +JSON.stringify(listButtonInfo)
    + ', \"resultPanel\": ' +JSON.stringify(resultPanel)
    + '}\n\n';

    if (g_resp_que.length > resp_que_size){
      g_resp_que.shift();
    }
    g_resp_que.push(respString); // 응답큐에 추가
  }
  else if (_dataType == 2) // data type :  2: 주차면 선택시 표시내용 (제어 패널 정보 포함)
  {
    var edgeStateInfo = edgeSystemStateMap.get(_host);
    var markerInfo = GetMarkerInfo(edgeStateInfo.place_idx);
    var listButtonInfo = GetListButtonInfo(_host);
    var bottomPanelInfo = GetBottomPanelInfo(_host);
    var resultPanel = GetResultPanel();
    var respString = '{\"dataType\": ' + _dataType
    + ', \"markerInfo\": ' +JSON.stringify(markerInfo)
    + ', \"listButtonInfo\": ' +JSON.stringify(listButtonInfo)
    + ', \"bottomPanelInfo\": ' +JSON.stringify(bottomPanelInfo)
    + ', \"resultPanel\": ' +JSON.stringify(resultPanel)
    + '}\n';

    return respString; // 응답큐에 추가하지 않고, 리턴
  }

  return undefined;
}


//==============================================================================================================================================================
// 라우터 처리
//==============================================================================================================================================================
//home화면 최초진입 응답 처리
router.get('/', async function(req, res, next) {
  logger.info('[INFO]'+' home.js - /');
  g_resp_que.length = 0;
  if(req.session.user != undefined) {
    req.session.user.lastLocation = locationName;
    GetCommonInfo();
    // res.write(`<script type="text/javascript">window.history.forward();function noBack(){window.history.forward();}</script>`);
    res.render('home' , {
      title: '차량번호 인식 시스템',
      placeList: places,
      markersInfoArr: JSON.stringify(markers),
    });
    
  } else {
    require('../utils/browser').ShowAlertMove(res, '로그인 정보가 없습니다.', 'login');
  }

  //const respString = respWrite(1, null); //전체 주차면에 대한 상태응답
  //res.end(respString);
  
});

//home화면 진입후, 전체 단말의 상태 취득
router.get('/status/:id', async function(req, res, next) {
  logger.debug('[DEBUG]'+'home.js - /status '+ req.params.id);
  // logger.debug('[DEBUG]'+'lastLocation : '+ req.session.user.lastLocation);
  if(req.session.user.lastLocation !== locationName) {
    res.redirect('/'+locationName);
    return;
  }

  let body_data = undefined;
  //응답큐에 응답할 데이터가 있으면 응답
  if(g_resp_que.length > 0) {
    body_data = g_resp_que.shift();
  } else {
    body_data = await respWrite(1, null); //전체 주차면에 대한 상태응답을 작성

  }

  if(body_data != undefined) {
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
    });
    res.end(body_data);
  }
});

//home화면 주차면 선택
router.get('/select/', async function(req, res, next) {
  logger.debug('[DEBUG]'+'home.js - /select ');

  if(req.session.user.lastLocation !== locationName) {
    res.redirect('/'+locationName);
    return;
  }

  g_resp_que.length = 0;
  var place_idx = parseInt(req.query.idx);
  var space_idx = parseInt(req.query.spc);

  var host = getHostFromIndex(place_idx, space_idx);
  if(host != null || host != undefined) {
    var sysInfo = await mngEdge.RequestSystemStatus(host);
    
    var updateResult = await SelectAreaInfoUpdate(host, sysInfo); // 갱신이벤트 요청

    if(updateResult) {
      const respString = await respWrite(2, host); // 응답 정보를 작성
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/html',
        'Connection': 'keep-alive'
      });
      res.end(respString);
    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(404);
  }
});

//home화면 edge단말 명령 제어
router.get('/command/', function (req, res, next) {
  logger.debug('[DEBUG]'+'home.js - /command ');

  if(req.session.user.lastLocation !== locationName) {
    res.redirect('/'+locationName);
    return;
  }
  
  var place_idx = parseInt(req.query.idx);
  var space_idx = parseInt(req.query.spc);
  var cmd = req.query.cmd;
  var val = req.query.val;

  var host = getHostFromIndex(place_idx, space_idx);
  if(host == null) res.end();
  else SendCommandToEdge(host, cmd, val, res);
});

module.exports = router;
