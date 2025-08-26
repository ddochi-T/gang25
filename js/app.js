/* ===============================
   도우미 & 상태
================================ */
const $ = (q,root=document)=>root.querySelector(q);
const $$ = (q,root=document)=>[...root.querySelectorAll(q)];
const state = { grade:'5', unit:'3', words:[], learnIdx:0, currentAnswer:null };
const K = { PREF:'pref-grade-unit' };

/* ===============================
   TTS (외부 API 없음)
================================ */
let VOICES=[]; function refreshVoices(){ VOICES=speechSynthesis.getVoices(); }
speechSynthesis.onvoiceschanged=refreshVoices; refreshVoices();
const KO_MALE_HINTS=[/남성/i,/Male/i,/Jinho/i,/Youngwoo/i];
const KO_FEMALE_HINTS=[/여성/i,/Female/i,/Yuna/i,/Sora/i];
function pickKoVoice(gender='female'){
  const ko = VOICES.filter(v => (v.lang||'').toLowerCase().startsWith('ko'));
  if(!ko.length) return VOICES[0]||null;
  const hints = gender==='male'?KO_MALE_HINTS:KO_FEMALE_HINTS;
  return ko.find(v=>hints.some(rx=>rx.test(v.name)))||ko[0];
}
function currentGender(){ return $('input[name="voiceGender"]:checked')?.value||'female'; }
function speak(text, gender=currentGender(), rate=1, pitch=1){
  if(!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang='ko-KR'; u.voice=pickKoVoice(gender); u.rate=rate; u.pitch=pitch;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

/* ===============================
   공통 뷰 전환
================================ */
function showView(name){ $$('[data-view]').forEach(el=>el.classList.add('hidden')); $(`[data-view="${name}"]`)?.classList.remove('hidden'); }
function updateContext(){ $('#current-context').textContent = `${state.grade}학년 ${state.unit}단원`; }

/* ===============================
   설정 로드/세이브
================================ */
function loadPref(){ try{ const p=JSON.parse(localStorage.getItem(K.PREF)||'{}'); if(p.grade) state.grade=String(p.grade); if(p.unit) state.unit=String(p.unit);}catch{} updateContext(); }
function savePref(){ localStorage.setItem(K.PREF, JSON.stringify({grade:state.grade, unit:state.unit})); updateContext(); }

/* ===============================
   CSV 로딩 (세미콜론 구분자)
   파일: data/{grade}g.csv
   - unit/단원 컬럼이 있으면 해당 단원만 필터
   - 없으면 전체 사용
================================ */
async function fetchCSV(url){
  const res = await fetch(url, { cache:'no-store' });
  if(!res.ok) throw new Error('CSV not found: '+url);
  const text = await res.text();
  return new Promise((resolve,reject)=>{
    Papa.parse(text, {
      header:true,
      skipEmptyLines:true,
      delimiter:';',
      quotes:true,
      transformHeader: h => (h||'').trim(),
      complete: r => resolve(r.data),
      error: reject
    });
  });
}
async function loadWords(){
  const url=`data/${state.grade}g.csv`;
  let rows=[]; try{ rows=await fetchCSV(url);}catch(e){ rows=[]; }
  // 컬럼 매핑(여러 이름 허용)
  let parsed = rows.map(r=>{
    // 키를 소문자 트림으로 정규화
    const nk = Object.fromEntries(Object.entries(r).map(([k,v])=>[(k||'').toLowerCase().trim(), v]));
    const word = r.word ?? r.단어 ?? r.Word ?? r['단어(표제어)'] ?? nk['word'] ?? nk['단어'] ?? '';
    const mean = r.mean ?? r.뜻   ?? r.Meaning ?? r['의미']      ?? nk['mean'] ?? nk['뜻']   ?? nk['meaning'] ?? nk['의미'] ?? '';
    const unit = r.unit ?? r.단원 ?? r.Unit    ?? r.UNIT        ?? nk['unit'] ?? nk['단원'] ?? '';
    return { word:String(word||'').trim(), mean:String(mean||'').trim(), unit:String(unit||'').trim() };
  }).filter(x=>x.word && x.mean);
  // 단원 필터(컬럼이 있으면만)
  const hasUnit = parsed.some(x=>x.unit);
  if(hasUnit){ parsed = parsed.filter(x=> (x.unit===String(state.unit)) ); }
  if(!parsed.length){ parsed=[{word:'예시', mean:'example'}]; }
  state.words = parsed;
}

/* ===============================
   초기 화면(설정) → 메뉴
================================ */
$('#btn-setup-go')?.addEventListener('click', ()=>{
  state.grade = $('#sel-grade').value;
  state.unit  = $('#sel-unit').value;
  savePref();
  showView('menu');
});
/* 뒤로 버튼 */
$$('[data-back]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = btn.getAttribute('data-back');
    showView(target||'menu');
  });
});

/* ===============================
   메뉴 → 각 모드
================================ */
$('#btn-learn')?.addEventListener('click', async ()=>{ showView('learn'); await loadWords(); state.learnIdx=0; renderLearn(); });
$('#btn-match')?.addEventListener('click', async ()=>{ showView('match'); await loadWords(); renderNextMatch(); });

/* ===============================
   플래시카드
================================ */
function renderLearn(){
  const wrap = $('#learn-wrap');
  const list = state.words;
  const i = state.learnIdx % list.length;
  const {word, mean} = list[i];
  wrap.innerHTML = `
    <div class="card">
      <div class="word" id="learn-word">${word}</div>
      <div class="mean" id="learn-mean">뜻 보기</div>
    </div>`;
  $('#learn-mean').addEventListener('click',(ev)=>{
    ev.target.textContent = (ev.target.textContent==='뜻 보기') ? mean : '뜻 보기';
  });
}
$('#btn-learn-prev')?.addEventListener('click', ()=>{ if(!state.words.length) return; state.learnIdx=(state.learnIdx-1+state.words.length)%state.words.length; renderLearn(); });
$('#btn-learn-next')?.addEventListener('click', ()=>{ if(!state.words.length) return; state.learnIdx=(state.learnIdx+1)%state.words.length; renderLearn(); });
$('#btn-learn-speak')?.addEventListener('click', ()=>{ const w=$('#learn-word')?.textContent||''; speak(w); });

/* ===============================
   단어 맞추기
================================ */
function shuffle(a){ return a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]); }
function renderNextMatch(){
  const wrap=$('#match-wrap'); const list=state.words.slice();
  if(!list.length){ wrap.innerHTML=`<div class="center muted">단어가 없어요.</div>`; return; }
  const q = shuffle(list).slice(0, Math.min(4, list.length));
  const answer=q[0]; state.currentAnswer=answer;
  wrap.innerHTML = `
    <div class="q">뜻을 고르세요: <span class="primary-text">${answer.word}</span></div>
    <div class="choices">
      ${shuffle(q).map(it=>`<button data-mean="${encodeURIComponent(it.mean)}">${it.mean}</button>`).join('')}
    </div>
    <div class="center" style="margin-top:10px"><button id="btn-match-speak" class="ghost">단어 듣기</button></div>`;
  $$('#match-wrap .choices button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const selected=decodeURIComponent(btn.dataset.mean||''); const ok=(selected===answer.mean);
      btn.classList.add(ok?'correct':'wrong');
    });
  });
  $('#btn-match-speak')?.addEventListener('click',()=>speak(answer.word));
}
$('#btn-match-next')?.addEventListener('click', renderNextMatch);

/* ===============================
   부팅
================================ */
document.addEventListener('DOMContentLoaded', ()=>{
  loadPref();
  $('#sel-grade').value = state.grade;
  $('#sel-unit').value  = state.unit;
  updateContext();
  showView('setup');
});
