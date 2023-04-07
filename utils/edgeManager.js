//========================================================================================================================================
// AI카메라 단말 앱(edge) 제어 명령 모듈
// 작성 : [E2S] mswon 2021.07.01 
//========================================================================================================================================
//변수 선언
const { Axios } = require('axios');
var express = require('express');
//axios의 구조가 api문서와 일치하지 않음
const axios = require('axios');
var SSH = require('simple-ssh');
const logger = require('./logManager');
//edge시스템(카메라 단말)의 프로토콜 통신 포트
const PORT_CMD = 5000;
//edge시스템의 SSH 통신 포트
const PORT_SSH = 22;
//통신실패시 재시도 횟수
const RETRY_COUNT = 1;

//edge시스템 명령
//edge단말 상태
const CMD_SYSTEM = '/system';
//edge단말 캡쳐
const CMD_CAPTURE = '/capture';
//edge단말 설정
const CMD_SETTING = '/setting';
//edge단말 제어
const CMD_CONTROL = '/control';


//리퀘스트에 사용할 공통 파라미터
const common_timeout = 2000;
const common_maxRedirects = 1;
//POST용 헤더
const post_headers = {'Content-Type': 'application/json'};

axios.defaults.timeout = common_timeout;
axios.defaults.maxRedirects = common_maxRedirects;
axios.defaults.headers.post = post_headers;

//SSH (미사용)
var PsSSHParam = {
    host: null,
    user: "nvidia",
    pass : "jetson"
};

//=====================================================================================================================
//메소드
//=====================================================================================================================
//GET 통신 edge단말 제어 메소드
async function GetCommandSystem(_host) {
    logger.debug('[DEBUG]'+'[EDGE] GET COMMAND SYSTEM ('+_host+')');
    let resp = undefined;
    var returnObj = { result : false, data : undefined, code : undefined};
    const configInstance = axios.create({
        method : 'GET',
        timeout : common_timeout,
        maxRedirects : common_maxRedirects,
    });
    var url = 'http://'+_host+':'+PORT_CMD + CMD_SYSTEM;
    try{
        resp = await axios.get(url, configInstance)
        .then(function(response){
            //성공
            returnObj.result = true;
            returnObj.code = response.status
            return response.data;
        }).catch(function (error){
            if(error.code === 'ECONNREFUSED'){
                //연결 거부
                returnObj.result = false;
                returnObj.code = error.code;
                return undefined;
            } else if(error.code === 'ETIMEDOUT'){
                //타임아웃
                returnObj.result = false;
                returnObj.code = error.code;
                return undefined;
            } else {
                //기타
                returnObj.result = false;
                returnObj.code = error.code;
                return undefined;
            }
        });

        returnObj.data = resp;

    } catch (_err) {
        logger.error('[ERROR]'+'[EDGE] '+_err);
        returnObj.result = false;
    } 

    return returnObj;
}

//POST 통신 Edge단말 제어 메소드
async function PostCommandSystem(_host, _cmd, _val) {
    logger.debug('[DEBUG]'+'[EDGE] POST COMMAND SYSTEM ('+_host+', '+_cmd+', '+_val+')');
    let resp = undefined;
    var returnObj = { result : false, data : undefined, code : undefined};
    try{
        const PostConfig = await BuildCommandParam(_host, _cmd, _val);
        resp = await axios.post(PostConfig.url, PostConfig.data)
        .then(function(response){
            logger.info('[INFO]'+'[EDGE] POST REQUEST SUCCESS : ' + _host);
            returnObj.result = true;
            returnObj.code = response.status;
            return response;
        }).catch(function (error){
            switch(error.code) {
                case 'ECONNREFUSED' :
                    logger.error('[ERROR]'+'[EDGE] POST CONNECTION REFUSED : ' + _host);
                    //연결 거부
                    returnObj.result = false;
                    returnObj.code = error.code;
                    return undefined;
                case 'ETIMEDOUT' :
                    logger.warn('[WARN]'+'[EDGE] POST CONNECTION TIME OUT : ' + _host);
                    //타임아웃
                    returnObj.result = false;
                    returnObj.code = error.code;
                    break;
                default :
                    logger.error('[ERROR]'+'[EDGE] CONNECTION FAILED ['+error.code + '] : '  + _host);
                    returnObj.result = false;
                    returnObj.code = error.code;
                    break;
            }
        });

        returnObj.data = resp;

    } catch (_err) {
        returnObj.result = false;
    }

    return returnObj;
}

//SSH Edge단말 제어 메소드
async function SshCommandSystem(_host) {
    logger.info('[INFO]'+'[EDGE] SSH COMMAND SYSTEM ('+_host+')');
    // var SshParam = PsSSHParam;
    // SshParam.host = _host;
    // var ssh = new SSH(SshParam);
    // var result = false;
    // ssh.exec('sudo reboot', {
    //     out : function (stdout) { logger.debug('[DEBUG]'+'[SSH] : out :' + stdout); },
    //     err : function (stderr) { logger.debug('[DEBUG]'+'[SSH] : err :' + stderr); result = false},
    //     exit : function (stdcd) { logger.debug('[DEBUG]'+'[SSH] : exit:' + stdcd); result = true }
    // }).start();
    return result;
}

//제어명령 파라미터 조립 메소드
async function BuildCommandParam(_host, _cmd, _val) {
    var urlBuf = 'http://' + _host + ':' + PORT_CMD;
    var bodyBuf = null;
    
    switch ( _cmd) {
        case 2 : // 서버 설정 변경
            urlBuf += CMD_SETTING;
            body = {
                server : {
                    ip : _val,
                    port : 3001,
                    protocol : http
                }
            };
        break;
        case 51 : //스피커 볼륨 조절
            urlBuf += CMD_SETTING;
            bodyBuf = {
                volume : _val  
            };
            break;
        case 4 : //영상 캡쳐
            urlBuf += CMD_CAPTURE;
            bodyBuf = {tr_id : 12345 };
            break;
        case 41 : // 영상 캡쳐
            urlBuf += CMD_CAPTURE;
            bodyBuf = {tr_id : _val };
            break;
        case 61 : //경광등 제어 ('on'/'off')
            urlBuf += CMD_CONTROL;
            bodyBuf = {beacon : _val};
            break;
        case 71 : //스피커 텍스트방송 출력
            urlBuf += CMD_CONTROL;
            bodyBuf = {text_to_speech : _val};
            break;
        case 81 : //스피커 안내방송 프리셋 출력 ( 1 : 최초진입, 2 : 한시간 경과)
            urlBuf += CMD_CONTROL;
            bodyBuf = {speaker : _val};
            break;
    }
    var post_param = {url : urlBuf, data : bodyBuf};
    return post_param;
}

//시스템 상태정보 요청 메소드 (IP주소)
async function RequestSystemStatus (_host) {
    logger.debug('[DEBUG]'+'[EDGE] REQUEST SYSTEM STATUS (' + _host + ')');
    var resp = undefined;
    var count = 0;
    try {
        //edge단말에 대하여 시스템상태요청
        while (count < RETRY_COUNT) {
            //통신이 실패한 경우 설정횟수만큼 재실행 후 주차장 상태 갱신
            resp = await GetCommandSystem(_host, count);
            if(resp == undefined) count++;
            else break;
        }
        

        if(resp.result){
            logger.info('[INFO]'+'[EDGE] GET REQUEST SUCCESS : ' + _host);
            const sysInfo = resp.data;
            return sysInfo;
        } else {
            switch(resp.code) {
                case 'ECONNREFUSED' :
                    logger.error('[ERROR]'+'[EDGE] GET CONNECTION REFUSED : ' + _host);
                    break;
                case 'ETIMEDOUT' :
                    logger.warn('[WARN]'+'[EDGE] GET CONNECTION TIME OUT : ' + _host);
                    break;
                case 'ECONNABORTED' :
                    //중단된 연결에대하여 로그를 남기지 않음
                    break;
                default :
                    logger.error('[ERROR]'+'[EDGE] CONNECTION FAILED ['+resp.code + '] : '  + _host);
                    break;
            }
        }
        
        return null;
    }
    catch (ex) {
        logger.error('[ERROR]'+ex);
        return null;
    }
}

//edge단말 명령 메소드 (IP주소, 명령번호, 명령값)
async function OrderToEdgeSystem(_host, _cmd, _val) {
    logger.info('[INFO]'+'[EDGE] ORDER TO EDGE SYSTEM (' + _host +', ' + _cmd + ', ' + _val + ')');
    var result = null;
    var count = 0;
    try {
        
        while (count < RETRY_COUNT) {
          //통신이 실패한 경우 설정횟수만큼 재실행 후 주차장 상태 갱신
          resp = await PostCommandSystem(_host, _cmd, _val);
          if(resp == null) count++;
          else break;
        }

        if(resp.result){
            result = resp.data;
            return result;
        }

        return result;
    }
    catch (ex) {
        logger.error('[ERROR]'+ex);
        return null;
    }
}

module.exports = {
    PostCommandSystem : PostCommandSystem
    , SshCommandSystem : SshCommandSystem
    , OrderToEdgeSystem : OrderToEdgeSystem
    , RequestSystemStatus : RequestSystemStatus
}