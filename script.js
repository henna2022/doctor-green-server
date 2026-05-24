/* ═══════════════════════════════════════
   DATA
═══════════════════════════════════════ */
var REMEDY={
  '탄저병':[{t:'1. 병든 식물 제거',b:'탄저병이 발생한 식물의 병든 부분을 신속히 제거하여 병의 확산을 방지합니다.'},{t:'2. 적절한 농약 사용',b:'보르도액, 디티오카바메이트계 살균제가 효과적입니다. 병 발생 전에 예방적으로 처리하는 것도 중요합니다.'},{t:'3. 재배 환경 관리',b:'통풍이 잘되도록 하고 과도한 습기를 피하도록 재배 환경을 관리합니다.'}],
  '잎마름병':[{t:'1. 이환 잎 즉시 제거',b:'증상이 보이는 잎은 즉시 제거하여 전파를 막습니다. 제거한 잎은 소각 처리합니다.'},{t:'2. 살균제 방제',b:'만코제브 계열의 살균제가 효과적입니다. 7일 간격으로 2~3회 살포합니다.'}],
  '복숭아심식나방':[{t:'1. 피해과 수거',b:'낙과된 피해 과실을 즉시 수거하여 처리합니다. 땅에 방치하면 다음 해 성충이 됩니다.'},{t:'2. 페로몬 트랩 설치',b:'복숭아심식나방 전용 페로몬 트랩을 과원 주위에 설치하여 성충을 포획합니다.'}],
  '갈색날개매미충':[{t:'1. 알집 제거',b:'겨울~이른 봄에 가지에 산란된 알집을 직접 채취하여 소각합니다.'},{t:'2. 약제 방제',b:'5월 중순~6월 초에 집중적으로 약제를 살포합니다.'}]
};
var DD={
  disease:[
    {name:'탄저병',desc:'고추·복숭아 등에 발생. 갈색 반점, 병반 확산, 열매 부패.',tags:['갈색반점','병반','부패']},
    {name:'잎마름병',desc:'잎 황화, 조기낙엽, 고사 증상.',tags:['잎 황화','조기낙엽','말라죽음']},
    {name:'흰가루병',desc:'잎 표면에 흰색 분말 형태 균총 형성.',tags:['흰색분말','균총','잎변형']},
    {name:'역병',desc:'줄기 기부 갈변, 급성 위조, 과실 부패.',tags:['줄기갈변','급성위조','과실부패']}
  ],
  pest:[
    {name:'복숭아심식나방',desc:'유충이 과실 내부로 침입하여 낙과 유발.',tags:['과실낙과','애벌레','피해흔']},
    {name:'갈색날개매미충',desc:'수액 흡즙으로 가지 고사, 그을음병 유발.',tags:['수액흡즙','가지고사','알집']},
    {name:'진딧물',desc:'즙액 흡즙, 바이러스 매개. 어린 순·잎 뒷면 집단 서식.',tags:['즙액흡즙','바이러스','집단서식']},
    {name:'응애',desc:'잎 뒷면 흡즙으로 황백화. 건조 고온 여름에 급증.',tags:['황백화','잎뒷면','건조기']}
  ]
};

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
var isDark=false, camStream=null, chartMode='temp', liveInterval=null, curDT='disease';
// 현재 위치 캐시 (작물 변경 시 알림 재계산용)
var currentLocation=null; // {lat, lon, city}
var alertRefreshTimer=null;
var sensorData=(function(){var d=[];var now=Date.now();for(var i=49;i>=0;i--){d.push({time:new Date(now-i*2000),temp:+(26+Math.random()*3).toFixed(1),hum:49+Math.round(Math.random()*2),lux:Math.random()>.4?50:Math.round(Math.random()*10)});}return d;})();

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  var el=document.getElementById('s-'+id);
  if(el) el.classList.add('active');
}

/* ═══════════════════════════════════════
   API 설정 — 한국 공공 데이터 API 통합
   ─────────────────────────────────────
   ① 기상청 단기예보 (apis.data.go.kr/1360000)
   ② 농촌진흥청 NCPMS 병해충 예찰정보 (ncpms.rda.go.kr)
   ③ 팜맵기반 병해충 발생 (apis.data.go.kr/1390802)
   ④ Open-Meteo (폴백, 키 불필요)
═══════════════════════════════════════ */
var API_CONFIG = {
  PROXY_BASE: 'https://doctor-green-server.vercel.app/api',
  KMA_KEY:     'kUANNT3g+CJFAWSYRbk4I7jHAsUbOCiEPs+WdCmP8W+hP+vzeoApnfklBkp4LgJTFyFaP9tpVhtN6aaTtYL58g==',
  NCPMS_KEY:   '20261d909608d30f1d1a8ba465793731eddd',
  FARMMAP_KEY: 'kUANNT3g+CJFAWSYRbk4I7jHAsUbOCiEPs+WdCmP8W+hP+vzeoApnfklBkp4LgJTFyFaP9tpVhtN6aaTtYL58g==',
  REFRESH_MIN: 30
};

var WMO_KO={0:'맑음',1:'대체로 맑음',2:'부분적 흐림',3:'흐림',45:'안개',48:'서리 안개',51:'이슬비',53:'이슬비',55:'이슬비',61:'비',63:'비',65:'강한 비',71:'눈',73:'눈',75:'강한 눈',80:'소나기',81:'소나기',82:'강한 소나기',95:'천둥번개',96:'우박 동반 천둥',99:'우박 동반 천둥'};
var WMO_EMOJI={0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌦',61:'🌧',63:'🌧',65:'🌧',71:'❄️',73:'❄️',75:'❄️',80:'🌦',81:'🌦',82:'⛈',95:'⛈',96:'⛈',99:'⛈'};
// 기상청 하늘상태 (SKY) + 강수형태 (PTY) → 이모지
var KMA_SKY={1:'☀️',3:'⛅',4:'☁️'};
var KMA_PTY={0:null,1:'🌧',2:'🌧',3:'❄️',5:'🌦',6:'🌦',7:'❄️'};
var KMA_PTY_KO={0:'',1:'비',2:'비/눈',3:'눈',5:'빗방울',6:'빗방울/눈날림',7:'눈날림'};

function setLocDisplay(name, weatherStr){
  document.getElementById('loc-name').textContent=name;
  document.getElementById('loc-weather').textContent=weatherStr;
  var n2=document.getElementById('loc-name2');
  var w2=document.getElementById('loc-weather2');
  if(n2) n2.textContent=name;
  if(w2) w2.textContent=weatherStr;
  closeModal('loc-modal');
}

/* ─── 위경도 → 기상청 격자(nx,ny) 변환
   Lambert Conformal Conic 투영 (기상청 공식 알고리즘) */
function latLonToKmaGrid(lat, lon){
  var RE=6371.00877, GRID=5.0, SLAT1=30.0, SLAT2=60.0;
  var OLON=126.0, OLAT=38.0, XO=43, YO=136;
  var DEGRAD=Math.PI/180.0;
  var re=RE/GRID;
  var slat1=SLAT1*DEGRAD, slat2=SLAT2*DEGRAD;
  var olon=OLON*DEGRAD, olat=OLAT*DEGRAD;
  var sn=Math.tan(Math.PI*0.25+slat2*0.5)/Math.tan(Math.PI*0.25+slat1*0.5);
  sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);
  var sf=Math.tan(Math.PI*0.25+slat1*0.5);
  sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;
  var ro=Math.tan(Math.PI*0.25+olat*0.5);
  ro=re*sf/Math.pow(ro,sn);
  var ra=Math.tan(Math.PI*0.25+lat*DEGRAD*0.5);
  ra=re*sf/Math.pow(ra,sn);
  var theta=lon*DEGRAD-olon;
  if(theta>Math.PI)theta-=2.0*Math.PI;
  if(theta<-Math.PI)theta+=2.0*Math.PI;
  theta*=sn;
  var nx=Math.floor(ra*Math.sin(theta)+XO+0.5);
  var ny=Math.floor(ro-ra*Math.cos(theta)+YO+0.5);
  return {nx:nx, ny:ny};
}

/* ─── 기상청 단기예보 base_date/base_time 계산
   발표시각: 02,05,08,11,14,17,20,23시 (10분 후부터 조회 가능) */
function getKmaBaseTime(){
  var now=new Date();
  // 안전하게 10분 여유 (API가 약 10분 뒤부터 제공)
  now=new Date(now.getTime()-10*60*1000);
  var BASE_HOURS=[2,5,8,11,14,17,20,23];
  var h=now.getHours();
  var baseHour=BASE_HOURS[0];
  for(var i=BASE_HOURS.length-1;i>=0;i--){
    if(h>=BASE_HOURS[i]){baseHour=BASE_HOURS[i];break;}
  }
  // 02시 이전이면 전날 23시 발표 사용
  var d=new Date(now);
  if(h<2){d.setDate(d.getDate()-1);baseHour=23;}
  var yyyy=d.getFullYear();
  var mm=String(d.getMonth()+1).padStart(2,'0');
  var dd=String(d.getDate()).padStart(2,'0');
  var hh=String(baseHour).padStart(2,'0');
  return {base_date:yyyy+mm+dd, base_time:hh+'00'};
}

/* ─── 위경도 → 행정동(시/군/구) 역지오코딩
   1순위: 백엔드 프록시 (행정안전부 도로명주소 API 권장)
   2순위: Nominatim (무료, CORS OK, 한국 정확도는 보통)  */
async function reverseGeocode(lat, lon){
  // 백엔드 프록시 우선
  if(API_CONFIG.PROXY_BASE){
    try{
      var r=await fetch(API_CONFIG.PROXY_BASE+'/geocode?lat='+lat+'&lon='+lon);
      if(r.ok){
        var d=await r.json();
        if(d && d.name) return d.name;
      }
    }catch(e){/* fall through */}
  }
  // 폴백: Nominatim
  try{
    var url='https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json&accept-language=ko';
    var r2=await fetch(url,{headers:{'Accept-Language':'ko'}});
    var d2=await r2.json();
    var a=d2.address||{};
    return a.city||a.town||a.county||a.municipality||a.state||'현재 위치';
  }catch(e){
    return '현재 위치';
  }
}

/* ─── ① 기상청 단기예보 호출
   백엔드 프록시: GET {PROXY}/kma?lat=&lon=
   직접호출: apis.data.go.kr/.../getVilageFcst (CORS 불가, http만 지원) */
async function fetchKmaForecast(lat, lon){
  if(API_CONFIG.PROXY_BASE){
    try{
      var r=await fetch(API_CONFIG.PROXY_BASE+'/kma?lat='+lat+'&lon='+lon);
      if(r.ok) return await r.json();
    }catch(e){}
    return null;
  }
  // 직접호출 (개발/테스트용 — 실제로는 CORS·HTTPS 이슈로 작동 안 할 가능성 높음)
  if(!API_CONFIG.KMA_KEY) return null;
  try{
    var g=latLonToKmaGrid(lat,lon);
    var t=getKmaBaseTime();
    var url='https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
      +'?serviceKey='+encodeURIComponent(API_CONFIG.KMA_KEY)
      +'&pageNo=1&numOfRows=300&dataType=JSON'
      +'&base_date='+t.base_date+'&base_time='+t.base_time
      +'&nx='+g.nx+'&ny='+g.ny;
    var r=await fetch(url);
    var d=await r.json();
    return parseKmaResponse(d);
  }catch(e){
    return null;
  }
}

/* 기상청 응답 → 정규화된 날씨 객체로 변환
   카테고리: TMP(기온), TMN/TMX(최저/최고), REH(습도), POP(강수확률),
            PCP(1시간강수량), WSD(풍속), SKY(하늘), PTY(강수형태) */
function parseKmaResponse(raw){
  if(!raw||!raw.response||raw.response.header.resultCode!=='00')return null;
  var items=(raw.response.body && raw.response.body.items && raw.response.body.items.item)||[];
  if(!items.length)return null;
  // 가장 가까운 미래 fcstTime의 현재 시각 카테고리들 수집
  var nowKey=null, today=null;
  var todayCats={}, dailyMax=-999, dailyMin=999, rainSum=0, maxWind=0, maxPop=0;
  items.forEach(function(it){
    var fd=it.fcstDate, ft=it.fcstTime, cat=it.category, val=it.fcstValue;
    if(!today)today=fd;
    if(fd!==today)return;
    if(cat==='TMP'){
      var t=parseFloat(val);
      if(!nowKey){nowKey=ft;todayCats.TMP=t;}
      if(t>dailyMax)dailyMax=t;
      if(t<dailyMin)dailyMin=t;
    } else if(cat==='TMX'){var v=parseFloat(val);if(v>dailyMax)dailyMax=v;}
    else if(cat==='TMN'){var v2=parseFloat(val);if(v2<dailyMin)dailyMin=v2;}
    else if(cat==='REH' && !todayCats.REH){todayCats.REH=parseFloat(val);}
    else if(cat==='SKY' && !todayCats.SKY){todayCats.SKY=parseInt(val);}
    else if(cat==='PTY' && !todayCats.PTY){todayCats.PTY=parseInt(val);}
    else if(cat==='WSD'){var w=parseFloat(val);if(w>maxWind)maxWind=w;if(!todayCats.WSD)todayCats.WSD=w;}
    else if(cat==='POP'){var p=parseFloat(val);if(p>maxPop)maxPop=p;}
    else if(cat==='PCP'){
      // "1.0mm","강수없음","30~50mm" 등 다양한 포맷
      var s=String(val);
      if(s==='강수없음'||s==='-'||s==='0'||s==='0.0')return;
      var n=parseFloat(s.replace(/[^\d.]/g,''));
      if(!isNaN(n))rainSum+=n;
    }
  });
  return {
    source:'KMA',
    temp:todayCats.TMP, hum:todayCats.REH,
    sky:todayCats.SKY, pty:todayCats.PTY,
    wind:todayCats.WSD||0,
    tmax:dailyMax>-999?dailyMax:null,
    tmin:dailyMin<999?dailyMin:null,
    rain:rainSum, pop:maxPop
  };
}

/* ─── ② NCPMS 병해충 예찰정보 호출
   백엔드 프록시: GET {PROXY}/ncpms?crop=&disease=
   실서비스에선 사용자가 등록한 작물 목록을 넘기는 게 정석 */
async function fetchNcpmsAlerts(userCropNames){
  if(API_CONFIG.PROXY_BASE){
    try{
      var q=encodeURIComponent((userCropNames||[]).join(','));
      var r=await fetch(API_CONFIG.PROXY_BASE+'/ncpms?crops='+q);
      if(r.ok) return await r.json(); // [{crop, name, level, period}, ...]
    }catch(e){}
  }
  return null;
}

/* ─── ③ 팜맵기반 병해충 발생 조회
   백엔드 프록시: GET {PROXY}/farmmap?lat=&lon=&radius=
   응답: 주변 농가 발생 현황 [{crop, disease, distance_km, severity}] */
async function fetchFarmmapNearby(lat, lon){
  if(API_CONFIG.PROXY_BASE){
    try{
      var r=await fetch(API_CONFIG.PROXY_BASE+'/farmmap?lat='+lat+'&lon='+lon+'&radius=10');
      if(r.ok) return await r.json();
    }catch(e){}
  }
  return null;
}

/* ─── 통합 fetcher: 위치 받으면 세 API 병렬 호출 + 폴백 */
async function fetchAllFarmData(lat, lon, cityName){
  // 위치 캐시 (작물 추가/삭제 시 재호출용)
  currentLocation={lat:lat, lon:lon, city:cityName};

  // 1) 날씨: 기상청 우선, 실패시 Open-Meteo
  var weather=await fetchKmaForecast(lat, lon);
  if(!weather){
    try{
      var url='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon
        +'&current=temperature_2m,relative_humidity_2m,weathercode,wind_speed_10m'
        +'&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode'
        +'&timezone=auto&forecast_days=2';
      var r=await fetch(url);
      var d=await r.json();
      weather={
        source:'OPENMETEO',
        temp:d.current.temperature_2m, hum:d.current.relative_humidity_2m,
        wind:d.current.wind_speed_10m, wcode:d.current.weathercode,
        tmax:d.daily?d.daily.temperature_2m_max[0]:null,
        tmin:d.daily?d.daily.temperature_2m_min[0]:null,
        rain:d.daily?d.daily.precipitation_sum[0]:0
      };
    }catch(e){weather=null;}
  }

  // 2) 날씨 표시 업데이트
  if(weather){
    var emoji, temp=weather.temp;
    if(weather.source==='KMA'){
      emoji=KMA_PTY[weather.pty]||KMA_SKY[weather.sky]||'🌡';
    } else {
      emoji=WMO_EMOJI[weather.wcode]||'🌡';
    }
    setLocDisplay(cityName, emoji+' '+(temp!=null?Math.round(temp)+'°C':'--°C'));
  } else {
    setLocDisplay(cityName,'--°C');
  }

  // 3) 병해충 데이터 병렬 호출 (백엔드 프록시 있을 때만 실제 호출)
  var cropNames=(typeof userCrops!=='undefined'?userCrops:[]).map(function(c){return c.name;});
  var [ncpms, farmmap] = await Promise.all([
    fetchNcpmsAlerts(cropNames),
    fetchFarmmapNearby(lat, lon)
  ]);

  // 4) 알림 생성
  generateAlerts({weather:weather, ncpms:ncpms, farmmap:farmmap, cityName:cityName});
}

// 기존 fetchWeather 호환 래퍼 (다른 곳에서 호출하는 코드 깨지지 않게)
async function fetchWeather(lat, lon, cityName){
  return fetchAllFarmData(lat, lon, cityName);
}

function requestGPS(){
  var btn=document.getElementById('gps-btn');
  btn.innerHTML='<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,.6);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;"></div> 위치 가져오는 중...';
  btn.disabled=true;

  if(!navigator.geolocation){
    btn.innerHTML='<i class="ti ti-current-location"></i> 현재 위치 자동 감지';
    btn.disabled=false;
    setLocDisplay('위치 불가','--°C');
    return;
  }
  // HTTPS 체크 (iOS Safari 필수)
  var isSecure=window.isSecureContext || location.hostname==='localhost' || location.hostname==='127.0.0.1';
  if(!isSecure){
    btn.innerHTML='<i class="ti ti-current-location"></i> 현재 위치 자동 감지';
    btn.disabled=false;
    setLocDisplay('HTTPS 필요','--°C');
    // 모달 안에 안내 메시지
    var msg=document.getElementById('gps-error-msg');
    if(!msg){
      msg=document.createElement('div');
      msg.id='gps-error-msg';
      msg.style.cssText='margin-top:8px;padding:10px;border-radius:10px;background:rgba(240,128,128,.12);color:#E05050;font-size:12px;line-height:1.6;text-align:center;';
      btn.parentNode.insertBefore(msg, btn.nextSibling);
    }
    msg.innerHTML='⚠️ HTTPS 환경에서만 위치를 자동으로 받을 수 있어요.<br>아래 도시 중에서 선택해 주세요.';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async function(pos){
      var lat=pos.coords.latitude, lon=pos.coords.longitude;
      var city=await reverseGeocode(lat,lon);
      await fetchWeather(lat, lon, city);
      btn.innerHTML='<i class="ti ti-current-location"></i> 현재 위치 자동 감지';
      btn.disabled=false;
      var msg=document.getElementById('gps-error-msg');if(msg)msg.remove();
    },
    function(err){
      btn.innerHTML='<i class="ti ti-current-location"></i> 현재 위치 자동 감지';
      btn.disabled=false;
      var msg=document.getElementById('gps-error-msg');
      if(!msg){
        msg=document.createElement('div');
        msg.id='gps-error-msg';
        msg.style.cssText='margin-top:8px;padding:10px;border-radius:10px;background:rgba(240,128,128,.12);color:#E05050;font-size:12px;line-height:1.6;text-align:center;';
        btn.parentNode.insertBefore(msg, btn.nextSibling);
      }
      if(err && err.code===1){
        msg.innerHTML='⚠️ 위치 권한이 거부되었어요.<br>설정 → Safari → 위치에서 허용해 주세요.';
      } else {
        msg.innerHTML='⚠️ 위치를 가져오지 못했어요. 아래 도시 중에서 선택해 주세요.';
      }
    },
    {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
  );
}

function setManualLoc(name, lat, lon){
  setLocDisplay(name,'날씨 로딩 중...');
  fetchWeather(lat, lon, name);
}

/* ═══════════════════════════════════════
   CAMERA
═══════════════════════════════════════ */
function requestCam(){
  var perm=document.getElementById('cam-perm');
  var loading=document.getElementById('cam-loading');
  var live=document.getElementById('cam-live');
  var closeBtn=document.getElementById('cam-close');
  var hint=document.getElementById('cam-hint');
  var ctrl=document.getElementById('cam-ctrl');

  // 로딩 화면 먼저 보여주기
  perm.style.display='none';
  loading.style.display='flex';

  // HTTPS 체크 (iOS Safari 필수)
  var isSecure=window.isSecureContext || location.hostname==='localhost' || location.hostname==='127.0.0.1';
  if(!isSecure){
    var rEl=document.getElementById('cam-fallback-reason');
    if(rEl)rEl.innerHTML='iOS Safari는 카메라 사용 시<br><strong>HTTPS</strong> 환경이 필요합니다.<br>아래에서 사진을 업로드해 보세요.';
    showCamFallback(loading, live, closeBtn, hint, ctrl);
    return;
  }

  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    var rEl2=document.getElementById('cam-fallback-reason');
    if(rEl2)rEl2.innerHTML='이 브라우저는 카메라 API를<br>지원하지 않습니다.<br>아래에서 사진을 업로드해 보세요.';
    showCamFallback(loading, live, closeBtn, hint, ctrl);
    return;
  }

  navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})
    .then(function(stream){
      camStream=stream;
      var video=document.getElementById('cam-video');
      video.srcObject=stream;
      video.style.display='block';
      document.getElementById('cam-fallback').style.display='none';
      showCamLive(loading, live, closeBtn, hint, ctrl);
    })
    .catch(function(err){
      // 권한 거부 또는 카메라 없음 → 폴백 화면
      var rEl3=document.getElementById('cam-fallback-reason');
      if(rEl3){
        if(err && err.name==='NotAllowedError'){
          rEl3.innerHTML='카메라 권한이 거부되었습니다.<br>설정 → Safari → 카메라에서<br>권한을 허용해 주세요.';
        } else if(err && err.name==='NotFoundError'){
          rEl3.innerHTML='카메라 장치를 찾을 수 없습니다.';
        } else {
          rEl3.innerHTML='카메라를 켤 수 없습니다.<br>아래에서 사진을 업로드해 보세요.';
        }
      }
      showCamFallback(loading, live, closeBtn, hint, ctrl);
    });
}

function showCamLive(loading, live, closeBtn, hint, ctrl){
  loading.style.display='none';
  live.style.display='block';
  closeBtn.style.display='flex';
  hint.style.display='block';
  ctrl.style.display='flex';
  document.getElementById('scan-overlay').style.display='block';
}

function showCamFallback(loading, live, closeBtn, hint, ctrl){
  loading.style.display='none';
  live.style.display='block';
  document.getElementById('cam-video').style.display='none';
  document.getElementById('cam-fallback').style.display='flex';
  closeBtn.style.display='flex';
  hint.style.display='block';
  ctrl.style.display='flex';
}

function stopCam(){
  if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}
  var perm=document.getElementById('cam-perm');
  var loading=document.getElementById('cam-loading');
  var live=document.getElementById('cam-live');
  perm.style.display='flex';
  loading.style.display='none';
  live.style.display='none';
  document.getElementById('cam-close').style.display='none';
  document.getElementById('cam-hint').style.display='none';
  document.getElementById('cam-ctrl').style.display='none';
  document.getElementById('scan-overlay').style.display='none';
  go('home');
}

function takePicture(){
  // 셔터 → 분석 시뮬레이션 → 결과
  document.getElementById('scan-overlay').style.display='none';
  go('result');
}

/* ═══════════════════════════════════════
   DIAG TABS / PHOTO
═══════════════════════════════════════ */
function switchDiagTab(t){
  document.getElementById('dp-cam').style.display=t==='cam'?'flex':'none';
  document.getElementById('dp-photo').style.display=t==='photo'?'block':'none';
  document.getElementById('dt-cam').className='dtab'+(t==='cam'?' act':'');
  document.getElementById('dt-photo').className='dtab'+(t==='photo'?' act':'');
}
function triggerFileInput(){document.getElementById('file-input').click();}
function handleFile(e){
  var f=e.target.files[0];if(!f)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    document.getElementById('preview-img').src=ev.target.result;
    document.getElementById('photo-preview').style.display='block';
    document.getElementById('upload-box').style.display='none';
    document.getElementById('analyze-spinner').style.display='flex';
    document.getElementById('analyze-done').style.display='none';
    document.getElementById('photo-result').style.display='none';
    setTimeout(function(){
      document.getElementById('analyze-spinner').style.display='none';
      document.getElementById('analyze-done').style.display='flex';
      document.getElementById('photo-result').style.display='block';
    },2200);
  };
  reader.readAsDataURL(f);
}
function resetPhoto(){
  document.getElementById('photo-preview').style.display='none';
  document.getElementById('upload-box').style.display='block';
  document.getElementById('file-input').value='';
}

/* ═══════════════════════════════════════
   MODAL
═══════════════════════════════════════ */
function openLocModal(){document.getElementById('loc-modal').style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}
function openSettings(){document.getElementById('settings-modal').style.display='flex';}

/* ═══════════════════════════════════════
   DARK MODE
═══════════════════════════════════════ */
function applyDark(on){
  isDark=on;
  var v=on?'1':'0';
  document.getElementById('phone').setAttribute('data-dark',v);
  document.querySelectorAll('.screen,.msheet').forEach(el=>el.setAttribute('data-dark',v));
}
function togSetting(key){
  var el=document.getElementById('tog-'+key);
  el.classList.toggle('on');
  if(key==='dark') applyDark(el.classList.contains('on'));
}

/* ═══════════════════════════════════════
   HEART
═══════════════════════════════════════ */
function toggleHeart(e,btn){
  e.stopPropagation();
  var on=btn.classList.contains('on');
  btn.classList.remove('pop');
  void btn.offsetWidth;
  if(on){btn.classList.remove('on');btn.innerHTML='<i class="ti ti-heart"></i>';}
  else{btn.classList.add('on','pop');btn.innerHTML='<i class="ti ti-heart-filled"></i>';}
}
function filterCrops(){
  var q=document.getElementById('crop-srch').value.toLowerCase();
  var cards=document.querySelectorAll('#crop-grid .cc:not(.cc-add)');
  var any=false;
  cards.forEach(c=>{
    var name=(c.dataset.name||'').toLowerCase();
    var show=!q||name.includes(q);
    c.style.display=show?'':'none';
    if(show)any=true;
  });
  // 검색 결과 없음 표시
  document.getElementById('crop-none').style.display=(!any && q)?'block':'none';
  // 추가 버튼은 검색어 있을 때 숨김 (검색하다 누르면 혼란스러움)
  var addBtn=document.getElementById('cc-add-btn');
  if(addBtn)addBtn.style.display=q?'none':'';
  // 빈 상태 안내문구는 검색중일 땐 숨김
  var empty=document.getElementById('crop-empty');
  if(empty)empty.style.display=(!q && userCrops.length===0)?'block':'none';
}

/* ═══════════════════════════════════════
   REMEDY / DODAM
═══════════════════════════════════════ */
function openRemedy(name,tags){
  document.getElementById('remedy-name').textContent=name;
  document.getElementById('remedy-tags').innerHTML=tags.map(t=>'<span class="rtag">'+t+'</span>').join('');
  var steps=REMEDY[name]||[];
  document.getElementById('remedy-body').innerHTML=steps.map(s=>'<div style="font-size:15px;font-weight:700;margin:0 0 6px;color:var(--txt);">'+s.t+'</div><div style="font-size:13px;color:var(--txt2);line-height:1.65;margin-bottom:16px;">'+s.b+'</div>').join('');
  go('remedy');
}
function goDodamSearch(type){
  curDT=type;
  document.getElementById('dodam-title').textContent=type==='disease'?'질병 도감':'해충 도감';
  document.getElementById('dodam-srch').value='';
  renderDodam('');
  go('dodam');
}
function searchDodam(){renderDodam(document.getElementById('dodam-srch').value);}
function hl(t,q){if(!q)return t;return t.replace(new RegExp('('+q+')','gi'),'<span class="hi">$1</span>');}
function renderDodam(q){
  var data=DD[curDT];
  var r=q?data.filter(d=>d.name.includes(q)||d.desc.includes(q)||d.tags.some(t=>t.includes(q))):data;
  var el=document.getElementById('dodam-res');
  if(!r.length){el.innerHTML='<div style="text-align:center;padding:32px 0;color:var(--txt3);font-size:14px;">검색 결과 없음</div>';return;}
  el.innerHTML=r.map(d=>'<div class="srch-item" onclick="openDodamDetail(\''+d.name+'\')"><div style="font-size:14px;font-weight:600;margin-bottom:3px;color:var(--txt);">'+hl(d.name,q)+'</div><div style="font-size:12px;color:var(--txt2);margin-bottom:5px;">'+hl(d.desc,q)+'</div><div style="display:flex;gap:5px;flex-wrap:wrap;">'+d.tags.map(t=>'<span style="background:var(--g5);border:1px solid var(--g3);color:var(--g1);border-radius:10px;padding:2px 8px;font-size:10px;">'+hl(t,q)+'</span>').join('')+'</div></div>').join('');
}
function openDodamDetail(name){
  if(REMEDY[name]){var d=DD.disease.concat(DD.pest).find(x=>x.name===name);openRemedy(name,d?d.tags:[]);}
}

/* ═══════════════════════════════════════
   SMARTFARM / SENSOR
═══════════════════════════════════════ */
function tryConnect(btn){
  btn.textContent='연결 중...';btn.disabled=true;
  fetch('http://localhost:8080/api/sensors',{signal:AbortSignal.timeout(2000)})
    .then(r=>r.json())
    .then(d=>{document.getElementById('srv-dot').className='odot';document.getElementById('srv-txt').textContent='서버 연결됨 ✓';btn.textContent='연결됨';updateSensorUI(d.sensors);})
    .catch(()=>startDemo(btn));
}
function startDemo(btn){
  if(btn){btn.textContent='데모';btn.disabled=false;}
  document.getElementById('srv-dot').className='odot';
  document.getElementById('srv-txt').textContent='데모 모드 (서버 미연결)';
  document.getElementById('p1-badge').textContent='● 데모';
  document.getElementById('p1-badge').style.background='#F59E0B';
  updateSensorUI(sensorData[sensorData.length-1]);
  updateMini();drawCharts();
  if(liveInterval)clearInterval(liveInterval);
  liveInterval=setInterval(()=>{
    var last=sensorData[sensorData.length-1];
    var r={time:new Date(),temp:+(last.temp+(Math.random()-.5)*.4).toFixed(1),hum:Math.max(40,Math.min(70,last.hum+(Math.random()>.5?1:-1))),lux:Math.random()>.4?50:Math.round(Math.random()*10)};
    sensorData.push(r);if(sensorData.length>50)sensorData.shift();
    updateSensorUI(r);updateMini();drawCharts();
  },2000);
}
function updateSensorUI(d){
  if(!d)return;
  document.getElementById('p1-temp').textContent=d.temp!=null?d.temp.toFixed?d.temp.toFixed(1):d.temp:'--';
  document.getElementById('p1-hum').textContent=d.hum!=null?d.hum:'--';
  document.getElementById('p1-lux').textContent=d.lux!=null?d.lux:'--';
  document.getElementById('p1-update').textContent='마지막 업데이트: '+new Date(d.time||Date.now()).toLocaleTimeString();
  var st='✅ 정상 — ';
  if(d.temp>30) st='⚠️ 온도 높음 ('+d.temp+'°C) — 환기 권장. ';
  else if(d.temp<15) st='⚠️ 온도 낮음 — 보온 필요. ';
  st+=d.hum>70?'습도 과다, 병해 위험.':d.hum<30?'습도 부족.':'습도 양호.';
  document.getElementById('p1-ai').textContent=st;
  renderHistTable();
}
function updateMini(){
  var last=sensorData[sensorData.length-1];if(!last)return;
  document.getElementById('p1-tmini').textContent=last.temp+'°C';
  document.getElementById('p1-hmini').textContent=last.hum+'%';
  document.getElementById('p1-lmini').textContent=last.lux+'%';
}
function drawCharts(){drawMini();drawHist();renderHistTable();}

function drawMini(){
  var c=document.getElementById('mini-chart');if(!c)return;
  var ctx=c.getContext('2d'),dpr=window.devicePixelRatio||1;
  c.width=c.offsetWidth*dpr;c.height=70*dpr;ctx.scale(dpr,dpr);
  var W=c.offsetWidth||300,H=70;ctx.clearRect(0,0,W,H);
  var vals=sensorData.slice(-20).map(d=>d.temp);if(!vals.length)return;
  var mn=Math.min(...vals)-.5,mx=Math.max(...vals)+.5,xS=W/(vals.length-1);
  ctx.strokeStyle=isDark?'#2D3748':'#e5e7eb';ctx.lineWidth=1;
  for(var i=0;i<=3;i++){var y=H-H*(i/3);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(0,H-(vals[0]-mn)/(mx-mn)*H);
  for(var i=1;i<vals.length;i++)ctx.lineTo(i*xS,H-(vals[i]-mn)/(mx-mn)*H);
  ctx.lineTo((vals.length-1)*xS,H);ctx.lineTo(0,H);ctx.closePath();
  ctx.fillStyle='rgba(78,202,160,.15)';ctx.fill();
  ctx.beginPath();ctx.moveTo(0,H-(vals[0]-mn)/(mx-mn)*H);
  for(var i=1;i<vals.length;i++)ctx.lineTo(i*xS,H-(vals[i]-mn)/(mx-mn)*H);
  ctx.strokeStyle='#4ECAA0';ctx.lineWidth=2;ctx.stroke();
}
function setCM(m){
  chartMode=m;
  ['temp','hum','lux'].forEach(k=>{var b=document.getElementById('btn-'+k);b.style.background=k===m?'var(--g1)':'var(--bg-card)';b.style.color=k===m?'#fff':'var(--txt2)';b.style.borderColor=k===m?'var(--g2)':'var(--brd)';});
  document.getElementById('hist-title').textContent={temp:'온도 이력 (°C)',hum:'습도 이력 (%)',lux:'조도 이력 (%)'}[m];
  drawHist();
}
function drawHist(){
  var c=document.getElementById('hist-chart');if(!c)return;
  var ctx=c.getContext('2d'),dpr=window.devicePixelRatio||1;
  c.width=c.offsetWidth*dpr;c.height=120*dpr;ctx.scale(dpr,dpr);
  var W=c.offsetWidth||300,H=120;ctx.clearRect(0,0,W,H);
  var vals=sensorData.map(d=>d[chartMode]);
  var valid=vals.filter(v=>v!=null);if(!valid.length)return;
  var mn=Math.min(...valid)-1,mx=Math.max(...valid)+1,xS=W/(vals.length-1);
  ctx.strokeStyle=isDark?'#2D3748':'#e5e7eb';ctx.lineWidth=1;
  for(var i=0;i<=4;i++){var y=H-H*(i/4);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();ctx.fillStyle=isDark?'#627084':'#999';ctx.font='10px sans-serif';ctx.fillText(Math.round(mn+(mx-mn)*(i/4)),4,y-2);}
  ctx.beginPath();var started=false;
  for(var i=0;i<vals.length;i++){if(vals[i]==null)continue;var x=i*xS,y=H-(vals[i]-mn)/(mx-mn)*H;if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}
  ctx.strokeStyle='#4ECAA0';ctx.lineWidth=2;ctx.stroke();
}
function renderHistTable(){
  var el=document.getElementById('hist-table');if(!el)return;
  var rows=sensorData.slice().reverse().slice(0,50);
  document.getElementById('hist-count').textContent=rows.length+' 건';
  el.innerHTML=rows.map(d=>{
    var t=new Date(d.time);
    var ts=t.getFullYear()+'-'+(t.getMonth()+1).toString().padStart(2,'0')+'-'+t.getDate().toString().padStart(2,'0')+' '+t.toLocaleTimeString();
    return '<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;padding:8px 0;border-bottom:1px solid var(--brd);font-size:11px;align-items:center;">'
      +'<div style="color:var(--txt2);">'+ts+'</div>'
      +'<div style="text-align:center;"><span style="background:rgba(240,128,128,.15);color:#E05050;border-radius:6px;padding:2px 6px;">'+d.temp+'°C</span></div>'
      +'<div style="text-align:center;"><span style="background:rgba(78,168,222,.15);color:#4EA8DE;border-radius:6px;padding:2px 6px;">'+d.hum+'%</span></div>'
      +'<div style="text-align:center;"><span style="background:rgba(245,158,11,.15);color:#F59E0B;border-radius:6px;padding:2px 6px;">'+d.lux+'%</span></div>'
      +'</div>';
  }).join('');
}
function switchTab(t){
  document.getElementById('pane-live').style.display=t==='live'?'block':'none';
  document.getElementById('pane-hist').style.display=t==='hist'?'flex':'none';
  document.getElementById('tab-live').style.color=t==='live'?'var(--g1)':'var(--txt2)';
  document.getElementById('tab-live').style.borderBottomColor=t==='live'?'var(--g1)':'transparent';
  document.getElementById('tab-hist').style.color=t==='hist'?'var(--g1)':'var(--txt2)';
  document.getElementById('tab-hist').style.borderBottomColor=t==='hist'?'var(--g1)':'transparent';
  if(t==='hist') setTimeout(()=>{drawHist();renderHistTable();},50);
}

/* ═══════════════════════════════════════
   CROPS — 작물 관리 (사용자 추가)
═══════════════════════════════════════ */
var userCrops=[]; // {name, emoji, bg, fav}
var pickedCrop=null; // 모달에서 선택된 작물

function openAddCropModal(){
  pickedCrop=null;
  document.querySelectorAll('.crop-pick').forEach(el=>{el.style.outline='';el.style.transform='';});
  var inp=document.getElementById('custom-crop-input');if(inp)inp.value='';
  document.getElementById('add-crop-modal').style.display='flex';
}
function pickCrop(el){
  pickedCrop={name:el.dataset.name, emoji:el.dataset.emoji, bg:el.dataset.bg};
  document.querySelectorAll('.crop-pick').forEach(e=>{e.style.outline='';e.style.transform='';});
  el.style.outline='3px solid var(--g1)';
  el.style.transform='scale(0.95)';
  // 직접입력 입력값 클리어
  var inp=document.getElementById('custom-crop-input');if(inp)inp.value='';
}
function confirmAddCrop(){
  var custom=document.getElementById('custom-crop-input').value.trim();
  var crop;
  if(custom){
    // 직접입력 우선
    crop={name:custom, emoji:'🌱', bg:'linear-gradient(135deg,#1B5E4B,#4ECAA0)', fav:false};
  } else if(pickedCrop){
    crop={name:pickedCrop.name, emoji:pickedCrop.emoji, bg:pickedCrop.bg, fav:false};
  } else {
    alert('작물을 선택하거나 이름을 입력해 주세요.');
    return;
  }
  // 중복 체크
  if(userCrops.some(c=>c.name===crop.name)){
    alert('이미 추가된 작물입니다.');
    return;
  }
  userCrops.push(crop);
  renderCrops();
  closeModal('add-crop-modal');
  // 내 작물이 바뀌면 NCPMS 예찰정보도 새로 가져와야 함
  refreshAlerts();
}
function removeCrop(name){
  if(!confirm('"'+name+'"을(를) 삭제하시겠어요?'))return;
  userCrops=userCrops.filter(c=>c.name!==name);
  renderCrops();
  refreshAlerts();
}

/* ─── 알림 새로고침 — 현재 위치로 세 API 다시 호출 */
function refreshAlerts(){
  if(currentLocation){
    fetchAllFarmData(currentLocation.lat, currentLocation.lon, currentLocation.city);
  }
}

/* ─── 자동 갱신 시작 (기본 30분 간격) */
function startAlertAutoRefresh(){
  if(alertRefreshTimer)clearInterval(alertRefreshTimer);
  alertRefreshTimer=setInterval(refreshAlerts, API_CONFIG.REFRESH_MIN*60*1000);
}
function renderCrops(){
  var grid=document.getElementById('crop-grid');
  var empty=document.getElementById('crop-empty');
  if(!grid)return;
  // 추가 버튼만 보존하고 나머지 제거
  var addBtn=document.getElementById('cc-add-btn');
  grid.innerHTML='';
  // 사용자 작물 카드 먼저
  userCrops.forEach(c=>{
    var heartIcon=c.fav?'<i class="ti ti-heart-filled"></i>':'<i class="ti ti-heart"></i>';
    var heartCls=c.fav?'heart on':'heart';
    var html='<div class="cc" data-name="'+c.name+'" onclick="go(\'crop-detail\')">'
      +'<div class="cc-img" style="background:'+c.bg+';">'+c.emoji+'</div>'
      +'<div class="cc-foot">'
      +'<span class="cc-name">'+c.name+'</span>'
      +'<button class="'+heartCls+'" onclick="event.stopPropagation();toggleHeart(event,this);toggleUserCropFav(\''+c.name+'\')">'+heartIcon+'</button>'
      +'</div></div>';
    grid.insertAdjacentHTML('beforeend', html);
  });
  // 추가 버튼은 항상 마지막에
  grid.appendChild(addBtn);
  // 빈 상태 안내문구
  if(empty)empty.style.display=userCrops.length===0?'block':'none';
}
function toggleUserCropFav(name){
  var c=userCrops.find(x=>x.name===name);
  if(c)c.fav=!c.fav;
}

/* ═══════════════════════════════════════
   ALERTS — 위치/시간/날씨 기반 동적 알림
═══════════════════════════════════════ */
var alertList=[]; // {kind:'warn'|'safe', badge, sub, title, desc}

// 지역×계절 기반 주변 농가 병해 시뮬레이션
// (실서비스에서는 농촌진흥청 병해충 발생정보 API로 대체)
var NEARBY_DISEASE_MAP={
  // 광역별 대표 작물·시기별 발생 가능 병해
  spring:[
    {crop:'고추', disease:'역병', risk:'high'},
    {crop:'딸기', disease:'잿빛곰팡이병', risk:'high'},
    {crop:'배추', disease:'노균병', risk:'mid'},
  ],
  summer:[
    {crop:'고추', disease:'탄저병', risk:'high'},
    {crop:'토마토', disease:'잎곰팡이병', risk:'high'},
    {crop:'복숭아', disease:'세균성구멍병', risk:'mid'},
    {crop:'사과', disease:'갈색무늬병', risk:'mid'},
    {crop:'벼', disease:'도열병', risk:'high'},
  ],
  fall:[
    {crop:'사과', disease:'탄저병', risk:'high'},
    {crop:'배추', disease:'무름병', risk:'mid'},
    {crop:'벼', disease:'이삭누룩병', risk:'mid'},
  ],
  winter:[
    {crop:'딸기', disease:'흰가루병', risk:'mid'},
    {crop:'시설채소', disease:'잿빛곰팡이병', risk:'high'},
  ]
};

function getSeason(){
  var m=new Date().getMonth()+1;
  if(m>=3&&m<=5)return 'spring';
  if(m>=6&&m<=8)return 'summer';
  if(m>=9&&m<=11)return 'fall';
  return 'winter';
}

function generateAlerts(payload){
  // payload: {weather, ncpms, farmmap, cityName}
  // 하위호환: 옛 호출(weatherData, cityName) → 첫 인자가 객체이고 weather 키 없으면 옛 포맷으로 가정
  if(arguments.length>=2 && typeof arguments[1]==='string'){
    payload={legacyWeather:arguments[0], cityName:arguments[1]};
  }
  payload=payload||{};
  var weather=payload.weather;
  var ncpms=payload.ncpms;        // 농촌진흥청 NCPMS 응답 (배열)
  var farmmap=payload.farmmap;     // 팜맵 주변 발생 (배열)
  var cityName=payload.cityName||'현재 위치';

  alertList=[];
  var now=new Date();
  var hour=now.getHours();
  var season=getSeason();
  var hasRealData=false; // 공공 API 응답을 하나라도 받았는가

  // ① 날씨 기반 경보 (기상청 KMA 응답 우선, Open-Meteo 폴백)
  if(weather){
    hasRealData=true;
    var src=weather.source||'OPENMETEO';
    var srcLabel=src==='KMA'?'기상청':'Open-Meteo';
    var todayMax=weather.tmax, todayMin=weather.tmin;
    var rainSum=weather.rain, hum=weather.hum, wind=weather.wind;
    var pop=weather.pop; // 강수확률 (기상청만)

    // 폭염 (최고 33°C 이상)
    if(todayMax!=null && todayMax>=33){
      alertList.push({kind:'warn', badge:'경보', sub:'폭염 ('+srcLabel+')', title:'야외활동 주의',
        desc:cityName+' 오늘 최고 '+Math.round(todayMax)+'°C가 예상됩니다. 낮시간 야외작업을 피하고 충분히 수분을 섭취하세요.'});
    } else if(todayMax!=null && todayMax>=30){
      alertList.push({kind:'safe', badge:'주의', sub:'더위 ('+srcLabel+')', title:'시설 환기 권장',
        desc:cityName+' 오늘 최고 '+Math.round(todayMax)+'°C. 하우스·시설재배 환기를 권장합니다.'});
    }
    // 한파 / 저온
    if(todayMin!=null && todayMin<=0){
      alertList.push({kind:'warn', badge:'경보', sub:'저온 ('+srcLabel+')', title:'동해 위험',
        desc:cityName+' 오늘 최저 '+Math.round(todayMin)+'°C. 노지작물 동해 위험, 보온덮개를 점검하세요.'});
    }
    // 강수
    if(rainSum!=null && rainSum>=30){
      alertList.push({kind:'warn', badge:'경보', sub:'호우 ('+srcLabel+')', title:'배수로 점검',
        desc:'오늘 강수량 '+Math.round(rainSum)+'mm 예상. 침수·역병 위험 ↑, 배수로 정비 권장.'});
    } else if(rainSum!=null && rainSum>=10){
      alertList.push({kind:'safe', badge:'주의', sub:'비 예보 ('+srcLabel+')', title:'방제 일정 조정',
        desc:'오늘 비 '+Math.round(rainSum)+'mm 예상. 농약 살포 일정을 조정하세요.'});
    } else if(pop!=null && pop>=60){
      // 기상청은 강수확률(POP) 따로 제공
      alertList.push({kind:'safe', badge:'주의', sub:'강수확률 '+Math.round(pop)+'%', title:'방제 일정 조정',
        desc:cityName+' 강수확률 '+Math.round(pop)+'%. 농약 살포 일정을 조정하세요.'});
    }
    // 강풍
    if(wind!=null && wind>=10){
      alertList.push({kind:'warn', badge:'경보', sub:'강풍 ('+srcLabel+')', title:'시설물 점검',
        desc:'풍속 '+wind.toFixed(1)+'m/s. 비닐하우스·지지대 점검 권장.'});
    }
    // 다습 → 곰팡이병 위험
    if(hum!=null && hum>=85){
      alertList.push({kind:'safe', badge:'주의', sub:'다습 ('+Math.round(hum)+'%)', title:'곰팡이병 위험 ↑',
        desc:'현재 습도 '+Math.round(hum)+'%. 통풍을 강화하고 곰팡이성 병해를 주의하세요.'});
    }
  } else if(payload.legacyWeather){
    // 옛 호출 호환 (Open-Meteo raw response)
    var lw=payload.legacyWeather;
    if(lw.current){
      var c=lw.current, daily=lw.daily;
      var todayMax2=daily?daily.temperature_2m_max[0]:null;
      if(todayMax2!=null && todayMax2>=33){
        alertList.push({kind:'warn', badge:'경보', sub:'폭염', title:'야외활동 주의',
          desc:cityName+' 오늘 최고 '+Math.round(todayMax2)+'°C 예상.'});
      }
      hasRealData=true;
    }
  }

  // ② 농촌진흥청 NCPMS — 내 작물 병해충 예찰정보
  if(ncpms && Array.isArray(ncpms) && ncpms.length){
    hasRealData=true;
    ncpms.slice(0,3).forEach(function(item){
      // 예상 응답 포맷: {crop, name(병해충명), level(예보/주의보/경보), period}
      var lv=item.level||'예보';
      var kind=(lv==='경보')?'warn':(lv==='주의보')?'warn':'safe';
      var badge=lv;
      alertList.push({
        kind:kind, badge:badge, sub:'NCPMS · '+item.crop,
        title:item.name,
        desc:'농촌진흥청 '+lv+': '+item.crop+'에 '+item.name+' 발생 예찰 정보 ('+(item.period||'금주')+').'
      });
    });
  }

  // ③ 팜맵 — 주변 농가 병해 발생 현황
  if(farmmap && Array.isArray(farmmap) && farmmap.length){
    hasRealData=true;
    farmmap.slice(0,3).forEach(function(item){
      // 예상 응답 포맷: {crop, disease, distance_km, severity('low'|'mid'|'high'), reportedAt}
      var sev=item.severity||'mid';
      var kind=(sev==='high')?'warn':'safe';
      var badge=(sev==='high')?'경보':(sev==='mid')?'주의':'안내';
      var dist=item.distance_km!=null?(item.distance_km<1?'1km 이내':'반경 '+Math.round(item.distance_km)+'km'):'주변';
      alertList.push({
        kind:kind, badge:badge, sub:'주변 농가 ('+dist+')',
        title:item.crop+' '+item.disease,
        desc:cityName+' '+dist+' 농가에서 '+item.crop+' '+item.disease+' 발생 보고. 예찰을 강화하세요.'
      });
    });
  }

  // ④ 공공 API 응답이 하나도 없을 때 폴백 (계절+위치 시드 기반 시뮬레이션)
  if(!hasRealData || (!ncpms && !farmmap)){
    var candidates=NEARBY_DISEASE_MAP[season]||[];
    var seed=0;
    if(cityName){for(var i=0;i<cityName.length;i++)seed+=cityName.charCodeAt(i);}
    seed+=now.getDate();
    var picks=[];
    for(var k=0;k<Math.min(2,candidates.length);k++){
      var idx=(seed+k*7)%candidates.length;
      if(!picks.includes(candidates[idx]))picks.push(candidates[idx]);
    }
    picks.forEach(function(p){
      var kind=p.risk==='high'?'warn':'safe';
      var badge=p.risk==='high'?'경보':'주의';
      alertList.push({
        kind:kind, badge:badge, sub:'주변 농가 (예시)', title:p.crop+' '+p.disease,
        desc:cityName+' 인근 농가에서 '+p.crop+'에 '+p.disease+' 발생이 보고되었습니다. 예찰을 강화하세요.'
      });
    });
  }

  // ⑤ 시간대별 영농 안내 (알림이 너무 적을 때 보완)
  if(alertList.length<2){
    if(hour>=5 && hour<10){
      alertList.push({kind:'safe', badge:'안내', sub:'이른 아침', title:'관수 적기',
        desc:'기온이 오르기 전 오전 관수를 권장합니다.'});
    } else if(hour>=11 && hour<15){
      alertList.push({kind:'safe', badge:'안내', sub:'한낮', title:'예찰 활동 권장',
        desc:'잎 뒷면·열매 상태를 살펴 병해충 초기 발견에 유리한 시간입니다.'});
    } else if(hour>=17 && hour<20){
      alertList.push({kind:'safe', badge:'안내', sub:'저녁', title:'방제 적기',
        desc:'기온이 내려가는 저녁은 약해를 줄이는 방제 적기입니다.'});
    }
  }

  renderAlerts();
}

function renderAlerts(){
  var statusEl=document.getElementById('alert-status');
  var cardsEl=document.getElementById('alert-cards');
  var listEl=document.getElementById('notify-list');
  var emptyEl=document.getElementById('notify-empty');
  var bellDot=document.getElementById('bell-dot');

  if(!cardsEl)return;

  // 데이터 소스 표시 — 알림 배열에서 사용된 출처 추적
  var sources=new Set();
  alertList.forEach(function(a){
    if(a.sub){
      if(a.sub.indexOf('기상청')>=0)sources.add('기상청');
      else if(a.sub.indexOf('Open-Meteo')>=0)sources.add('Open-Meteo');
      if(a.sub.indexOf('NCPMS')>=0)sources.add('NCPMS');
      if(a.sub.indexOf('주변 농가 (예시)')>=0)sources.add('예시');
      else if(a.sub.indexOf('주변 농가')>=0)sources.add('팜맵');
    }
  });

  // 상태 표시 업데이트
  if(statusEl){
    if(alertList.length===0){
      statusEl.textContent='특이사항 없음';
      statusEl.style.color='var(--g2)';
    } else {
      var srcText=sources.size>0?' · '+Array.from(sources).join('+'):'';
      statusEl.innerHTML='<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#F08080;"></span> '+alertList.length+'건<span style="font-size:10px;color:var(--txt3);margin-left:4px;">'+srcText+'</span>';
      statusEl.style.color='var(--txt2)';
    }
  }

  // 홈 화면 카드 (가로 스크롤)
  if(alertList.length===0){
    cardsEl.innerHTML='<div style="padding:14px 16px;background:var(--bg-card);border:1px dashed var(--brd);border-radius:14px;font-size:12px;color:var(--txt2);width:100%;text-align:center;">현재 위치 주변에 특이사항이 없어요 🌿</div>';
  } else {
    cardsEl.innerHTML=alertList.map(function(a){
      var badgeCls=a.kind==='warn'?'b-red':'b-teal';
      return '<div class="acard" onclick="go(\'notify\')" style="cursor:pointer;">'
        +'<span class="badge '+badgeCls+'">'+a.badge+'</span>'
        +'<div class="acard-sub">'+a.sub+'</div>'
        +'<div class="acard-title">'+a.title+'</div></div>';
    }).join('');
  }

  // 알림 페이지 상세 리스트
  if(listEl){
    if(alertList.length===0){
      if(emptyEl)emptyEl.style.display='flex';
    } else {
      if(emptyEl)emptyEl.style.display='none';
      // 빈 상태 외 항목 제거 후 재생성
      Array.from(listEl.querySelectorAll('.nitem')).forEach(n=>n.remove());
      alertList.forEach(function(a){
        var cls=a.kind==='warn'?'nitem warn':'nitem safe';
        var badgeCls=a.kind==='warn'?'b-red':'b-teal';
        var html='<div class="'+cls+'">'
          +'<div style="flex-shrink:0;padding-top:2px;"><span class="badge '+badgeCls+'">'+a.badge+'</span></div>'
          +'<div><div class="ntitle">'+a.title+'</div><div class="ndesc">'+a.desc+'</div></div></div>';
        listEl.insertAdjacentHTML('beforeend', html);
      });
    }
  }

  // 벨 dot 표시
  if(bellDot)bellDot.style.display=alertList.length>0?'block':'none';
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.addEventListener('load', function(){
  startDemo(null);
  renderCrops();       // 작물 그리드 (빈 상태)
  renderAlerts();      // 알림 (초기엔 빈 상태로 시작 → 위치 받으면 채워짐)

  // 자동으로 GPS 위치 시도
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      async function(pos){
        var lat=pos.coords.latitude, lon=pos.coords.longitude;
        var city=await reverseGeocode(lat,lon);
        fetchWeather(lat,lon,city);
        startAlertAutoRefresh();
      },
      function(err){
        // 거부 또는 실패 시 위치모달 자동 오픈으로 유도
        document.getElementById('loc-name').textContent='위치 설정 필요';
        document.getElementById('loc-weather').textContent='👆 탭하여 선택';
        // 알림 영역은 안내
        var statusEl=document.getElementById('alert-status');
        if(statusEl){statusEl.textContent='위치 정보 필요';statusEl.style.color='var(--txt2)';}
        var cardsEl=document.getElementById('alert-cards');
        if(cardsEl)cardsEl.innerHTML='<div style="padding:14px 16px;background:var(--bg-card);border:1px dashed var(--brd);border-radius:14px;font-size:12px;color:var(--txt2);width:100%;text-align:center;cursor:pointer;" onclick="openLocModal()">📍 위치를 설정하면 맞춤 알림을 받을 수 있어요</div>';
      },
      {enableHighAccuracy:false,timeout:8000,maximumAge:600000}
    );
  } else {
    fetchWeather(37.0079,127.2797,'안성시');
    startAlertAutoRefresh();
  }
});
