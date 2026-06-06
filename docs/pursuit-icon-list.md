# Pathfinder — Pursuit Icon System

Centred semantic icon for each pursuit hexagon (a tooth for Invisalign, a runner for a marathon). Coverage is **not** driven by the length of this list — it's driven by letting the AI pick from the full installed Lucide set. This list is the **quality anchor**, not the vocabulary.

## How resolution works (two tiers)

1. **Preferred overrides** (this file) — exact/fuzzy concept match → use the named icon. Guarantees good picks for common pursuits and flags custom ones.
2. **AI free pick** — no override match → AI selects the single best icon from the **full installed `lucide-react-native` exports** (enumerated from node_modules, the source of truth for valid names).
3. **Theme icon fallback** — AI returns nothing valid → use the pursuit's theme icon.
4. **Generic fallback** — `sparkles`.

Notes:
- Icon pick is a **separate call at pursuit creation**, not part of per-message Stream extraction. The full name list may be included there since it fires once per pursuit.
- Names are **kebab-case**; component exports are **PascalCase** (`heart-pulse` → `HeartPulse`).
- ⚠️ = no Lucide match; exclude from import, falls back to theme icon until a custom icon is drawn.
- Any name below not found in the installed package degrades gracefully (→ AI pick → theme icon), so validate against node_modules rather than trusting this file blindly.

---

## Finance — Money & Finance

salary / main income → banknote
side income / freelance → coins
passive income → coins
dividends → trending-up
pay rise → trending-up
savings → piggy-bank
savings goal / specific purchase → target
investing / portfolio → chart-candlestick
long-term / index investing → chart-line
day trading / stocks → chart-no-axes-combined
crypto → bitcoin
property / real estate → house
buy a home → key
sell a home → house
pension / retirement → umbrella
emergency fund → shield-check
net worth → wallet
budgeting → calculator
cut spending / frugality → scissors
bills / subscriptions → receipt
credit score → gauge
pay off debt → credit-card
loan / mortgage → landmark
tax → receipt
insurance → shield
charity / giving / tithing → hand-heart
inheritance / estate → scroll
financial independence → gem

## Work — Work & Career

career / job → briefcase
promotion → award
job search → search
cv / resume → file-text
performance review → clipboard-check
networking → handshake
change career / pivot → route
quit job → door-open
sabbatical / time off → palm-tree
retire → umbrella
learn a skill → graduation-cap
course / study → book-open
get a degree / university → graduation-cap
research / phd → microscope
teaching / mentoring others → presentation
coding / software → code
data / analytics → chart-bar
ai / ml skill → brain-circuit
design → pen-tool
writing (professional) → pen-line
write a book → book
public speaking → mic
conference talk → presentation
languages → languages
certification → badge-check
start a business → store
launch a product → rocket
side project → lightbulb
consulting / freelancing → laptop
sales → trending-up
negotiation → handshake
marketing / growth → megaphone
build an audience / personal brand → megaphone
blogging → rss
podcasting → mic
youtube channel → video
leadership / management → users
hire / build a team → user-plus
project management → kanban
build a portfolio → folder
find a mentor → user-check

## Health — Health & Body

### Movement
gym / strength training → dumbbell
gain muscle → dumbbell
lose weight → scale
cycling → bike
swimming → waves
hiking → mountain
walking / steps → footprints
climbing / bouldering → mountain
martial arts / boxing → ⚠️ (no good match → theme)
tennis → ⚠️
golf → flag
football / soccer → ⚠️
basketball → ⚠️
skiing / snowboarding → ⚠️
surfing → waves
rowing → ⚠️
sports (general) → trophy
running / marathon → ⚠️ runner figure
triathlon → ⚠️
yoga → ⚠️ yoga pose
pilates → ⚠️
stretching / mobility → ⚠️
posture → ⚠️

### Nutrition
healthy eating / diet → salad
cut sugar → candy-off
vegan / vegetarian → leaf
cook more → cooking-pot
meal prep → utensils
intermittent fasting → clock
hydration → droplet
nutrition tracking → apple
supplements / vitamins → pill
gut health → ⚠️

### Appearance
teeth / invisalign / dental → ⚠️ tooth
skincare → sparkles
haircut / hair → scissors
style / wardrobe → shirt
glasses / eyewear → glasses
tattoo → ⚠️
weight goal → scale

### Rest & Recovery
sleep / rest → moon
sleep routine → bed
recovery → battery-charging
reduce stress → heart-pulse
breathing → wind
sauna / cold plunge → ⚠️
quit caffeine → coffee
digital detox / screen time → smartphone

### Medical
doctor / checkup → stethoscope
dentist appointment → ⚠️ tooth
manage a condition → activity
medication → pill
physiotherapy → ⚠️
mental health → brain
quit smoking → cigarette-off
sobriety / quit drinking → wine-off
eye exam → eye
blood test / labs → test-tube
surgery / recovery → bandage

## People — People & Relationships

family → users
have a baby / pregnancy → baby
parenting / kids → baby
romance / dating → heart
find a partner → heart
relationship → heart-handshake
engagement → ⚠️ rings
marriage / wedding → ⚠️ rings
move in together → home
long-distance → map-pin
repair a relationship → heart-handshake
divorce / separation → ⚠️
set boundaries → shield
friendships → users-round
make new friends → user-plus
reconnect with someone → message-circle
quality time → coffee
elderly parents / caregiving → hand-heart
siblings / extended family → users
dog → dog
cat → cat
pets (general) → paw-print
community / belonging → users
join a club → users-round
give back / community service → hand-heart
host / entertain → party-popper

## Becoming — Who I'm Becoming

purpose / direction → compass
life vision → telescope
spirituality / faith → church
prayer → ⚠️
therapy / inner work → brain
journaling → notebook-pen
meditation / mindfulness → ⚠️ lotus
personal growth → sprout
self-discipline → target
build habits → repeat
productivity → check-check
gratitude → heart
confidence / self-esteem → star
overcome a fear → shield
manage anxiety → wind
self-compassion → hand-heart
joy / fun → smile
creativity → palette
values / integrity → anchor
find calm → wind
slow down / presence → leaf
bucket list → list-checks
legacy → landmark

## Pleasures — *(NOT in schema v6 — exclude unless a migration adds the theme)*

reading → book-open
music (listening) → music
instrument / guitar / piano → guitar
singing → mic
photography → camera
film / tv → clapperboard
gaming → gamepad-2
board games / chess → dices
puzzles → puzzle
travel → plane
explore / road trips → map
camping → tent
fishing → fish
sailing / boating → sailboat
scuba diving → ⚠️
astronomy / stargazing → telescope
birdwatching → bird
gardening / plants → flower-2
art / painting → brush
drawing → pencil
pottery / ceramics → ⚠️
knitting / sewing / crafts → ⚠️
woodworking / diy → hammer
baking → cake-slice
cooking (hobby) → chef-hat
wine / whisky → wine
coffee / cafés → coffee
nature / outdoors → trees
creative writing → feather
calligraphy → pen-tool
collecting → ⚠️
dancing → ⚠️
volunteering → hand-heart

## Life & Admin — *(cross-cutting; map to the most relevant existing theme)*

move house / relocate → truck
move abroad / emigrate → plane
renovate home → hammer
home improvement → wrench
declutter / minimalism → archive
organize / cleaning → broom
buy a car → car
sell a car → car
learn to drive → car
driving license → id-card
passport → book-marked
visa / citizenship → stamp
legal / will → scroll
plan an event / party → party-popper
plan a wedding → calendar-heart
plan a trip → map
adopt a pet → paw-print

---

## Custom icon commission list (the ⚠️ items)

Only these need designing. Match Lucide: 24×24, 2px stroke, round caps/joins, no fill.

**High priority (common):**
1. Tooth / dental
2. Runner / marathon
3. Yoga pose
4. Meditation / lotus
5. Stretching
6. Wedding rings

**Lower priority (grow as needed):**
7. Dancing
8. Specific sports — boxing/martial arts, tennis, basketball, football/soccer, skiing, rowing
9. Crafts — knitting/sewing, pottery
10. Misc — scuba, sauna/cold plunge

Until each exists, those pursuits fall back to the theme icon.

## Resolution order (give this to Cursor)

1. Preferred override match (this file) → use it
2. else AI picks best name from full installed Lucide set
3. else pursuit's theme icon
4. else `sparkles`
