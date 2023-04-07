var express = require('express');
var router = express.Router();
const logger = require("../utils/logManager");
const browser = require('../utils/browser'); 
const locationName = 'login';
/* GET home page. */
router.get('/', function(req, res, next) {

  const msg =req.query.msg;
  try{

    //로그인에 성공한 후, session 객체 안의 user속성값을 확인하고 리다이렉트
    if(req.session.user != undefined) {
      
      res.redirect('home');
    } 

    res.render('login', { 
      title: '전기차 충전소 AI 감시 시스템 관제서버' ,
      msg: msg
    });

  } catch (e) {
    logger.error('[ERROR]'+e);
  }
  res.end();
});

// 로그인 
router.post('/signin', async (req, res, next) =>{
  logger.debug('[DEBUG]'+"[LOGIN] req.body :" + JSON.stringify(req.body));
  const {username, password} = req.body;
  const reqIpAddr = req.headers['x-forwarded-for'] || req.ip;
  logger.info('[INFO]'+"[LOGIN] login request [ username : " + username + " ] from " + reqIpAddr );
  const fs = require('fs');
  var users = undefined;
  var [user] = [];
  
  try {
    // JSON파일에서 사용자 정보 취득
    let rawdata = fs.readFileSync('./login.json','utf-8');
    users = JSON.parse(rawdata).users;
  } catch (exception) {
    logger.error('[ERROR]'+exception);
    browser.ShowAlertError(res, 'login.json파일을 찾을 수 없습니다.', 404);
  }

  try {
    // JSON파일의 사용자 정보와 대조하여 사용자 확인
    user = users.filter((v)=> v.username === username && v.password === password); // JSON기재 사용자 확인
    
    if(user.length != 0) {
      const loginUser = user.at(0);
      logger.info('[INFO]'+"[LOGIN] user :" + JSON.stringify(loginUser.username));
      //로그인에 성공한 후, session 객체 안에 user속성값을 추가하여 사용자정보를 추가한다.
    //세션생성 (username, ID)
    user.id = req.session.id;
    req.session.user = {...user};
    req.session.user.lastLocation = locationName;
    res.redirect('/vnplace');
    } else {
      //실패시
      browser.ShowAlertMove(res, '해당 사용자 정보가 없습니다.', '/');
    }
  } catch (exception) {
    logger.warn('[WARN]'+"[LOGIN] Login failed [ username : " + username + " ] from " + reqIpAddr);
    browser.ShowAlertMove(res, '로그인에 실패하였습니다. \n로그인 정보를 확인해주십시오.', '/');
    return;
  }
  
  
  

});

// 로그아웃
router.get('/signout', async (req, res, next) =>{
  
  if(req.session.user != undefined) {
    const reqIpAddr = req.headers['x-forwarded-for'] || req.ip;
    logger.info('[INFO]'+`[LOGOUT] user : ${req.session.user.username} from ${reqIpAddr}`);
    req.session.destroy(function(){
      req.session;
    });

    browser.ShowAlertMove(res, '로그아웃 되었습니다.', '/');
  } else {
    res.redirect('/');
  }
});


module.exports = router;
