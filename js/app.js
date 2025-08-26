/* ===============================
   도우미 & 전역 상태
================================ */
const $ = (q,root=document)=>root.querySelector(q);
const $$ = (q,root=document)=>[...root.querySelectorAll(q)];
const state = {
  grade: '5',
  words: [],
  learnIdx: 0,
  currentAnswer: null
};
const K = { PREF:'pref-grade' };

/* ===============================
   보이스(TTS)
================================ */
let VOICES = [];
function refreshVoices(){ VOICES = speechSynthesis.getVoices(); }
speechSynthesis.onvoiceschanged = refreshVoices; refreshVoices();

const KO_MALE_HINTS   = [/남성/i,/Male/i,/Jinho/i,/Youngwoo/i];
const KO_FEMALE_HINTS = [/여성/i,/Female/i,/Yuna/i,/Sora/i];

function pickKoVoice(gender='female'){
  const ko = VOICES.filter(v => (v.lang||'').toLowerCase().startsWith('ko'));
  if (!ko.length) return VOICES[0] || null;
  const hints = gender==='male' ? KO_MALE_HINTS : KO_FEMALE_HINTS;
  return ko.find(v=>hints.some(rx=>rx.test(v.name))) || ko[0];
}
function currentGender(){
  return document.querySelector('input[name="voiceGender"]:checked')?.value || 'female';
}
function speak(text, gender=currentGender(), rate=1, pitch=1){
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.voice = pickKoVoice(gender);
  u.rate = rate; u.pitch = pitch;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* ===============================
   뷰 전환 & 상단 문구
================================ */
function showView(name){
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.add('hidden'));
  document.querySelector(`[data-view="${name}"]`)?.classList.remove('hidden');
}
function updateContextText(){
  document.getElementById('current-context').textContent = `${state.grade}학년 • 새로 나온 단어`;
}

/* ===============================
   설정 저장/불러오기
================================ */
function loadPref(){
  try{
    const g = localStorage.getItem(K.PREF);
    if (g) state.grade = String(g);
  }catch{}
  updateContextText();
}
function savePref(){
  localStorage.setItem(K.PREF, state.grade);
  updateContextText();
}

/* ===============================
   CSV 로딩
   규칙: data/{grade}g.csv
================================ */
async function fetchCSV(url){
  const res = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error(`CSV not found: ${url}`);
  const text = await res.text();
  return new Promise((resolve,reject)=>{
    Papa.parse(text, {
      header:true,
      skipEmptyLines:true,
      complete: results => resolve(results.data),
      error: err => reject(err)
    });
  });
}
async function loadWords(){
  const url = `data/${state.grade}g.csv`;
  let rows = [];
  try{ rows = await fetchCSV(url); }catch(e){ rows = []; }
  state.words = rows.map(r=>{
    const word = r.word ?? r.단어 ?? r.Word ?? r['단어(표제어)'] ?? '';
    const mean = r.mean ?? r.뜻   ?? r.Meaning ?? r['의미'] ?? '';
    return { word: String(word).trim(), mean: String(mean).trim() };
  }).filter(x=>x.word && x.mean);
  if (!state.words.length){ state.words = [{ word:'예시', mean:'example' }]; }
}

/* ===============================
   홈 → 각 모드
================================ */
document.getElementById('btn-learn')?.addEventListener('click', async ()=>{
  showView('learn'); await loadWords(); state.learnIdx = 0; renderLearn();
});
document.getElementById('btn-match')?.addEventListener('click', async ()=>{
  showView('match'); await loadWords(); initMatch();
});
document.getElementById('btn-fill')?.addEventListener('click', ()=> showView('fill'));
document.getElementById('btn-pair')?.addEventListener('click', ()=> showView('pair'));
document.querySelectorAll('[data-back]').forEach(b=> b.addEventListener('click', ()=> showView('home')));

/* ===============================
   학년 모달
================================ */
const dlg = document.getElementById('pref-dialog');
document.getElementById('btn-open-pref')?.addEventListener('click', ()=>{
  document.getElementById('sel-grade').value = state.grade;
  dlg.showModal();
});
document.getElementById('btn-save-pref')?.addEventListener('click', (e)=>{
  e.preventDefault(); state.grade = document.getElementById('sel-grade').value; savePref(); dlg.close();
});

/* ===============================
   플래시카드
================================ */
function renderLearn(){
  const wrap = document.getElementById('learn-wrap');
  const list = state.words;
  const i = state.learnIdx % list.length;
  const {word, mean} = list[i];
  wrap.innerHTML = `
    <div class="card">
      <div class="word" id="learn-word">${word}</div>
      <div class="mean" id="learn-mean">뜻 보기</div>
    </div>
  `;
  document.getElementById('learn-mean').addEventListener('click', (ev)=>{
    ev.target.textContent = (ev.target.textContent==='뜻 보기') ? mean : '뜻 보기';
  });
}
document.getElementById('btn-learn-prev')?.addEventListener('click', ()=>{
  if (!state.words.length) return;
  state.learnIdx = (state.learnIdx - 1 + state.words.length) % state.words.length;
  renderLearn();
});
document.getElementById('btn-learn-next')?.addEventListener('click', ()=>{
  if (!state.words.length) return;
  state.learnIdx = (state.learnIdx + 1) % state.words.length;
  renderLearn();
});
document.getElementById('btn-learn-speak')?.addEventListener('click', ()=>{
  const w = document.getElementById('learn-word')?.textContent || '';
  speak(w);
});

/* ===============================
   단어 맞추기
================================ */
function shuffle(a){ return a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]); }
function initMatch(){ renderNextMatch(); }
function renderNextMatch(){
  const wrap = document.getElementById('match-wrap');
  const list = state.words.slice();
  if (!list.length) { wrap.innerHTML = `<div class="center muted">단어가 없어요.</div>`; return; }
  const q = shuffle(list).slice(0, Math.min(4, list.length));
  const answer = q[0]; state.currentAnswer = answer;
  wrap.innerHTML = `
    <div class="q">뜻을 고르세요: <span class="primary-text">${answer.word}</span></div>
    <div class="choices">
      ${shuffle(q).map(it=>`<button data-mean="${encodeURIComponent(it.mean)}">${it.mean}</button>`).join('')}
    </div>
    <div class="center" style="margin-top:10px"><button id="btn-match-speak" class="ghost">단어 듣기</button></div>
  `;
  document.querySelectorAll('#match-wrap .choices button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const selected = decodeURIComponent(btn.dataset.mean || '');
      const ok = selected === answer.mean;
      btn.classList.add(ok ? 'correct' : 'wrong');
    });
  });
  document.getElementById('btn-match-speak')?.addEventListener('click', ()=> speak(answer.word));
}
document.getElementById('btn-match-next')?.addEventListener('click', renderNextMatch);

/* ===============================
   시작
================================ */
document.addEventListener('DOMContentLoaded', ()=>{ loadPref(); showView('home'); });
