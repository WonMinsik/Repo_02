const db = require('../db');
const logger = require('./logManager');

//주차이력 테이블 차량 연료타입 데이터 동기(주차면IP주소, 데이터 검색 범위 시작일, 데이터 검색 범위 종료일 ) - 성공 : [rows] , 실패 : false
async function SyncPlateType ( ) {
    const connection = await db.getConnection(async conn => conn);
  
    try {
      await connection.beginTransaction();
      //plate테이블 type칼럼 크기 변경 쿼리
      var req_AlterTable_query = 'ALTER TABLE plate CHANGE COLUMN type type CHAR(16) NULL DEFAULT NULL COLLATE utf8mb4_unicode_ci AFTER addr';

      //주차이력테이블 하이브리드 차량 연료 데이터 변경(영업차량 제외)쿼리
      var req_TypeChange_query = 'UPDATE node.plate plt INNER JOIN (SELECT evn.number AS number FROM node.evnum evn WHERE evn.fuel = 1 AND evn.fuel_s IN (\'l\', \'m\', \'n\', \'o\', \'p\') ) evs ON plt.plate_no = evs.number SET plt.type = \'하이브리드\' WHERE plt.type != \'영업\'';
  
      await connection.query(req_AlterTable_query);

      logger.debug('[DEBUG]'+'WORKING::SyncPlateType() - Alter Table');

      await connection.query(req_TypeChange_query);
  
      logger.debug('[DEBUG]'+'WORKING::SyncPlateType() - Type Change Success');
  
      return true;
    }
    catch (exception) {
      logger.error('[ERROR]'+'WORKING::Exception - ' + exception);
  
      return false;
    }
    finally {
      connection.release();
    }
  }

  module.exports = {
    SyncPlateType : SyncPlateType,
  }