//========================================================================================================================================
// AI카메라 관제서버 브라우저 및 공통 제어 명령 모듈
// 작성 : [E2S] mswon 2022.10.06 
//========================================================================================================================================
function ShowAlertMsg(_res, _msg) {
    _res.send(`
      <script>
        alert('` + _msg + `')
      </script>`);
}

//경고창 표시 후 이동 (응답객체, 메시지 내용, 링크)
function ShowAlertMove(_res, _msg, _Path) {

    _res.send(`
      <script>
        alert('` + _msg + `')
        location.href = '` + _Path + `'
      </script>`);
}
//경고창 표시 및 상태코드 전달
function ShowAlertError(_res, _msg, _statusCd) {

    _res.send(`
      <script>
        alert('` + _msg + `')
      </script>`).status(_statusCd);
    
}

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

//입력한 ms만큼 대기
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
    ShowAlertMsg : ShowAlertMsg,
    ShowAlertMove : ShowAlertMove,
    ShowAlertError : ShowAlertError,
    GetSysTime : GetSysTime,
    sleep : sleep,
}