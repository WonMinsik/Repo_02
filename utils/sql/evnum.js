//========================================================================================================================================
// DB 입출력 관리를위한 evnum 테이블 쿼리 모듈
// 작성 : [E2S] mswon 2021.07.01
//========================================================================================================================================
//변수 정의
const db = require('../../db');
const logger = require('../logManager');

// auth : 0 -> 자동등록 
const auth_AutoReg = 0;
// auth : 1 -> 사용자등록
const auth_UserReg = 1;
// auth : 2 -> 국토부 인증 등록
const auth_ProxyReg = 2;

// fuel : 1 -> 단속 대상 제외
const fuel_Allow = 1;
// fuel : 2 -> 단속 대상
const fuel_ClackDown = 2;

//evnum 테이블 제어

//데이터 추가 (차량번호, 등록유형, 단속여부, 연료코드)
async function Insert (_number, _auth, _fuel, _fuel_s) {
  const connection = await db.getConnection(async conn => conn);
  //logger.debug('[DEBUG]'+'[SQL] INSERT ('+_number+', '+_auth+', '+_fuel+', '+_fuel_s+')');
  try {
    await connection.beginTransaction();
    var req_query = 'INSERT IGNORE INTO evnum (_ID, number, auth, fuel, fuel_s) VALUES (NULL,?,?,?,?);';
    await connection.execute(req_query, [_number, _auth, _fuel, _fuel_s]);
    await connection.commit();

    logger.debug('[DEBUG]'+'[SQL] INSERT ['+_number+']');

    return true;
  }
  catch (exception) {
    logger.error('[ERROR]'+'[SQL] ERROR :' + exception);
    return false;
  }
  finally {
    connection.release();
  }
}
//데이터 갱신 (ID, 차량번호, 등록유형, 단속여부, 연료코드)
async function Update (_ID, _number, _auth, _fuel, _fuel_s) {
  const connection = await db.getConnection(async conn => conn);
  //logger.debug('[DEBUG]'+'[SQL] UPDATE ('+_ID+', '+_number+', '+_auth+', '+_fuel+', '+_fuel_s+')');
  try {
    await connection.beginTransaction();
    var req_query = 'UPDATE evnum SET auth=?, fuel=?, fuel_s=? WHERE _ID=?';
    await connection.execute(req_query, [_auth, _fuel, _fuel_s, _ID]);
    await connection.commit();

    logger.debug('[DEBUG]'+'[SQL] UPDATE');

    return true;
  }
  catch (exception) {
    logger.error('[ERROR]'+'[SQL] ERROR :' + exception);
    return false;
  }
  finally {
    connection.release();
  }

}

//데이터 삭제 (차량번호)
async function Delete (_num) {
  const connection = await db.getConnection(async conn => conn);
  //logger.debug('[DEBUG]'+'[SQL] DELETE ('+_num+')');
  try {
    await connection.beginTransaction();
    var req_query = 'DELETE FROM evnum WHERE number=?';
    await connection.execute(req_query, [_num]);
    await connection.commit();

    logger.debug('[DEBUG]'+'[SQL] DELETE');

    return true;
  } 
  catch (exception) {
    logger.error('[ERROR]'+'[SQL] ERROR - ' + exception);

    return false;
  }
  finally {
    connection.release();
  }
}

//등록차량 정보 취득 (차량 번호)
async function GetVehicleInfo (_number) {
    const connection = await db.getConnection(async conn => conn);
    //logger.debug('[DEBUG]'+'[SQL] GET VEHICLE INFO ('+_number+')');
    try {
      await connection.beginTransaction();
  
      var req_query = 'SELECT _ID, number, auth, fuel, fuel_s FROM evnum WHERE number = ? ORDER BY _ID DESC';
      var [rows] = await connection.query(req_query, [_number]);
      logger.debug('[DEBUG]'+rows);
  
      if (rows.length > 0) {
        var row = rows[0];
        
        return row;
      }

      return null;
    }
    catch (exception) {
      logger.error('[ERROR]'+'[SQL] ERROR - ' + exception);
  
      return null;
    }
    finally {
      connection.release();
    }
  }
  
  
  //등록차량 목록 취득()
  async function GetEvList() {
    //logger.debug('[DEBUG]'+'[SQL] GET EV LIST');
    const connection = await db.getConnection(async conn => conn);

    try {
      await connection.beginTransaction();
      var req_query = 'SELECT * FROM evnum ORDER BY number';
      var [rows] = await connection.query(req_query);
      return rows;
    }
    catch (exception) {
      logger.error('[error]'+'[SQL] ERROR - ' + exception);
  
      return [];
    }
    finally {
      connection.release();
    }
  }
  
  
  
  module.exports = {
    AUTH_AUTO_REG : auth_AutoReg
    , AUTH_USER_REG : auth_UserReg
    , AUTH_PROXY_REG : auth_ProxyReg
    , FUEL_ALLOW : fuel_Allow
    , FUEL_CLACKDOWN : fuel_ClackDown
    , Insert : Insert
    , Update : Update
    , Delete : Delete
    , GetVehicleInfo : GetVehicleInfo
    , GetEvList : GetEvList
  }