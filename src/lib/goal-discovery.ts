export type GoalDomain = "career" | "fitness" | "financial" | "education" | "general";

export function detectGoalDomain(input: {
  lifeArea: string;
  title: string;
  description: string;
}): GoalDomain {
  const source = `${input.lifeArea} ${input.title} ${input.description}`.toLowerCase();

  if (/(career|job|broker|employment|promotion|interview|role)/.test(source)) {
    return "career";
  }
  if (/(fitness|health|body|weight|fat|muscle|training|exercise|gym)/.test(source)) {
    return "fitness";
  }
  if (/(money|financial|savings|debt|income|invest|budget|deposit)/.test(source)) {
    return "financial";
  }
  if (/(study|education|exam|degree|course|qualification|learn)/.test(source)) {
    return "education";
  }
  return "general";
}

export function getDomainQuestions(domain: GoalDomain): string[] {
  switch (domain) {
    case "career":
      return [
        "Got it. Tell me a bit about your current work situation and background.",
        "Nice. What qualifications or certifications do you already have?",
        "Helpful context. Any experience that could be relevant here, even if indirect?",
        "Thanks. Where are you currently based, and are you open to relocating or hybrid work?",
        "Makes sense. Why does this career move matter to you right now?",
      ];
    case "fitness":
      return [
        "Great start. How would you describe your current fitness level right now?",
        "Thanks. What has your training or exercise looked like over the last 12 months?",
        "Good to know. Any injuries or health limitations we should plan around?",
        "Got it. How much time can you realistically train each week?",
        "Perfect. What equipment or training access do you have right now?",
      ];
    case "financial":
      return [
        "Thanks for sharing that. Where are your savings currently at for this goal?",
        "Helpful. How would you describe your income situation right now?",
        "Makes sense. What fixed monthly expenses do you need to cover?",
        "Got it. What financial commitments are already locked in?",
        "Great. How much could you realistically allocate to this goal each month?",
      ];
    case "education":
      return [
        "Good context. Where are you currently on this subject or qualification path?",
        "Thanks. What study history or past attempts have you had so far?",
        "Got it. How much time each week can you realistically commit to studying?",
        "Helpful. What's the exam or credential target, and how tight is the timeline?",
        "Final one here: what usually breaks your study consistency?",
      ];
    default:
      return [
        "Thanks. Where are you starting from with this goal today?",
        "Got it. What has worked (or not worked) for you in this area before?",
        "That helps. What's the biggest practical obstacle right now?",
        "Makes sense. How many hours per week can you commit reliably?",
        "Last one: what would meaningful progress look like in month one?",
      ];
  }
}
