/**
 * SurveyScene — the end-of-experience user feedback questionnaire.
 *
 * A short bilingual survey (feeling scale, two choice questions, an open
 * field, optional email) submitted to /api/feedback (Upstash-backed). In
 * ?test mode it stays local and never persists. Shows a calm thank-you
 * state on submit.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { sceneOverlay } from '../ui/motion';
import type { Scene } from './SceneNav';

interface Props {
  onNavigate: (s: Scene) => void;
}

const TEST =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('test');

const FEEL = [
  { v: 1, zh: '没什么共鸣' },
  { v: 2, zh: '还好' },
  { v: 3, zh: '有点意思' },
  { v: 4, zh: '挺喜欢' },
  { v: 5, zh: '深受触动' },
];
const OWN = [
  { v: 'yes', en: 'yes', zh: '是' },
  { v: 'kind', en: 'kind of', zh: '有点' },
  { v: 'no', en: 'not really', zh: '不太' },
];
const DRAWS = [
  { v: 'creature', en: 'the creature I grew', zh: '长出的小怪' },
  { v: 'colony', en: 'the living colony', zh: '活体菌落' },
  { v: 'share', en: 'sharing & claiming', zh: '分享认领' },
  { v: 'writing', en: 'the writing prompt', zh: '书写倾诉' },
  { v: 'visuals', en: 'the visuals', zh: '视觉' },
];

export function SurveyScene({ onNavigate }: Props) {
  const [feel, setFeel] = useState<number | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [draws, setDraws] = useState<Set<string>>(new Set());
  const [better, setBetter] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (TEST) return;
    fetch('/api/feedback')
      .then((r) => r.json())
      .then((d) => { if (typeof d?.count === 'number') setCount(d.count); })
      .catch(() => {});
  }, []);

  const toggleDraw = (v: string) =>
    setDraws((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });

  const canSubmit = feel != null || better.trim() || own != null || draws.size > 0;

  const submit = async () => {
    if (!canSubmit || status === 'sending') return;
    setStatus('sending');
    const response = {
      feel, own, draws: [...draws],
      better: better.trim().slice(0, 1500),
      email: email.trim().slice(0, 160),
      at: Date.now(),
    };
    if (TEST) { setStatus('done'); return; }
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      const d = await r.json();
      if (typeof d?.count === 'number') setCount(d.count);
      setStatus(d?.ok ? 'done' : 'error');
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
          <h2>thank you<span>谢谢你的低语</span></h2>
          <p>your reflection joins the network.<br />你的反馈已汇入菌网。</p>
          <button className="survey-cta" onClick={() => onNavigate('field')}>
            back to the field ▸<span>回到田野</span>
          </button>
        </div>
      ) : (
        <div className="survey-form">
          <div className="survey-head">
            <h2>FEEDBACK<span>体验反馈</span></h2>
            <p>
              a few quick questions — help the network grow.
              <br />几个小问题,帮这片菌网长得更好。
              {count != null && count > 0 ? ` · ${count.toLocaleString()} shared` : ''}
            </p>
          </div>

          {/* Q1 — feeling scale */}
          <div className="survey-q">
            <div className="survey-q-t">How did The Whisper Network make you feel?<span>它带给你的感受?</span></div>
            <div className="survey-scale">
              {FEEL.map((f) => (
                <button
                  key={f.v}
                  className={`survey-dot${feel === f.v ? ' on' : ''}`}
                  onClick={() => setFeel(f.v)}
                  title={f.zh}
                >
                  {f.v}
                  <span className="survey-dot-zh">{f.zh}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Q2 — ownership */}
          <div className="survey-q">
            <div className="survey-q-t">Did the creature you grew feel truly yours?<span>你长出的小怪,感觉「属于你」吗?</span></div>
            <div className="survey-chips">
              {OWN.map((o) => (
                <button
                  key={o.v}
                  className={`survey-chip${own === o.v ? ' on' : ''}`}
                  onClick={() => setOwn(o.v)}
                >
                  {o.en}<i>{o.zh}</i>
                </button>
              ))}
            </div>
          </div>

          {/* Q3 — what drew you in (multi) */}
          <div className="survey-q">
            <div className="survey-q-t">What drew you in most?<span>最吸引你的是?(可多选)</span></div>
            <div className="survey-chips">
              {DRAWS.map((d) => (
                <button
                  key={d.v}
                  className={`survey-chip${draws.has(d.v) ? ' on' : ''}`}
                  onClick={() => toggleDraw(d.v)}
                >
                  {d.en}<i>{d.zh}</i>
                </button>
              ))}
            </div>
          </div>

          {/* Q4 — open */}
          <div className="survey-q">
            <div className="survey-q-t">What would make it better?<span>希望它再多点什么?</span></div>
            <textarea
              className="survey-text"
              rows={3}
              maxLength={1500}
              value={better}
              onChange={(e) => setBetter(e.target.value)}
              placeholder="anything you'd want more of… / 随便写点…"
            />
          </div>

          {/* Q5 — email (optional) */}
          <div className="survey-q">
            <div className="survey-q-t">Email <em>(optional)</em><span>邮箱(选填,想回复你)</span></div>
            <input
              className="survey-input"
              type="email"
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="survey-actions">
            <button
              className="survey-submit"
              disabled={!canSubmit || status === 'sending'}
              onClick={submit}
            >
              {status === 'sending' ? 'sending…' : 'send feedback ▸'}
            </button>
            <button className="survey-skip" onClick={() => onNavigate('field')}>skip</button>
            {status === 'error' && <span className="survey-err">couldn’t send — try again</span>}
          </div>
        </div>
      )}
    </motion.div>
  );
}
