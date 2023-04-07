//========================================================================================================================================
// 주차장 정보 제어 명령 모듈
// 작성 : [E2S] mswon 2021.07.05
//========================================================================================================================================
//변수 선언
const { SSL_OP_EPHEMERAL_RSA } = require('constants');
var emitter = require('../utils/emitter');
var fs = require('fs');

//EDGE단말 제어관리자
var mngEdge = require('./edgeManager');
var mngProxy = require('./proxyManager');

//테이블 제어
var sqlevnum = require('./sql/evnum');
var sqlplate = require('./sql/plate');
const logger = require('./logManager');


//[외부 발신용] 이벤트 : 초기 정보 설정 완료
const EVT_BASE_INFO_SET_COMPLETE = 'BASE_INFO_SET_COMPLETE';
// //[외부 발신용] 이벤트 : DB 등록 정보 변경
// const EVT_DB_UPDATED = 'DB_INFO_UPDATED';
//[외부 발신용] 이벤트 : 주차 상태 변경
const EVT_STATE_UPDATED = 'STATE_INFO_UPDATED';
//[] 이벤트 : 차량등록 이벤트
const EVT_AUTH_MANUAL_REG = 'UPDATE_VEHICLE_AUTH_STATE';

// 차량번호판 표준
const plateNumberRegex = / \d{2,3}[가-힣]\d{4}|[가-힣]{2}\d{2,3}[가-힣]\d{4}/;
// [지역]XXX[종류]XXXX의 표준
const plateNumberRegex_Type1 = /[가-힣]{2}\d{2,3}[가-힣]\d{4}/;
// XXX[종류]XXXX의 표준
const plateNumberRegex_Type2 = /\d{2,3}[가-힣]\d{4}/;


//등록 주차장 정보 데이터
var placeInfoDBItem = {
    // //주차장 ID
    // id: 0
    //주차장 번호
    index: 0
    //주차장 명
    , name: ''
    //주차장 주소
    , addr: ''
    //주차장 위도
    , lat: ''
    //주차장 경도
    , lon: ''
    //보유주차면의 단말기기 IP목록
    , areas: []
    // //갱신일
    // , updateDate: null
    // //갱신자
    // , updateUser: ''
    // //등록일
    // , createDate: null
    // //등록자
    // , createUser: ''
    // //삭제플래그
    // , delflg : false
};
const placeInfoDBItemStr = JSON.stringify(placeInfoDBItem);

//등록 주차면 정보 데이터
var areaInfoDBItem = {
    // //주차면 ID
    // id: 0
    //소속 주차장 번호
    place_idx: 0
    //소속 주차장 내 주차면번호
    , space_idx : 0
    //주차면 IP
    , host: ''
    //충전시간
    , chargeTime:60,
    // //갱신일
    // , UpdateDate: null
    // //갱신자
    // , UpdateUser: ''
    // //등록일
    // , CreateDate: null
    // //등록자
    // , CreateUser: ''
    // //삭제플래그
    // , delflg : false
};
const areaInfoDBItemStr = JSON.stringify(areaInfoDBItem);

//주차 상태 맵 정보
var edgeStateItem = {
    // 기본정보
    // 주차장번호
    place_idx:0,
    // 주차면번호
    space_idx:0,
    // 단말IP
    host:"",
    // 연결상태
    connected: 0,
    //단말 연결시간정보 ([문자열]YYYY-MM-dd HH:mm:ss)
    sys_time:'',
    //경광등
    beacon:false,
    //스피커 볼륨
    volume:0,

    // 차량정보
    // 전기차 인증 = 0:미인증 1:인증, 일반차일때 인증된 경우 전기차로 판단
    vehicleEVAuth:0,
    // 국토부 인증  = 0:미인증 1:인증, 인증받은 경우 시스템내에서 번호확인차량으로 판단.
    vehicleFuelAuth:0,
    //주차면 상태  = 0:비어있음, 1:일반(위반), 2:전기차(충전중), 3:영업(영업), 98:충전초과(OVER), 99:연결해제
    vehicleStatus: 99,
    // 차량 연료구분 = '일반', '전기', '불명' (일반차량 번호판, 차량번호 미조회, 조회 실패 ), undefined (차량 없음) -> '혼합'(하이브리드) 추가는 보류
    vehicleFuelDiv:undefined,

    //감지정보
    // 차량 유무 = false:차량없음, true:차량있음
    plateState:false,
    // 번호판 번호
    plateNumber:"",
    // 번호판 종류
    plateType:"",

    //주차시간 정보
    // 시간 ([Date형])
    timestamp:'',
    // mode = 0 : none, 1 : 주차시간 이내, 2 : 주차시간 초과
    timeMode:0,
};
const edgeStateItemStr = JSON.stringify(edgeStateItem);

var evnumInfoDBItem = {
    number:''
    , auth:0
    , fuel:0
    , fuel_s:''
};
const evnumInfoDBItemStr = JSON.stringify(evnumInfoDBItem);

//DB 등록 주차장 정보 배열
var places = [];
//주차 상태 정보Map
var edgeSystemStateMap = new Map();
//초기화처리중 등록여부 확인을 위한 전기차 번호 Map
var evnumInfoMap = new Map();

//===================================================================================================================================
//등록정보 및 상태정보 초기화 (DB 작성시 불필요 부분 포함)
//===================================================================================================================================
//시스템 초기 처리시 json파일 읽기
fs.readFile('./place_info.json', 'utf8', (error, jsonFile) => {
    if (error) return logger.error('[ERROR]'+error);
    InitDBInfo(jsonFile);
  });
  
//DB등록정보 초기화 (json파일 데이터)
async function InitDBInfo( _jsonFile) {
    if(places.length > 0) return;

    logger.info('[INFO]'+'[SYSTEM] INITIALIZE SYSTEM');
    var jsonPlaces;
    var index = 0;
    var jpInfo = null;
    var fs = require('fs');
    
    try {

        if(_jsonFile != null || _jsonFile !== undefined) {
            jpInfo  = JSON.parse(_jsonFile);
        };
        

        if(jpInfo != null) {
            jsonPlaces = jpInfo.places;
        }
        else {
            return;
        }

        if(jsonPlaces.length > 0) {
            //추가 처리 없음
            
        }
        else{
            return;
        }

        //주차장 및 주차면 DB맵 생성
        jsonPlaces.forEach(_jsonPlace => {  

            //주차면 정보맵 생성
            InitParkingPlaces(
                index
                , _jsonPlace.name
                , _jsonPlace.addr
                , _jsonPlace.lat
                , _jsonPlace.lon
                , _jsonPlace.hosts
            );
            //주차장 번호 증가
            index++;
        });
        
        var result = await InitializeEdgeSystemStateMap();
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
    }
}
//주차장 정보 초기화 
function InitParkingPlaces ( _index, _name, _addr, _lat, _lon, _hosts = []) {
    try {
        var placeItem = JSON.parse(placeInfoDBItemStr);
        placeItem.index = _index;
        placeItem.name = _name;
        placeItem.addr = _addr;
        placeItem.lat = _lat;
        placeItem.lon = _lon;

        //주차장 정보맵을 생성
        var areaItemArray = InitParkingAreas( _index, _hosts);

        if(areaItemArray == null) {
            placeItem.areas = [];
        }
        else {
            placeItem.areas = areaItemArray;
        }

        places.push(placeItem);

    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
    }
}

function InitParkingAreas ( _placeIndex, _hosts = []) {
    try {
        if(_hosts === undefined ||_hosts.length == 0) return [];

        var areaItemArray = [];
        var spaceIndex = 0;

        _hosts.forEach( _host => {
            var areaItem = JSON.parse(areaInfoDBItemStr);

            areaItem.place_idx = _placeIndex;
            areaItem.space_idx = spaceIndex;
            areaItem.host = _host.ip;
            //areaItem.chargeTime = 충전시간을 설정;
            areaItemArray.push(areaItem);

            spaceIndex++;
        });

        return areaItemArray;
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return null;
    }
}

//[HOME]화면에서 주차시간변경시 해당설정은 미들웨어에서 보존
function ReacquireDBInfo(_places) {
    places = _places;
}



async function sleep(t){
    return new Promise(resolve=>setTimeout(resolve,t));
  }
//===================================================================================================================================
//주차 상태Map 제어
//===================================================================================================================================
//주차 상태 정보 Map 초기화 메소드 ()
async function InitializeEdgeSystemStateMap(){
    if(places.length <= 0) return;
    logger.info('[INFO]'+'[SYSTEM] EDGE SYSTEM STATE MAP INITIALIZING');
    try {
        var evnumlistMapGetResult = await GetEVListMap();

        places.forEach( _placeInfo => {
            _placeInfo.areas.forEach(_areaInfo=> {
                //기본정보 입력
                InitEdgeStateItem(_areaInfo.host, _areaInfo.place_idx, _areaInfo.space_idx, evnumlistMapGetResult);
            });
        });
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
    }
}


async function GetEVListMap () {
    logger.debug('[DEBUG]'+'[P_MNG] GET EV LIST MAP');
    try {
        var rows = await sqlevnum.GetEvList();

        if(rows != null) {
            rows.forEach(_row=> {
                var evnumInfo = JSON.parse(evnumInfoDBItemStr);
                evnumInfo.number = _row.number;
                evnumInfo.auth = _row.auth;
                evnumInfo.fuel = _row.fuel;
                evnumInfo.fuel_s = _row.fuel_s;

                evnumInfoMap.set(evnumInfo.number, evnumInfo);
            });
        }
        return true;
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return false;
    }
}

//주차 상태 정보 초기화 메소드 (IP주소, 주차장번호, 주차면 번호, 전기차목록데이터Map 사용여부(true:false))
async function InitEdgeStateItem(_host, _place_idx, _space_idx, _useEVListMap = false){
    logger.debug('[DEBUG]'+'[P_MNG] InitEdgeStateItem ['+_host +', '+ _place_idx+', '+_space_idx+']');
    try {
        var sysInfo = await mngEdge.RequestSystemStatus(_host);
        var stateItem = JSON.parse(edgeStateItemStr);

        if(sysInfo == null) {
            // 연결끊김상태 입력
            // 기본정보
            stateItem.host = _host;
            stateItem.place_idx = _place_idx;
            stateItem.space_idx = _space_idx;
            stateItem.connected = false;
            stateItem.sys_time = '';
            stateItem.beacon = false;
            stateItem.volume = 0;

            // 차량정보
            stateItem.vehicleEVAuth = 0;
            stateItem.vehicleFuelAuth = 0;
            stateItem.vehicleStatus =  99,
            stateItem.vehicleFuelDiv = undefined;

            //감지정보
            stateItem.plateState = false;
            stateItem.plateNumber = '';
            stateItem.plateType = '';

            //주차시간 정보
            stateItem.timestamp = '';
            stateItem.timeMode = 0;
        }
        else {

            // 기본정보
            stateItem.host = _host;
            stateItem.place_idx = _place_idx;
            stateItem.space_idx = _space_idx;
            stateItem.connected = true;
            stateItem.sys_time = sysInfo.system_time;
            stateItem.beacon = sysInfo.beacon;
            stateItem.volume = sysInfo.volume;

            var plateInfo = sysInfo.plate;
            //감지정보
            stateItem.plateState = plateInfo.status;
            stateItem.plateNumber = plateInfo.number;
            stateItem.plateType = plateInfo.type;

            if( _useEVListMap == true) {
                // 차량정보
                if(plateInfo.status == true || plateInfo.status == 'true') {
                    //차량이 있는 경우
                    if(evnumInfoMap.has(plateInfo.number)) {
                        //목록맵에 차량번호 정보가 존재하는 경우
                        var evnumInfo = evnumInfoMap.get(plateInfo.number);
                        if(evnumInfo.fuel != 2) {
                            //차량이 수동제외대상이 아닌 경우
                            stateItem.vehicleEVAuth = 1;
                            stateItem.vehicleFuelAuth = 1;
                            stateItem.vehicleStatus = (plateInfo.type == '영업') ? 3 : 2;
                            stateItem.vehicleFuelDiv = '전기';
                        }
                        else {
                            //차량이 수동제외대상인 경우
                            stateItem.vehicleEVAuth = 0;
                            stateItem.vehicleFuelAuth = 1;
                            stateItem.vehicleStatus = (plateInfo.type == '영업') ? 3 : 1;
                            stateItem.vehicleFuelDiv = '일반';
                        }
                    }
                    else {
                        //일반차량 혹은 번호 오인식
                        stateItem.vehicleEVAuth = 0;
                        stateItem.vehicleFuelAuth = 0; //proxy조회로 전기차 가능성이 있으므로 연료인증 미인증.
                        stateItem.vehicleStatus = (plateInfo.type == '영업') ? 3 : (plateInfo.type == '전기') ? 2 : 1;
                        stateItem.vehicleFuelDiv = (plateInfo.type == '전기' || plateInfo.type == '영업') ? '전기' : '일반';
                    }
                }
                else {
                    //차량이 없는 경우
                    stateItem.vehicleEVAuth = 0;
                    stateItem.vehicleFuelAuth = 0;
                    stateItem.vehicleStatus = 0;
                    stateItem.vehicleFuelDiv = undefined;
                }
            }
            else {
                //전기차 목록맵이 사용불가 인 경우
                if(plateInfo.status == true || plateInfo.status == 'true') {
                    //차량이 있는 경우
                    stateItem.vehicleEVAuth = 0;
                    stateItem.vehicleFuelAuth = 0; //proxy조회로 전기차 가능성이 있으므로 연료인증 미인증.
                    stateItem.vehicleStatus = (plateInfo.type == '영업') ? 3 : (plateInfo.type == '전기') ? 2 : 1;
                    stateItem.vehicleFuelDiv = (plateInfo.type == '전기' || plateInfo.type == '영업') ? '전기' : '일반';
                }
                else {
                    //차량이 없는 경우
                    stateItem.vehicleEVAuth = 0;
                    stateItem.vehicleFuelAuth = 0;
                    stateItem.vehicleStatus = 0;
                    stateItem.vehicleFuelDiv = undefined;
                }
            }
            
            //주차시간 정보
            if(plateInfo.status == true || plateInfo.status == 'true') {
                stateItem.timestamp = new Date();
                stateItem.timeMode = 0;
            }
            else {
                stateItem.timestamp = '';
                stateItem.timeMode = 0;
            }
        }

        edgeSystemStateMap.set(_host, stateItem);
        logger.debug('[DEBUG]'+'[P_MNG] SET EDGE STATE. KEY : '+_host);
    }
    catch (exception) {
        logger.error('[ERROR]'+'[P_MNG] FAILED TO SET EDGE STATE. KEY : '+_host + '\n' + exception);
    }
}

//주차면 표시용 상태 취득 ( 단말상태정보 )
function GetVehicleStatus ( _edgeStateInfo) {
    var returnAreaState = 0;
    
    //연결상태가 아닌경우 비접속상태 반환
    if ( _edgeStateInfo.connected == false ) return 99;
    
    //차량이 없는 경우 빈 상태 반환
    if ( _edgeStateInfo.plateState == false ) return 0;
    
    
    if( _edgeStateInfo.vehicleFuelAuth == 0) {
        //번호판확인을 받지 않은 상태인 경우
        switch(_edgeStateInfo.plateType ) {
            case '일반':
                returnAreaState = 1;
                break;
            case '전기':
                returnAreaState = 2;
                break;
            case '영업':
                returnAreaState = 3;
                break;
            default :
                returnAreaState = 0;
                break;
        }
        
        return returnAreaState;
    }

    //번호판확인을 받은 상태인 경우
    if(_edgeStateInfo.plateType == '영업') {
        //영업차량
        if(_edgeStateInfo.timeMode > 1) {
            returnAreaState = 98;
        }
        else {
            returnAreaState = 3;
        }
    }
    else if(_edgeStateInfo.plateType == '전기' && _edgeStateInfo.vehicleFuelDiv == '전기'){
        //전기차량
        if(_edgeStateInfo.timeMode > 1) {
            returnAreaState = 98;
        }
        else {
            returnAreaState = 2;
        }
    }
    else {
        //하이브리드차량 혹은 일반차량
        if ( _edgeStateInfo.vehicleFuelDiv == '전기' || _edgeStateInfo.vehicleFuelDiv == '혼합' ) {
            //하이브리드차량
            if(_edgeStateInfo.timeMode > 1) {
                returnAreaState = 98;
            }
            else {
                returnAreaState = 2;
            }
        }
        else {
            //일반차량
            returnAreaState = 1;
        }
    }
    
    return returnAreaState;
}


function getEdgeStateInfo(_host) {
    try {
        if(edgeSystemStateMap.has(_host)) return edgeSystemStateMap.get(_host);
        else return null;
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return null;
    }
}
  
  //주차면 상태 정보 갱신(갱신할 상태 정보)
function UpdateEdgeStateInfo( _edgeStateInfo) {
    logger.debug('[DEBUG]'+'[P_MNG] UpdateEdgeStateInfo (' + _edgeStateInfo.host + ')');
    try {
        edgeSystemStateMap.set(_edgeStateInfo.host, _edgeStateInfo);
        emitter.emit(EVT_STATE_UPDATED, _edgeStateInfo);
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return null;
    }
}

// DB에 주차면 공백 데이터 추가(대상IP주소)
async function DBSetEmpty(_addr) {
    logger.debug('[DEBUG]'+' SET EMPTY ('+_addr+')');
    try {
        var currentStatus = await sqlplate.GetCurrentStatus(_addr);
        if (currentStatus.plate_no == '' && currentStatus.type == ''){
            return false;
        }

        var [rows] = await sqlplate.GetCurrentStatus(_addr);
        
        //rows 상태를 정확하게 파악이 되지않아 비활성화

        logger.debug('[DEBUG]'+'[P_MNG] rows = ' + JSON.stringify(rows));

        if (rows.type != ''  && rows.plate_no != '') {
            await sqlplate.Insert(_addr,'', '', '');
            return true;
        }
        return false;
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return false;
    }
}


//신규, 일반 번호판 프록시 조회 (주차면 IP주소, 번호판종류, 차량번호, 상태정보 데이터 인계)
async function CheckPlateNumberProxy (_host,_v_type, _num, _edgeStateInfo = null) {
    logger.info('[INFO]'+'[SYSTEM] [CHECK PLATE NUMBER PROXY] [host : '+_host+', v_type : '+_v_type+', num : '+_num+']');
  
    //전기차 인증상태
    var proxyResultEVAuth = 0;
    //연료 인증상태
    var proxyResultFuelAuth = 0;
    //인증후 차량구분
    var proxyResultFuelDiv = _v_type;

    var is_ev = undefined;
    try {
        if(_num == '') {
            return;
        }

        //연료코드의 프록시 조회
        var sysinfo = await mngProxy.GetFuelCodeFromProxy(_num);

        if (sysinfo === undefined) {
            is_ev = undefined;
        }
        else {
            is_ev = mngProxy.IsEv(sysinfo.useFuelCode);
        }
        
        if (is_ev == undefined) {
            //차량의 번호 오인식의 경우
            logger.warn('[WARN]'+'[SYSTEM] - FUEL CODE REQUEST FAILED. \''+_num+'\' IS UNVALID NUMBER');
            
            //차량번호를 정상적으로 인식했을 경우에만 안내음성 출력 및 경광등 ON
            CommandOutputInform(_host, 0);

            proxyResultEVAuth = 0;
            proxyResultFuelAuth = 0;
            proxyResultFuelDiv = '불명';
        }
        else if (is_ev == false && _v_type == '전기') {
            //전기차량의 번호판 오인식의 경우
            logger.info('[INFO]'+'[SYSTEM] - FUEL CODE REQUEST FAILED. \''+_num+'\' IS NOT EV');

            //전기차량번호를 정상적으로 인식했을 경우에만 안내음성 출력 및 경광등 ON
            CommandOutputInform(_host, 0);
            
            proxyResultEVAuth = 0;
            proxyResultFuelAuth = 0; //프록시 번호 조회가 가능할때 1로 바꾼다.
            proxyResultFuelDiv = '전기';
        }
        else if (is_ev != undefined && (_v_type == '영업')) {
            //영업차량의 번호의 경우.
            logger.info('[INFO]'+'[SYSTEM] - \''+_num+'\' IS BV, - REGIST AS EV');

            //전기차로 판단하여 비콘 비활성화.
            CommandOutputInform(_host, 0);
            
            //전기차취급하여 DB에 등록
            await sqlevnum.Insert(_num, sqlevnum.AUTH_PROXY_REG, sqlevnum.FUEL_ALLOW, 'e');
            
            proxyResultEVAuth = (is_ev== true ? 1 : 0);
            proxyResultFuelAuth = (is_ev== true ? 1 : 0);
            proxyResultFuelDiv = '전기'; // 영업차량은 '전기'로 취급한다.
        }
        else if (is_ev == true && (_v_type == '일반')) {
            //하이브리드 차량의 경우.
            logger.info('[INFO]'+'[SYSTEM] '+_num+' IS EV - BEACON OFF');
            //비콘 비활성화.
            CommandOutputInform(_host, 0);
            
            //하이브리드 차량의 경우 국토부 권한으로 인증데이터를 DB에 INSERT한다.
            await sqlevnum.Insert(_num, sqlevnum.AUTH_PROXY_REG, sqlevnum.FUEL_ALLOW, sysinfo.useFuelCode);
            
            proxyResultEVAuth = 1;
            proxyResultFuelAuth = 1;
            proxyResultFuelDiv = '전기'; //'혼합';
        }
        else if (is_ev == true && (_v_type == '전기')) {
            //전기차 차량의 경우.
            logger.info('[INFO]'+'[SYSTEM] '+_num+' IS EV - REG DB AUTO AUTH');
            //비콘 비활성화.
            CommandOutputInform(_host, 0);
            
            //전기차의 경우 자동 권한으로 인증데이터를 DB에 INSERT한다.
            await sqlevnum.Insert(_num, sqlevnum.AUTH_AUTO_REG, sqlevnum.FUEL_ALLOW, sysinfo.useFuelCode);
            
            proxyResultEVAuth = 1;
            proxyResultFuelAuth = 1;
            proxyResultFuelDiv = '전기';
        }
        else {
            //일반차량의 경우.
            logger.info('[INFO]'+'[SYSTEM] \''+_num+'\' IS NOT EV - BEACON ON, SPEAKER ON');
            
            //전기차가 아닌 경우 비콘 활성화.안내음성 출력.
            CommandOutputInform(_host, 1);
            
            proxyResultEVAuth = 0;
            proxyResultFuelAuth = 1;
            proxyResultFuelDiv = '일반';
        }
        
        //변경한 인증데이터를 적용한다.
        UpdateVehicleAuthState( _host, proxyResultEVAuth, proxyResultFuelAuth, proxyResultFuelDiv, _edgeStateInfo);
    } catch (e) {
        logger.error('[ERROR]'+e);
        return;
    }
}

//차량 인증상태 갱신(IP주소, 전기차인증, 국토부인증, 차량구분)
function UpdateVehicleAuthState (_host, _vehicleEVAuth, _vehicleFuelAuth, _fuelDiv, _edgeStateInfo = null) {
    logger.info('[INFO]'+'[SYSTEM] [UpdateVehicleStateInfo] - _host['+_host+'] _vehicleEVAuth['+_vehicleEVAuth+'] _vehicleFuelAuth['+_vehicleFuelAuth+']');
    var edgeStateInfo = _edgeStateInfo;

    if(edgeStateInfo == null) {
        edgeStateInfo = getEdgeStateInfo(_host);
    }

    edgeStateInfo.vehicleEVAuth = _vehicleEVAuth;
    edgeStateInfo.vehicleFuelAuth = _vehicleFuelAuth;
    edgeStateInfo.vehicleFuelDiv = _fuelDiv;
    edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);
  
    // [E2S] 2021.07.14 mswon 현상태 정보 맵 동기화
    UpdateEdgeStateInfo(edgeStateInfo);
}


//차량 번호 정보 DB대조 이벤트. (주차면 IP주소, 차량구분, 차량번호)
//[E2S]mswon 2021.07.08 수정
async function CheckPlateNumberDB (_host, _v_type, _v_num, _edgeStateInfo = null) {
    logger.info('[INFO]'+'[P_MNG] [CHECK PLATE NUMBER DB] - _host['+_host+'] ['+_v_type+'] ['+_v_num+']');
  
    try {
        var _ID = 0;
        var auth = 0;
        var fuel = 0; 
        var vehicleDBEVAuth = 0;
        var vehicleDBFuelAuth = 0;
        var vehicleDBFuelDiv = undefined;

        if(_v_num == '') {
            //차량번호가 없는 경우, 빈 주차장으로 판단하여 비콘 off
            logger.debug('[DEBUG]'+'[P_MNG] NO NUMBER AT '+_host);
            // CommandOutputInform(_host, 0);
            
            //- 상태 변경데이터 적용
            //- UpdateVehicleAuthState( _host, 0, 0, undefined);
            return;
        }
  
        var row = await sqlevnum.GetVehicleInfo(_v_num);

        //DB에 국토부 인증 데이터가 존재하는 경우
        if (row != null) {
            // ========================================================================================
            // 연료가 하이브리드(휘발유+전기)=(fuel=1, fuel_s='l')로 등록된 차량일 경우 
            // 수동으로 제외(fuel=2) 처리 할 필요가 있음. 플러그인 하이브리드만 단속에서 제외.
            // --------------------------------------------------------------------------------------------
            // auth = 0:자동등록, 1:사용자 등록, 2:국토부 연결 등록 (국토부 연결되면 fuel값 저장)
            // fuel = 0 : 전기차량, 1: 단속제외, 2: 단속대상(하이브리드등의 이유로 시스템상으로는 전기차이지만, 단속대상이 되는 경우)
            // fuel_s = 연료코드,  프록시 반환값, 일반차량중에서 해당 항목이 null이 아닌, e, l에 해당하는 차량은 하이브리드로 처리
            // ========================================================================================
  
            _ID = row._ID;
            fuel = row.fuel;
            auth = row.auth;

            if (fuel != 2) {
                //등록차량이며, 단속 대상이 아닌 경우
                logger.info('[INFO]'+'[SYSTEM] THIS CAR IS REGISTERED.');
                
                CommandOutputInform(_host, 0);
  
                vehicleDBEVAuth = 1; // 전기차 인증 = 0:미인증, 1:인증, 0인 경우 전기차충전소 주차시 단속대상으로 판단.
                vehicleDBFuelAuth = 1; // 국토부 인증 = 1: 번호판확인 완료, 0:번호판 미확인
                vehicleDBFuelDiv = '전기';
            }
            
            else if (fuel == 2) {
                //등록차량이지만, 단속 대상인 경우
                logger.info('[INFO]'+'[SYSTEM] THIS CAR IS REGISTERED, BUT NOT EV DIV');
                
                CommandOutputInform(_host, 1);
  
                vehicleDBEVAuth = 0; // 전기차 인증 = 0:미인증, 1:인증, 0인 경우 전기차충전소 주차시 단속대상으로 판단.
                vehicleDBFuelAuth = 1; // 국토부 인증 = 1:번호판인증 
                vehicleDBFuelDiv = '일반';// 수동제외차량은 일반차량 취급
            }
  
            //상태 변경데이터 적용
            UpdateVehicleAuthState( _host, vehicleDBEVAuth, vehicleDBFuelAuth, vehicleDBFuelDiv , _edgeStateInfo);
        }
        else {
            //DB에 국토부 인증 데이터가 존재하지않는 경우 (처음 발견된 차량번호 혹은 미등록 차량번호인 경우)
            logger.info('[INFO]'+'[SYSTEM] THIS CAR IS NOT REGISTERED. number : '+_v_num);
            
            //전기차, 영업차량의 번호판이 미확인 경우 일단 경우 경광등을 OFF
            if(_v_type == '영업' || _v_type == '전기'){
                CommandOutputInform(_host, 0);
            }
            //국토부에 조회한다.
            CheckPlateNumberProxy(_host,_v_type, _v_num, _edgeStateInfo);
        }
    }
    catch (exception) {
        logger.error('[ERROR]'+'[ERROR] :'+exception);
    }
}



//===================================================================================================================================
//상태정보Map 이벤트
//===================================================================================================================================
//리퀘스트 결과 반영 이벤트. ( _host : [IP주소], _connection : [false = 연결해제, true = 연결], _val :[응답데이터]) => 가상화면 추가 실패로 함수화
//emitter.on('UPDATE_EDGE_STATE', function (_host, _connection, _val = null) {
function UpdateEdgeStateFromRequest(_host, _connection = false, _val = null) {
    logger.info('[INFO]'+'[SYSTEM] UpdateEdgeStateFromRequest - _host['+_host+'] ');
    var edgeStateInfo = edgeSystemStateMap.get(_host);
    
    if(_connection == false) {
        //연결해제상태이거나, 응답데이터가 없는 경우
        
        edgeStateInfo.connected = _connection;
        edgeStateInfo.beacon = false;
        edgeStateInfo.volume = 0;
        edgeStateInfo.sys_time = '';
        
        edgeStateInfo.vehicleEVAuth = 0;
        edgeStateInfo.vehicleFuelAuth = 0;
        edgeStateInfo.vehicleStatus = 99;
        edgeStateInfo.vehicleFuelDiv = undefined;
        
        edgeStateInfo.plateNumber = '';
        edgeStateInfo.plateState = false;
        edgeStateInfo.plateType = '';
        
        edgeStateInfo.timeMode =0;
        edgeStateInfo.timestamp = '';
        
        //단말상태정보를 갱신
        UpdateEdgeStateInfo(edgeStateInfo);
    }
    else if(_connection == true && _val == null) {
        //응답은 있으나 값은 전달받지 않은경우
        //접속상태 갱신만 한다.
        edgeStateInfo.connected = _connection;
        
        //단말상태정보를 갱신
        UpdateEdgeStateInfo(edgeStateInfo);
    }
    else {
  
        var newTimestamp = new Date();

        //연결정보 및 기본 설정 정보 취득
        edgeStateInfo.connected = _connection;
        edgeStateInfo.beacon = (_val.beacon == 'on'? true:false);
        edgeStateInfo.volume = _val.volume;
        edgeStateInfo.sys_time = _val.system_time;
        
        // 새로 감지된 번호판 정보 취득
        var newPlate = _val.plate;
        var newStatus = newPlate.status == 'false' ? false : true;
        var newNumber = (newPlate.number != undefined) ? newPlate.number :'';
        var newType = (newPlate.Type != undefined) ? newPlate.Type :'';
        
        if ( newStatus == false) {
            // 주차장에 차량이 없는경우
            //단말 혹은 서버 재부팅으로 이전차량 정보가 일치하지 않는경우. 
            //서버상의 감지정보를 edge단말장치의 감지정보와 동기 시킨다.
            edgeStateInfo.plateNumber = newNumber;
            edgeStateInfo.plateState = newStatus;
            edgeStateInfo.plateType = newType;

            edgeStateInfo.vehicleEVAuth = 0;
            edgeStateInfo.vehicleFuelAuth = 0;
            edgeStateInfo.vehicleFuelDiv = undefined;

            edgeStateInfo.timestamp = '';
            edgeStateInfo.timeMode = 0;
            edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);

            //DB에 공백데이터 확인 후 퇴차정보(공백) 추가.
            DBSetEmpty(_host);
            //단말상태정보를 갱신
            UpdateEdgeStateInfo(edgeStateInfo);
        }
        else {
            // 주차장에 신규차량이 감지되는 경우
            if(edgeStateInfo.plateNumber != newNumber && edgeStateInfo.plateType != newType) {
                // 이전 감지차량의 번호/번호판종류와 현재 감지된 차량의 번호/번호판종류가 다른경우
                // 신규차량으로 처리하고시간 인증정보 초기화, 상태저장, 그리고 번호대조 실시시킨다.
                // *******************신규차량 감지지점*******************
                edgeStateInfo.plateNumber = newNumber;
                edgeStateInfo.plateState = newStatus;
                edgeStateInfo.plateType = newType;
                

                edgeStateInfo.vehicleEVAuth = 0;
                edgeStateInfo.vehicleFuelAuth = 0;
                edgeStateInfo.vehicleFuelDiv = (newType == '전기' || newType == '영업') ? '전기' : '불명';

                //시간정보 갱신
                edgeStateInfo.timestamp = newTimestamp;
                edgeStateInfo.timeMode = 1;
                edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);

                //단말상태를 갱신한다.(화면 갱신이벤트 미발생)
                edgeSystemStateMap.set(edgeStateInfo.host, edgeStateInfo);
                //단말상태 갱신후, 번호조회 실시
                CheckPlateNumberDB(edgeStateInfo.host, newType, newNumber, edgeStateInfo);
            }
            else {
                //이전 감지차량과 번호/번호판종류가 같은 경우
                if(edgeStateInfo.timeMode < 2) {
                    //차량이 이미 주차시간 초과가 아니라면 시간체크
                    edgeStateInfo.timeMode = ParkTimeCheck(edgeStateInfo, newTimestamp);
                }
                edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);
                //단말상태정보를 갱신
                UpdateEdgeStateInfo(edgeStateInfo);
            }
        }
    }
    
    return edgeStateInfo;
}
//);

//==============================================================================================================================================
//기본 수신 이벤트 대응====================================================================================================================================
//==============================================================================================================================================

//검출, 주기보고 수신 이벤트 시스템처리(보고형태 [0 = 검출, 1= 주기], 보고IP, 번호판종류, 번호판 상태, 번호판 번호, 감지시간, 이미지파일 경로)
function OnReportAction( _reportType, _host, _plateType, _plateStatus, _plateNumber, _nowTime, _imgPath) { 
    logger.info('[INFO]'+'[SYSTEM] OnReportAction ('+((_reportType == 0) ? '검출': '주기') +', '+_host+', '+_plateType+', ' + _plateStatus + ', '+_plateNumber+', '+ GetSysTime(_nowTime) +', '+_imgPath+')');
    
    try {
        var edgeStateInfo = getEdgeStateInfo(_host);
        if (edgeStateInfo == null) return;

        if(_plateStatus == false) {
            //출차의 경우
            //번호판정보 갱신 -> 번호판 상태만 갱신하여 이전차량 번호 유지
            edgeStateInfo.plateState = _plateStatus;

            //인증정보 초기화
            edgeStateInfo.vehicleDBFuelAuth = 0;
            edgeStateInfo.vehicleFuelAuth= 0;
            edgeStateInfo.vehicleFuelDiv = undefined;
            //주차면 상태 취득
            edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);

            edgeStateInfo.timestamp = _nowTime;
            edgeStateInfo.sys_time = GetSysTime(_nowTime);
            edgeStateInfo.timeMode = 0;
            
            // 경광등 꺼짐, 및 상태정보 갱신
            DBSetEmpty(_host);
            CommandOutputInform(_host, 0);
            UpdateEdgeStateInfo(edgeStateInfo);
            return;
        }
        
        if(edgeStateInfo.plateState == true && edgeStateInfo.plateNumber == _plateNumber) {
            //동일차량 주차중인경우

            if(edgeStateInfo.vehicleFuelAuth != 0) {
                //번호판 확인을 받은 차량의 경우
                if(edgeStateInfo.timeMode < 2) {
                    //차량이 이미 주차시간 초과가 아니라면 시간체크
                    edgeStateInfo.timeMode = ParkTimeCheck(edgeStateInfo, _nowTime);
                }
                edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);
            }
            else {
                //번호판 확인을 받지않은 차량의 경우
                CheckPlateNumberDB( _host, _plateType, _plateNumber, edgeStateInfo);
            }
        }
        else if ((edgeStateInfo.plateNumber != _plateNumber) && (_plateNumber != '')){
            // ****************************** 신규차량 감지지점 *************************************
            //신규번호의 경우
            // var checkResult = IsPlateNumberCorrect(edgeStateInfo.plateNumber, _plateNumber);

            if(false) {
                //이전번호의 오인식으로 판단되는 경우 [예: 12가4568 -> 2가4568 or 12가 456 or 124568, etc]
                //번호판 확인을 받은 차량의 경우
                if(edgeStateInfo.timeMode < 2) {
                    //차량이 이미 주차시간 초과가 아니라면 시간체크
                    edgeStateInfo.timeMode = ParkTimeCheck(edgeStateInfo, _nowTime);
                }
                edgeStateInfo.vehicleStatus = GetVehicleStatus(edgeStateInfo);
            } 
            else {
                //이전차량와 무관한 신규차량으로 판단되는 경우 (영업은 전기차량으로 판단)
                edgeStateInfo.plateType = _plateType;
                edgeStateInfo.plateNumber = _plateNumber;
                edgeStateInfo.plateState = true;

                edgeStateInfo.vehicleEVAuth = 0;
                edgeStateInfo.vehicleFuelAuth = 0;
                edgeStateInfo.vehicleFuelDiv = (_plateType == '전기'|| _plateType == '영업') ? '전기': '불명';
                edgeStateInfo.vehicleStatus = (_plateType == '영업') ? 3 : ((_plateType == '전기') ? 2 : 1);

                edgeStateInfo.timestamp = _nowTime;
                edgeStateInfo.timeMode = 1;

                CheckPlateNumberDB( _host, _plateType, _plateNumber, edgeStateInfo);
            }
        }
        else {
            //감시서버 시스템 시작후 첫 차량으로 판단되는 경우
            edgeStateInfo.plateType = _plateType;
            edgeStateInfo.plateNumber = _plateNumber;
            edgeStateInfo.plateState = true;

            edgeStateInfo.vehicleEVAuth = 0;
            edgeStateInfo.vehicleFuelAuth = 0;
            edgeStateInfo.vehicleFuelDiv = (_plateType == '전기'|| _plateType == '영업') ? '전기': '불명';
            edgeStateInfo.vehicleStatus = (_plateType == '영업') ? 3 : ((_plateType == '전기') ? 2 : 1);

            edgeStateInfo.timestamp = _nowTime;
            edgeStateInfo.timeMode = 1;

            CheckPlateNumberDB( _host, _plateType, _plateNumber, edgeStateInfo);
        }

        UpdateEdgeStateInfo(edgeStateInfo);
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return;
    }
}

//차량번호 정규식 확인 (이전 번호, 신규 번호)
function IsPlateNumberCorrect(_prevNumber, _NewNumber) {
    try {
        if(plateNumberRegex.exec(_NewNumber) !== null) {
            return true;
        }
        
    }
    catch (exception) {
        logger.error(exception);
        return false;
    }
}

//edge단말 시스템 시간 문자열 취득
function GetSysTime ( _timeStamp = new Date()) {
    if (_timeStamp == '' || _timeStamp == null || _timeStamp == undefined) return '';
    var year = _timeStamp.getFullYear();
    var month = get2numStr(_timeStamp.getMonth() + 1);
    var day = get2numStr(_timeStamp.getDate());
    var hours = get2numStr(_timeStamp.getHours());
    var minuets = get2numStr(_timeStamp.getMinutes());
    var seconds = get2numStr(_timeStamp.getSeconds());
    var timeString = year+'-'+month+'-'+day+' '+hours+':'+minuets+':'+seconds;
    return timeString;
}
//연월일시분초를 2글자 문자열로 전환
function get2numStr ( _yMdhms) {
    if(_yMdhms < 10) return '0'+ _yMdhms;
    else return '' + _yMdhms; 
}

//주차시간 확인 (주차면 상태 정보, 현재시간(Date형))
function ParkTimeCheck( _edgeStateInfo, _nowTime) {
    var time_mode = 0; // 차량 없음
    
    if(_edgeStateInfo.timestamp == '' || _edgeStateInfo.timestamp == undefined || _edgeStateInfo.timestamp == null ) return time_mode;
    try {
        var oldTime = null;
        var nowTime = null;
        if(_edgeStateInfo == null) return 0;
        else {
            oldTime = _edgeStateInfo.timestamp;
            nowTime = _nowTime;
        }

        var oldTimeMiliSec = oldTime.getTime();
        var nowTimeMiliSec = nowTime.getTime();

        var placeInfo = places[_edgeStateInfo.place_idx];
        var areas = placeInfo.areas;
        var areaInfo = areas[_edgeStateInfo.space_idx];
        var chargeTime = areaInfo.chargeTime;

        var elapsedMin = parseInt((nowTimeMiliSec - oldTimeMiliSec) / 1000 / 60);

        logger.debug('[DEBUG]'+'[P_MNG] ParkTimeCheck [ 주차시간 : '+ elapsedMin + '][ 충전시간 : ' + chargeTime + ']');

        if(elapsedMin > chargeTime) {
            // 지정시간 초과, 플래그를 2로 변경, 안내방송 
            time_mode = 2;
            CommandOutputInform(_edgeStateInfo.host, 2);
        }
        else {
            // 지정시간 충전시간으로 판단, 플래그를 1로 변경
            time_mode = 1;
        }

        return time_mode;
    }
    catch (ex) {
        logger.error('[ERROR]'+ex);
        return 0;
    }
}

//시간확인 및 볼륨 제어 이벤트 //[e2s] mswon 2022.08.09 추가
async function AutoVolumeSet(_host){
    logger.debug('[DEBUG]'+'placeManager:: TIME CHECK' + _host);
  
    var now_Date = new Date();
    var now_hour = now_Date.getHours();
  
    var night_SttHour = 14;//21;
    var night_EndHour = 15;//6;

    var VolumeCtrlResult = null;

    // 21시 이후 ~ 06시 전까지 음량 30으로 변경
    if(now_hour < night_EndHour && now_hour >= night_SttHour)
    {
        logger.debug('[DEBUG]'+'placeManager:: TIME CHECK - VOLUME CHANGE TO 30, ' + _host);
        VolumeCtrlResult = await mngEdge.OrderToEdgeSystem(_host,51, 30);
    }
    //상기시간 전후 1시간동안(19~20시, 06~07시) 65 고정
    else if((now_hour < night_SttHour && now_hour >= night_SttHour - 1 ) 
          || (now_hour < night_EndHour + 1 && now_hour >= night_EndHour))
    {
        logger.debug('[DEBUG]'+'placeManager:: TIME CHECK - VOLUME CHANGE TO 65, ' + _host);
        VolumeCtrlResult = await mngEdge.OrderToEdgeSystem(_host,51, 65);
    }
    else
    {
      // 기타 시간 음량 제한/고정 없음
      logger.debug('[DEBUG]'+'placeManager:: TIME CHECK - NOT VOLUME CHANGE ' + _host);
      return true;
    }

    if(VolumeCtrlResult == null)
    {
        
        return false;
    }
    else
    {
        logger.debug('[DEBUG]'+'placeManager:: TIME CHECK - VOLUME CHANGE OK');
        return true;
    }
  }

//안내방송 출력제어 (IP주소, 명령타입)
async function CommandOutputInform(_host, _commandType) {

    //안내방송을 출력하기 전에 볼륨 및 경광등 제어
    var VolumeSetResult = await AutoVolumeSet(_host);
    if(_commandType == 1 || _commandType == 2)
    {
        var resultBeacon = await mngEdge.OrderToEdgeSystem(_host, 61, 'on');
    }
    else
    {
        var resultBeacon = await mngEdge.OrderToEdgeSystem(_host, 61, 'off');
    }

    switch (_commandType) {
        case 1 : // 일반차량주차에 대한 안내
            
            if(resultBeacon != null) {
                mngEdge.OrderToEdgeSystem(_host, 81, 1);
            }
            break;
        case 2 : // 충전시간초과차량에 대한 안내
            var resultBeacon = await mngEdge.OrderToEdgeSystem(_host, 61, 'on');
            if(resultBeacon != null) {
                mngEdge.OrderToEdgeSystem(_host, 81, 2);
            }
            break;
        default :
            break;
    }
}

//mariaDB용 날짜 취득 메소드
function getYMDStr(_timeStamp) {
    var times  = new Date(_timeStamp);
    return times.getFullYear()+'-'
         + get2numStr(times.getMonth()+1)+'-'
         + get2numStr(times.getDate());
}

//입출차판단(IP주소, 번호판타입, 차량상태, 번호판 번호, 스냅샷파일경로)
async function InOutAnalysis (_host, _plateType, _plateStatus, _plateNumber, _imgPath)  {
    var resultInOut = 0; // 0:입차, 1: 주차중, 2, 출차 판단
    try {

        var now_time = new Date();
        var s_date = (new Date(now_time) - 32400000)-86400000;// - 9hour - 24Hour // 2일전
        var e_date = (new Date(now_time) - 32400000)+86400000;// - 9hour + 24Hour // 1일전 혹은 금일까지

        // 해당범위 차량 주차정보 취득
        var [rows] = sqlplate.GetVnList(_host, getYMDStr(s_date),getYMDStr(e_date)); 

        var firstRow = rows[0];
        var lastRow = rows[rows.length-1];
        
        //var checkResult = IsPlateNumberCorrect(prevNumber, _plateNumber);
    }
    catch (exception) {
        logger.error('[ERROR]'+exception);
        return undefined;
    }
}

module.exports = {
    EVT_BASE_INFO_SET_COMPLETE,
    EVT_STATE_UPDATED,
    places,
    edgeSystemStateMap,
    InitDBInfo : InitDBInfo,
    UpdateEdgeStateFromRequest : UpdateEdgeStateFromRequest,
    OnReportAction : OnReportAction,
    UpdateVehicleAuthState : UpdateVehicleAuthState,
    ReacquireDBInfo : ReacquireDBInfo
}