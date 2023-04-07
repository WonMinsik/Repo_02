//========================================================================================================================================
// DB 입출력 관리를위한 DB쿼리 모듈
// 작성 : [E2S] mswon 2021.05.31 
// 수정 : [E2S] mswon 2021.06.02
// 수정 : [E2S] mswon 2021.06.29
//========================================================================================================================================
//변수 정의
const db = require('../db');
const logger = require('./logManager');

// //evnum 테이블 제어
async function InsertData_evnum (colum1, colum2, colum3, colum4) {}

// async function UpdateData_evnum (colum1, colum2, colum3, colum4, colum5) {}

// //데이터 삭제 (차량번호) - 성공 : true, 실패 : false
// async function DeleteData_evnum (_num) {
//   const connection = await db.getConnection(async conn => conn);

//   try {
//     await connection.beginTransaction();
//     var req_query = 'DELETE FROM evnum WHERE number=?';
//     var [result] = await connection.execute(req_query, [_num]);

//     //커밋 후 true 반환
//     await connection.commit();

//     logger.debug('[DEBUG]'+'db::DeleteData_evnum() - Delete [' + _num + ']');

//     return true;
//   } 
//   catch (exception) {
//     logger.debug('[DEBUG]'+'db::DeleteData_evnum() - ' + exception);

//     return false;
//   }
//   finally {
//     connection.release();
//   }
// }

//등록차량 정보 취득 (차량 번호)
async function GetVehicleInfo_evnum (_number) {
    const connection = await db.getConnection(async conn => conn);
  
    try {
      await connection.beginTransaction();
  
      var req_query = 'SELECT _ID, number, auth, fuel, fuel_s FROM evnum WHERE number = ? ORDER BY _ID DESC';
      var [rows] = await connection.query(req_query, [_number]);
      logger.debug('[DEBUG]'+rows);
  
      if (rows.length > 0) {
        var row = rows[0];
        
        return row;
      }
      else {
        return undefined;
      }
    }
    catch (exception) {
      logger.error('[ERROR]'+'query::GetVehicleInfo_evnum() - ' + exception);
  
      return undefined;
    }
    finally {
      connection.release();
    }
  }
  
  
  // //등록차량 목록 취득() - 성공 : 등록차량 목록, 실패 : false
  // async function GetEVList_evnum () {
  //   const connection = await db.getConnection(async conn => conn);
  
  //   try {
  //     await connection.beginTransaction();
  
  //     var req_query = 'SELECT * FROM evnum ORDER BY number';
  //     var [rows] = await connection.query(req_query);
  
  //     logger.debug('[DEBUG]'+'db::GetEVList_evnum() - GET LIST');
  
  //     return rows;
  //   }
  //   catch (exception) {
  //     logger.debug('[DEBUG]'+'db::GetEVList_evnum() - ' + exception);
  
  //     return false;
  //   }
  //   finally {
  //     connection.release();
  //   }
  // }
  
  //plate 테이블 제어
  // //주차 차량 정보 삽입(주차면IP, 차량 종류, 차량 번호, 이미지 경로) - 성공: true, 실패 : false
  // async function InsertData_plate (_addr, _type, _plate_no, _path) {
  //   const connection = await db.getConnection(async conn => conn);
  
  //   try {
  //     await connection.beginTransaction();
  
  //     var req_query = 'INSERT INTO node.plate (addr, type, plate_no, path) VALUES (?, ?, ?, ?)';
  //     var [result] = await connection.execute(req_query, [ _addr, _type, _plate_no, _path]);
  
  //     //커밋 후 true 반환
  //     await connection.commit();
      
  //     logger.debug('[DEBUG]'+'db::InsertData_plate() - Inserted [' + _addr + ', ' + _type + ', ' + _plate_no + ', ' + _path + ']');
      
  //     return true;
  //   }
  //   catch (exception) {
  //     logger.debug('[DEBUG]'+'db::InsertData_plate() - ' + exception);
  
  //     return false;
  //   }
  //   finally {
  //     connection.release();
  //   }
  // }
  
  // async function UpdateData_plate () {}
  
  // async function DeleteData_plate () {}
  
  //주차면 별 화면출력용 데이터 취득(주차면IP주소, 데이터 검색 범위 시작일, 데이터 검색 범위 종료일 ) - 성공 : [rows] , 실패 : false
  async function GetViewData_plate ( _addr, _s_db_date, _e_db_date) {
    const connection = await db.getConnection(async conn => conn);
  
    try {
      await connection.beginTransaction();
      
      var req_query = '';
  
      if(_s_db_date == '' && _e_db_date == '') {
        req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr =\' ? \' ? ?';
      }
      else {
        req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr =\' ? \' AND timestamp BETWEEN ? AND ?';
      }
  
      var [rows] = await connection.query(req_query, [_addr, _s_db_date, _e_db_date]);
  
      logger.debug('[DEBUG]'+'db::GetViewData_plate() -  [' + _addr + ', ' + _s_db_date + ', ' + _e_db_date + ']');
  
      return rows;
    }
    catch (exception) {
      logger.error('[ERROR]'+'db::GetViewData_plate() - ' + exception);
  
      return false;
    }
    finally {
      connection.release();
    }
  }
  
  //엑셀출력용 데이터 취득(주차면IP주소 열거 문자열, 데이터 검색 범위 시작일, 데이터 검색 범위 종료일 ) - 성공 : [rows] , 실패 : false
  async function GetExcelData_plate ( _strAddrs, _s_db_date, _e_db_date) {
    const connection = await db.getConnection(async conn => conn);
  
    try {
      await connection.beginTransaction();
      
      var req_query = 'SELECT id, timestamp, addr, type, plate_no, path FROM node.plate WHERE addr IN( ? ) AND timestamp BETWEEN ? AND ?';
      var [rows] = await connection.query(req_query, [_strAddrs, _s_db_date, _e_db_date]);
  
      logger.debug('[DEBUG]'+'db::GetExcelData_plate() -  [' + _strAddrs + ', ' + _s_db_date + ', ' + _e_db_date + ']');
  
      return rows;
    }
    catch (exception) {
      logger.error('[ERROR]'+'db::GetExcelData_plate() - ' + exception);
  
      return false;
    }
    finally {
      connection.release();
    }
  }
  
  //place 테이블 제어
  // async function InsertData_place () {}
  
  // async function UpdateData_place () {}
  
  // async function DeleteData_place () {}
  
  // async function SelectData_place () {}
  
  //space 테이블 제어
  // async function InsertData_space () {}
  
  // async function UpdateData_space () {}
  
  // async function DeleteData_space () {}
  
  // async function SelectData_space () {}
  
  
  module.exports = {
    GetVehicleInfo : GetVehicleInfo_evnum,
    GetViewData : GetViewData_plate,
    GetExcelData : GetExcelData_plate
  }