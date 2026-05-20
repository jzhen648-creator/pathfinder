// Five circular life-domain icons.
// Each: thin stroke, single colour, transparent bg, scales to 48px cleanly.
// viewBox is normalized to 48; stroke-width tuned for visual consistency.

const Icon = ({ size = 48, color = "currentColor", stroke = 1.5, children, title }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label={title}
    role="img"
    style={{ display: "block" }}
  >
    {children}
  </svg>
);

// 1. CAREER — ladder inside circle. Two rails + three rungs.
const CareerIcon = ({ size, color = "#F5B544", stroke = 1.5 }) => (
  <Icon size={size} color={color} stroke={stroke} title="Career">
    <circle cx="24" cy="24" r="20" />
    <line x1="18" y1="11" x2="18" y2="37" />
    <line x1="30" y1="11" x2="30" y2="37" />
    <line x1="18" y1="17" x2="30" y2="17" />
    <line x1="18" y1="24" x2="30" y2="24" />
    <line x1="18" y1="31" x2="30" y2="31" />
  </Icon>
);

// 2. FINANCE — banknote inside circle. Generic note: rounded rect + centre disc + corner pips.
const FinanceIcon = ({ size, color = "#4FD1C5", stroke = 1.5 }) => (
  <Icon size={size} color={color} stroke={stroke} title="Finance">
    <circle cx="24" cy="24" r="20" />
    <rect x="11" y="17" width="26" height="14" rx="1.5" />
    <circle cx="24" cy="24" r="2.6" />
    <line x1="14.5" y1="20.5" x2="15.5" y2="20.5" />
    <line x1="32.5" y1="27.5" x2="33.5" y2="27.5" />
  </Icon>
);

// 3. INNER SELF — yin yang. Outer circle + S-curve + two dots.
// The S-curve is two stacked semicircles forming the divider.
const InnerIcon = ({ size, color = "#B07CFF", stroke = 1.5 }) => (
  <Icon size={size} color={color} stroke={stroke} title="Inner self">
    <circle cx="24" cy="24" r="20" />
    {/* S-curve divider: top arc bulges left, bottom arc bulges right */}
    <path d="M24 4 A10 10 0 0 0 24 24 A10 10 0 0 1 24 44" />
    {/* Filled accent dots */}
    <circle cx="24" cy="14" r="1.6" fill={color} stroke="none" />
    <circle cx="24" cy="34" r="1.6" fill={color} stroke="none" />
  </Icon>
);

// 4. RELATIONSHIPS — two simple figures (heads + shoulders) inside circle.
const RelationshipsIcon = ({ size, color = "#F472B6", stroke = 1.5 }) => (
  <Icon size={size} color={color} stroke={stroke} title="Relationships">
    <circle cx="24" cy="24" r="20" />
    {/* Left figure */}
    <circle cx="18" cy="19" r="3" />
    <path d="M12 33 C 12 28, 15 26, 18 26 C 21 26, 24 28, 24 33" />
    {/* Right figure */}
    <circle cx="30" cy="19" r="3" />
    <path d="M24 33 C 24 28, 27 26, 30 26 C 33 26, 36 28, 36 33" />
  </Icon>
);

// 5. HEALTH — ECG pulse line spanning circle.
const HealthIcon = ({ size, color = "#FF8A65", stroke = 1.5 }) => (
  <Icon size={size} color={color} stroke={stroke} title="Health">
    <circle cx="24" cy="24" r="20" />
    <path d="M9 24 L17 24 L19.5 19 L22 29 L25 17 L27.5 24 L39 24" />
  </Icon>
);

const ICONS = [
  { id: "career",        label: "Career",        hint: "ladder",       color: "#F5B544", Comp: CareerIcon },
  { id: "finance",       label: "Finance",       hint: "banknote",     color: "#4FD1C5", Comp: FinanceIcon },
  { id: "inner",         label: "Inner self",    hint: "yin yang",     color: "#B07CFF", Comp: InnerIcon },
  { id: "relationships", label: "Relationships", hint: "two figures",  color: "#F472B6", Comp: RelationshipsIcon },
  { id: "health",        label: "Health",        hint: "ECG pulse",    color: "#FF8A65", Comp: HealthIcon },
];

Object.assign(window, {
  Icon, CareerIcon, FinanceIcon, InnerIcon, RelationshipsIcon, HealthIcon, ICONS,
});
