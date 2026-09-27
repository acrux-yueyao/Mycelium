/**
 * ObserveCard — the field observation panel.
 *
 * Shown when a spore is tapped in the field: the canvas draws the live
 * magnified spore (DitherField's observation magnifier); this DOM card
 * sits beside/below it with the specimen's facts — name, family, time on
 * stage, bonds, and its colour story (exchanging / holding / fading /
 * permanent residual). Data refreshes ~1.4×/s via onObserve.
 */
import { CHARACTERS } from '../data/characters';
import type { ObserveInfo } from './DitherField';

interface Props {
  info: ObserveInfo;
  onClose: () => void;
}

function presence(ms: number): string {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function ObserveCard({ info, onClose }: Props) {
  const fam = CHARACTERS[info.charId];
  const dye = info.dye;
  return (
    <div className="observe-card">
      <button className="observe-close" onClick={onClose} aria-label="close">✕</button>
      <div className="observe-name">
        {info.name}
        {info.mine && <em>yours · 你的孢子</em>}
      </div>
      <div className="observe-row">
        <i style={{ background: fam.color }} />
        family <b>{fam.name}</b>
      </div>
      <div className="observe-row">on stage 在场 <b>{presence(info.presentMs)}</b></div>
      <div className="observe-row">bonds 连接 <b>{info.bonds}</b></div>
      <div className="observe-dye">
        {dye ? (
          dye.phase === 'exchanging' ? (
            <>exchanging colour with <b>{dye.from}</b> · {Math.round(dye.progress * 100)}%
              <span>正在与 {dye.from} 交换颜色</span></>
          ) : dye.phase === 'holding' ? (
            <>keeping <b>{dye.from}</b>&apos;s colour · {Math.round(dye.progress * 100)}%
              <span>保留着 {dye.from} 的颜色</span></>
          ) : (
            <>letting <b>{dye.from}</b>&apos;s colour fade · {Math.round(dye.progress * 100)}%
              <span>{dye.from} 的颜色正慢慢褪去</span></>
          )
        ) : info.perm ? (
          <>carries a residue of an old encounter<span>身上留着一段旧相遇的残色</span></>
        ) : (
          <>its own palette, unmixed<span>此刻是本色</span></>
        )}
      </div>
      <div className="observe-hint">tap empty ground to release · 点空处放它回去</div>
    </div>
  );
}
