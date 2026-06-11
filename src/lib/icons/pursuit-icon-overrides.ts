/** Preferred concept→icon overrides — parsed from docs/pursuit-icon-list.md */
export type PursuitIconOverride = {
  concepts: readonly string[];
  iconSlug: string | null;
  section: string;
};

/** Case-insensitive substring match against pursuit title/description. */
export const PURSUIT_ICON_PREFERRED_OVERRIDES: readonly PursuitIconOverride[] = [
  {
    "concepts": [
      "salary",
      "main income"
    ],
    "iconSlug": "banknote",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "side income",
      "freelance"
    ],
    "iconSlug": "coins",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "passive income"
    ],
    "iconSlug": "coins",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "dividends"
    ],
    "iconSlug": "trending-up",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "pay rise"
    ],
    "iconSlug": "trending-up",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "savings"
    ],
    "iconSlug": "piggy-bank",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "savings goal",
      "specific purchase"
    ],
    "iconSlug": "target",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "investing",
      "portfolio"
    ],
    "iconSlug": "chart-candlestick",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "long-term",
      "index investing"
    ],
    "iconSlug": "chart-line",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "day trading",
      "stocks"
    ],
    "iconSlug": "chart-no-axes-combined",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "crypto"
    ],
    "iconSlug": "bitcoin",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "property",
      "real estate"
    ],
    "iconSlug": "house",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "buy a home"
    ],
    "iconSlug": "key",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "sell a home"
    ],
    "iconSlug": "house",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "pension",
      "retirement"
    ],
    "iconSlug": "umbrella",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "emergency fund"
    ],
    "iconSlug": "shield-check",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "net worth"
    ],
    "iconSlug": "wallet",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "budgeting"
    ],
    "iconSlug": "calculator",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "cut spending",
      "frugality"
    ],
    "iconSlug": "scissors",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "bills",
      "subscriptions"
    ],
    "iconSlug": "receipt",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "credit score"
    ],
    "iconSlug": "gauge",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "pay off debt"
    ],
    "iconSlug": "credit-card",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "loan",
      "mortgage"
    ],
    "iconSlug": "landmark",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "tax"
    ],
    "iconSlug": "receipt",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "insurance"
    ],
    "iconSlug": "shield",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "charity",
      "giving",
      "tithing"
    ],
    "iconSlug": "hand-heart",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "inheritance",
      "estate"
    ],
    "iconSlug": "scroll",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "financial independence"
    ],
    "iconSlug": "gem",
    "section": "Finance — Money & Finance"
  },
  {
    "concepts": [
      "career",
      "job"
    ],
    "iconSlug": "briefcase",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "promotion"
    ],
    "iconSlug": "award",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "job search"
    ],
    "iconSlug": "search",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "cv",
      "resume"
    ],
    "iconSlug": "file-text",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "performance review"
    ],
    "iconSlug": "clipboard-check",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "networking"
    ],
    "iconSlug": "handshake",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "change career",
      "pivot"
    ],
    "iconSlug": "route",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "quit job"
    ],
    "iconSlug": "door-open",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "sabbatical",
      "time off"
    ],
    "iconSlug": "tree-palm",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "retire"
    ],
    "iconSlug": "umbrella",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "learn a skill"
    ],
    "iconSlug": "graduation-cap",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "course",
      "study"
    ],
    "iconSlug": "book-open",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "get a degree",
      "university"
    ],
    "iconSlug": "graduation-cap",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "research",
      "phd"
    ],
    "iconSlug": "microscope",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "teaching",
      "mentoring others"
    ],
    "iconSlug": "presentation",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "coding",
      "software"
    ],
    "iconSlug": "code",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "data",
      "analytics"
    ],
    "iconSlug": "chart-bar",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "ai",
      "ml skill"
    ],
    "iconSlug": "brain-circuit",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "design"
    ],
    "iconSlug": "pen-tool",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "writing (professional)"
    ],
    "iconSlug": "pen-line",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "write a book"
    ],
    "iconSlug": "book",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "public speaking"
    ],
    "iconSlug": "mic",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "conference talk"
    ],
    "iconSlug": "presentation",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "languages"
    ],
    "iconSlug": "languages",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "certification"
    ],
    "iconSlug": "badge-check",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "start a business"
    ],
    "iconSlug": "store",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "launch a product"
    ],
    "iconSlug": "rocket",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "side project"
    ],
    "iconSlug": "lightbulb",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "consulting",
      "freelancing"
    ],
    "iconSlug": "laptop",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "sales"
    ],
    "iconSlug": "trending-up",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "negotiation"
    ],
    "iconSlug": "handshake",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "marketing",
      "growth"
    ],
    "iconSlug": "megaphone",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "build an audience",
      "personal brand"
    ],
    "iconSlug": "megaphone",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "blogging"
    ],
    "iconSlug": "rss",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "podcasting"
    ],
    "iconSlug": "mic",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "youtube channel"
    ],
    "iconSlug": "video",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "leadership",
      "management"
    ],
    "iconSlug": "users",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "hire",
      "build a team"
    ],
    "iconSlug": "user-plus",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "project management"
    ],
    "iconSlug": "kanban",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "build a portfolio"
    ],
    "iconSlug": "folder",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "find a mentor"
    ],
    "iconSlug": "user-check",
    "section": "Work — Work & Career"
  },
  {
    "concepts": [
      "gym",
      "strength training"
    ],
    "iconSlug": "dumbbell",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "gain muscle"
    ],
    "iconSlug": "biceps-flexed",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "lose weight"
    ],
    "iconSlug": "scale",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "cycling"
    ],
    "iconSlug": "bike",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "swimming"
    ],
    "iconSlug": "waves-ladder",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "hiking"
    ],
    "iconSlug": "mountain",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "walking",
      "steps"
    ],
    "iconSlug": "footprints",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "climbing",
      "bouldering"
    ],
    "iconSlug": "mountain",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "martial arts",
      "boxing"
    ],
    "iconSlug": "sword",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "tennis"
    ],
    "iconSlug": "volleyball",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "golf"
    ],
    "iconSlug": "flag",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "football",
      "soccer"
    ],
    "iconSlug": "volleyball",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "basketball"
    ],
    "iconSlug": "volleyball",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "skiing",
      "snowboarding"
    ],
    "iconSlug": "snowflake",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "surfing"
    ],
    "iconSlug": "waves-ladder",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "rowing"
    ],
    "iconSlug": "ship",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "sports (general)"
    ],
    "iconSlug": "trophy",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "running",
      "marathon"
    ],
    "iconSlug": "person-standing",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "triathlon"
    ],
    "iconSlug": "medal",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "yoga"
    ],
    "iconSlug": "stretch-vertical",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "pilates"
    ],
    "iconSlug": "stretch-vertical",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "stretching",
      "mobility"
    ],
    "iconSlug": "stretch-horizontal",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "posture"
    ],
    "iconSlug": "accessibility",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "healthy eating",
      "diet"
    ],
    "iconSlug": "salad",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "cut sugar"
    ],
    "iconSlug": "candy-off",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "vegan",
      "vegetarian"
    ],
    "iconSlug": "leaf",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "cook more"
    ],
    "iconSlug": "cooking-pot",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "meal prep"
    ],
    "iconSlug": "utensils",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "intermittent fasting"
    ],
    "iconSlug": "clock",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "hydration"
    ],
    "iconSlug": "droplet",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "nutrition tracking"
    ],
    "iconSlug": "apple",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "supplements",
      "vitamins"
    ],
    "iconSlug": "pill",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "gut health"
    ],
    "iconSlug": "pill-bottle",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "teeth",
      "invisalign",
      "dental"
    ],
    "iconSlug": "smile",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "skincare"
    ],
    "iconSlug": "sparkles",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "haircut",
      "hair"
    ],
    "iconSlug": "scissors",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "style",
      "wardrobe"
    ],
    "iconSlug": "shirt",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "glasses",
      "eyewear"
    ],
    "iconSlug": "glasses",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "tattoo"
    ],
    "iconSlug": "pen-tool",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "weight goal"
    ],
    "iconSlug": "scale",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "sleep",
      "rest"
    ],
    "iconSlug": "moon",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "sleep routine"
    ],
    "iconSlug": "bed",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "recovery"
    ],
    "iconSlug": "battery-charging",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "reduce stress"
    ],
    "iconSlug": "heart-pulse",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "breathing"
    ],
    "iconSlug": "wind",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "sauna",
      "cold plunge"
    ],
    "iconSlug": "shower-head",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "quit caffeine"
    ],
    "iconSlug": "coffee",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "digital detox",
      "screen time"
    ],
    "iconSlug": "smartphone",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "doctor",
      "checkup"
    ],
    "iconSlug": "stethoscope",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "dentist appointment"
    ],
    "iconSlug": "smile",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "manage a condition"
    ],
    "iconSlug": "activity",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "medication"
    ],
    "iconSlug": "pill",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "physiotherapy"
    ],
    "iconSlug": "accessibility",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "mental health"
    ],
    "iconSlug": "brain",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "quit smoking"
    ],
    "iconSlug": "cigarette-off",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "sobriety",
      "quit drinking"
    ],
    "iconSlug": "wine-off",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "eye exam"
    ],
    "iconSlug": "eye",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "blood test",
      "labs"
    ],
    "iconSlug": "test-tube",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "surgery",
      "recovery"
    ],
    "iconSlug": "bandage",
    "section": "Health — Health & Body"
  },
  {
    "concepts": [
      "family"
    ],
    "iconSlug": "users",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "have a baby",
      "pregnancy"
    ],
    "iconSlug": "baby",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "parenting",
      "kids"
    ],
    "iconSlug": "baby",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "romance",
      "dating"
    ],
    "iconSlug": "heart",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "find a partner"
    ],
    "iconSlug": "heart",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "relationship"
    ],
    "iconSlug": "heart-handshake",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "engagement"
    ],
    "iconSlug": "gem",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "marriage",
      "wedding"
    ],
    "iconSlug": "heart-handshake",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "move in together"
    ],
    "iconSlug": "house",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "long-distance"
    ],
    "iconSlug": "map-pin",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "repair a relationship"
    ],
    "iconSlug": "heart-handshake",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "divorce",
      "separation"
    ],
    "iconSlug": "heart-crack",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "set boundaries"
    ],
    "iconSlug": "shield",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "friendships"
    ],
    "iconSlug": "users-round",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "make new friends"
    ],
    "iconSlug": "user-plus",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "reconnect with someone"
    ],
    "iconSlug": "message-circle",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "quality time"
    ],
    "iconSlug": "coffee",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "elderly parents",
      "caregiving"
    ],
    "iconSlug": "hand-heart",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "siblings",
      "extended family"
    ],
    "iconSlug": "users",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "dog"
    ],
    "iconSlug": "dog",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "cat"
    ],
    "iconSlug": "cat",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "pets (general)"
    ],
    "iconSlug": "paw-print",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "community",
      "belonging"
    ],
    "iconSlug": "users",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "join a club"
    ],
    "iconSlug": "users-round",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "give back",
      "community service"
    ],
    "iconSlug": "hand-heart",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "host",
      "entertain"
    ],
    "iconSlug": "party-popper",
    "section": "People — People & Relationships"
  },
  {
    "concepts": [
      "purpose",
      "direction"
    ],
    "iconSlug": "compass",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "life vision"
    ],
    "iconSlug": "telescope",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "spirituality",
      "faith"
    ],
    "iconSlug": "church",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "prayer"
    ],
    "iconSlug": "cross",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "therapy",
      "inner work"
    ],
    "iconSlug": "brain",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "journaling"
    ],
    "iconSlug": "notebook-pen",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "meditation",
      "mindfulness"
    ],
    "iconSlug": "sun-medium",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "personal growth"
    ],
    "iconSlug": "sprout",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "self-discipline"
    ],
    "iconSlug": "target",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "build habits"
    ],
    "iconSlug": "repeat",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "productivity"
    ],
    "iconSlug": "check-check",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "gratitude"
    ],
    "iconSlug": "heart",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "confidence",
      "self-esteem"
    ],
    "iconSlug": "star",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "overcome a fear"
    ],
    "iconSlug": "shield",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "manage anxiety"
    ],
    "iconSlug": "wind",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "self-compassion"
    ],
    "iconSlug": "hand-heart",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "joy",
      "fun"
    ],
    "iconSlug": "smile",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "creativity"
    ],
    "iconSlug": "palette",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "values",
      "integrity"
    ],
    "iconSlug": "anchor",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "find calm"
    ],
    "iconSlug": "wind",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "slow down",
      "presence"
    ],
    "iconSlug": "leaf",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "bucket list"
    ],
    "iconSlug": "list-checks",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "legacy"
    ],
    "iconSlug": "landmark",
    "section": "Becoming — Who I'm Becoming"
  },
  {
    "concepts": [
      "reading"
    ],
    "iconSlug": "book-open",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "music (listening)"
    ],
    "iconSlug": "music",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "instrument",
      "guitar",
      "piano"
    ],
    "iconSlug": "guitar",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "singing"
    ],
    "iconSlug": "mic",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "photography"
    ],
    "iconSlug": "camera",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "film",
      "tv"
    ],
    "iconSlug": "clapperboard",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "gaming"
    ],
    "iconSlug": "gamepad-2",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "board games",
      "chess"
    ],
    "iconSlug": "dices",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "puzzles"
    ],
    "iconSlug": "puzzle",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "travel"
    ],
    "iconSlug": "plane",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "explore",
      "road trips"
    ],
    "iconSlug": "map",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "camping"
    ],
    "iconSlug": "tent",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "fishing"
    ],
    "iconSlug": "fish",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "sailing",
      "boating"
    ],
    "iconSlug": "sailboat",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "scuba diving"
    ],
    "iconSlug": "fish",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "astronomy",
      "stargazing"
    ],
    "iconSlug": "telescope",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "birdwatching"
    ],
    "iconSlug": "bird",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "gardening",
      "plants"
    ],
    "iconSlug": "flower-2",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "art",
      "painting"
    ],
    "iconSlug": "brush",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "drawing"
    ],
    "iconSlug": "pencil",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "pottery",
      "ceramics"
    ],
    "iconSlug": "anvil",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "knitting",
      "sewing",
      "crafts"
    ],
    "iconSlug": "package-2",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "woodworking",
      "diy"
    ],
    "iconSlug": "hammer",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "baking"
    ],
    "iconSlug": "cake-slice",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "cooking (hobby)"
    ],
    "iconSlug": "chef-hat",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "wine",
      "whisky"
    ],
    "iconSlug": "wine",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "coffee",
      "cafés"
    ],
    "iconSlug": "coffee",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "nature",
      "outdoors"
    ],
    "iconSlug": "trees",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "creative writing"
    ],
    "iconSlug": "feather",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "calligraphy"
    ],
    "iconSlug": "pen-tool",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "collecting"
    ],
    "iconSlug": "package-2",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "dancing"
    ],
    "iconSlug": "hand-metal",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "volunteering"
    ],
    "iconSlug": "hand-heart",
    "section": "Play & Leisure — Play & Leisure theme (pleasures)"
  },
  {
    "concepts": [
      "move house",
      "relocate"
    ],
    "iconSlug": "truck",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "move abroad",
      "emigrate"
    ],
    "iconSlug": "plane",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "renovate home"
    ],
    "iconSlug": "hammer",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "home improvement"
    ],
    "iconSlug": "wrench",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "declutter",
      "minimalism"
    ],
    "iconSlug": "archive",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "organize",
      "cleaning"
    ],
    "iconSlug": "brush-cleaning",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "buy a car"
    ],
    "iconSlug": "car",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "sell a car"
    ],
    "iconSlug": "car",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "learn to drive"
    ],
    "iconSlug": "car",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "driving license"
    ],
    "iconSlug": "id-card",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "passport"
    ],
    "iconSlug": "book-marked",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "visa",
      "citizenship"
    ],
    "iconSlug": "stamp",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "legal",
      "will"
    ],
    "iconSlug": "scroll",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "plan an event",
      "party"
    ],
    "iconSlug": "party-popper",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "plan a wedding"
    ],
    "iconSlug": "calendar-heart",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "plan a trip"
    ],
    "iconSlug": "map",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  },
  {
    "concepts": [
      "adopt a pet"
    ],
    "iconSlug": "paw-print",
    "section": "Life & Admin — *(cross-cutting; map to the most relevant existing theme)*"
  }
] as const;
