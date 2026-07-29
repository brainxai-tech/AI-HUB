export const SCENARIOS = [
  {
    id: "interview",
    title: "Interview Room",
    titleZh: "面试剧场",
    role: "Hiring manager",
    userRole: "Candidate",
    goal: "Answer behavioral and role-fit questions with clear, confident English.",
    setting: "A focused 20-minute interview for a product or operations role.",
    opening:
      "Hi, thanks for joining today. To begin, could you tell me about yourself and why this role interests you?",
    beats: [
      "Warm introduction",
      "Behavioral question using STAR",
      "Follow-up challenge",
      "Candidate questions"
    ],
    starters: [
      "Tell me about a time you solved a difficult problem.",
      "What would your previous teammates say is your biggest strength?",
      "Why are you interested in this position?"
    ],
    rubric: [
      "Structured answers",
      "Professional vocabulary",
      "Concrete examples",
      "Confidence and clarity"
    ]
  },
  {
    id: "travel",
    title: "Travel Desk",
    titleZh: "旅行剧场",
    role: "Hotel front desk agent",
    userRole: "Traveler",
    goal: "Handle practical travel situations politely and efficiently.",
    setting: "A hotel check-in desk after a long flight, with a booking issue to resolve.",
    opening:
      "Good evening. Welcome to Harbor Hotel. May I have your name and booking confirmation, please?",
    beats: [
      "Check-in request",
      "Problem clarification",
      "Polite negotiation",
      "Resolution and next steps"
    ],
    starters: [
      "I have a reservation under Michael Song.",
      "Could you help me change my room?",
      "I think there may be a mistake with my booking."
    ],
    rubric: [
      "Useful travel phrases",
      "Politeness",
      "Question asking",
      "Problem solving"
    ]
  },
  {
    id: "negotiation",
    title: "Deal Table",
    titleZh: "商务谈判剧场",
    role: "Procurement manager",
    userRole: "Sales lead",
    goal: "Negotiate price, delivery, and contract terms with firm but respectful English.",
    setting: "A supplier meeting where the buyer wants a discount and shorter delivery time.",
    opening:
      "Thanks for the proposal. Your price is higher than our budget, and the delivery date feels too late. What flexibility do you have?",
    beats: [
      "Opening position",
      "Trade-off discussion",
      "Counteroffer",
      "Agreement summary"
    ],
    starters: [
      "I understand the budget concern. Let me explain what is included.",
      "We may be able to adjust the timeline if we align on scope.",
      "Could we discuss a volume-based discount?"
    ],
    rubric: [
      "Persuasive logic",
      "Diplomatic language",
      "Clear concessions",
      "Commercial vocabulary"
    ]
  },
  {
    id: "campus",
    title: "Campus Lounge",
    titleZh: "校园社交剧场",
    role: "Classmate",
    userRole: "New student",
    goal: "Start natural conversations, join activities, and build friendly rapport.",
    setting: "A campus lounge before a club event, where students are chatting casually.",
    opening:
      "Hey, I don't think we've met before. Are you here for the club meetup too?",
    beats: [
      "Icebreaker",
      "Shared interest",
      "Invitation",
      "Follow-up plan"
    ],
    starters: [
      "Yeah, I'm new here and wanted to check it out.",
      "What kind of activities does this club usually do?",
      "I'm still getting used to campus life."
    ],
    rubric: [
      "Natural tone",
      "Turn-taking",
      "Cultural fit",
      "Friendly follow-up"
    ]
  }
];

export const LEVELS = ["A2", "B1", "B2", "C1"];
export const TONES = ["supportive", "realistic", "challenging"];

export function getScenario(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function listScenarioSummaries() {
  return SCENARIOS.map(({ id, title, titleZh, role, userRole, goal, opening, rubric }) => ({
    id,
    title,
    titleZh,
    role,
    userRole,
    goal,
    opening,
    rubric
  }));
}
