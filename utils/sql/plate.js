//========================================================================================================================================
// DB 입출력 관리를위한 plate테이블 쿼리 모듈
// 작성 : [E2S] mswon 2021.07.01 
//========================================================================================================================================
//변수 정의
const db = require('../../db');
const logger = require('../logManager');


//주차 차량 정보 삽입(주차면IP, 차량 종류, 차량 번호, 이미지 경로) - 성공: true, 실패 : false
async function Insert (_addr, _type, _plate_no, _path) {
  const connection = await db.getConnection(async conn => conn);
  logger.debug('[DEBUG]'+'[SQL] Insert (' + _addr + ', ' + _type + ', ' + _plate_no + ', ' + _path + ')');
  try {
    await connection.beginTransaction();
    var req_query = 'INSERT INTO node.plate (addr, type, plate_no, path) VALUES (?, ?, ?, ?)';
    await connection.execute(req_query, [ _addr, _type, _plate_no, _path]);
    //커밋 후 true 반환
    await connection.commit();
    return true;
  }
  catch (exception) {
    logger.error('[SQL] ERROR : ' + exception);
    return false;
  }
  finally {
    connection.release();
  }
}
  
async function Update () {}
  
async function Delete () {}
  
//주차면 별 화면출력용 데이터 취득(주차면IP주소, 데이터 검색 범위 시작일, 데이터 검색 범위 종료일 ) - 성공 : [rows] , 실패 : false
async function GetVnList ( _addr, _s_db_date, _e_db_date) {
  logger.debug('[DEBUG]'+'[SQL] GET VNLIST ('+_addr+', '+_s_db_date+', '+_e_db_date+')');
  const connection = await db.getConnection(async conn => conn);
  var rows = [];
  try {
    await connection.beginTransaction();
    
    var req_query = '';

    if(_s_db_date == '' && _e_db_date == '') {
      req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr IN ( ? )';
      rows = await connection.query(req_query, [_addr]);
    }
    else {
      req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr IN ( ? ) AND timestamp BETWEEN ? AND ?';
      rows = await connection.query(req_query, [_addr, _s_db_date, _e_db_date]);
    }

    return rows;
  }
  catch (exception) {
    logger.error('[ERROR]'+'[SQL] ERROR : ' + exception);

    return [];
  }
  finally {
    connection.release();
  }
}
  
//엑셀출력용 데이터 취득(주차면IP주소 열거 문자열, 데이터 검색 범위 시작일, 데이터 검색 범위 종료일 ) - 성공 : [rows] , 실패 : false
async function GetExcelData ( _strAddrs, _s_db_date, _e_db_date) {
  logger.debug('[DEBUG]'+'[SQL] GET EXCEL DATA ('+_strAddrs+', '+_s_db_date+', '+_e_db_date+')');
  const connection = await db.getConnection(async conn => conn);

  try {
    await connection.beginTransaction();
    
    var req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr IN( ? ) AND timestamp BETWEEN ? AND ?';
    var [rows] = await connection.query(req_query, [_strAddrs, _s_db_date, _e_db_date]);

    logger.debug('[DEBUG]'+'[PLATE] EXCEL DATA GET ' + rows);

    return rows;
  }
  catch (exception) {
    logger.error('[ERROR]'+'[SQL] ERROR : ' + exception);

    return [];
  }
  finally {
    connection.release();
  }
}
  
//주차면의 가장 최근 상태정보를 불러낸다.
async function GetCurrentStatus (_addr) {
  logger.debug('[DEBUG]'+'[SQL] GET CURRENT STATUS : ' + _addr);
  const connection = await db.getConnection(async conn => conn);
  try {
    await connection.beginTransaction();

    var req_query = 'SELECT * FROM plate WHERE addr IN ( ? ) ORDER BY timestamp DESC LIMIT 1';
    var [rows] = await connection.query(req_query, [_addr]);

    return rows;
  }
  catch (exception) {
    logger.error('[ERROR]'+'[SQL] ' + exception);

    return [];
  }
  finally {
    connection.release();
  }
}
module.exports = {
  Insert : Insert
  //, Update : Update
  //, Delete : Delete
  , GetVnList : GetVnList
  , GetExcelData : GetExcelData
  , GetCurrentStatus : GetCurrentStatus
}