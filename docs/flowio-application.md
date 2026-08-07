# FlowIO Application — Project "Huai" (怀)

> 使用说明：以下按典型申请表字段分块，遇到对应输入框直接复制该块。
> 方括号内容需要你本人核对/替换。英文为提交语言。

---

## Applicant Information

- **Name:** [Your full name]
- **Email:** nikkiyao@bu.edu
- **Affiliation:** Boston University — [program name, e.g., Design / HCI]
- **Role:** [Undergraduate / Graduate] student
- **Location:** Boston, MA, USA *(happy to pick up in person at MIT Media Lab — we are in the same city)*
- **Intended use:** Non-commercial academic research / degree project

## Project Title

**Huai (怀): A Pneumatic Embrace Shawl for People Experiencing Touch Starvation**

## Project Summary (short version, ~100 words)

Huai is a wearable shawl that simulates the somatic components of a human
hug for people experiencing touch starvation ("skin hunger") who have
difficulty falling asleep. Five discrete air bladders — mapped to five
hands: two gripping the upper arms, two resting on the shoulders, one palm
between the shoulder blades — inflate in a proximal sequence at 15–35 mmHg,
paced to a breathing-entrainment rhythm (12→6 breaths/min, 3:7
inhale:exhale ratio), combined with skin-temperature heating (36→33 °C)
and a heartbeat module. FlowIO's five pneumatic ports map one-to-one onto
the five bladders, making it the ideal controller for our user studies.

## Project Description (long version)

**Motivation.** Touch starvation is increasingly visible: professional
cuddle-therapy sessions demonstrably improve clients' sleep, but cost
$70–140/hour, are scarce, and carry stigma — user comments we collected
describe wanting this care but being unable to afford it or embarrassed to
ask friends. Huai is designed as "the bridge between sessions": an
at-home, nightly pre-sleep ritual object at a fraction of the cost.

**Evidence base.** The design operationalizes clinical findings: deep
pressure improves insomnia (Ekholm et al. 2020, randomized controlled
trial); pre-sleep paced breathing at 6 breaths/min shortens sleep-onset
latency (Tsai et al. 2015); mild skin warming promotes sleep onset
(Kräuchi et al. 1999; Raymann et al.); hug release timing and robot-
initiated squeezes matter (Block & Kuchenbecker, HuggieBot). Our core
hypothesis — that sequencing discrete pressure "hands" in the spatial
order of a real embrace (arms → shoulders → back) increases perceived
hug realism — is novel and untested; it is the primary variable in our
planned studies.

**System.** A cashmere-covered shawl containing five bladders (two are
three-chamber kneading cuffs around the upper arms with passively
sequenced chambers), a below-clavicle heating pad with NTC closed-loop
control, and a heartbeat actuator. Working pressure is capped at 40 mmHg
(≈5.3 kPa) by a mechanical relief valve; total system volume ≈2.4 L.
Safety is mechanical-first: magnetic front closure doubles as a kill
switch — opening the garment de-energizes all valves, which vent by
default.

**Why FlowIO specifically.**
1. **Five ports = five hands.** Our architecture maps one-to-one onto
   FlowIO's five pneumatic channels — no other platform matches this.
2. **Low-pressure wearable regime.** Our 2–5 kPa range and slow rhythms
   (0.1 Hz breathing modulation, multi-second SOA sequencing) sit exactly
   in FlowIO's wearable-HCI design envelope.
3. **Rapid study iteration.** The Bluetooth + JavaScript stack lets us
   re-parameterize inflation order, SOA (5–25 s sweep), and rhythm curves
   between participants without reflashing firmware — essential for our
   within-subject counterbalanced studies.

**Planned studies.** (1) A blinded three-condition study of inflation
order (distal→proximal vs. simultaneous vs. reversed) on perceived
"being-hugged" realism, plus release-speed comparison; (2) a 7-night ABA
in-home study (2 baseline / 3 intervention / 2 withdrawal nights, n=5)
measuring sleep-onset latency, respiratory entrainment, subjective
embrace realism, and voluntary reuse.

**Timeline.** Manual prototype (hand-bulb actuated) is specified and in
fabrication now; FlowIO would be integrated at the automated-control
stage, [month/year] onward.

## Non-Commercial Statement

This is an academic degree project. No commercial use is intended for the
FlowIO device or derived data. All outcomes (design documentation,
study protocols, results) will be openly shared.

## Giving Back to the FlowIO Community

- Full engineering documentation already exists (assembly drawings,
  pneumatic schematics, timing tables, evidence-graded design rationale)
  and will be published openly with FlowIO integration notes.
- We will contribute a documented **wearable low-pressure use case**
  (garment-integrated bladders, safety interlock pattern, breathing-
  entrainment rhythm library) — a category the FlowIO showcase can use.
- FlowIO will be acknowledged/cited in the thesis and any resulting
  publications (CHI/TEI-track writeup planned).
- Being in Boston, we are glad to demo the finished garment in person.

## Requested Hardware

One FlowIO device, general-purpose module (moderate flow), five-port
configuration. If module options are offered: our regime is low pressure
(≤6 kPa), moderate flow (≈2 L/min), battery or USB powered.

---

### 中文备忘（不提交）

- 表单若有字数限制，优先保 Summary、Why FlowIO、Non-Commercial 三块。
- 若表单只有一个大文本框：Summary + Why FlowIO + Planned studies + Giving back 顺序拼接。
- 附件位可上传规格书 PDF（把工程分册文档打印为 PDF 附上，说服力最强）。
- "in-person pickup/demo" 这句保留——同城是真实优势。
