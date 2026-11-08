# DESIGN.md

Direction for Squeek Pack. This file records the direction the build already follows, so
the rules in `antislop.md` have something to filter against. If any line here does not match
what you want, change it here first and the build follows.

## What this is

An instrument, not a dashboard. Squeektoshi's wheel produces work one pass at a time, and
work is counted in rounds of ten minutes. You are the one closing the rounds: his running
arrives as bursts, a round holds 10,000 work units, and work never moves between rounds. The
round owns one screen; the manual page under it explains the arithmetic. No wallet.

## Identity

A workshop bench with a measuring rule on it, in the shop's own colours. The bench is the
same black and red as evm0x.com, because Squeek Pack is a thing built in that shop and
should read as one. The only bright thing in the room is the work that has actually been
counted.

Motif: **the rule and the stamp**. The round is drawn as a steel rule with ten major ticks,
one per thousand work units, because the whole whitepaper is about measuring a wheel. Every
number is set as if it were stamped onto a plate: uppercase, monospaced, tight to its rule.
Nothing floats, nothing glows, nothing is a card except the two sheets that interrupt play.

### The mark

A crate, filled from the bottom to a little over half, ruled in tens. It is the round drawn
as an object: the red is work that has been packed, the hairline above it is room still
open, the ticks are the rule's thousands. Nothing in it is decoration, and nothing in it is
a letter, so it survives being 16 pixels wide in a browser tab.

Sharp corners, a 2.6 unit stroke, no rounding, no gradient, no glow. The stroke is `#4a4a4a`
on night and `#b4b4b4` on day, always quieter than the fill, because the packed part is the
only thing worth looking at. The mark sits in a lockup with the wordmark at `0.42em` gap and
`1.16em` tall, sized in ems so the two never drift apart when the type scales.

Two files, on purpose: `logo.svg` carries the ticks for anything 24 pixels and up, and
`favicon.svg` drops them and thickens the crate so the shape still reads in a tab. The share
card redraws the same mark in canvas, since a canvas cannot take an SVG.

## Palette

The bench runs evm0x.com's palette: black paper, white ink, one red. Night is the default,
because the shop it belongs to is black.

Amber is the second colour and it has exactly one job: it marks money. Every number the
chain pays is amber, every control and every piece of identity is red or ink. Amber never
lands on a button, so a number you earned can never be mistaken for a thing you press.

| Role | Value (night) | Value (day) | Why |
|---|---|---|---|
| Paper | `#000000` | `#f5f5f5` | evm0x.com's own background, unchanged. Pure black, no blue-grey tint. |
| Plate | `#0b0b0b` | `#ffffff` | The one raised surface: the chute. Barely lighter than the paper, separated by a hairline, not a shadow. |
| Ink | `#f5f5f5` | `#0a0a0a` | evm0x.com's text colour. 19.3:1 on black. |
| Brand red | `#eb0004` | `#eb0004` | evm0x.com's accent, used for fills only: the packed rule, the timer, the primary button, the card's stamp. |
| Red text | `#ff3b3b` | `#c40003` | The same red lifted (night) or deepened (day) so red text clears AA on its plate: 5.94:1 and 5.75:1. The brand red as text is 4.53:1 on pure black and 4.25:1 on the plate, so it is not used for type. |
| Money | `#ffc247` | `#7a5200` | The only colour that means "this is what you were paid": blocks and block units in the readout, the calculator, the log, the results sheet and the share card. 13.06:1 on black, 6.35:1 on the day paper. Never used on a control. |
| Ghost gold | `#e0b341` | `#7a5200` | State: he is asleep, the difficulty is a replay, no settlement. |
| Miss red | `#ff5252` | `#b00003` | State: a burst was rejected, or an endpoint is unreachable. |
| Hairline | `#222222` | `#dcdcdc` | evm0x.com's border colour. Rules and ticks, drawn not coloured. |

The three state colours are a status system, not decoration. Each appears only on the chip,
the flash line, or the burst plate. Every text token is checked against its own background,
measured in the browser with a script rather than by eye: the lowest ratio in either theme is
5.13:1, and the primary button's white label on `#eb0004` is 4.63:1. A palette scan returns no
green or blue left anywhere in either theme.

## Typography

| Face | Where | Why |
|---|---|---|
| Big Shoulders Display 800 / 600 | Burst numerals, the score, the wordmark, sheet titles | A plate stamped on a machine: tall, narrow, industrial. The burst has to be readable at arm's length while a clock is running. |
| Cascadia Code, falling back to JetBrains Mono, 400 / 600 | Every measured value, every label, every button | evm0x.com sets its own text in Cascadia Code, so the shop's face comes first here too. Where it is not installed, JetBrains Mono is the closest match with tabular figures, which keep a live counter from jittering. This is a readout, not a terminal costume: there is no fake window, no prompt, no typed-out command. |
| Work Sans 400 | Sheet prose only | Long explanation needs a text face. It never appears in the play area, where every word is a label. |

**On the uppercase micro-labels** (R-06): `ROUND`, `PACKED`, `CAP`, `WORK UNITS` are set at
9–10px with 0.16em tracking. This is the one place tracking is deliberately wide, because
these labels sit under a scale where the eye needs them to read as a scale's engraving
rather than as prose. They are never more than three words, never a headline, and never
used to decorate a section that has no data under it.

## Layout

One composition held for the whole game: wordmark and controls on one line, the rule, the
chute, two actions, one flash line, one readout strip. The board is centred in whatever
height the viewport has left, so a tall screen gets air above and below the same block
instead of a void in the middle. The only break in the composition is a sheet, which covers
the screen because it is a different mode of attention.

Dials: **ENERGY 2 / RHYTHM 2 / MOTION 1**. Calm instrument, even spacing, almost no motion.

## Motion and elevation, and why

- **Shadow (R-12)**: exactly two elements carry one, the chute plate and a sheet card. Both
  are things that sit on top of the bench rather than in it. Nothing else floats.
- **Motion (R-19)**: three transitions exist and each answers a question. The fill width
  answers "how much of the round is gone", the burst clock answers "how long do I have", and
  the plate's press state answers "did that register". There is no entrance animation, no
  fade-up, no bounce, no confetti on a sealed round: the number is the reward.
- The clock is a `transform` on a single bar, so it runs on the compositor and never
  reflows the layout.

## What this refuses

- No wallet, no signature, no token, no purchase.
- No multiplier invented to make a tier feel rewarding. Holder status buys sight, and the
  copy says so in those words.
- No fake "live" claim: when the wheel is idle the chip says GHOST and the shift says it is
  a replay.
- No number on the page that a reader cannot recompute from the four expressions printed in
  HOW THIS WORKS.
