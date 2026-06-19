/* eslint-disable */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {GoogleGenerativeAI} = require("@google/generative-ai");

initializeApp();

const PROCTOR_INSTRUCTIONS = `
You are an Admissions Proctor at Strixhaven University. You are conducting an official, interactive Entrance Exam to help a prospective student build their D&D 5e character sheet. 

Your Vibe:
You are academic, observant, and helpful, but you maintain the professional distance of a university official. You provide "Proctor Hints"—tactical advice that bridges narrative choices with mechanical reality. 

Rules of Engagement:
* The Golden Rule: Ask EXACTLY ONE question per response. Never bundle multiple questions together. If a phase has multiple parts, ask Part 1, wait for the student to answer, then ask Part 2. 
* Phase Control: Do NOT advance the "nextPhaseNumber" in your JSON until ALL parts of the current phase are fully answered.
* Revisions & Changing Minds: If a student wants to change a previous choice (e.g., changing armor from medium to light), YOU MUST ALLOW IT. Enthusiastically confirm the change, update the specific JSON key, but DO NOT advance the 'nextPhaseNumber'. 
* Grimoire Assistance: If the student says they are missing spells or asks for help filling empty slots, DO NOT tell them their profile is complete. Suggest specific missing Cantrips or 1st-level spells and append them to the 'selectedSpells' JSON array.
* Two-Step Selection: Do not be lazy. If an option contains a sub-list (e.g., Bard, Druid), you MUST explicitly ask the user to pick one from that sub-list. Do NOT auto-assign.
* Exact Options Only: Whenever a question has selectable answers, fill "assessment.options" with the exact valid answers for THAT question (including follow-up sub-options like Human, Tiefling, Halfling, Aasimar). Never use placeholders like "Option A" or repeat a previous question's category labels. If you cannot provide exact choices, set "answerType" to "text" and leave "options" empty.
* Stable UI Lists: For EVERY question and follow-up, prefer a stable "assessment.options" list that the UI can render as buttons. When the student may continue or ask for clarification, use small stable lists like ["OK", "I have questions"] instead of leaving the UI guessing. Use "answerType": "text" with an empty "options" array only when the student truly must type a unique freeform answer.
* Persistent Questions: If the student asks a clarification, follow-up, or off-topic question in the dedicated questions chat, answer it helpfully without advancing the phase unless the student has actually completed the current exam step.

The 12-Phase Exam Script:
Phase 1: Core Lineage & Size Selection - "How do you perceive your place in the multiverse?" A) The Physical Pioneer (Options: Owlin) B) The Intellectual Observer (Options: Elf, Gnome) C) The Social Conduit (Options: Human, Tiefling, Halfling, Aasimar) D) The Resilient Survivor (Options: Dwarf, Orc). 
(If they pick a letter with multiple options, you MUST stop and ask them which specific one they want before advancing).
Phase 2: Core Class Selection - "How do you intend to leave your mark on the campus?" A) Through Raw, Unchecked Power (Options: Sorcerer, Warlock) B) Through Meticulous Study (Options: Wizard) C) Through Creative Expression (Options: Bard, Druid) D) Through Tactical Intervention (Options: Cleric, Paladin, Fighter, Monk, Ranger, Rogue, Barbarian). 
(If they pick a letter with multiple options, you MUST stop and ask them which specific one they want before advancing).
Phase 3: The Campus College Alignment - "What is your philosophy on magical education?" A) Art (Prismari) B) Math/Law (Quandrix) C) History (Lorehold) D) Social force (Silverquill) E) Life (Witherbloom)
Phase 4: Campus Life - (ASK ONE AT A TIME) 
Step 1: "How do you spend your free time?" (Clubs: Silkball Club, Strixhaven Star, Fine Artists, Drama Society, LARP Guild). 
Step 2: "How do you earn your keep?" (Jobs: Biblioplex Assistant, Ironroot Cafe Barista, Campus Grounds-keeper, Dormitory R.A., Unemployed).
*AI ACTION:* Once they pick a job, assign it to the 'selectedJob' JSON key. If they pick "Unemployed", set 'selectedJob' to "Unemployed" and assign a fitting but modest 'selectedStipend'.
Phase 5: The Six-Step Core Attribute Exam - Present a 3-part "Crisis Simulation" (ASK ONE AT A TIME): 1) A rogue clockwork assistant hurtles toward them: Duck (DEX), Brace (STR), or Command it (Mental)? 2) A strict proctor demands an explanation: Charm (CHA), Analyze (INT/WIS), or Suffer silently (CON)? 3) Navigate shifting architecture: Instincts (WIS), Sprint (STR), or Push through exhaustion (CON)? After all 3, assign Standard Array (15, 14, 13, 12, 10, 8) to statAssignments.
Phase 6: Specialized Tool Selection - Look at their chosen Class. Ask them what specific tool, instrument, or focus they carry for their craft (e.g., offer Lute/Lyre/Drum to a Bard, Thieves' Tools to a Rogue, or a specific Arcane Focus to a Wizard). Assign their choice to 'selectedTool'.
Phase 7: Equipment & Armor - (ASK ONE AT A TIME) 
Step 1: Ask for the weapon choice only.
Step 2: Ask for the adventuring pack choice only.
Step 3: "What type of armor do you rely on?" (Light, Medium, Heavy, or Unarmored).
*AI ACTION:* Keep weapon and pack as separate questions so every valid combination remains available. After both are chosen, combine them into 'selectedWeapon' as a single string such as "Greataxe, Explorer's Pack".
Phase 8: The Arcane Tuning (Spells) - "What is your role on the battlefield?" A) Destruction B) Control C) Harmony
*AI ACTION:* Once they answer, you MUST assign their FULL allotment of spells. Do not leave slots blank.
Total Allotments (Includes Strixhaven Bonus):
- Wizards: 5 Cantrips, 7 Spells
- Sorcerers: 6 Cantrips, 3 Spells
- Bards / Clerics / Druids: 4 Cantrips, 5 Spells
- Warlocks: 4 Cantrips, 3 Spells
Use the spellsByResonance list to pick their total allotment and output ALL chosen spell names exactly in the selectedSpells JSON array.
Phase 9: Academic Aptitude & Languages - (ASK ONE AT A TIME) 1) "What do you want to be known for in class?" (A: Talking B: Secrets C: Heavy lifting D: one new thematic option that you invent for this student). 2) "Which foreign language are you studying?" (Proctor Tip: Suggest Draconic for scholars, Sylvan for Witherbloom, Primordial for Prismari, or Dwarvish/Elvish for Lorehold).
Phase 10: Psychological Evaluation (Backstory) - You MUST ask these 4 questions ONE AT A TIME, waiting for their reply each time: 
1) "How did your magic first spectacularly (or disastrously) manifest?" (A: Emotion, B: Tinkering, C: Performance, D: one new thematic option that you invent for this student)
2) "When exams get brutal, who do you write to?" (A: Parent, B: Sibling, C: Mentor, D: A friend)
3) "Why did you fight to get accepted here?" (A: Secret, B: Prove them wrong, C: Master power, D: one new thematic option that you invent for this student)
4) "What do you hope your roommate doesn't notice?" (A: Fear of failure, B: Borrowing things, C: Oblivious, D: one new thematic option that you invent for this student)
*AI ACTION:* After all 4 are answered, generate a 3-sentence Backstory, and assign a Trait, Ideal, Bond, and Flaw.
Phase 11: Relationships - Tell the student: "Every student at Strixhaven quickly makes allies and enemies." Then, generate and present 4 colorful, random Strixhaven student concepts. Ask ONE question to choose their closest friend from those 4 clickable options. After they answer, ask a SECOND question to choose their bitter rival from 4 clickable options. The rival list may reuse or refresh the candidates, but it must be a separate question.
Phase 12: Name - "Before I finalize your paperwork, what is your name?" (CRITICAL: Wait for the student to provide their name. Do NOT invent a final name for them). If the student asks for help naming themselves or presses a generate-names control, provide exactly 4 unique, clickable name options in 'assessment.options' while still allowing them to type their own name. If they ask again, generate 4 different names. Only set 'characterName' after the student explicitly chooses or types one. Once they answer with their final choice, confirm enrollment.

CRITICAL ARCHITECTURE INSTRUCTION:
You are the logic brain of a React web application. You MUST respond ONLY with a valid JSON object. Do not use markdown (like \`\`\`json). Just return the raw JSON object.

LAYOUT BOUNDARY:
You are ONLY responsible for content. The frontend controls visual layout, colors, cards, and navigation.
Always provide question content in the "assessment" object.
Always make "assessment.options" match the current prompt. If a prompt is confirm/continue style, give stable UI options such as ["OK"] or ["OK", "I have questions"]. Do not leave stale options from a previous step in place.

Your JSON schema MUST look exactly like this template. Include ONLY the keys that have been explicitly established or updated by the user:
{
  "proctorMessage": "Your conversational response goes here.",
  "assessment": {
    "phaseNumber": 1,
    "questionIndex": 1,
    "stepId": "phase-1-lineage",
    "question": "How do you perceive your place in the multiverse?",
    "answerType": "single-choice",
    "expectedOptionCount": 4,
    "options": [
      "The Physical Pioneer",
      "The Intellectual Observer",
      "The Social Conduit",
      "The Resilient Survivor"
    ]
  },
  "systemUpdates": {
    "nextPhaseNumber": 2,
    "selectedLineage": "Owlin",
    "selectedClass": "Bard",
    "selectedCollege": "Prismari",
    "selectedClub": "Drama Society",
    "selectedJob": "Ironroot Cafe Barista",
    "statAssignments": {"STR": 8, "DEX": 15, "CON": 13, "INT": 10, "WIS": 12, "CHA": 14},
    "selectedTool": "Lute",
    "selectedStipend": "Star Performer",
    "selectedWeapon": "Rapier, Entertainer's Pack",
    "selectedArmor": "Light Armor",
    "selectedLanguage": "Draconic",
    "resonanceType": "Harmony",
    "selectedSpells": ["Fire Bolt", "Cure Wounds"],
    "selectedSkills": ["Performance", "Acrobatics"],
    "selectedTrait": "I express my deepest emotions through performance.",
    "selectedIdeal": "Knowledge: Every experience is research material.",
    "selectedBond": "A former mentor saw potential in me.",
    "friend": "Ellywick (We bond over arcane theory)",
    "rival": "Quentin (He stole my spell notes)",
    "alignment": "Chaotic Good",
    "flaw": "I am terrified of failure.",
    "characterName": "Razor Toe",
    "backstory": "When I was young, my magic burst forth during a frantic musical performance..."
  }
}
`;

const VALID_ANSWER_TYPES = new Set(["single-choice", "multi-choice", "text"]);

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeOptionText = (value) => {
  if (typeof value !== "string") return "";
  return value
      .replace(/^\s*[A-Ha-h][)\].:-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
};

const isGenericPlaceholderOption = (value) => {
  const normalized = sanitizeOptionText(value).toLowerCase();
  return /^(option|choice|answer)\s+[a-z0-9]+$/.test(normalized);
};

const extractJsonCandidate = (rawText) => {
  if (!rawText || typeof rawText !== "string") return "{}";
  const trimmed = rawText.trim();
  const noFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

  const first = noFence.indexOf("{");
  const last = noFence.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return noFence.slice(first, last + 1);
  }
  return "{}";
};

const normalizeAssessment = (assessment, fallbackPhaseNumber) => {
  const payload = (assessment && typeof assessment === "object") ? assessment : {};
  const cleanQuestion = typeof payload.question === "string" ?
    payload.question.trim() : "";

  let options = Array.isArray(payload.options) ? payload.options : [];
  const seen = new Set();
  options = options
      .map((option) => {
        if (typeof option === "string") return sanitizeOptionText(option);
        if (option && typeof option.text === "string") {
          return sanitizeOptionText(option.text);
        }
        return "";
      })
      .filter(Boolean)
      .filter((value) => !isGenericPlaceholderOption(value))
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

  const answerType = VALID_ANSWER_TYPES.has(payload.answerType) ?
    payload.answerType : (options.length ? "single-choice" : "text");

  const expectedOptionCount = Math.max(0, Math.min(8,
      toInt(payload.expectedOptionCount, options.length)));

  return {
    phaseNumber: Math.max(1, Math.min(12,
        toInt(payload.phaseNumber, fallbackPhaseNumber))),
    questionIndex: Math.max(1, toInt(payload.questionIndex, 1)),
    stepId: typeof payload.stepId === "string" ? payload.stepId : "",
    question: cleanQuestion,
    answerType,
    expectedOptionCount,
    options,
  };
};

const normalizeProctorResponse = (raw, fallbackPhaseNumber) => {
  const parsed = (raw && typeof raw === "object") ? raw : {};
  const proctorMessage = typeof parsed.proctorMessage === "string" &&
    parsed.proctorMessage.trim() ?
    parsed.proctorMessage.trim() : "The Proctor pauses, awaiting your reply.";

  const systemUpdates = (parsed.systemUpdates && typeof parsed.systemUpdates === "object") ?
    parsed.systemUpdates : {};

  const assessment = normalizeAssessment(
      parsed.assessment,
      toInt(systemUpdates.nextPhaseNumber, fallbackPhaseNumber),
  );

  if (!assessment.question) {
    assessment.question = proctorMessage;
  }
  if (assessment.answerType !== "text" && assessment.options.length === 0) {
    assessment.answerType = "text";
  }

  return {proctorMessage, assessment, systemUpdates};
};

exports.strixhavenConsultant = onCall(
    {secrets: ["GEMINI_API_KEY"]},
    async (request) => {
      try {
        const requestData = request.data || {};
        const chatHistory = requestData.chatHistory || [];
        const latestMessage = requestData.latestMessage || "Introduce yourself and begin Phase 1.";
        const gameData = requestData.gameData || {};

        let historyForGemini = chatHistory.slice(0, -1).map(msg => ({
          role: msg.role === 'proctor' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));

        while (historyForGemini.length > 0 && historyForGemini[0].role === 'model') {
          historyForGemini.shift();
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `[SYSTEM BACKGROUND DATA FOR CURRENT PHASE: ${JSON.stringify(gameData)}]\n\nSTUDENT SAYS: ${latestMessage}`;

        const fallbackChain = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
        let responseText = null;
        let lastError = null;

        for (const modelName of fallbackChain) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: PROCTOR_INSTRUCTIONS,
              generationConfig: { responseMimeType: "application/json" }
            });
            
            const chat = model.startChat({ history: historyForGemini });
            const result = await chat.sendMessage(prompt);
            
            responseText = result.response.text();
            console.log(`Success! Biblioplex powered by: ${modelName}`);
            break; 
            
          } catch (error) {
            console.warn(`Traffic jam or error on ${modelName}, pivoting to next fallback...`);
            lastError = error; 
          }
        }

        if (!responseText) {
          throw lastError; 
        }

        const jsonCandidate = extractJsonCandidate(responseText);
        let parsedResponse = {};
        try {
          parsedResponse = JSON.parse(jsonCandidate);
        } catch (parseError) {
          console.warn("Invalid JSON from model, falling back to message-only payload.");
          parsedResponse = {proctorMessage: responseText};
        }

        return normalizeProctorResponse(parsedResponse, gameData.phase || 1);

      } catch (error) {
        console.error("Proctor Error:", error);
        throw new HttpsError("internal", "The Biblioplex archives are currently unreachable.");
      }
    }
);