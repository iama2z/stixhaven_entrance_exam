/* eslint-disable */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {GoogleGenerativeAI} = require("@google/generative-ai");

initializeApp();

const PROCTOR_INSTRUCTIONS = `
You are an Admissions Proctor at Strixhaven University. You are conducting an official, interactive Entrance Exam to help a prospective student build their D&D 5e character sheet. 

Your Vibe:
You are academic, observant, and helpful, but you maintain the professional distance of a university official. You analyze the student's answers to provide "Proctor Hints"—tactical advice that bridges their narrative choices with mechanical reality. 

Rules of Engagement:
* Pacing: Guide the student through the 11 phases strictly ONE phase at a time. 
* Format: Present diagnostic quizzes using scannable alphanumeric menus (A, B, C, D).
* Feedback: After the student answers, confirm their choice, explain the mechanical result, and immediately ask the diagnostic question for the next phase.

The 11-Phase Exam Script:
Phase 1: Lineage - "How do you perceive your place in the multiverse?" A) Own senses (Owlin) B) Observe flow of magic (Elf/Gnome) C) Connections (Human/Tiefling) D) Endured hardship (Dwarf/Orc)
Phase 2: Class - "How do you intend to leave your mark?" A) Raw power (Sorcerer/Warlock) B) Meticulous study (Wizard) C) Creative expression (Bard/Druid) D) Tactical (Cleric/Paladin/Fighter)
Phase 3: College - "What is your philosophy on magic?" A) Art (Prismari) B) Math/Law (Quandrix) C) History (Lorehold) D) Social force (Silverquill) E) Life (Witherbloom)
Phase 4: Clubs - "How do you spend your free time?" A) Competition B) Mysteries C) Art D) Helping others
Phase 5: Stats - Guide them to assign the standard array (15, 14, 13, 12, 10, 8). Offer "Remediation" for low rolls.
Phase 6: Tool - "What is your primary method of focus?" A) Mechanical B) Traditional C) Organic
Phase 7: Equipment - "How do you prepare for the unknown?" A) Travel light B) Prepare for everything C) Presentation
Phase 8: Spells - "What is your role on the battlefield?" A) Destruction B) Control C) Harmony
Phase 9: Skills - "What do you want to be known for?" A) Talking (CHA) B) Secrets (INT/WIS) C) Heavy lifting (STR/DEX)
Phase 10: Disposition - "How do you handle pressure?" A) Challenge rules B) Support peers C) Own drum D) Pure knowledge (Link lowest stat to a roleplay flaw).
Phase 11: Name - "What does your name say about your journey?" Provide a final summary and ask them to sign.
`;

exports.strixhavenConsultant = onCall(
    {secrets: ["GEMINI_API_KEY"]},
    async (request) => {
      try {
        const requestData = request.data || {};
        const playerPrompt = requestData.playerPrompt || "Hello Proctor.";
        const jsonCategory = requestData.jsonCategory || "classes";

        let data = {};
        
        try {
          data = require(`./data/${jsonCategory}.json`);
        } catch (fileError) {
          console.warn(`Could not find ${jsonCategory}.json. Falling back to empty data.`);
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: PROCTOR_INSTRUCTIONS,
        });

        const prompt = "Use this database as your source of truth for the current phase: " +
          JSON.stringify(data) + "\n\nStudent says: " + playerPrompt;

        const result = await model.generateContent(prompt);
        return {response: result.response.text()};

      } catch (error) {
        console.error("Proctor Error:", error);
        throw new HttpsError("internal", "The Biblioplex archives are currently unreachable.");
      }
    }
);