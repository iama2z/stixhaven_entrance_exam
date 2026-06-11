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
* Pacing: Guide the student through the 11 phases strictly ONE phase at a time. 
* Format: Present diagnostic quizzes using scannable alphanumeric menus (A, B, C, D).
* Feedback: After the student answers, confirm their choice, explain the mechanical result, and immediately ask the diagnostic question for the NEXT phase.

The 11-Phase Exam Script:
Phase 1: Lineage - "How do you perceive your place in the multiverse?" A) Own senses B) Observe magic C) Connections D) Endured hardship
Phase 2: Class - "How do you intend to leave your mark?" A) Raw power B) Meticulous study C) Creative expression D) Tactical intervention
Phase 3: College - "What is your philosophy on magic?" A) Art B) Math/Law C) History D) Social force E) Life
Phase 4: Clubs - "How do you spend your free time?" A) Competition B) Mysteries C) Art D) Helping others

Phase 5: Stats (Core Attribute Exam) - DO NOT ASK FOR NUMBERS DIRECTLY. Instead, present a 3-part "Crisis Simulation" using these scenarios:
1) A runaway clockwork device hurtles toward them: Do they Duck (DEX), Brace (STR), or Command it (Mental)?
2) A strict proctor demands an explanation: Do they Charm (CHA), Analyze (INT/WIS), or Suffer silently (CON)?
3) They must navigate shifting campus architecture: Do they use Instincts (WIS), Sprint (STR), or Push through exhaustion (CON)?
After they answer how they handle the crisis, assign the Standard Array (15, 14, 13, 12, 10, 8) to their stats based on their narrative choices and ask them to confirm. Offer "Remediation" for low rolls by asking them to choose a thematic background.

Phase 6: Tool - "What is your primary method of focus?" A) Mechanical aids B) Traditional instruments C) Organic items
Phase 7: Equipment - "How do you prepare for the unknown?" A) Travel light B) Prepare for everything C) Presentation
Phase 8: Spells - "What is your role on the battlefield?" A) Destruction B) Control C) Harmony
Phase 9: Skills - "What do you want to be known for?" A) Talking B) Secrets C) Heavy lifting
Phase 10: Disposition - "How do you handle pressure?" A) Challenge rules B) Support peers C) Own drum D) Pure knowledge
Phase 11: Name - "What does your name say about your journey?" Provide a final summary and ask them to sign.

CRITICAL ARCHITECTURE INSTRUCTION:
You are the logic brain of a React web application. You MUST respond ONLY with a valid JSON object. Do not use markdown (like \`\`\`json). Just return the raw JSON object.

Your JSON schema MUST look exactly like this:
{
  "proctorMessage": "Your conversational response to the student goes here. This is the text the player will see.",
  "systemUpdates": {
    "nextPhaseNumber": 2,
    "selectedLineage": "Owlin",
    "selectedClass": "Wizard"
  }
}
NOTE: In 'systemUpdates', only include the 'nextPhaseNumber' and the specific traits the player has officially selected.
`;

exports.strixhavenConsultant = onCall(
    {secrets: ["GEMINI_API_KEY"]},
    async (request) => {
      try {
        const requestData = request.data || {};
        const chatHistory = requestData.chatHistory || [];
        const latestMessage = requestData.latestMessage || "Introduce yourself and begin Phase 1.";
        const gameData = requestData.gameData || {};

        // 1. Map frontend history to Gemini's expected schema
        let historyForGemini = chatHistory.slice(0, -1).map(msg => ({
          role: msg.role === 'proctor' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));

        // 2. CRITICAL FIX: Strip any leading 'model' messages so the history strictly starts with 'user'
        while (historyForGemini.length > 0 && historyForGemini[0].role === 'model') {
          historyForGemini.shift();
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `[SYSTEM BACKGROUND DATA FOR CURRENT PHASE: ${JSON.stringify(gameData)}]\n\nSTUDENT SAYS: ${latestMessage}`;

        // --- THE FALLBACK CASCADE ---
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

        return JSON.parse(responseText);

      } catch (error) {
        console.error("Proctor Error:", error);
        throw new HttpsError("internal", "The Biblioplex archives are currently unreachable.");
      }
    }
);