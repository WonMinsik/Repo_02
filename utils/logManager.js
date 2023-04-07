//================================================================================================================================
//logger : winston을 사용하여 info레벨 이상의 로그파일 생성 
// 작성 : E2S mswon (2021-10-11)
//================================================================================================================================
//변수 정의
var winston = require('winston');
var winstonDaily = require('winston-daily-rotate-file');

const logDir = __dirname +'/../logs/';  // logs 디렉토리 하위에 로그 파일 저장
const { combine, timestamp, printf } = winston.format;

// Define log format
const logFormat = printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});

/*
 * Log Level
 * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
 */
const Logger = winston.createLogger({
  format: combine(
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    logFormat,
  ),
  transports: [
    // info 레벨 로그를 저장할 파일 설정
    new winstonDaily({
      level: 'info',//로그인정보, 리퀘스트등의 이력
      datePattern: 'YYYYMMDD',
      dirname: logDir,
      filename: `%DATE%.log`,
      maxFiles: 30,  // 30일치 로그 파일 저장
      zippedArchive: true, 
    }),
    // error 레벨 로그를 저장할 파일 설정
    new winstonDaily({
      level: 'error',
      datePattern: 'YYYYMMDD',
      dirname: logDir + '/error',  // error.log 파일은 /logs/error 하위에 저장 
      filename: `%DATE%.error.log`,
      maxFiles: 30,
      zippedArchive: true,
    }),
  ],
});

// dev 환경의 경우 
if (process.env.NODE_ENV === 'dev') {
  Logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),  // 색깔 넣어서 출력
      winston.format.simple(),  // `${info.level}: ${info.message} JSON.stringify({ ...rest })` 포맷으로 출력
    )
  }));
}

module.exports = Logger;