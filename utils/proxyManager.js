//================================================================================================================================
//proxy : proxy서버에 접속하여 차량 연료코드를 취득, 취득한 연료코드로부터 차량을 판별한다.
// 작성 : E2S mswon (2021-06-01)
// 수정 : E2S mswon (2021-06-02)
// 수정 : E2S mswon (2021-07-30)
//================================================================================================================================
//변수 정의
//var url_req_proxy = 'http://105.17.1.150:9700/proxy/findFuelCode?vhrno='; // 테스트 서버 프록시
//var url_req_proxy = 'http://105.17.1.150:39700/proxy/findFuelCode?vhrno=' // 테스트 서버 프록시
const url_req_proxy = 'http://27.101.117.52:39700/proxy/findFuelCode?vhrno='; // 운영 서버 프록시

var request = require("request");
var urlencode = require('urlencode'); 
const logger = require('../utils/logManager');
//차량종류 확인 (연료코드) return 차량 종류 - 일반 차량 :false , 하이브리드, 전기 차량 : true, 취득실패 : undefined
function IsEv(_fuel_code) {
  if(_fuel_code == '') return undefined; //취득실패
  else if (_fuel_code == 'a') return false; // 휘발유
  else if (_fuel_code == 'b') return false; // 경유
  else if (_fuel_code == 'c') return false; // 엘피지
  else if (_fuel_code == 'd') return false; // 등유
  else if (_fuel_code == 'e') return true; // 전기
  else if (_fuel_code == 'f') return false; // 알코올
  else if (_fuel_code == 'g') return false; // 휘발유(유연)
  else if (_fuel_code == 'h') return false; // 휘발유(무연)
  else if (_fuel_code == 'i') return false; // 태양열
  else if (_fuel_code == 'j') return false; // CNG
  else if (_fuel_code == 'k') return false; // LNG
  else if (_fuel_code == 'l') return true; // 하이브리드(휴발유+전기)
  else if (_fuel_code == 'm') return true; // 하이브리드(경유+전기)
  else if (_fuel_code == 'n') return true; // 하이브리드(LPG+전기)
  else if (_fuel_code == 'o') return true; // 하이브리드(CNG+전기)
  else if (_fuel_code == 'p') return true; // 하이브리드(LNG+전기)
  return false;  //'z':기타연료
}

//프록시서버를 경유하여 국토부DB에서 차량번호를 조회, 연료코드를 취득한다.
async function GetFuelCodeFromProxy(_num) {
  logger.info('[PROXY] - _num['+_num+']');
  var returnValue = undefined;
  
  try {
    if(_num == ''){
      return returnValue;
    } 
    else {
      var url_fuel_code = url_req_proxy + urlencode.encode(_num);

      //logger.debug('[PROXY] TEST - REQUEST URL: ' + url_fuel_code);
      
      let _body = await doProxyRequest(url_fuel_code);
      returnValue = await GetParseDataFromResult(_body);
    }
    return returnValue;
  }
  catch (e) {
    logger.error('[PROXY] - PROXY ERROR !!! ' + e);
    return undefined;
  }
}

//프록시 서버와 GET통신
async function doProxyRequest(_url) {
  return new Promise(function (resolve, reject) {
    request.get({
      uri: _url,
      method: "GET",
      timeout: 1500,
      followRedirect: true,
      maxRedirects: 1
    }, 
    async function GetFuelTypeFromReqResult (_err, _res, _body) {
      if ( !_err) {
        resolve(_body);
      }
      else {
        if (_res != null) _res.render('result', { title: 'ERROR', results : _err });
        reject(_err);
      }
    });
  });
}

async function GetParseDataFromResult(_body) {
  try {
    if (_body) {
      var vehicleInfo = JSON.parse(_body);
      return vehicleInfo;
    }
    else {
      return undefined;
    }
  }
  catch (e) {
    logger.error('[PROXY] PARSE ERROR : '+ e);
    return undefined;
  }
}

//차량연료종류를 2문자의 한글로 취득 return 성공 : 차량 연료 종류
async function GetFuelType_2Kor (_number) {
    var vehicleInfo = await GetFuelCodeFromProxy(_number);

    if(vehicleInfo.useFuelCode != '') {
        if(vehicleInfo.useFuelCode == 'e') {
            return '전기';
        }
        else if(vehicleInfo.useFuelCode == 'l'){
            //place테이블 type칼럼 수정대비 : 하이브리드 항목 분리
            return '전기';
        }
        else {
            return '일반';
        }
    }
    else {
        return '';
    }
}


//모듈 출력
module.exports = {
  GetFuelCodeFromProxy : GetFuelCodeFromProxy
  , IsEv : IsEv
  //, CheckPlateNo : CheckPlateNo
}