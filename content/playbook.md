# Attention playbook

A working reference for YouTube, Shorts and carousels. Every tactic here has the
same four parts: what it is, why it works, what it looks like in each format,
and how it fails. Examples are written for AI engineering content.

Read the last section first if you only have two minutes.

---

## The order things have to happen

You cannot persuade someone who left. The sequence is fixed and each stage only
buys you the next one.

1. **Stop them.** Two seconds on a Short, one second on a thumbnail, one line on
   a carousel cover.
2. **Keep them.** Give a reason to stay that is not yet satisfied.
3. **Make them believe it.** Specifics, names, numbers, and a reason you get to
   say this.
4. **Make them do something.** One action, cheap, obvious.

Most content fails at stage 2. Stage 1 is the one people obsess over, and stage 2
is where the drop-off actually happens.

---

## 1. Stopping them

### Curiosity gap

**What.** Show enough that a gap opens, not enough to close it.

**Why.** Loewenstein's information gap theory: curiosity behaves like a felt
deprivation. Once you know a piece is missing, the missing piece itches. The
critical bit that people get wrong is that the gap only opens if they already
know *something*. Total ignorance is not curiosity, it is indifference.

**Formats.**
- YouTube title: "The agent setup I stopped using after 3 months"
- Short: open on the outcome, withhold the mechanism
- Carousel cover: name the thing, withhold the how

**Fails when.** The gap is fake. If the payoff is smaller than the promise, you
trained the viewer to distrust the next one. This is the only tactic in this
document that damages you retroactively.

### Contrarian open

**What.** State the opposite of what your audience currently believes.

**Why.** Two things at once. It violates a prediction, which forces attention,
and it recruits the people who disagree, who are the most likely to comment.

**Formats.**
- "Most AI coding advice is written by people who ship nothing."
- "Your agent doesn't need better prompts."

**Fails when.** You are contrarian about something nobody believes, which reads
as a strawman, or contrarian without a real argument, which reads as bait. The
test: can you defend the position for ten minutes? If not, do not open with it.

### Identity address

**What.** Name the person you are talking to.

**Why.** Self-referential material is encoded and recalled better than neutral
material. It also does audience filtering for you, which the algorithm reads as
a quality signal because the wrong people never click.

**Formats.**
- "If you're the only person on your team using agents seriously, this is for you."
- Carousel cover with the reader named in the subtitle.

**Fails when.** The identity is too broad ("if you're a developer"). It has to be
specific enough that some people feel excluded.

### Pattern interrupt

**What.** Break the expected shape of the format.

**Why.** The orienting response. Novelty detection is involuntary; habituation to
a repeated format is also involuntary. Every genre trains its own expectations,
and breaking your own genre's convention is more effective than breaking a
general one.

**Formats.**
- Short that opens mid-sentence with no intro
- Carousel where slide 1 is a screenshot, not a statement
- Video that opens on the failure, not the promise

**Fails when.** The interrupt is unrelated to the content. Jump cuts and zooms
are not pattern interrupts, they are noise you have already habituated to.

### Mass appeal framing

**What.** Take a narrow topic and state it at the level where more people care.

**Why.** Reach is a function of how many people can see themselves in the first
frame. This trades against identity address; you are choosing where on that dial
to sit for a given piece.

**Formats.** "How I run CI for agents" reaches your niche. "The reason your AI
coding setup falls apart at 3 people" reaches everyone who has hit that wall.

**Fails when.** You widen so far the claim is generic. Wide framing plus narrow
proof is the combination that works. Wide framing plus wide proof is a LinkedIn
platitude.

---

## 2. Keeping them

This section is the one that matters. If you only implement one thing from this
document, implement open loops.

### Open loop

**What.** Raise something, delay the answer, keep going.

**Why.** Usually credited to the Zeigarnik effect, the finding that interrupted
tasks are recalled better than completed ones. Be aware the original effect has
replicated poorly and the size is contested. The practical mechanism is simpler
and does not depend on it: an unanswered question is a reason to continue, and
content without one gives the reader permission to leave at every boundary.

**Formats.**
- YouTube: "I'll show you the step that broke this, but you need the setup first."
- Short: state the outcome at 0:02, deliver the mechanism at 0:20
- Carousel: end slide 3 with a question that slide 6 answers

**How to actually do it.** Write the piece, then go through it slide by slide or
beat by beat and ask: at the end of this unit, is there anything unresolved? If
every unit is self-contained you have written a reference document, not a piece
of content. Both are fine, but only one gets watched.

**Fails when.** You open loops you never close. That is worse than opening none.
Track them explicitly.

### Callback

**What.** Close a loop from earlier, visibly.

**Why.** Closure is the payoff that makes the next open loop credible. It is also
how you train an audience that staying is worth it.

**Formats.** End a video by returning to the thing you opened on. In a carousel,
the penultimate slide answers the cover.

**Fails when.** The callback is decorative rather than a real resolution.

### Reframe

**What.** Take something the audience already believes and rotate it so it looks
different.

**Why.** New information is cheap and mostly ignored. Reorganised existing
information feels like insight because the reader does the work of updating and
therefore owns the conclusion.

**Formats.**
- "The bottleneck was never how fast you type."
- "CI/CD standardised deployment. This is the same move, applied one stage earlier."

**Fails when.** You reframe something they did not believe in the first place.
The reframe needs a real prior to push against.

### Pre-handling the objection

**What.** Say the reader's counter-argument out loud, then answer it.

**Why.** Inoculation theory, which is one of the better supported findings in
persuasion research. A weakened version of a counter-argument, delivered by you
with a refutation attached, makes the audience more resistant to that argument
later. It also buys enormous trust, because you demonstrably know what they are
thinking.

**Formats.**
- "This sounds like overkill for a team of two. It was, until the third person joined."
- A carousel slide that opens "You're thinking this doesn't apply to solo work."

**Fails when.** You pick a soft objection instead of the real one. Use the actual
top comment you get on this topic.

---

## 3. Making them believe it

### Specificity

**What.** Exact numbers, real names, actual commands.

**Why.** The concreteness effect. Concrete information is processed faster and
remembered better than abstract information, and processing fluency gets
misattributed as truth. "Faster" is a claim. "Cut review time from 40 minutes to
9" is evidence, whether or not the reader checks it.

**Formats.** Replace every adjective with a number or a name. "A large codebase"
becomes "180k lines". "Various tools" becomes "Linear, GitHub Actions, Claude Code".

**Fails when.** The numbers are invented. Do not.

### Naming it

**What.** Give the concept a label.

**Why.** A named thing feels like an object that exists in the world rather than
your opinion about the world. It also gives people a handle to repeat, which is
how ideas travel without you.

**Formats.** "Software factory". "The ticket is the spec". Name the concept once,
then use the name consistently.

**Fails when.** You name six things in one piece. One name per piece, maximum.

### Social proof

**What.** Evidence that other people already did this.

**Why.** Cialdini's consensus principle. Strongest when the referenced people are
similar to the audience, which is why "a team like yours" beats "Fortune 500s".

**Formats.** Team size, adoption, a number of tickets, a screenshot of a real
board.

**Fails when.** The proof is about you being impressive rather than the method
being reliable. Those look similar and land completely differently.

### Authority close

**What.** End on why you specifically get to say this.

**Why.** Authority is evaluated last, not first. Claim it up front and it reads
as arrogance; earn it through the body and state it at the end and it reads as
context.

**Formats.** "I've run this on four teams. The first two failed, and this is what
they had in common."

**Fails when.** It is credentials rather than experience. Nobody cares about the
title, they care that you did the thing and it broke.

---

## 4. Making them act

### Loss aversion

**What.** Frame the cost of not acting, not just the gain from acting.

**Why.** Prospect theory: losses loom larger than equivalent gains. Treat the
popular "losses hurt twice as much" figure as folklore; the direction is solid,
the multiplier is not.

**Formats.** "Every week without this, the same review comment gets written by
hand forty times."

**Fails when.** It tips into fear-mongering, which reads as sales and gets
punished by an engineering audience specifically.

### Low commitment, high reward

**What.** Make the next step obviously cheap.

**Why.** Commitment and consistency. A small action taken now makes a larger one
likelier later. The barrier matters more than the reward.

**Formats.** One command to try. One file to copy. One comment to leave.

**Fails when.** The ask has more than one step.

### Comment CTA

**What.** Ask for a specific word in the comments in exchange for something.

**Why.** Two reasons, and the second is the real one. Reciprocity makes people
comply, and comments are a ranking signal, so the CTA feeds distribution
directly.

**Formats.** "Comment SKILLS and I'll send the config."

**Fails when.** You use it on every post. It burns. Save it for pieces where the
resource genuinely exists.

### Peak-end

**What.** Engineer the strongest moment and the final moment deliberately.

**Why.** Kahneman's peak-end rule: people judge an experience by its most intense
point and its ending, not its average. This is why a strong middle and a limp
ending underperforms a decent middle and a sharp ending.

**Formats.** Put your single best line at the end, not the start. Most people bury
it in the middle.

---

## The six-beat spine

One structure, drawn from what already performs on this channel, that carries
across reel, Short and carousel. Write the beats once, then render them per
format.

| # | Beat | Job |
|---|---|---|
| 1 | Hook | A question or claim that opens curiosity or names a problem they have |
| 2 | Problem | The pain, briefly, in terms they recognise |
| 3 | Solution | The tool or approach, plain language, framed as benefit |
| 4 | Step by step | How it works, demonstrated rather than described |
| 5 | Reinforce | Recap how it solves the problem from beat 2 |
| 6 | Call to action | One ask |

### How each beat renders

| Beat | Reel | Short | Carousel |
|---|---|---|---|
| 1 Hook | First 3 seconds, cold, no intro | Same, harder | Cover slide, best design |
| 2 Problem | 8–10 seconds | 3 seconds | 1 slide |
| 3 Solution | 8–10 seconds, name the concept | 1 line | 1 slide, name the concept |
| 4 Steps | 25–30 seconds, one visual per step | 1 step only | 4–6 slides, numbered |
| 5 Reinforce | 10 seconds, plus the objection | Cut | 2 slides: objection, then benefit |
| 6 CTA | 5 seconds | 1 word or none | 1 slide |

### Two adjustments for carousels

The spine comes from reels, where the viewer makes no decision and the video
plays on. A carousel asks for an active swipe at every slide, so two changes are
needed.

**Carry a loop from beat 3 into beat 4.** Beats 1 to 3 resolve the tension by
themselves. On a reel that is fine because playback continues; on a carousel it
gives the reader permission to stop on slide 3. Open something in beat 3 and
close it partway through beat 4. In the software factory deck: beat 3 says "five
stages, and the one teams skip is the second", and slide 06 is that stage.

**Do not use "follow for more" as the beat 6 ask.** It converts poorly and gives
the ranking system nothing. Ask for a comment keyword tied to a real resource.

### One input, two outputs

Write the six beats as plain text once. The carousel is beats to slides, roughly
1:1 except beat 4 which expands and beat 5 which splits. The reel is the same
beats with timings and a visual per step. Keep the shared lines identical word
for word across both, because repetition across formats is what makes a phrase
stick to you.

Worked example: `carousels/software-factory/carousel.yaml` and
`scripts/software-factory-reel.md` are the same six beats, and the reel script
ends with a table mapping every slide to its timestamp.

---

## Sequences that work

### YouTube video

1. Cold open on the failure or the outcome. No intro, no name, no channel.
2. Open the loop in the first fifteen seconds. Say what you will show and why it
   is not obvious.
3. Identity address so the right people stay.
4. Body, most tactical part first, because retention decays.
5. Pre-handle the biggest objection around two thirds through, which is where
   doubt peaks.
6. Callback to the cold open.
7. Authority close, then one CTA.

### Short

1. First two seconds: the claim, or the outcome, nothing else.
2. Second three seconds: why it is not what they expect. This is the reframe.
3. Middle: one tactical thing, only one.
4. End: close the loop. No CTA, or one word.

Shorts do not have room for four tactics. Pick a hook, a reframe and a payoff.

### Carousel

1. **Cover.** Hook plus name of the thing. Visual quality matters more here than
   anywhere else because it is the only slide most people see.
2. **Slide 2.** Reframe, and open a loop.
3. **Slides 3 to N.** Numbered points. Numbers give position in a sequence, which
   is itself a retention device.
4. **One slide.** Pre-handle the objection.
5. **Penultimate.** Callback closing the cover's loop, plus the payoff line.
6. **Last.** Authority plus one CTA.

Keep type sizes consistent across slides. Inconsistent sizing reads as amateur
before anyone has processed a word.

---

## Checklist

Run this before publishing anything.

- [ ] Is there an unresolved question in the first 10% of the piece?
- [ ] Is every loop I opened closed by the end?
- [ ] Have I named the person this is for, specifically enough to exclude someone?
- [ ] Is there at least one exact number, name, or command?
- [ ] Have I named the concept once, and only once?
- [ ] Have I said the real objection out loud?
- [ ] Does the ending contain my best line?
- [ ] Is the CTA a single step?
- [ ] Would this still be useful with all the tactics stripped out?

That last one is the important one.

---

## What not to do

**Do not use these as a substitute for having something to say.** All of them are
amplifiers. Applied to a piece with no real content they produce the exact thing
your audience is trained to scroll past, and an engineering audience is faster at
detecting it than most.

**Avoid the constructions that now read as machine-written.** "Stop doing X,
start doing Y." "It's not about X, it's about Y." "You don't have an X problem,
you have a Y problem." These were effective rhetorical inversions and are now
markers. If a line fits that template, rewrite it as a plain statement.

### The headline-only test

Before anything else, strip a draft down to its headlines and read them in order,
with no body copy. They have to tell the whole story on their own. If a reader
would be confused, the deck is broken no matter how good each line sounds alone.

An earlier draft of the software factory deck read like this:

> I gave *it* one ticket → Agents run half an hour → *It's* CI/CD but for writing
> code → Intake Spec Build Review Merge → Everything goes through the ticket queue
> → An agent can't do anything with a bad ticket → The agent matters less than
> everyone thinks → Every run gets its own git worktree

Three separate failures, and none of them is a wording problem.

1. **Undefined pronouns.** "It" appears twice before anything has been named.
2. **Opinions posing as steps.** The middle section was meant to explain how the
   thing works. "The agent matters less than everyone thinks" is a hot take, and
   "every run gets its own git worktree" is an implementation detail. Neither
   tells you what happens.
3. **No sequence.** Nothing was in time order, so the reader could not build a
   mental model of the process.

The fix was to make the middle section a literal sequence of events: you label the
ticket, an agent rewrites it, you approve, a second agent writes the code, you
review the pull request. Each slide only uses ideas an earlier slide already
introduced.

**Rules that follow from this.**

- Name the thing before using a pronoun for it.
- If a slide is numbered, it must be a step, not an opinion. Opinions go in the
  video or the comments.
- Steps go in the order they happen, not in order of how interesting they are.
- Every metaphor is a tax. "It's CI/CD but earlier" only works for people who
  already know CI/CD well, and it costs you everyone else. Prefer the plain
  description.
- Cut anything that does not move the explanation forward, however good it is.

### Six rules that keep copy sounding human

These are the specific things that made an earlier draft of the software factory
deck read as generated, even though every line was factually fine.

1. **Use contractions.** "doesn't", "can't", "I'll", "it's". Writing "does not"
   and "cannot" is the loudest single tell, and it is invisible until you look
   for it.
2. **Lead with verbs, not compressed nouns.** "35 minutes of agent work" is three
   nouns stacked to save space. "I gave it one ticket and walked away" is a person
   talking.
3. **Say it the way you'd say it out loud.** "I watched none of it" is formal
   register. Nobody says that. "I didn't watch any of it" is what comes out of a
   mouth.
4. **Break the two-part rhythm.** Fragment, full stop, balanced punchy clause,
   repeated ten times, is the shape of generated copy. Vary sentence length. Let
   one line run long.
5. **Keep your hedges and asides.** "basically", "pretty much", "honestly", "the
   thing nobody mentions". They read as thinking out loud, which is the texture
   that gets stripped first and matters most.
6. **Steal from your own transcript.** The phrasing you used when speaking is
   already in your voice. "You're not tied to your keyboard anymore" beats
   anything invented for the slide.

Test: read the slide aloud. If you would not say it to a colleague in those exact
words, rewrite it.

**Do not run more than three or four tactics in one piece.** Stacked hooks cancel
out. A contrarian identity-addressed pattern-interrupting curiosity gap is not
four times as good, it is noise.

**Be careful with the ones that spend trust.** Curiosity gaps, controversy drops
and comment CTAs all borrow against your credibility and have to be repaid with
a real payoff. The tactics that build trust instead of spending it are
specificity, pre-handling objections, and the authority close.

---

## On the evidence

Worth knowing which of these rest on solid ground, since you will eventually be
challenged on them.

**Well supported.** Inoculation theory for pre-handling objections. The
concreteness effect and processing fluency for specificity. Peak-end for
endings. Self-referential encoding for identity.

**Real direction, contested size.** Loss aversion. Social proof. Curiosity gaps.

**Weak or folk.** The Zeigarnik effect as usually cited; open loops work but the
lab finding behind them replicates poorly. Anything explaining hooks via
"dopamine hits" is pop neuroscience and you should not repeat it.

The practical upshot does not change much. Use them because they work in
practice, not because a study says so, and do not cite the studies in your
content unless you have read them.
