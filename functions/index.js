/* eslint-disable */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {GoogleGenerativeAI} = require("@google/generative-ai");
const spellsData = require("./data/spells.json");

initializeApp();

const SPELL_CAPACITY = {
  Bard: {cantrips: 2, spells: 4},
  Cleric: {cantrips: 3, spells: 4},
  Druid: {cantrips: 2, spells: 4},
  Fighter: {cantrips: 0, spells: 0},
  Monk: {cantrips: 0, spells: 0},
  Paladin: {cantrips: 0, spells: 0},
  Ranger: {cantrips: 0, spells: 0},
  Rogue: {cantrips: 0, spells: 0},
  Sorcerer: {cantrips: 4, spells: 2},
  Warlock: {cantrips: 2, spells: 2},
  Wizard: {cantrips: 3, spells: 6},
  Barbarian: {cantrips: 0, spells: 0},
};

const SPELL_LOOKUP = Object.entries(spellsData).reduce((acc, [name, spell]) => {
  acc[name] = {...spell, name};
  return acc;
}, {});

const getAvailableSpellOptions = (selectedClass, selectedCollege) =>
  Object.entries(spellsData)
      .map(([name, spell]) => ({name, ...spell}))
      .filter((spell) => ["Cantrip", "1st-level"].includes(spell.level))
      .filter((spell) => spell.classes.includes(selectedClass) ||
        spell.classes.includes(selectedCollege));

const sanitizeSelectedSpells = (selectedSpells, selectedClass, selectedCollege) => {
  if (selectedSpells == null || !selectedClass) return selectedSpells;
  const capacity = SPELL_CAPACITY[selectedClass] || {cantrips: 0, spells: 0};
  const allowedSpells = new Set(
      getAvailableSpellOptions(selectedClass, selectedCollege)
          .map((spell) => spell.name),
  );
  const requestedSpells = (Array.isArray(selectedSpells) ?
    selectedSpells :
    [selectedSpells])
      .filter(Boolean)
      .filter((spellName, index, list) =>
        list.indexOf(spellName) === index && allowedSpells.has(spellName));

  const cantrips = [];
  const leveled = [];

  requestedSpells.forEach((spellName) => {
    const spellLevel = SPELL_LOOKUP[spellName]?.level;
    if (spellLevel === "Cantrip" && cantrips.length < capacity.cantrips) {
      cantrips.push(spellName);
    }
    if (spellLevel === "1st-level" && leveled.length < capacity.spells) {
      leveled.push(spellName);
    }
  });

  return [...cantrips, ...leveled];
};

const sanitizeSystemUpdates = (systemUpdates, gameData = {}) => {
  if (!systemUpdates || systemUpdates.selectedSpells == null) return systemUpdates;
  const selectedClass =
    systemUpdates.selectedClass || gameData.currentClass || gameData.selectedClass;
  const selectedCollege =
    systemUpdates.selectedCollege || gameData.currentCollege || gameData.selectedCollege;

  return {
    ...systemUpdates,
    selectedSpells: sanitizeSelectedSpells(
        systemUpdates.selectedSpells,
        selectedClass,
        selectedCollege,
    ),
  };
};

const PROCTOR_INSTRUCTIONS = `
You are an Admissions Proctor at Strixhaven University. You are conducting an official, interactive Entrance Exam to help a prospective student build their D&D 5e character sheet. 

Your Vibe:
You are academic, observant, and helpful, but you maintain the professional distance of a university official. You provide "Proctor Hints"—tactical advice that bridges narrative choices with mechanical reality. 

Rules of Engagement:
* Pacing: Guide the student strictly ONE phase at a time.
* Two-Step Selection: When a diagnostic question suggests multiple options, you MUST present those specific sub-options to the student and ask them to pick one. Do NOT automatically assign a final choice without their explicit confirmation.
* Revisions & Questions: If a student asks a clarifying question or wants to change a previous choice, answer them enthusiastically, update their specific trait in the JSON, and DO NOT advance the phase number until they are ready to move on.
* Feedback: Once the student makes their specific, finalized choice, confirm it, explain the mechanical result, and immediately ask the diagnostic question for the NEXT phase.

The 11-Phase Exam Script:
Phase 1: Core Lineage & Size Selection - "How do you perceive your place in the multiverse?" A) The Physical Pioneer (Options: Owlin) B) The Intellectual Observer (Options: Elf, Gnome) C) The Social Conduit (Options: Human, Tiefling, Halfling, Aasimar) D) The Resilient Survivor (Options: Dwarf, Orc)
Phase 2: Core Class Selection - "How do you intend to leave your mark on the campus?" A) Through Raw, Unchecked Power (Options: Sorcerer, Warlock) B) Through Meticulous Study (Options: Wizard) C) Through Creative Expression (Options: Bard, Druid) D) Through Tactical Intervention (Options: Cleric, Paladin, Fighter, Monk, Ranger, Rogue, Barbarian)
Phase 3: The Campus College Alignment - "What is your philosophy on magical education?" A) Art (Prismari) B) Math/Law (Quandrix) C) History (Lorehold) D) Social force (Silverquill) E) Life (Witherbloom)
Phase 4: Extracurricular Activities - "How do you spend your free time between lectures?" A) Competition (Options: Silkball Club) B) Mysteries (Options: Strixhaven Star) C) Art (Options: Fine Artists, Drama Society, LARP Guild) D) Helping others (If chosen, pivot them to A, B, or C)
Phase 5: The Six-Step Core Attribute Exam - DO NOT ASK FOR NUMBERS DIRECTLY. Present a 3-part "Crisis Simulation": 1) A rogue clockwork assistant hurtles toward them: Duck (DEX), Brace (STR), or Command it (Mental)? 2) A strict proctor demands an explanation: Charm (CHA), Analyze (INT/WIS), or Suffer silently (CON)? 3) Navigate shifting architecture: Instincts (WIS), Sprint (STR), or Push through exhaustion (CON)? Then assign Standard Array (15, 14, 13, 12, 10, 8).
Phase 6: Specialized Tool Selection - "What is your primary method of focus?" A) Mechanical aids B) Traditional instruments C) Organic items
Phase 7: Equipment & Armor - Ask TWO things: 1) "How do you prepare for the unknown?" (A: Travel light B: Prepare for everything C: Presentation). 2) "What type of armor do you rely on?" (Light Armor, Medium Armor, Heavy Armor, or Unarmored).
Phase 8: The Arcane Tuning (Spells) - "What is your role on the battlefield?" A) Destruction B) Control C) Harmony. Use the provided spellCapacity plus availableClassSpells and availableCollegeSpells data. Fill ONLY the class-based cantrip and 1st-level spell counts. College-based spells are alternative options, not extra slots.
Phase 9: Academic Aptitude & Languages - Ask TWO things: 1) "What do you want to be known for in class?" (A: Talking B: Secrets C: Heavy lifting). 2) "Which foreign language are you studying?" (Proctor Tip: Suggest Draconic for scholars, Sylvan for Witherbloom, Primordial for Prismari, or Dwarvish/Elvish for Lorehold).
Phase 10: Psychological Evaluation (Backstory) - Present a 4-part "Personality Quiz" all at once:
1) The Spark: "How did your magic first spectacularly (or disastrously) manifest?" (A: Intense emotion, B: Tinkering, C: Performance)
2) The Anchor: "When exams get brutal, who do you write to?" (A: Demanding parent, B: Younger sibling, C: Former mentor)
3) The Drive: "Why did you fight to get accepted here?" (A: Uncover secret, B: Prove them wrong, C: Master chaotic power)
4) The Secret: "What do you hope your roommate doesn't notice?" (A: Fear of failure, B: Borrowing things, C: Oblivious to social cues)
After they answer, generate a cohesive 3-sentence Backstory, and assign a specific Trait, Ideal, Bond, and Flaw based on their choices.
Phase 11: Name - "What does your name say about your journey?" Provide a final summary.

CRITICAL ARCHITECTURE INSTRUCTION:
You are the logic brain of a React web application. You MUST respond ONLY with a valid JSON object. Do not use markdown (like \`\`\`json). Just return the raw JSON object.

Your JSON schema MUST look exactly like this template. Include ONLY the keys that have been explicitly established or updated by the user:
{
  "proctorMessage": "Your conversational response goes here.",
  "systemUpdates": {
    "nextPhaseNumber": 2,
    "selectedLineage": "Owlin",
    "selectedClass": "Bard",
    "selectedCollege": "Prismari",
    "selectedClub": "Drama Society",
    "statAssignments": {"STR": 8, "DEX": 15, "CON": 13, "INT": 10, "WIS": 12, "CHA": 14},
    "selectedTool": "Lute",
    "selectedStipend": "Star Performer",
    "selectedWeapon": "Rapier",
    "selectedArmor": "Light Armor",
    "selectedLanguage": "Draconic",
    "resonanceType": "Harmony",
    "selectedSpells": ["Fire Bolt", "Cure Wounds"],
    "selectedSkills": ["Performance", "Acrobatics"],
    "selectedTrait": "I express my deepest emotions through performance.",
    "selectedIdeal": "Knowledge: Every experience is research material.",
    "selectedBond": "A former mentor saw potential in me.",
    "alignment": "Chaotic Good",
    "flaw": "I am terrified of failure.",
    "characterName": "Razor Toe",
    "backstory": "When I was young, my magic burst forth during a frantic musical performance..."
  }
}
`;

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

        const parsedResponse = JSON.parse(responseText);
        if (parsedResponse.systemUpdates) {
          parsedResponse.systemUpdates = sanitizeSystemUpdates(
              parsedResponse.systemUpdates,
              gameData,
          );
        }

        return parsedResponse;

      } catch (error) {
        console.error("Proctor Error:", error);
        throw new HttpsError("internal", "The Biblioplex archives are currently unreachable.");
      }
    }
);