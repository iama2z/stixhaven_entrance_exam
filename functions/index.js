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
Phase 1: Lineage - "How do you perceive your place in the multiverse?" A) Own senses (Owlin) B) Observe flow of magic (Elf/Gnome) C) Connections (Human/Tiefling) D) Endured hardship (Dwarf/Orc)
Phase 2: Class - "How do you intend to leave your mark?" A) Raw power (Sorcerer/Warlock) B) Meticulous study (Wizard) C) Creative expression (Bard/Druid) D) Tactical (Cleric/Paladin/Fighter)
Phase 3: College - "What is your philosophy on magic?" A) Art (Prismari) B) Math/Law (Quandrix) C) History (Lorehold) D) Social force (Silverquill) E) Life (Witherbloom)
Phase 4: Clubs - "How do you spend your free time?" A) Competition B) Mysteries C) Art D) Helping others
Phase 5: Stats - Guide them to assign the standard array (15, 14, 13, 12, 10, 8). Offer "Remediation" for low rolls.
Phase 6: Tool - "What is your primary method of focus?" A) Mechanical B) Traditional C) Organic
Phase 7: Equipment - "How do you prepare for the unknown?" A) Travel light B) Prepare for everything C) Presentation
Phase 8: Spells - "What is your role on the battlefield?" A) Destruction B) Control C) Harmony
Phase 9: Skills - "What do you want to be known for?" A) Talking (CHA) B) Secrets (INT/WIS) C) Heavy lifting (STR/DEX)
Phase 10: Disposition - "How do you handle pressure?" A) Challenge rules B) Support peers C) Own drum D) Pure knowledge (Link lowest stat to a flaw).
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
        // 1. Unpack the exact data sent by React
        const requestData = request.data || {};
        const chatHistory = requestData.chatHistory || [];
        const latestMessage = requestData.latestMessage || "Introduce yourself and begin Phase 1.";
        const gameData = requestData.gameData || {};

        // 2. Format the React chat history into Gemini's specific history format
        // We pop the very last message off, because the frontend includes the user's newest message in this array, 
        // and Gemini wants the new message sent separately.
        const historyForGemini = chatHistory.slice(0, -1).map(msg => ({
          role: msg.role === 'proctor' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-3.5-flash",
          systemInstruction: PROCTOR_INSTRUCTIONS,
          generationConfig: {
              responseMimeType: "application/json", // This forces Gemini to only output JSON!
          }
        });

        // 3. Boot up the conversational memory
        const chat = model.startChat({
          history: historyForGemini,
        });

        // 4. Send the new prompt, injecting the current phase's data silently into the background
        const prompt = `[SYSTEM BACKGROUND DATA FOR CURRENT PHASE: ${JSON.stringify(gameData)}]\n\nSTUDENT SAYS: ${latestMessage}`;
        
        const result = await chat.sendMessage(prompt);
        const responseText = result.response.text();
        
        // 5. Parse the JSON string into an actual object and send it back to React
        const jsonResponse = JSON.parse(responseText);
        return jsonResponse;

      } catch (error) {
        console.error("Proctor Error:", error);
        throw new HttpsError("internal", "The Biblioplex archives are currently unreachable.");
      }
    }
);