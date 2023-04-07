var createError = require('http-errors');
var express = require('express');
var session = require('express-session');
var MemoryStore = require('memorystore')(session);
var MngFile = require('./utils/fileManager');
var path = require('path');
//const Logger =require('morgan'); //[e2s] mswon 2022.10.13 [로거변경] morgan에서 winston로 변경 
// var cookieParser = require('cookie-parser');

//세션 유효시간 (ms 단위);
const maxAge = 1000 * 60 * 60 * 10; // 1000ms, 60초, 60분, 10시간 
// const maxAge = 1000 * 60 * 30; // 1000ms, 60초, 30분
// const maxAge = 1000 * 60 * 15; // 1000ms, 60초, 15분
const sessionObj = {
  secret: 'ui-wang_vnumai', // salt =-> 암호화할떄 필요한 요소값
  resave: false,
  saveUninitialized: true,
  store: new MemoryStore({ checkPeriod: maxAge }), //서버를 저장할 공간설정
  //checkPeriod : 서버측 세션의 유효기간
  cookie: {
    maxAge: maxAge
  }
  // 브라우저의 쿠키 유효시간
};


var db = require('./db.js');
var config = new(require('./config.js'))();
const fs = require('fs');
var app = express();

// 라우터에 대한 GET이나 POST 요청을 로그로 남기지않음.
// app.use(Logger("dev"));
app.use(express.json({limit:"8mb"}));
app.use(express.urlencoded({limit:"8mb", extended: true}));
//app.use(cookieParser());

app.use(session(sessionObj));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));
app.use('/files', express.static(path.join(__dirname, '/../files')));
MngFile.SetBaseDirectory();
// -----------------------------------------
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
//app.set('view engine', 'ejs');

// -----------------------------------------
app.set('config', config);
// -----------------------------------------

app.set('db', db);
// -----------------------------------------

const Auth = (req, res, next) => {
  const {user} = req.session;
  if(user != undefined) {
    if(user.id != req.session.id)
    {
      require('./utils/browser').ShowAlertMove(res, '세션 정보가 변경되었습니다.', '/login');  
    }
    next();
  } else {
    require('./utils/browser').ShowAlertMove(res, '로그인 정보가 없습니다. ', '/login');
  }
}

// -----------------------------------------
app.use('/login', require('./routes/login')); // 로그인화면 (테스트중)
app.use('/', require('./routes/login')); // 로그인화면 (미사용) -> 리다이렉트용
app.use('/home', Auth, require('./routes/home')); // 메인화면
app.use('/reglist', Auth, require('./routes/reglist'));  // 전기차 등록차량 편집
app.use('/vnlist', Auth, require('./routes/vnlist'));  // 단말별 주차 현황 List
app.use('/vnplace', Auth, require('./routes/vnplace')); // 현황판 화면
app.use('/vnsnapshots', Auth, require('./routes/vnsnapshots'));  // 스냅삿 확인화면

app.use('/place', require('./routes/place'));  // 주기보고 수신
app.use('/vnum', require('./routes/vnum')); // 검출보고 수신
app.use('/status', require('./routes/status')); // 상태보고 수신
app.use('/upload', require('./routes/upload')); // 현황판클릭이미지 수신
// -----------------------------------------
// app.use('/vnumdb', require('./routes/vnumdb'));
// app.use('/vnumfs', require('./routes/vnumfs'));
// app.use('/vnview', require('./routes/vnview'));
// app.use('/vnstatus', require('./routes/vnstatus'));
// app.use('/vntemp', require('./routes/vntemp'));
// app.use('/vnrequest', require('./routes/vnrequest'));
// app.use('/vnrealtime', require('./routes/vnrealtime'));
// app.use('/places', require('./routes/places'));
// app.use('/capture', require('./routes/capture'));
// app.use('/uploads', require('./routes/uploads'));
// app.use('/uploadfs', require('./routes/uploadfs'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
