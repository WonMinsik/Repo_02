//========================================================================================================================================
// AI카메라 서버내 파일(edge) 제어 명령 모듈
// 작성 : [E2S] mswon 2022.10.07 
//========================================================================================================================================
const path = require('path');
const fs = require('fs');
const logger = require('./logManager');
const root_files_path = __dirname + '/../../files/';

//테스트용 스냅샷 파일 저장 경로?
const snap_test_path = root_files_path + 'view/'; //  '~/files/view/{ip}.jpg'
//스냅샷화면용 파일 저장 경로 (home화면에서의 스냅샷명령어)
const snap_home_path = root_files_path + 'capture/'; //  '~/files/view/{YYYYMMDDHHmmss}_{ip}-12345.jpg'
//섬네일 이미지 심볼릭 링크의 경로
const thumb_symlink_path = root_files_path + 'status/'; //  '~/files/status/img_{ip}.jpg'
//섬네일 실제 이미지 경로
const thumb_file_path = root_files_path + 'status/img/'; // '~/files/status/img/{ip}.jpg'
//검출보고 이미지 심볼릭 링크 경로
const report_symlink_path = root_files_path; // + '~/files/{ip}.jpg'
//검출보고 실제 이미지 파일 경로
const report_file_path = root_files_path + 'plate/'; //+ '~/files/plate/{ip}/{각 파일명}.jpg'
//현황판 클릭 이미지 심볼릭 링크 경로
const clicked_symlink_path = root_files_path + 'status/'; // + '~/files/cap_{ip}.jpg'
//현황판 클릭 실제 이미지 파일 경로
const clicked_file_path = root_files_path + 'status/cap/'; //+ '~/files/status/cap/{ip}.jpg'
//섬네일 심볼릭링크의 헤더
const thumb_symlink_filename_header = 'img_';
//현황판 클릭 이미지의 심볼릭링크의 헤더
const clicked_symlink_filename_header = 'cap_';
//이미지 파일 확장자
const image_file_ext = '.jpg';


//경로 존재여부 확인 후 경로 생성
function CheckCreateDirectory(_path) {
    try{
        var chkPath = fs.existsSync(_path)

        if(chkPath)
        {
            // no work
        } else {

            fs.mkdirSync(_path, { recursive: true}, (err) =>{
                if (err) throw err;
            });

            logger.info('[INFO]'+"[File] Create Directory : " + _path);

            chkPath = fs.existsSync(_path);
        }

        return chkPath;

    } catch(err) {
       logger.error('[ERROR]'+err);
    }
}

//기본경로 생성
function SetBaseDirectory(){
    logger.info('[INFO]'+'[File] Set Base Directory');
    //테스트용 스냅샷 저장경로
    CheckCreateDirectory(snap_test_path);
    //home화면 수동 스냅샷 저장경로 생성
    CheckCreateDirectory(snap_home_path);
    //현황판 섬네일 경로 생성
    CheckCreateDirectory(thumb_file_path);
    CheckCreateDirectory(thumb_symlink_path);
    //현황판 스냅샷 경로 생성
    CheckCreateDirectory(clicked_file_path);
    CheckCreateDirectory(clicked_symlink_path);
    //검출보고 스냅샷 저장경로 생성
    CheckCreateDirectory(report_file_path);
    CheckCreateDirectory(report_symlink_path);
}

function GetSymlinkPath(_file_path) {
    const filedirname = path.dirname(_file_path) + '/';
    const filename = path.basename(_file_path);

    var symlinkpath = undefined;

    //현황판 섬네일
    if(filedirname === thumb_file_path) {
        symlinkpath = thumb_symlink_path + thumb_symlink_filename_header + filename;
    //현황판 클릭이미지
    } else if(filedirname === clicked_file_path) {
            symlinkpath = clicked_symlink_path + clicked_symlink_filename_header + filename;
    //검출보고 이미지
    } else if (filedirname.includes(report_file_path)) {
        const ipAddr = filedirname.startsWith(report_file_path.length);
        symlinkpath = report_symlink_path + ipAddr + image_file_ext;
    } else {
        logger.error('[ERROR]'+'[File] Get Symbolic Link Path Error : ' + _file_path);
        return symlinkpath;
    }
    logger.debug('[DEBUG]'+'[File] Get SymlinkPath : ' + symlinkpath + '\n From : ' + _file_path);
    return symlinkpath
}


//현황판 섬네일이미지 생성 및 심볼링 링크 연결
function SetThumbnailImageFileFromData (_file_path, _data) {
    logger.debug('[DEBUG]'+'[File]- Create Thumbnail Image ['+_file_path+']');
    
    try {
        //경로 확인
        if(CheckCreateDirectory(path.dirname(_file_path))) {            
            //데이터 스트림을 base64 디코드
            var buf = Buffer.from(_data, 'base64');
            
            //섬네일 이미지를 갱신(jpg파일 덮어쓰기)
            fs.writeFileSync(_file_path, buf);

            const link_path = GetSymlinkPath(_file_path);

            //섬네일 이미지에 대한 심볼릭 링크가 없는경우 생성
            if(link_path != undefined)
            {
                if(!fs.existsSync(link_path)) {
                    fs.symlinkSync(_file_path, link_path);
                }
            }
        }
    } catch(err) {
        logger.error('[ERROR]'+err)
    }
}

//현황판 클릭이미지 생성 및 심볼릭링크 연결
function SetClickedImageFileFromData (_file_path, _data) {
    logger.debug('[DEBUG]'+'[File]- Create Clicked Image ['+_file_path+']');
    
    try {
        //경로 확인
        if(CheckCreateDirectory(path.dirname(_file_path))) {            
            //데이터 스트림을 base64 디코드
            var buf = Buffer.from(_data, 'base64');
            
            //클릭 이미지를 갱신(jpg파일 덮어쓰기)
            fs.writeFileSync(_file_path, image_data);

            const link_path = GetSymlinkPath(_file_path);

            //클릭 이미지에 대한 심볼릭 링크가 없는경우 생성
            if(link_path != undefined)
            {
                if(!fs.existsSync(link_path)) {
                    fs.symlinkSync(_file_path, link_path);
                }
            }
        }
    } catch(err) {
        logger.error('[ERROR]'+err);
    }
}

//검출보고이미지 생성 및 심볼릭 링크 연결
function SetReportImageFileFromData ( _file_path, _data){
    logger.debug('[DEBUG]'+'[File]- Report Click Image ['+_file_path+']');
    try {

        var buf = Buffer.from(_data, 'base64');
        // 비동기 파일 쓰기,
        // fs.writeFileSync(_file_path, buf);
        fs.writeFile(_file_path, buf, function (err) {
            if (err) {
                logger.error('[ERROR]'+err);
                logger.dir(err);
                return;
            }
            logger.debug('[DEBUG]'+'WRITE COMPLETE : ' + _file_path); 
           }
        );
        logger.debug('[DEBUG]'+'[File]- Report Click Image ['+_file_path+']');
        

    } catch (err) {
        logger.error('[ERROR]'+err);
    }
  
}

//이미지파일을 읽어 스트림으로 취득
async function GetDataStreamFromImage(filename){

    try {
        fs.stat( filename, (_err, _stats) => {
            if (_err) {
              logger.error('[ERROR]'+_err);
              return undefined;
            } else {
              fs.readFile(filename, function(_err2, _data) {
                if (_err2) { 
                    logger.error('[ERROR]'+_err2);
                    return undefined;
                } else {
                  return _data;
                }
              });
            }
        });
    } catch (error) {
        logger.error('[ERROR]'+error);
        return undefined;
    }
}

module.exports ={
    thumb_symlink_path : thumb_symlink_path,
    thumb_file_path : thumb_file_path,
    clicked_symlink_path : clicked_symlink_path,
    clicked_path : clicked_file_path,
    report_symlink_path : report_symlink_path,
    report_file_path : report_file_path,
    thumb_symlink_header : thumb_symlink_filename_header,
    clicked_symlink_header : thumb_symlink_filename_header,
    img_ext : image_file_ext,
    SetBaseDirectory : SetBaseDirectory,
    CreateDir : CheckCreateDirectory,
    SetThumbNail : SetThumbnailImageFileFromData,
    SetClickImage : SetClickedImageFileFromData,
    SetReportImage : SetReportImageFileFromData,
    
}