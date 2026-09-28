/**
 * SurveyScene — the study feedback page ("leave an account").
 *
 * Rebuilt 2026-09 against design/irb_feedback_spec.md (compiled from the
 * IRB draft + paper §3.5): one free-text account, four 1–7 softness
 * scales (fourth optional), optional nickname + two optional demographic
 * items, a required 18+ checkbox and a required consent checkbox, a
 * standing support-resources notice, and a hidden honeypot. No contact
 * field — no direct identifiers are collected (IRB §1.7). A random
 * browser token links repeat entries; only its salted hash is stored
 * server-side. Partial entries are never stored. ?test mode stays local.
 *
 * ⚠ IRB status: the protocol is a DRAFT. Until approval, the server
 * flags submissions research:false (see api/feedback.ts RESEARCH_ENABLED).
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { sceneOverlay } from '../ui/motion';
import type { Scene } from './SceneNav';

interface Props {
  onNavigate: (s: Scene) => void;
}

const TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('test');

/* ⚠ 上线前必填(IRB Section H/I 承诺):删除请求联系方式 + 场地支持资源 */
const DELETION_CONTACT = 'nikkiyao814@gmail.com';
const SUPPORT_LINES_EN =
  'In the US: call or text 988 (Suicide & Crisis Lifeline) · emergency: 911 · elsewhere: findahelpline.com';
const SUPPORT_LINES_ZH =
  '美国:拨打或短信 988(危机热线)· 紧急情况:911 · 其他地区:findahelpline.com';

const SCALES: Array<{
  key: 'bearable' | 'comprehensible' | 'expressible' | 'acceptance';
  en: [string, string];
  zh: [string, string];
  required: boolean;
}> = [
  { key: 'bearable', en: ['harder to bear', 'easier to bear'], zh: ['更难受了', '更扛得住了'], required: true },
  { key: 'comprehensible', en: ['more confused', 'clearer'], zh: ['更糊涂了', '更看得清了'], required: true },
  { key: 'expressible', en: ['harder to put into words', 'easier to put into words'], zh: ['更说不出', '更说得出了'], required: true },
  { key: 'acceptance', en: ['want to push it away', 'can let it stay open'], zh: ['想把它推开', '能让它悬着'], required: false },
];

const AGE = [
  { v: '18-29', en: '18–29', zh: '18–29' },
  { v: '30+', en: '30 or older', zh: '30 及以上' },
  { v: 'na', en: 'prefer not to say', zh: '不想说' },
];
const TRANSITION = [
  { v: 'yes', en: 'yes', zh: '是' },
  { v: 'no', en: 'no', zh: '否' },
  { v: 'unsure', en: 'hard to say', zh: '说不清' },
];

function participantToken(): string | null {
  try {
    const k = 'mycelium_participant';
    let t = localStorage.getItem(k);
    if (!t) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      t = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(k, t);
    }
    return t;
  } catch {
    return null;
  }
}

function pastEntries(): number {
  try { return Number(localStorage.getItem('mycelium_fb_entries')) || 0; } catch { return 0; }
}

export function SurveyScene({ onNavigate }: Props) {
  const [text, setText] = useState('');
  const [scales, setScales] = useState<Record<string, number | null>>({
    bearable: null, comprehensible: null, expressible: null, acceptance: null,
  });
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState<string | null>(null);
  const [transition, setTransition] = useState<string | null>(null);
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');   // honeypot — humans never see it
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [entryNo, setEntryNo] = useState(0);

  const visits = useMemo(pastEntries, []);

  const scalesMissing = SCALES.some((s) => s.required && scales[s.key] == null);
  const textOk = text.trim().length >= 15;
  const canSubmit = textOk && !scalesMissing && adult && consent;

  const submit = async () => {
    setTried(true);
    if (!canSubmit || status === 'sending') return;
    setStatus('sending');
    const zh = typeof navigator !== 'undefined' && (navigator.language || '').startsWith('zh');
    const softness: Record<string, number> = {};
    for (const s of SCALES) if (scales[s.key] != null) softness[s.key] = scales[s.key] as number;
    const response = {
      v: 2,
      text: text.trim().slice(0, 4000),
      softness,
      nickname: nickname.trim().slice(0, 80) || undefined,
      demo: { age: age || undefined, transition: transition || undefined },
      language: zh ? 'zh' : 'en',
      consent: true,
      adult: true,
      token: participantToken(),
      website,
      at: Date.now(),
    };
    const n = visits + 1;
    if (TEST) {
      setEntryNo(n);
      setStatus('done');
      return;
    }
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      const d = await r.json();
      if (d?.ok) {
        try { localStorage.setItem('mycelium_fb_entries', String(n)); } catch { /* per-viewer only */ }
        setEntryNo(n);
        setStatus('done');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <motion.div
      className="scene survey"
      variants={sceneOverlay}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {status === 'done' ? (
        <div className="survey-thanks">
          <div className="survey-thanks-glyph" aria-hidden>❋</div>
          <h2>Thank you.<span>谢谢你。</span></h2>
          <p>
            Your account has been kept — as part of understanding how this work
            accompanies its audience. It is anonymous and can be withdrawn at any time.
            <br />你的经历已经留下——成为理解这件作品如何承接观众的一部分。它是匿名的,随时可以撤回。
          </p>
          <p>
            {entryNo > 1 ? (
              <>This is your {entryNo}th entry — they are being linked into a trajectory of your own.
                <br />这是你留下的第 {entryNo} 段——它们正连成一条属于你的轨迹。</>
            ) : (
              <>You are welcome to come back and write what this became for you later.
                <br />随时可以再回来,写下这件事之后又变成了什么样。</>
            )}
          </p>
          <button className="survey-cta" onClick={() => onNavigate('field')}>
            back to the field ▸<span>回到田野</span>
          </button>
        </div>
      ) : (
        <div className="survey-form">
          <div className="survey-head">
            <h2>LEAVE AN ACCOUNT<span>留下这段经历</span></h2>
            {visits > 0 && (
              <p className="survey-return">
                Your {visits + 1}th visit · your earlier entries will be linked into one trajectory
                <br />这是你第 {visits + 1} 次回到这里 · 你之前留下的会连成一条轨迹
              </p>
            )}
          </div>

          {/* standing support notice (IRB §1.6) */}
          <div className="survey-notice">
            <b>If you are struggling right now</b> — this page is not a help channel and
            no one is monitoring it live. Please contact a local support line or campus
            counseling service; in an emergency, call your local emergency number.
            Nothing you write here will be used to judge you.
            <br />{SUPPORT_LINES_EN}
            <br /><b>如果你此刻很难受</b>——这个页面不是求助渠道,也没有人实时值守。请联系你所在地的
            心理支持热线或校园咨询服务;有紧急危险请拨打当地急救电话。你写下的内容不会被用来判断你。
            <br />{SUPPORT_LINES_ZH}
          </div>

          {/* open account */}
          <div className="survey-q">
            <div className="survey-q-t">
              What did this work leave with you?<span>这件作品,在你身上留下了什么?</span>
            </div>
            <p className="survey-hint">
              No need to judge whether it was good. Write what it brought to mind, what you felt,
              what it unsettled, or what you took away. Take your time; a half-written entry is fine.
              <br />不用总结好不好——写下它让你想起什么、感到什么、动摇了什么,或者你带走了什么。慢慢写,写一半也没关系。
            </p>
            <textarea
              className="survey-text"
              rows={6}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="In that moment I… / 那一刻我……"
            />
            {tried && !textOk && (
              <div className="survey-err">at least a sentence (15+ characters) · 请至少写一句(15 字以上)</div>
            )}
          </div>

          {/* softness scales */}
          <div className="survey-q">
            <div className="survey-q-t">
              Having written that, how do you feel right now?<span>写完这一刻,感觉怎么样?</span>
            </div>
            <p className="survey-hint">
              Not a rating of the work — your own state at this moment. Go with your first instinct.
              <br />不是评价作品——是此刻你自己的状态。凭直觉点一个。
            </p>
            {SCALES.map((s) => (
              <div className="survey-scale-row" key={s.key}>
                <span className="survey-anchor">
                  {s.en[0]}<i>{s.zh[0]}</i>
                </span>
                <div className="survey-scale">
                  {[1, 2, 3, 4, 5, 6, 7].map((v) => (
                    <button
                      key={v}
                      className={`survey-dot sm${scales[s.key] === v ? ' on' : ''}`}
                      onClick={() => setScales((p) => ({ ...p, [s.key]: p[s.key] === v ? null : v }))}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <span className="survey-anchor r">
                  {s.en[1]}{!s.required && ' (optional)'}<i>{s.zh[1]}{!s.required && '(可选)'}</i>
                </span>
              </div>
            ))}
            {tried && scalesMissing && (
              <div className="survey-err">A few of the state items are still unanswered · 还差几项当下状态没点</div>
            )}
          </div>

          {/* optional extras */}
          <div className="survey-q">
            <div className="survey-q-t">Nickname <em>(optional)</em><span>昵称(可选)</span></div>
            <input
              className="survey-input"
              maxLength={80}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="survey-q">
            <div className="survey-q-t">Your age <em>(optional)</em><span>年龄段(可选)</span></div>
            <div className="survey-chips">
              {AGE.map((o) => (
                <button key={o.v} className={`survey-chip${age === o.v ? ' on' : ''}`}
                  onClick={() => setAge(age === o.v ? null : o.v)}>
                  {o.en}<i>{o.zh}</i>
                </button>
              ))}
            </div>
          </div>
          <div className="survey-q">
            <div className="survey-q-t">
              Are you in the middle of a life transition? <em>(optional)</em>
              <span>你正处在一段人生过渡中吗?(可选)</span>
            </div>
            <div className="survey-chips">
              {TRANSITION.map((o) => (
                <button key={o.v} className={`survey-chip${transition === o.v ? ' on' : ''}`}
                  onClick={() => setTransition(transition === o.v ? null : o.v)}>
                  {o.en}<i>{o.zh}</i>
                </button>
              ))}
            </div>
          </div>

          {/* honeypot — bots fill it, humans never see it */}
          <input
            className="survey-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="website"
          />

          {/* consent (IRB §1.3 / §1.5) */}
          <label className={`survey-check${tried && !adult ? ' miss' : ''}`}>
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span>I am 18 or older. <i>我已年满 18 岁。</i></span>
          </label>
          <label className={`survey-check${tried && !consent ? ' miss' : ''}`}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree that this account may be used as <b>anonymous research material</b>. My identity
              will not be stored — only an irreversible hashed reference — and I can ask for my entries
              to be deleted at any time by writing to {DELETION_CONTACT}. Participation is voluntary and
              open to those 18 or over. The text may be read and coded by researchers to understand how
              interactive works accompany their audiences.
              <i>
                我同意把这段经历作为<b>匿名研究语料</b>使用。我的身份不会被存储——只保留一个不可逆的哈希引用;
                我可以随时写信至 {DELETION_CONTACT} 要求删除我的记录。参与完全自愿,且须年满 18 岁。
                这段文字可能被研究者阅读与编码,用于理解交互作品如何承接观众。
              </i>
            </span>
          </label>

          <div className="survey-actions">
            <button
              className="survey-submit"
              disabled={status === 'sending'}
              onClick={submit}
            >
              {status === 'sending' ? 'sending…' : 'leave it here ▸ 留在这里'}
            </button>
            <button className="survey-skip" onClick={() => onNavigate('field')}>skip · 跳过</button>
            {status === 'error' && <span className="survey-err">couldn’t send — try again · 没发出去,再试一次</span>}
          </div>
        </div>
      )}
    </motion.div>
  );
}
