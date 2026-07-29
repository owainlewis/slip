# Reel: How to build your AI software factory

Same order as `carousels/software-factory`, same words where they overlap. Every
beat explains the next one. Nothing refers to something not yet said.

Target 60 to 75 seconds. Talking head with screen recording cutaways.

---

## 1. Hook — 0:00 to 0:06

**Say:**
> I added a label to a GitHub issue, went away, and came back to a finished pull
> request. Here's the whole setup.

**Screen:** the label going on the issue, then jump cut to the merged PR. Show
both ends before explaining the middle.

**On-screen text:** `LABEL IN. PULL REQUEST OUT.`

No intro, no name, no channel branding.

---

## 2. Problem — 0:06 to 0:18

**Say:**
> Think about what you actually do with a ticket. You read it, plan it, write the
> code, test it, review it, open a pull request, then fix whatever CI complains
> about. Seven steps, and you do all seven every single time.

**Screen:** the seven steps appearing as a list, one at a time, in sync.

**On-screen text:** `7 STEPS. EVERY TICKET.`

This beat is doing the teaching. The rest of the video refers back to it.

---

## 3. What it is — 0:18 to 0:28

**Say:**
> A software factory just does those steps for you. It's a program that sits there
> watching your issue list. When a ticket's ready, it starts an agent, the agent
> works through those seven steps, and you get a pull request at the end.

**Screen:** the daemon running, picking up an issue.

**On-screen text:** `IT RUNS THE SEVEN STEPS`

No metaphor here. CI/CD comparisons only work if the viewer already knows CI/CD
well, and it costs you the people who don't.

---

## 4. How it works — 0:28 to 0:58

Five steps, in the order they happen. Show each one.

**01 — You label the ticket.**
> You put a label on the issue. That's the trigger. Nothing runs until you add
> one, so you decide what gets picked up and when.

Screen: adding `factory:ready-for-spec`.

**02 — An agent rewrites the ticket.**
> First thing that happens is an agent rewrites the ticket. Most tickets are too
> vague to build from. Look at this one: improve the readme, no detail at all. The
> agent reads your code, works out what's actually needed, and writes proper
> acceptance criteria.

Screen: the vague ticket, then the rewritten one, side by side. Hold this. It is
the most convincing thing in the video.

**03 — You approve it.**
> You read that and label it again. That's the only decision you make in the whole
> loop, and it takes about ten seconds.

Screen: adding `factory:ready-to-implement`.

**04 — A second agent writes the code.**
> Then a second agent picks it up and writes the code. It gets its own copy of the
> repo so nothing collides. It plans, writes it, runs the tests, reviews its own
> diff, opens the pull request, and fixes whatever CI flags.

Screen: the workflow stepping through, sped up.

**05 — You review.**
> About half an hour later you come back to a pull request. Read the diff, merge
> it, or send it back with a comment. That's the whole loop.

Screen: the diff, then merge.

---

## 5. Scope — 0:58 to 1:08

**Say:**
> One thing to be clear about. Only send it the boring tickets. Dependency bumps,
> small bug fixes, cleanup. Anything that needs a real decision, you still do
> yourself. This is for the work you'd rather not think about.

**Screen:** the board, mechanical tickets tagged, the rest untagged.

Saying this out loud is what stops the top comment being someone telling you it
does not work for real engineering.

---

## 6. CTA — 1:08 to 1:14

**Say:**
> All of it's open source. The workflows, the prompts, the program that watches the
> queue. Comment FACTORY and I'll send you the repo.

**On-screen text:** `COMMENT "FACTORY"`

One ask. Not "follow for more", which converts badly and gives the ranking system
nothing.

---

## Shared assets

| Beat | Carousel slide | Timestamp | Shared line |
|---|---|---|---|
| 1 Hook | `cover` | 0:00 | label in, pull request out |
| 2 Problem | `problem` | 0:06 | the same seven steps by hand |
| 3 What it is | `what` | 0:18 | does those steps for you |
| 4 Step 01 | `label` | 0:28 | you put a label on the ticket |
| 4 Step 02 | `spec` | 0:34 | an agent rewrites the ticket first |
| 4 Step 03 | `approve` | 0:42 | you read it and label it again |
| 4 Step 04 | `build` | 0:47 | a second agent writes the code |
| 4 Step 05 | `review` | 0:53 | you come back to a pull request |
| 5 Scope | `scope` | 0:58 | only send it the boring tickets |
| 6 CTA | `cta` | 1:08 | comment FACTORY |

## Cutting this to 30 seconds

Keep beats 1, 2, 3 and 6. Replace beat 4 with one sentence: "you label it, an
agent writes the spec, you approve, a second agent writes the code." Drop beat 5.
Beat 2 is the one people will want to cut and it is the one that makes the rest
make sense.
