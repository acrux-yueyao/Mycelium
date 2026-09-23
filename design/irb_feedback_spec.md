# Feedback questionnaire spec — from the IRB draft and the paper

> Compiled 2026-09-23 for the Mycelium site's feedback page. Every item below is quoted verbatim from the source files named; nothing is paraphrased.
> **Status warning: the IRB protocol is a DRAFT, not yet submitted and not yet approved.** Nothing here is "approved for collection". The site may implement it, but must not collect research data until the BU CRC IRB issues its determination. Sources: `写作/IRB/IRB填表稿_v2_对应BU真表.md` (draft Exempt application), `understory/static/feedback.html` (the working questionnaire, EN/ZH), `写作/paper_full_v1.md` (§1, §3.5), `写作/submission_package/supplementary/S0_codebook.md`.

---

## 1. What the IRB draft says about the online questionnaire

### 1.1 Exemption basis (Section E)
Category **(2) survey procedures**, criterion **(2)(i)**:
> The information obtained is recorded in such a manner that the identity of the human subjects cannot readily be ascertained, directly or through identifiers linked to the subjects.

Condition attached in the draft: *"前提是删掉联系方式字段。若保留，就只能勾 (2)(ii)，且 J 节要按 Restricted Use 填。"* — i.e. the **optional contact field must be removed** for this exemption path.

### 1.2 Study procedures (Section I, verbatim)
> One internet survey, completed on the participant's own device: (1) a free-text box ("What did this work leave with you?", up to 4,000 characters); (2) four 1–7 scales about the participant's state at that moment (bearable / comprehensible / expressible / can-let-it-stay-open; the fourth optional); (3) an optional nickname. No interviews, no follow-up contact, no observation. A returning visitor may submit again; entries from the same device are linked by a random code generated in the browser.

Duration: > 2–5 minutes per submission; no further involvement.

### 1.3 Population, inclusion/exclusion (Section G, verbatim)
- Participant population: > Adults (18+) among the general public visiting the installation; no BU-student targeting.
- Inclusion: > Adults aged 18 or over who have experienced the installation and choose to open the feedback page.
- Exclusion: > Anyone under 18; anyone who does not tick the consent box.
- Children: **No**. Draft note: *"同意文字注明须年满 18；无额外年龄核验。⚠ 若 IRB 要求，加一个'我已年满 18'勾选框"* — an "I am 18 or older" checkbox may be required; safest to include it now.

### 1.4 Recruitment (Section H, verbatim)
> A small sign and QR code are placed at the installation inviting visitors to "leave an account of what the work left with you." No one is approached individually; no staff solicit participation. The sign and the page header are the only recruitment materials.

### 1.5 Consent process (Section H, verbatim)
> Consent is obtained on the web page itself, before submission, by a required checkbox next to a plain-language consent statement (attached). The statement says: the purpose of the study; that the account will be read and coded by researchers and may be paraphrased in publications; that no identity is stored, only an irreversible hashed code; that participation is voluntary and can stop at any time; that the participant may ask for their entries to be deleted at any time via the contact given; and that participants must be 18 or over. The page cannot be submitted without ticking the box.

**Consent statement, current wording (feedback.html):**
- EN: > I agree that this account may be used as **anonymous research material**. My identity will not be stored — only an irreversible hashed reference — and I can ask for my entries to be deleted at any time. The text may be read and coded by researchers to understand how interactive works accompany their audiences.
- ZH: > 我同意把这段经历作为**匿名研究语料**使用。我的身份不会被存储——只保留一个不可逆的哈希引用；我可以随时要求删除我的记录。这段文字可能被研究者阅读与编码，用于理解交互作品如何承接观众。

Gap to close: the Section H text promises the statement says **"participants must be 18 or over"** and names **"the contact given"** for deletion requests; the current on-page wording contains neither. Add both.

### 1.6 Risk mitigation / support notice (Section I, verbatim)
> (a) every page displays a standing support-resources notice stating that the page is not a help channel, is not monitored in real time, and giving local crisis-line / campus-counseling / emergency numbers; (b) the page states that nothing written will be used to judge the participant; (c) participants may stop at any time and partial entries are not stored; (d) on request, all of a participant's entries and derived codes are deleted.

**Support notice, current wording (feedback.html):**
- EN: > **If you are struggling right now** — this page is not a help channel and no one is monitoring it live. Please contact a local support line or campus counseling service; in an emergency, call your local emergency number. Nothing you write here will be used to judge you.
- ZH: > **如果你此刻很难受**——这个页面不是求助渠道，也没有人实时值守。请联系你所在地的心理支持热线或校园咨询服务；有紧急危险请拨打当地急救电话。你写下的内容不会被用来判断你。

Gap: Section I promises **actual numbers** ("local crisis-line / campus-counseling / emergency numbers"); the current text has none. Add the venue-appropriate numbers.

### 1.7 Identifiers, privacy, data (Sections I/J, verbatim)
> Responses are entered on the participant's own device, not on a shared kiosk, so no one else sees what is written. No IP address is logged for research. The server stores the text, the four scale values, language, and a one-way hash of the device-generated code; the hash salt is held outside the database, so the code cannot be reversed. Coding of the text is done by researchers; a commercial language-model API is used as a first-pass annotator, receiving the text with no identifier attached, under terms that exclude use for model training.

> No direct identifiers are collected (no name, email, phone, account, or IP). The only linking field is an irreversible hash of a random browser-generated code.

Rules for the page that follow from this:
- **No email / phone / account login.** Remove the "Contact (optional; only for a follow-up invitation)" field.
- **Nickname** is allowed as optional (Section I lists it), but note it is free text; the draft treats the data as anonymous on the basis that no direct identifier is collected.
- **Participant token**: random, generated client-side, stored in the browser; sent to the server and salted-hashed there; never displayed. Current implementation: localStorage key `understory_participant`.
- **Do not log IP for research.**
- Partial entries are **not stored** (only complete submissions).
- Deletion on request must cascade to all of that participant's entries and derived codes.

### 1.8 Costs / payments (Section K)
> There are no costs or payments to participants in this study.

---

## 2. What the paper plans to collect

### 2.1 Research question (paper §1, verbatim)
> what would a design framework look like that helps emerging adults perceive, express, and bear the continuous reconfiguration of their value systems, and how can such a framework be evaluated when success cannot be defined as reaching a prescribed outcome?

Lay version used in the IRB draft (Section G):
> The research question is whether two aspects of the experience—feeling eased (softness) and actively rethinking one's own views (depth)—go together or come apart. The written accounts will be coded by researchers for depth; the scales give softness directly from the participant. Comparing the two on the same person tells us whether an artwork that comforts also prompts reflection, or comforts instead of it.

### 2.2 The two measured axes (paper §3.5, verbatim)
> **Softness.** Did the process become more bearable, comprehensible, and expressible? Softness is assessed as *trajectories* rather than endpoints: perceived stress, psychological acceptance, tolerance of uncertainty, and self-concept clarity over time; qualitatively, users' own re-interpretations of their externalized material, returned to them in the manner of dynamic feedback [SengersGaver2006].

> **Depth.** Is negotiation actually occurring, or being avoided? […] Brooding presents as an R0/R1 loop: repeated revisiting with the same account, **no alternatives entertained**, static across entries. Live negotiation presents as R2: alternative explanations and perspectives in play **without conclusion**, evolving across entries. A provisional settlement presents as a local R3 marker, a reframing statement or a changed understanding, which may later be legitimately reopened.

Depth is **coded by researchers from the free text** (R0–R3); it is not asked of the participant. Softness is **self-reported** on the page. The whole point of the first-party questionnaire is that the two axes are measured by independent methods (the paper, §3.7: "the two axes are then measured by independent methods").

### 2.3 Instrument, verbatim (feedback.html, EN then ZH)

**Open question**
- Prompt: > What did this work leave with you?  ／ > 这件作品，在你身上留下了什么？
- Hint: > No need to judge whether it was good. Write what it brought to mind, what you felt, what it unsettled, or what you took away. Take your time; a half-written entry is fine.  ／ > 不用总结好不好——写下它让你想起什么、感到什么、动摇了什么，或者你带走了什么。慢慢写，写一半也没关系。
- Placeholder: > In that moment I…  ／ > 那一刻我……
- Limit: 4,000 characters (server truncates; client requires ≥15 characters to submit).

**Softness self-report — four single-item 7-point scales**
- Header: > Having written that, how do you feel right now?  ／ > 写完这一刻，感觉怎么样？
- Sub: > Not a rating of the work — your own state at this moment. Go with your first instinct.  ／ > 不是评价作品——是此刻你自己的状态。凭直觉点一个。
- Format: seven buttons labelled 1–7 between a left anchor and a right anchor.

| key | left anchor (1) | right anchor (7) | 左 | 右 | required |
|---|---|---|---|---|---|
| `bearable` | harder to bear | easier to bear | 更难受了 | 更扛得住了 | yes |
| `comprehensible` | more confused | clearer | 更糊涂了 | 更看得清了 | yes |
| `expressible` | harder to put into words | easier to put into words | 更说不出 | 更说得出了 | yes |
| `acceptance` | want to push it away | can let it stay open | 想把它推开 | 能让它悬着 | no ("(optional)" ／ "（可选）") |

Validation message if a required item is missing: > A few of the state items are still unanswered  ／ > 还差几项当下状态没点

Definitions behind the four items (S0 codebook, verbatim):
> **bearable** — soothing / comforting / relieving / cathartic — a difficulty became more possible to sit with. About the person's load easing, not "the work is enjoyable".
> **comprehensible** — the person understands their own feeling or situation more clearly than before.
> **expressible** — the person could put into words something felt but previously unsaid.
> **acceptance** (optional) — the person can let a difficulty stay unresolved without pushing it away; omitted when the text gives no signal.
> Each on **1–7**: 1 = not at all / it got worse; 4 = neutral / no signal; 7 = strongly so.

**Other fields**
- Nickname (optional): > Nickname (optional)  ／ > 昵称（可选）
- ~~Contact~~ — **remove** (see §1.7).
- Consent checkbox (required) — wording in §1.5, plus the two additions noted there.
- Honeypot: hidden field `website`, must stay empty (bot filter).

**Returning-visitor text**
- > Your Nth visit · your earlier entries will be linked into one trajectory  ／ > 这是你第 N 次回到这里 · 你之前留下的会连成一条轨迹

**After submit**
- > Thank you.  ／ > 谢谢你。
- > Your account has been kept — as part of understanding how this work accompanies its audience. It is anonymous and can be withdrawn at any time.  ／ > 你的经历已经留下——成为理解这件作品如何承接观众的一部分。它是匿名的，随时可以撤回。
- First entry: > You are welcome to come back and write what this became for you later.  ／ > 随时可以再回来，写下这件事之后又变成了什么样。
- Nth entry: > This is your Nth entry — they are being linked into a trajectory of your own.  ／ > 这是你留下的第 N 段——它们正连成一条属于你的轨迹。

### 2.4 Payload the Understory server accepts (`POST /api/submit_feedback`)
```
artwork_version_id, text, consent:true, participant_token, softness:{bearable,comprehensible,expressible,acceptance}, nickname, contact, website(honeypot), language:"zh"|"en"
```
Softness values must be integers 1–7; server stores them in `softness_assessment` with `coder_id="self_report"`. If the Mycelium site posts to Understory, drop `contact`.

### 2.5 Recommended additions not yet in the page (from the IRB draft's gaps)
1. Optional demographic screen, if the paper is to say how many respondents are in the target population — the IRB draft note: *"建议反馈页加两个可选的小问题：年龄段（是否 18–29）、是否正处在一段人生过渡中"*. If added, it must also be added to the IRB application before submission.
2. "I am 18 or older" checkbox (see §1.3).
3. Actual support numbers in the notice (see §1.6).
4. Deletion-request contact in the consent text (see §1.5).
